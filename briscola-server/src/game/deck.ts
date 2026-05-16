// Briscola deck operations
//
// Self-contained: includes the base 40-card Italian deck and shuffle/deal
// helpers (this server is a separate npm package and does not import across
// project boundaries).

import type { Card, CardValue, PlayerId, Suit } from './types.js';
import { CARDS_PER_HAND, CARD_VALUES, SUITS } from './constants.js';

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
  const shuffled = [...deck];
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
  const actualCount = Math.min(count, deck.length);
  return {
    dealt: deck.slice(0, actualCount),
    remaining: deck.slice(actualCount),
  };
}

export interface InitialDeal {
  hands: Record<PlayerId, Card[]>;
  trump: Card;
  /**
   * Remaining draw pile, ordered top-to-bottom.
   * The trump is the LAST element (drawn last).
   */
  deck: Card[];
}

/**
 * Lay out a fresh Briscola round from a shuffled 40-card deck:
 * - 3 cards each to non-dealer and dealer (non-dealer first, by convention)
 * - The next card is flipped face-up as the trump (briscola)
 * - The trump sits at the bottom of the draw pile; the remaining 33 cards
 *   are drawn from the top first, and the trump is the very last card drawn
 */
export function dealInitialHands(
  shuffledDeck: Card[],
  dealer: PlayerId
): InitialDeal {
  if (shuffledDeck.length < CARDS_PER_HAND * 2 + 1) {
    throw new Error(
      `dealInitialHands: deck too small (got ${shuffledDeck.length}, need >= 7)`
    );
  }

  const nonDealer: PlayerId = dealer === 'player1' ? 'player2' : 'player1';

  const { dealt: nonDealerHand, remaining: r1 } = dealCards(shuffledDeck, CARDS_PER_HAND);
  const { dealt: dealerHand, remaining: r2 } = dealCards(r1, CARDS_PER_HAND);
  const { dealt: [trump], remaining: r3 } = dealCards(r2, 1);

  return {
    hands: {
      [nonDealer]: nonDealerHand,
      [dealer]: dealerHand,
    } as Record<PlayerId, Card[]>,
    trump,
    deck: [...r3, trump],
  };
}
