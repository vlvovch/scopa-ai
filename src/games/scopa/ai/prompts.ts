// Shared AI prompts and formatting utilities for LLM-based AI players

import type { Card, Move } from '../types';
import type { LLMAIContext } from './types';
import { reasoningLanguageNote } from '../../../ai/reasoningLanguage';

/**
 * Base game rules shared by all system instructions
 */
const SCOPA_RULES = `You are an expert Italian Scopa player.

RULES:
- 40-card deck, 4 suits: Denari (coins), Coppe (cups), Spade (swords), Bastoni (clubs)
- Values: 1 (Asso) to 10 (Re). Face cards: Fante=8, Cavallo=9, Re=10
- On your turn, you play one card from your hand. When playing a card:
  - If it matches a table card's value, you must capture that card (pick one if there are multiple matches)
  - Otherwise, you may capture multiple cards if their values sum to your card's value
  - Only if no capture possible, place your card on the table
- On the last hand of the round (the dealer deck is empty), the player who did last capture takes all remaining cards on the table

SCORING (calculated at end of each round):
- Carte: 1 point for most cards captured (21+ guarantees)
- Denari: 1 point for most Denari suit cards (6+ guarantees)
- Sette Bello: 1 point for capturing the 7 of Denari
- Primiera: 1 point for best prime (highest-value card from each suit)
  Prime values: 7=21, 6=18, Asso=16, 5=15, 4=14, 3=13, 2=12, face cards=10
- Scopa: 1 point EACH TIME you clear all cards from the table EXCEPT for the last hand of the round

First to reach target score wins.`;

/**
 * System instruction for multi-turn chat sessions (Gemini, OpenAI)
 * Each turn provides only the opponent's last move; conversation history tracks earlier moves
 */
export const SYSTEM_INSTRUCTION_MULTITURN = `${SCOPA_RULES}

CONVERSATION MODE: Multi-turn
This is a multi-turn conversation. A new conversation starts at the beginning of each round.
Use the conversation history to track strategic information, such as:
- Cards captured by each player (for Carte, Denari, Primiera estimates)
- Which high-value cards (7s, 6s, Aces) have been played
- Opponent's playing patterns
- Any other strategic information you may need to make decisions

INPUT FORMAT (each turn):
- Current game state (scores, deck/pile counts)
- Your last move and opponent's last move (for context)
- Current table and your hand
- Numbered list of valid moves

OUTPUT: JSON with moveIndex (0-based) and reasoning.`;

/**
 * System instruction for single-turn requests (Gemini single-turn)
 * Each request includes complete round history since no conversation context is maintained
 */
export const SYSTEM_INSTRUCTION_SINGLETURN = `${SCOPA_RULES}

CONVERSATION MODE: Single-turn
Each request is independent - you have no memory of previous requests.
The complete round history is provided in each request. Use it to reconstruct strategic information, such as:
- Cards captured by each player (for Carte, Denari, Primiera estimates)
- Which high-value cards (7s, 6s, Aces) have been played
- Opponent's playing patterns
- Any other strategic information you may need to make decisions

INPUT FORMAT (each request):
- Current game state (scores, deck/pile counts)
- Complete round history (all moves from round start)
- Current table and your hand
- Numbered list of valid moves

OUTPUT: JSON with moveIndex (0-based) and reasoning.`;

/**
 * @deprecated Use SYSTEM_INSTRUCTION_MULTITURN or SYSTEM_INSTRUCTION_SINGLETURN
 */
export const SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION_MULTITURN;

/**
 * The system instruction a cloud model gets: the multi-turn or single-turn
 * text plus the reasoning-language line for the current interface language
 * (src/ai/reasoningLanguage.ts). The on-device instruction stays as it is.
 */
export function systemInstruction(mode: 'multiturn' | 'singleturn'): string {
  return (mode === 'singleturn' ? SYSTEM_INSTRUCTION_SINGLETURN : SYSTEM_INSTRUCTION_MULTITURN) + reasoningLanguageNote();
}

/**
 * Format a card for display in prompts
 */
export function formatCard(card: Card): string {
  return `${card.value} of ${card.suit}`;
}

/**
 * Format an array of cards for display in prompts
 */
