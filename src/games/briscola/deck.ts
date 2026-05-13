// Briscola deck operations
//
// The base 40-card Italian deck and generic shuffle/deal helpers are shared
// with Scopa (re-exported below). The Briscola-specific bit is `dealInitialHands`
// which lays out a fresh round: 3 cards to each player + flipping the trump.

import type { Card, PlayerId } from './types';
import { CARDS_PER_HAND } from './constants';
import { dealCards } from '../scopa/deck';

export { createDeck, shuffleDeck, dealCards } from '../scopa/deck';

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

  const nonDealer: PlayerId = dealer === 'human' ? 'cpu' : 'human';

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
