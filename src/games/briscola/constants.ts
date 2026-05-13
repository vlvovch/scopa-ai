// Briscola constants

import type { CardValue } from '../scopa/types';

/**
 * Point values for each card value, used to compute the round score.
 *
 * Per-suit totals: 11+10+4+3+2 = 30 points. Four suits → 120 total per round.
 * Cards 2,4,5,6,7 are "scartine" (worth zero).
 */
export const POINT_VALUES: Readonly<Record<CardValue, number>> = {
  1: 11,  // Ace (Asso)
  3: 10,  // Three (Tre)
  10: 4,  // King (Re)
  9: 3,   // Knight (Cavallo) — Queen-equivalent
  8: 2,   // Knave (Fante) — Jack-equivalent
  7: 0,
  6: 0,
  5: 0,
  4: 0,
  2: 0,
} as const;

/**
 * Trick-winning rank for each card value (higher number wins within a suit).
 * Ace > 3 > King > Knight > Knave > 7 > 6 > 5 > 4 > 2.
 * Note this is NOT the same as point-value ordering.
 */
export const CARD_RANK: Readonly<Record<CardValue, number>> = {
  1: 10,  // Ace
  3: 9,
  10: 8,  // King
  9: 7,   // Knight
  8: 6,   // Knave
  7: 5,
  6: 4,
  5: 3,
  4: 2,
  2: 1,   // Two (lowest)
} as const;

/** Number of cards dealt to each player at the start of a round */
export const CARDS_PER_HAND = 3;

/** Total point value of all cards in the deck */
export const TOTAL_POINTS_PER_ROUND = 120;

/** Minimum points needed to win a round outright */
export const POINTS_TO_WIN_ROUND = 61;

/** Default match length (number of rounds to win) */
export const DEFAULT_TARGET_SCORE = 1;
