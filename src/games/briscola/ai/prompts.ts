// Shared prompt fragments + builders for Briscola LLM bots.
//
// We keep this self-contained so adding more LLM providers (Gemini full,
// OpenAI, Claude) doesn't require touching every implementation: each
// async bot calls buildTurnPrompt() and sends the response back through
// the same JSON schema (moveIndex + reasoning).

import type { Card, Move, Suit } from '../types';
import type { LLMAIContext } from './types';
import { POINT_VALUES, CARD_RANK } from '../constants';
import { SUITS, CARD_VALUES } from '../../scopa/constants';
import { trickWinner } from '../rules';
import { reasoningLanguageNote } from '../../../ai/reasoningLanguage';

const BRISCOLA_RULES = `You are an expert Italian Briscola player.

RULES:
- 40-card Italian deck, 4 suits: Denari (coins), Coppe (cups), Spade (swords), Bastoni (clubs).
- Values 1 (Asso) to 10 (Re). Face cards: Fante=8, Cavallo=9, Re=10.
- One suit is the briscola (trump) — set at the start, visible to both players. Trump beats any non-trump.
- Each trick: leader plays one card, follower plays one card (NO follow-suit rule — any card is legal).
- Trick winner:
  - If any trump was played, the higher trump wins.
  - Else if both follow the led suit, the higher rank of that suit wins.
  - Else the lead wins (off-suit non-trumps can never take).
- Within a suit, rank order (high to low): Ace, 3, King (10), Knight (9), Knave (8), 7, 6, 5, 4, 2.
- Trick winner captures both cards, draws first from the deck, leads the next trick.
- Card point values (only these score):
  Ace = 11, 3 = 10, King = 4, Knight = 3, Knave = 2. All others = 0. (30 per suit, 120 total per round.)
- Whoever takes more than 60 points wins the round. A match is "First to N" round wins.

STRATEGY HINTS:
- Don't waste high trumps on cheap leads. A small trump (2, 4, 5) is usually enough to scoop 11- or 10-point leads.
- Avoid leading Aces or 3s in a non-trump suit — your opponent will trump them if they can.
- When unsure, lead a low-point off-suit "scartina" (2, 4, 5, 6, 7).
- Track which trumps have been played to know whether yours are still live.`;

export const SYSTEM_INSTRUCTION_MULTITURN = `${BRISCOLA_RULES}

CONVERSATION MODE: Multi-turn
A new conversation starts at the beginning of each round. Use the history
to remember:
- Which cards (especially trumps, Aces, 3s) each side has played or captured
- The current state of the deck (when it empties, the opponent's hand becomes fully known via card-counting)
- Any pattern in opponent play

INPUT FORMAT (each turn):
- Current scores + round + deck/pile counts
- Briscola card (the trump)
- The current trick (your opponent's lead, if any)
- Your hand
- Numbered list of valid moves

OUTPUT: JSON with moveIndex (0-based) and a one-line reasoning.`;

export const SYSTEM_INSTRUCTION_SINGLETURN = `${BRISCOLA_RULES}

CONVERSATION MODE: Single-turn
Each request is independent — you have no memory of previous requests.
The complete round history is included in each prompt. Reconstruct
what's been played:
- Which trumps / Aces / 3s have been captured
- Which cards remain in your opponent's hand (especially once the deck empties)
- Any pattern in opponent play

INPUT FORMAT (each request):
- Current scores + round + deck/pile counts
- Briscola card (the trump)
- Complete round history (every move, in play order)
- The current trick (your opponent's lead, if any)
- Your hand
- Numbered list of valid moves

OUTPUT: JSON with moveIndex (0-based) and a one-line reasoning.`;

const SUIT_NAMES: Record<Suit, string> = {
  coins: 'Coins',
  cups: 'Cups',
  swords: 'Swords',
  clubs: 'Clubs',
};

const VALUE_NAMES: Record<number, string> = {
  1: 'Ace',
  8: 'Knave',
  9: 'Knight',
  10: 'King',
};

