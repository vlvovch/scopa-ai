// Step 2.4: Game Constants

import type { Suit, CardValue } from './types';

/** All four suits in the Italian deck */
export const SUITS: readonly Suit[] = ['coins', 'cups', 'swords', 'clubs'] as const;

/** All card values 1-10 */
export const CARD_VALUES: readonly CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Prime (Primiera) scoring values for each card value.
 * 7 is most valuable (21), followed by 6 (18), Ace (16), etc.
 * Face cards (8, 9, 10) are worth 10.
 */
export const PRIME_VALUES: Readonly<Record<CardValue, number>> = {
  7: 21,
  6: 18,
  1: 16,  // Ace
  5: 15,
  4: 14,
  3: 13,
  2: 12,
  8: 10,  // Knave (Fante)
  9: 10,  // Knight (Cavallo)
  10: 10, // King (Re)
} as const;

/** Default target score to win the game */
export const DEFAULT_TARGET_SCORE = 11;

/** Number of cards dealt to each player per hand */
export const CARDS_PER_HAND = 3;

/** Number of cards dealt to the table at game start */
export const INITIAL_TABLE_CARDS = 4;

/** Total cards in an Italian deck */
export const DECK_SIZE = 40;

/** Maximum number of kings allowed in initial table deal */
export const MAX_INITIAL_KINGS = 2;
