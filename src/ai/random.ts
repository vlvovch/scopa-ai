// Random AI Player - Selects moves completely at random

import type { Move } from '../game/types';
import type { AIPlayer, AIContext } from './types';
import { getValidMoves } from '../game/rules';

/**
 * Random AI that picks a random card and random valid move.
 * This is the simplest possible AI - no strategy at all.
 */
export const randomAI: AIPlayer = {
  name: 'Random',

  selectMove(context: AIContext): Move {
    const { hand, table, player } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    // Select a random card from hand
    const randomCardIndex = Math.floor(Math.random() * hand.length);
    const cardToPlay = hand[randomCardIndex];

    // Get valid moves for this card
    const validMoves = getValidMoves(cardToPlay, table, player);

    if (validMoves.length === 0) {
      throw new Error('No valid moves available for selected card');
    }

    // Select a random valid move
    const randomMoveIndex = Math.floor(Math.random() * validMoves.length);
    return validMoves[randomMoveIndex];
  },
};

/**
 * Factory function to create a random AI player
 */
export function createRandomAI(): AIPlayer {
  return randomAI;
}
