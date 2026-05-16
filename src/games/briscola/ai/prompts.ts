// Shared prompt fragments + builders for Briscola LLM bots.
//
// We keep this self-contained so adding more LLM providers (Gemini full,
// OpenAI, Claude) doesn't require touching every implementation: each
// async bot calls buildTurnPrompt() and sends the response back through
// the same JSON schema (moveIndex + reasoning).

import type { Card, Move } from '../types';
import type { LLMAIContext } from './types';
import { POINT_VALUES, CARD_RANK } from '../constants';

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

/** Format a card by Italian short name. */
export function formatCard(card: Card): string {
  const suitName: Record<Card['suit'], string> = {
    coins: 'Coins',
    cups: 'Cups',
    swords: 'Swords',
    clubs: 'Clubs',
  };
  const valueName: Record<number, string> = {
    1: 'Ace',
    8: 'Knave',
    9: 'Knight',
    10: 'King',
  };
  const v = valueName[card.value] ?? String(card.value);
  const pts = POINT_VALUES[card.value];
  return pts > 0 ? `${v} of ${suitName[card.suit]} (${pts}pt)` : `${v} of ${suitName[card.suit]}`;
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
 * Build the per-turn prompt for multi-turn chat sessions. Keep it terse —
 * the model already has the rules in the system instruction and tracks
 * history via the conversation.
 */
export function buildTurnPrompt(context: LLMAIContext): string {
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

  const moves = validMoves.map((m, i) => formatMove(m, i)).join('\n');

  return `--- TURN ---
Round ${roundNumber} (Score: You ${scores.self} - Opponent ${scores.opponent}, first to ${targetScore})
Trump: ${formatCard(trump)} (suit: ${trumpSuit})
Deck remaining: ${deckCount} | Opponent hand: ${opponentHandCount}
My pile: ${myCaptured.length} cards | Opponent pile: ${oppCaptured.length} cards

Your last move: ${formatLastMove(lastSelfMove)}
Opponent's last move: ${formatLastMove(lastOpponentMove)}

${trickLine}

My hand (high to low): ${formatCards(sortedHand)}

Valid moves:
${moves}

Choose the best move (0-${validMoves.length - 1}).`;
}