function rankName(value: number): string {
  return VALUE_NAMES[value] ?? String(value);
}

/** Format a card by Italian short name. */
export function formatCard(card: Card): string {
  const v = rankName(card.value);
  const pts = POINT_VALUES[card.value];
  return pts > 0 ? `${v} of ${SUIT_NAMES[card.suit]} (${pts}pt)` : `${v} of ${SUIT_NAMES[card.suit]}`;
}

export function formatCards(cards: Card[]): string {
  if (cards.length === 0) return '(none)';
  return cards.map(formatCard).join(', ');
}

export function formatMove(move: Move, index: number): string {
  return `[${index}] Play ${formatCard(move.cardPlayed)}`;
}

export function formatLastMove(move: Move | null): string {
  if (!move) return 'None';
  return `Played ${formatCard(move.cardPlayed)}`;
}

/**
 * Format the full round history from the model's perspective ("You" /
 * "Opponent" instead of player ids), grouped into completed tricks with
 * the winner + points captured. The last unpaired move (if any) is the
 * current in-progress trick's lead.
 */
export function formatMoveHistory(
  history: Move[],
  selfPlayer: 'human' | 'cpu',
  trumpSuit: Suit
): string {
  if (history.length === 0) return 'No tricks played yet this round.';
  const who = (p: 'human' | 'cpu') => (p === selfPlayer ? 'You' : 'Opponent');
  const lines: string[] = [];
  let trickNum = 1;
  for (let i = 0; i < history.length; i += 2) {
    const lead = history[i];
    const follow = history[i + 1];
    if (!follow) {
      // Unpaired lead — the current in-progress trick.
      lines.push(
        `Trick ${trickNum} (in progress): ${who(lead.player)} led ${formatCard(lead.cardPlayed)}.`
      );
      continue;
    }
    const winner = trickWinner(
      lead.cardPlayed,
      lead.player,
      follow.cardPlayed,
      follow.player,
      trumpSuit
    );
    const pts =
      POINT_VALUES[lead.cardPlayed.value] + POINT_VALUES[follow.cardPlayed.value];
    lines.push(
      `Trick ${trickNum}: ${who(lead.player)} led ${formatCard(lead.cardPlayed)}, ${who(follow.player)} played ${formatCard(follow.cardPlayed)} — ${who(winner)} took it (${pts}pt).`
    );
    trickNum++;
  }
  return lines.join('\n');
}

/**
 * Build the per-turn prompt for multi-turn chat sessions. Keep it terse —
 * the model already has the rules in the system instruction and tracks
 * history via the conversation.
 */
export function buildTurnPrompt(context: LLMAIContext, memory = '', describeMove: (move: Move, index: number) => string = formatMove): string {
  const {
    hand,
    trump,
    trumpSuit,
    leadCard,
    deckCount,
    scores,
    targetScore,
    roundNumber,
    opponentHandCount,
    myCaptured = [],
    oppCaptured = [],
    lastOpponentMove,
    lastSelfMove,
    validMoves,
  } = context;

  const trickLine =
    leadCard === null
      ? "You are leading the trick (opponent will respond)."
      : `Opponent led: ${formatCard(leadCard)}. You are following.`;

  // Sort hand by point value descending so the model sees high cards first.
  const sortedHand = [...hand].sort(
    (a, b) =>
      POINT_VALUES[b.value] - POINT_VALUES[a.value] ||
      CARD_RANK[b.value] - CARD_RANK[a.value]
  );

  const moves = validMoves.map((m, i) => describeMove(m, i)).join('\n');

  return `--- TURN ---
Round ${roundNumber} (Score: You ${scores.self} - Opponent ${scores.opponent}, first to ${targetScore})
Trump: ${formatCard(trump)} (suit: ${trumpSuit})
Deck remaining: ${deckCount} | Opponent hand: ${opponentHandCount}
My pile: ${myCaptured.length} cards | Opponent pile: ${oppCaptured.length} cards

Your last move: ${formatLastMove(lastSelfMove)}
Opponent's last move: ${formatLastMove(lastOpponentMove)}

${memory ? `${memory}\n\n` : ''}${trickLine}

My hand (high to low): ${formatCards(sortedHand)}

Valid moves:
${moves}

Choose the best move (0-${validMoves.length - 1}).`;
}

