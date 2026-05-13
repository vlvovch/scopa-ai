import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, dealInitialHands } from './deck';
import { CARDS_PER_HAND } from './constants';
import type { Card } from './types';

describe('Briscola deck', () => {
  describe('createDeck (reused from Scopa)', () => {
    it('produces 40 unique cards', () => {
      const deck = createDeck();
      expect(deck.length).toBe(40);
      const ids = new Set(deck.map(c => c.id));
      expect(ids.size).toBe(40);
    });
  });

  describe('shuffleDeck (reused from Scopa)', () => {
    it('returns a new array of the same length', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      expect(shuffled.length).toBe(40);
      expect(shuffled).not.toBe(deck);
    });

    it('preserves the set of cards (no loss, no dups)', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      const originalIds = new Set(deck.map(c => c.id));
      const shuffledIds = new Set(shuffled.map(c => c.id));
      expect(shuffledIds).toEqual(originalIds);
    });
  });

  describe('dealInitialHands', () => {
    const buildDeck = (): Card[] => createDeck(); // 40 unshuffled cards

    it('deals 3 cards to each player', () => {
      const { hands } = dealInitialHands(buildDeck(), 'cpu');
      expect(hands.human.length).toBe(CARDS_PER_HAND);
      expect(hands.cpu.length).toBe(CARDS_PER_HAND);
    });

    it('leaves 34 cards in the draw pile (33 face-down + 1 trump at bottom)', () => {
      const { deck } = dealInitialHands(buildDeck(), 'cpu');
      expect(deck.length).toBe(34);
    });

    it('places the trump as the LAST card in the deck (drawn last)', () => {
      const { trump, deck } = dealInitialHands(buildDeck(), 'cpu');
      expect(deck[deck.length - 1]).toEqual(trump);
    });

    it('partitions all 40 cards exactly once', () => {
      const original = buildDeck();
      const { hands, deck } = dealInitialHands(original, 'cpu');
      const seen = new Set([
        ...hands.human.map(c => c.id),
        ...hands.cpu.map(c => c.id),
        ...deck.map(c => c.id),
      ]);
      expect(seen.size).toBe(40);
    });

    it('deals to non-dealer (human) first when cpu is dealer', () => {
      // With unshuffled deck, the order is fixed. Non-dealer gets cards 0..2,
      // dealer gets 3..5, card 6 is trump, 7..39 are deck top-to-bottom.
      const deck = buildDeck();
      const { hands, trump } = dealInitialHands(deck, 'cpu');
      expect(hands.human).toEqual(deck.slice(0, 3));
      expect(hands.cpu).toEqual(deck.slice(3, 6));
      expect(trump).toEqual(deck[6]);
    });

    it('throws if the deck is too small', () => {
      expect(() => dealInitialHands([], 'cpu')).toThrow();
      expect(() => dealInitialHands(buildDeck().slice(0, 6), 'cpu')).toThrow();
    });

    it('does not mutate the input deck', () => {
      const deck = buildDeck();
      const snapshot = deck.map(c => c.id);
      dealInitialHands(deck, 'cpu');
      expect(deck.map(c => c.id)).toEqual(snapshot);
    });
  });
});
