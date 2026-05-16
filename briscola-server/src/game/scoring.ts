// Briscola scoring

import type { Card, RoundScore } from './types.js';
import { POINT_VALUES } from './constants.js';

/**
 * Compute the round score from a player's captured pile.
 * The outcome ('win'/'loss'/'tie') is determined by comparing against the
 * opponent's captured pile.
 */
export function calculateRoundScore(
  captured: Card[],
  opponentCaptured: Card[]
): RoundScore {
  const points = sumPoints(captured);
  const opponentPoints = sumPoints(opponentCaptured);

  let outcome: 'win' | 'loss' | 'tie';
  if (points > opponentPoints) outcome = 'win';
  else if (points < opponentPoints) outcome = 'loss';
  else outcome = 'tie';

  return {
    points,
    outcome,
    counts: {
      aces: captured.filter(c => c.value === 1).length,
      threes: captured.filter(c => c.value === 3).length,
      kings: captured.filter(c => c.value === 10).length,
      knights: captured.filter(c => c.value === 9).length,
      knaves: captured.filter(c => c.value === 8).length,
    },
  };
}

/** Sum of POINT_VALUES across the given cards. */
export function sumPoints(cards: Card[]): number {
  let total = 0;
  for (const card of cards) {
    total += POINT_VALUES[card.value];
  }
  return total;
}
