// Heuristic AI Player - Uses greedy strategy with priority-based move selection

import type { Card, Move } from '../game/types';
import type { AIPlayer, AIContext } from './types';
import { getValidMoves } from '../game/rules';
import { PRIME_VALUES } from '../game/constants';

/**
 * Score a move based on strategic value.
 * Higher score = better move.
 */
function scoreMove(move: Move): number {
  let score = 0;

  // No capture = placing card (lowest priority, but sometimes necessary)
  if (move.capturedCards.length === 0) {
    // Prefer placing low-value cards that are less useful
    // Avoid placing 7s (best prime value) and coins
    const card = move.cardPlayed;
    if (card.suit === 'coins') {
      score -= 10; // Don't give away coins
    }
    if (card.value === 7) {
      score -= 20; // Don't give away 7s (best prime value)
    }
    // Prefer placing face cards (low prime value)
    if (card.value >= 8) {
      score += 5;
    }
    return score;
  }

  // Capturing is always better than placing
  score += 100;

  // Priority 1: Scopa (clearing the table) - huge bonus
  if (move.isScopa) {
    score += 1000;
  }

  // Priority 2: Capture sette bello (7 of coins)
  const capturesSetteBello = move.capturedCards.some(
    c => c.suit === 'coins' && c.value === 7
  );
  if (capturesSetteBello) {
    score += 500;
  }

  // Priority 3: Capture denari (coins) - each coin is valuable
  const coinsCount = move.capturedCards.filter(c => c.suit === 'coins').length;
  score += coinsCount * 50;

  // Priority 4: Improve primiera - capture high prime value cards
  // Prime values: 7=21, 6=18, 1=16, 5=15, 4=14, 3=13, 2=12, 8/9/10=10
  for (const card of move.capturedCards) {
    const primeValue = PRIME_VALUES[card.value];
    // Weight 7s heavily, then 6s, then aces
    if (card.value === 7) {
      score += 30;
    } else if (card.value === 6) {
      score += 20;
    } else if (card.value === 1) {
      score += 15;
    } else {
      score += primeValue / 2;
    }
  }

  // Priority 5: Capture more cards (tiebreaker)
  // +1 for played card, +1 for each captured
  score += (1 + move.capturedCards.length) * 5;

  return score;
}

/**
 * Get all possible moves for all cards in hand
 */
function getAllMoves(hand: Card[], table: Card[], player: 'human' | 'cpu'): Move[] {
  const allMoves: Move[] = [];
  for (const card of hand) {
    const moves = getValidMoves(card, table, player);
    allMoves.push(...moves);
  }
  return allMoves;
}

/**
 * Heuristic AI that selects moves based on strategic priorities:
 * 1. Scopa (clearing the table)
 * 2. Capture sette bello (7 of coins)
 * 3. Capture denari (coins)
 * 4. Capture high prime value cards (7s, 6s, aces)
 * 5. Capture more cards
 */
export const heuristicAI: AIPlayer = {
  name: 'Heuristic',

  selectMove(context: AIContext): Move {
    const { hand, table, player } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    // Get all possible moves for all cards in hand
    const allMoves = getAllMoves(hand, table, player);

    if (allMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    // Score each move and select the best one
    let bestMove = allMoves[0];
    let bestScore = scoreMove(bestMove);

    for (let i = 1; i < allMoves.length; i++) {
      const move = allMoves[i];
      const score = scoreMove(move);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  },
};

/**
 * Factory function to create a heuristic AI player
 */
export function createHeuristicAI(): AIPlayer {
  return heuristicAI;
}