export function formatCards(cards: Card[]): string {
  if (cards.length === 0) return '(none)';
  return cards.map(formatCard).join(', ');
}

/**
 * Format a move for display in the valid moves list
 */
export function formatMove(move: Move, index: number): string {
  const cardStr = formatCard(move.cardPlayed);
  if (move.capturedCards.length === 0) {
    return `[${index}] Play ${cardStr} (place on table)`;
  }
  const captured = formatCards(move.capturedCards);
  const scopa = move.isScopa ? ' [SCOPA!]' : '';
  return `[${index}] Play ${cardStr} → capture ${captured}${scopa}`;
}

/**
 * Format last opponent move for context
 */
export function formatLastMove(move: Move | null): string {
  if (!move) return 'None (start of round)';
  const cardStr = formatCard(move.cardPlayed);
  if (move.capturedCards.length === 0) {
    return `Played ${cardStr} to table`;
  }
  const captured = formatCards(move.capturedCards);
  return `Played ${cardStr} and captured: ${captured}`;
}

/**
 * Build the turn prompt for multi-turn chat sessions
 * Used by Gemini (multi-turn) and OpenAI
 */
export function buildTurnPrompt(context: LLMAIContext, memory = '', describeMove: (move: Move, index: number) => string = formatMove): string {
  const {
    hand, table, scores, targetScore, roundNumber,
    opponentHandCount, selfCapturedCount, opponentCapturedCount,
    deckCount, lastOpponentMove, lastSelfMove, validMoves
  } = context;

  const movesStr = validMoves.map((m, i) => describeMove(m, i)).join('\n');

  return `--- TURN ---
Round ${roundNumber} | Score: You ${scores.self} - Opponent ${scores.opponent} (target: ${targetScore})
Deck: ${deckCount} | My pile: ${selfCapturedCount} | Opponent pile: ${opponentCapturedCount} | Opponent hand: ${opponentHandCount}

Your last move: ${formatLastMove(lastSelfMove)}
Opponent's last move: ${formatLastMove(lastOpponentMove)}

${memory ? `${memory}\n\n` : ''}Table: ${formatCards(table)}
My hand: ${formatCards(hand)}

Valid moves:
${movesStr}

Choose best move (0-${validMoves.length - 1}):`;
}

/**
 * What the on-device model is told about the round so far, kept to what a
 * three-billion-parameter model can use without confusing it: the coins
 * race, where the 7 of coins is, and the scope. (The cloud bots carry the
 * history instead; the primiera and the unseen values used to be here and
 * were read as cards in the opponent's hand.) Empty when the context
 * carries no captured piles.
 */
export function buildRoundMemory(context: LLMAIContext): string {
  const { hand, table, selfCaptured, opponentCaptured, selfScopaCount = 0, opponentScopaCount = 0 } = context;
  if (!selfCaptured || !opponentCaptured) return '';
  const countCoins = (cards: Card[]) => cards.filter((c) => c.suit === 'coins').length;
  const isSetteBello = (c: Card) => c.suit === 'coins' && c.value === 7;
  const setteBello = selfCaptured.some(isSetteBello) ? 'in your pile'
    : opponentCaptured.some(isSetteBello) ? "in the opponent's pile"
    : hand.some(isSetteBello) ? 'in your hand'
    : table.some(isSetteBello) ? 'on the table'
    : 'not seen yet';
  return `--- ROUND MEMORY ---
Coins captured: you ${countCoins(selfCaptured)}, opponent ${countCoins(opponentCaptured)} (6 win the coins point)
7 of coins: ${setteBello}
Scope this round: you ${selfScopaCount}, opponent ${opponentScopaCount}`;
}

/**
 * A legal move spelled out for the on-device model: what it captures, or
 * that the card stays on the table, and a scopa named as such. The small
 * model read "(place on table)" as a capture and mixed the two up.
 */
export function formatOnDeviceMove(move: Move, index: number): string {
  const cardStr = formatCard(move.cardPlayed);
  if (move.capturedCards.length === 0) {
    return `[${index}] Play ${cardStr}: no capture, it stays on the table`;
  }
  const scopa = move.isScopa ? ' and empties the table: a SCOPA' : '';
  return `[${index}] Play ${cardStr}: captures ${formatCards(move.capturedCards)}${scopa}`;
}

