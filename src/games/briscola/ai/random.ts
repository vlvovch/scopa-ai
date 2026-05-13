// Random Briscola AI — picks a random card from hand

import type { AIContext, AIPlayer } from './types';
import type { Move } from '../types';

export const randomAI: AIPlayer = {
  name: 'Random',

  selectMove(context: AIContext): Move {
    const { hand, player } = context;
    if (hand.length === 0) {
      throw new Error('randomAI: cannot select move with empty hand');
    }
    const idx = Math.floor(Math.random() * hand.length);
    return { player, cardPlayed: hand[idx] };
  },
};

export function createRandomAI(): AIPlayer {
  return randomAI;
}
