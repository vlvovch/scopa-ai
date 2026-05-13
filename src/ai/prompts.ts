// Shared AI prompts and formatting utilities for LLM-based AI players

import type { Card, Move } from '../games/scopa/types';
import type { LLMAIContext } from './types';

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
export function buildTurnPrompt(context: LLMAIContext): string {
  const {
    hand, table, scores, targetScore, roundNumber,
    opponentHandCount, selfCapturedCount, opponentCapturedCount,
    deckCount, lastOpponentMove, lastSelfMove, validMoves
  } = context;

  const movesStr = validMoves.map((m, i) => formatMove(m, i)).join('\n');

  return `--- TURN ---
Round ${roundNumber} | Score: You ${scores.self} - Opponent ${scores.opponent} (target: ${targetScore})
Deck: ${deckCount} | My pile: ${selfCapturedCount} | Opponent pile: ${opponentCapturedCount} | Opponent hand: ${opponentHandCount}

Your last move: ${formatLastMove(lastSelfMove)}
Opponent's last move: ${formatLastMove(lastOpponentMove)}

Table: ${formatCards(table)}
My hand: ${formatCards(hand)}

Valid moves:
${movesStr}

Choose best move (0-${validMoves.length - 1}):`;
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