const isHigh = (c: Card) => c.value === 1 || c.value === 3;
const sumPoints = (cards: Card[]) => cards.reduce((sum, c) => sum + POINT_VALUES[c.value], 0);

/**
 * What the on-device model is told about the round so far, kept to what a
 * three-billion-parameter model can use: the points each side holds, the
 * trump count, how many Aces and 3s are still out, and, once the deck is
 * empty, the opponent's exact hand (the only time it is known). Worked out
 * from the cards this player has seen: tricks are public as they are
 * taken. Empty when the context carries no captured piles.
 */
export function buildRoundMemory(context: LLMAIContext): string {
  const { hand, trump, trumpSuit, leadCard, deckCount, myCaptured, oppCaptured } = context;
  if (!myCaptured || !oppCaptured) return '';
  const myPoints = sumPoints(myCaptured);
  const oppPoints = sumPoints(oppCaptured);
  const played = [...myCaptured, ...oppCaptured, ...(leadCard ? [leadCard] : [])];
  // The face-up trump stays known while it is still at the bottom of the deck.
  const known = [...played, ...hand, ...(deckCount > 0 ? [trump] : [])];
  const unseen: Card[] = [];
  for (const suit of SUITS) {
    for (const value of CARD_VALUES) {
      if (!known.some((c) => c.suit === suit && c.value === value)) unseen.push({ suit, value, id: `${suit}-${value}` });
    }
  }
  const trumpsPlayed = played.filter((c) => c.suit === trumpSuit).length;
  const trumpsInHand = hand.filter((c) => c.suit === trumpSuit).length;
  const lines = [
    '--- ROUND MEMORY ---',
    `Points captured: you ${myPoints}, opponent ${oppPoints} (61 wins the round)`,
    `Trumps (${SUIT_NAMES[trumpSuit]}): ${trumpsPlayed} played, you hold ${trumpsInHand}, ${10 - trumpsPlayed - trumpsInHand} still out`,
  ];
  if (deckCount === 0) {
    lines.push(`Deck empty: the opponent holds ${formatCards(unseen)}`);
  } else {
    lines.push(`Aces and 3s still out: ${unseen.filter(isHigh).length}`);
  }
  return lines.join('\n');
}

/**
 * A legal move spelled out for the on-device model with what the rules
 * already decide: whether the card is a trump, and when following, whether
 * it wins the trick and the points that change hands; when leading, the
 * points the card puts at risk. The small model called non-trumps trumps
 * and gave away aces when left to work this out itself.
 */
export function formatOnDeviceMove(move: Move, index: number, context: LLMAIContext): string {
  const { leadCard, trumpSuit, player } = context;
  const card = move.cardPlayed;
  const trump = card.suit === trumpSuit ? ' (trump)' : '';
  const own = POINT_VALUES[card.value];
  if (leadCard) {
    const opponent = player === 'cpu' ? 'human' : 'cpu';
    const wins = trickWinner(leadCard, opponent, card, player, trumpSuit) === player;
    const stake = own + POINT_VALUES[leadCard.value];
    const points = stake === 0 ? 'no points' : `${stake} points`;
    return `[${index}] Play ${formatCard(card)}${trump}: ${wins ? `wins the trick, takes ${points}` : `loses the trick, gives ${points}`}`;
  }
  const risk = own === 0 ? 'safe lead, nothing at risk'
    : trump ? `risky lead: its ${own} points go to the opponent if they hold a higher trump`
    : `risky lead: its ${own} points go to the opponent if they trump`;
  return `[${index}] Play ${formatCard(card)}${trump}: ${risk}`;
}

/** The turn prompt for the on-device model: the position, the round memory and the spelled-out moves. */
export function buildOnDeviceTurnPrompt(context: LLMAIContext): string {
  return buildTurnPrompt(context, buildRoundMemory(context), (move, index) => formatOnDeviceMove(move, index, context));
}