/** The turn prompt for the on-device model: the position, the round memory and the spelled-out moves. */
export function buildOnDeviceTurnPrompt(context: LLMAIContext): string {
  return buildTurnPrompt(context, buildRoundMemory(context), formatOnDeviceMove);
}

/**
 * Format a move from a specific perspective (for move history)
 * Used by single-turn AI that sends full history each request
 */
export function formatMoveForHistory(move: Move, perspective: 'self' | 'opponent'): string {
  const who = perspective === 'self' ? 'You' : 'Opponent';
  const cardStr = formatCard(move.cardPlayed);
  if (move.capturedCards.length === 0) {
    return `${who} played ${cardStr} to table`;
  }
  const captured = formatCards(move.capturedCards);
  const scopa = move.isScopa ? ' [SCOPA!]' : '';
  return `${who} played ${cardStr} and captured: ${captured}${scopa}`;
}

/**
 * Format complete move history for single-turn prompts
 */
export function formatMoveHistory(history: Move[], selfPlayer: 'human' | 'cpu', initialTable: Card[]): string {
  if (history.length === 0) {
    return `Initial table: ${formatCards(initialTable)}\nNo moves yet this round.`;
  }

  const lines = [`Initial table: ${formatCards(initialTable)}`];
  for (const move of history) {
    const perspective = move.player === selfPlayer ? 'self' : 'opponent';
    lines.push(formatMoveForHistory(move, perspective));
  }
  return lines.join('\n');
}

/**
 * Build full prompt for single-turn requests (includes complete history)
 * Used by Gemini single-turn mode
 */
export function buildSingleTurnPrompt(
  context: LLMAIContext,
  roundMoveHistory: Move[],
  initialTable: Card[]
): string {
  const {
    hand, table, scores, targetScore, roundNumber,
    opponentHandCount, selfCapturedCount, opponentCapturedCount,
    deckCount, validMoves, player
  } = context;

  const historyStr = formatMoveHistory(roundMoveHistory, player, initialTable);
  const movesStr = validMoves.map((m, i) => formatMove(m, i)).join('\n');

  return `--- CURRENT STATE ---
Round ${roundNumber} | Score: You ${scores.self} - Opponent ${scores.opponent} (target: ${targetScore})
Deck: ${deckCount} | My pile: ${selfCapturedCount} | Opponent pile: ${opponentCapturedCount} | Opponent hand: ${opponentHandCount}

--- ROUND HISTORY ---
${historyStr}

--- YOUR TURN ---
Table now: ${formatCards(table)}
Your hand: ${formatCards(hand)}

Valid moves:
${movesStr}

Choose best move (0-${validMoves.length - 1}):`;
}


/**
 * System instruction for the on-device model (Apple Intelligence). One
 * request per move, no memory between requests, and a small context
 * window, so only the rules and the current position are sent.
 */
export const SYSTEM_INSTRUCTION_ON_DEVICE = `You play Scopa, the Italian card game, against one opponent. Cards are named "value of suit": values 1 to 10, suits coins, cups, swords and clubs.

WHAT MATTERS
- Playing a card that captures moves it and the captured cards into your pile. Playing a card that captures nothing leaves it on the table for the opponent.
- Points at the end of the round: most cards, most coins, the 7 of coins, the primiera (7s and 6s count most) and one point for every scopa, a capture that empties the table.
- Prefer a capture over placing a card. The best captures take the 7 of coins, other coins, 7s and 6s, or several cards at once.
- A capture that empties the table is a scopa: take it. Avoid leaving a table the opponent can clear with one card.

You cannot see the opponent's cards or the deck. Never describe or guess them. Each request stands alone: use only the state in the request.

INPUT: the scores, a short ROUND MEMORY (coins, the 7 of coins, scope), the table, your hand and the numbered legal moves, each saying what it captures or that it captures nothing.
OUTPUT: candidates, the two or three strongest legal moves (their 0-based numbers, each with one short note on why it is good or risky); then reasoning, one sentence naming the best move and why, mentioning only cards from the request; then moveIndex, the 0-based number of that best move.`;
