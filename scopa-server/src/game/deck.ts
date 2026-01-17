// Deck Management for Scopa

import type { Card, CardValue, Suit } from './types.js';
import { SUITS, CARD_VALUES, MAX_INITIAL_KINGS } from './constants.js';

/**
 * Create a full 40-card Italian deck.
 * Each card has a unique ID in format '{suit}-{value}'.
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const value of CARD_VALUES) {
      deck.push({
        suit: suit as Suit,
        value: value as CardValue,
        id: `${suit}-${value}`,
      });
    }
  }

  return deck;
}

/**
 * Shuffle a deck using Fisher-Yates algorithm.
 * Returns a new shuffled array without mutating the input.
 */
export function shuffleDeck(deck: Card[]): Card[] {
  // Create a copy to avoid mutating the original
  const shuffled = [...deck];

  // Fisher-Yates shuffle (from end to start)
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Deal cards from the top of the deck.
 * Returns the dealt cards and remaining deck without mutating the input.
 */
export function dealCards(
  deck: Card[],
  count: number
): { dealt: Card[]; remaining: Card[] } {
  // Handle edge case: deal what's available if deck is smaller than count
  const actualCount = Math.min(count, deck.length);

  return {
    dealt: deck.slice(0, actualCount),
    remaining: deck.slice(actualCount),
  };
}

/**
 * Validate initial table deal (must not have 3+ kings).
 * Kings are cards with value 10.
 */
export function isValidInitialDeal(tableCards: Card[]): boolean {
  const kingCount = tableCards.filter((card) => card.value === 10).length;
  return kingCount <= MAX_INITIAL_KINGS;
}