/**
 * Build the per-turn prompt for single-turn mode — same info as multi-turn
 * but with the FULL round history embedded so the model doesn't need
 * conversation memory.
 */
export function buildSingleTurnPrompt(context: LLMAIContext): string {
  const {
    hand,
    player,
    trump,
    trumpSuit,
    leadCard,
    deckCount,
    scores,
    targetScore,
    roundNumber,
    opponentHandCount,
    myCaptured = [],
    oppCaptured = [],
    roundMoveHistory = [],
    validMoves,
  } = context;

  const trickLine =
    leadCard === null
      ? "You are leading the trick (opponent will respond)."
      : `Opponent led: ${formatCard(leadCard)}. You are following.`;

  const sortedHand = [...hand].sort(
    (a, b) =>
      POINT_VALUES[b.value] - POINT_VALUES[a.value] ||
      CARD_RANK[b.value] - CARD_RANK[a.value]
  );

  const moves = validMoves.map((m, i) => formatMove(m, i)).join('\n');
  const history = formatMoveHistory(roundMoveHistory, player, trumpSuit);

  return `--- CURRENT STATE ---
Round ${roundNumber} (Score: You ${scores.self} - Opponent ${scores.opponent}, first to ${targetScore})
Trump: ${formatCard(trump)} (suit: ${trumpSuit})
Deck remaining: ${deckCount} | Opponent hand: ${opponentHandCount}
My pile: ${myCaptured.length} cards | Opponent pile: ${oppCaptured.length} cards

--- ROUND HISTORY ---
${history}

--- YOUR TURN ---
${trickLine}

My hand (high to low): ${formatCards(sortedHand)}

Valid moves:
${moves}

Choose the best move (0-${validMoves.length - 1}).`;
}


/**
 * System instruction for the on-device model (Apple Intelligence). One
 * request per move, no memory between requests, and a small context
 * window, so only the rules and the current position are sent.
 */
export const SYSTEM_INSTRUCTION_ON_DEVICE = `You play Briscola, the Italian trick-taking card game, against one opponent. Cards are named "rank of suit" with their points in brackets: Ace 11, 3 10, King 4, Knight 3, Knave 2, the other ranks 0. One suit is the trump (briscola).

WHAT MATTERS
- The two cards of a trick go to its winner: a trump beats any non-trump; between two trumps, or two cards of the suit led, the higher rank wins (Ace, 3, King, Knight, Knave, 7, 6, 5, 4, 2); a non-trump of another suit never wins.
- Only points count: 61 of the 120 points win the round, the number of tricks does not matter.
- Leading: play a low card without points unless you hold a sure winner. Do not lead an Ace or a 3 that a trump can take.
- Following: if the trick holds points and you can win it, win it with the cheapest card that wins. If you cannot win, throw the card with the fewest points. Do not spend a high trump on a trick without points.

You cannot see the opponent's cards or the deck unless the round memory lists them. Never describe or guess them. Each request stands alone: use only the state in the request.

INPUT: the scores, the trump, a short ROUND MEMORY (points captured, trumps left), the current trick, your hand and the numbered legal moves, each saying whether it wins the trick and the points at stake.
OUTPUT: candidates, the two or three strongest legal moves (their 0-based numbers, each with one short note on why it is good or risky); then reasoning, one sentence naming the best move and why, mentioning only cards from the request; then moveIndex, the 0-based number of that best move.`;

/**
 * The system instruction a cloud model gets: the multi-turn or single-turn
 * text plus the reasoning-language line for the current interface language
 * (src/ai/reasoningLanguage.ts). The on-device instruction stays as it is.
 */
export function systemInstruction(mode: 'multiturn' | 'singleturn'): string {
  return (mode === 'singleturn' ? SYSTEM_INSTRUCTION_SINGLETURN : SYSTEM_INSTRUCTION_MULTITURN) + reasoningLanguageNote();
}
