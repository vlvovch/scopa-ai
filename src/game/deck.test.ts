import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, dealCards, isValidInitialDeal } from './deck';
import type { Card } from './types';

describe('Deck Management', () => {
  describe('createDeck', () => {
    it('should create exactly 40 cards', () => {
      const deck = createDeck();
      expect(deck).toHaveLength(40);
    });

    it('should have all unique IDs', () => {
      const deck = createDeck();
      const ids = deck.map((card) => card.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(40);
    });

    it('should have exactly 10 cards of each suit', () => {
      const deck = createDeck();
      const suits = ['coins', 'cups', 'swords', 'clubs'] as const;

      for (const suit of suits) {
        const suitCards = deck.filter((card) => card.suit === suit);
        expect(suitCards).toHaveLength(10);
      }
    });

    it('should have exactly 4 cards of each value', () => {
      const deck = createDeck();

      for (let value = 1; value <= 10; value++) {
        const valueCards = deck.filter((card) => card.value === value);
        expect(valueCards).toHaveLength(4);
      }
    });

    it('should have 7 of coins with ID exactly "coins-7"', () => {
      const deck = createDeck();
      const setteBello = deck.find((card) => card.id === 'coins-7');

      expect(setteBello).toBeDefined();
      expect(setteBello?.suit).toBe('coins');
      expect(setteBello?.value).toBe(7);
    });

    it('should have all IDs in format "{suit}-{value}"', () => {
      const deck = createDeck();
      const validSuits = ['coins', 'cups', 'swords', 'clubs'];

      for (const card of deck) {
        const [suit, valueStr] = card.id.split('-');
        expect(validSuits).toContain(suit);
        expect(Number(valueStr)).toBeGreaterThanOrEqual(1);
        expect(Number(valueStr)).toBeLessThanOrEqual(10);
        expect(card.id).toBe(`${card.suit}-${card.value}`);
      }
    });
  });

  describe('shuffleDeck', () => {
    it('should return same 40 cards as original', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);

      expect(shuffled).toHaveLength(40);

      // Check all original cards are present
      const originalIds = new Set(deck.map((c) => c.id));
      const shuffledIds = new Set(shuffled.map((c) => c.id));
      expect(shuffledIds).toEqual(originalIds);
    });

    it('should not mutate the original deck', () => {
      const deck = createDeck();
      const originalOrder = deck.map((c) => c.id);

      shuffleDeck(deck);

      const afterOrder = deck.map((c) => c.id);
      expect(afterOrder).toEqual(originalOrder);
    });

    it('should produce different order than original (statistical)', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);

      // Count how many cards are in same position
      let samePosition = 0;
      for (let i = 0; i < deck.length; i++) {
        if (deck[i].id === shuffled[i].id) {
          samePosition++;
        }
      }

      // Statistically, very unlikely all 40 cards stay in place
      expect(samePosition).toBeLessThan(40);
    });

    it('should produce different orderings on multiple shuffles', () => {
      const deck = createDeck();
      const shuffled1 = shuffleDeck(deck);
      const shuffled2 = shuffleDeck(deck);

      const order1 = shuffled1.map((c) => c.id).join(',');
      const order2 = shuffled2.map((c) => c.id).join(',');

      // Extremely unlikely to get same order twice
      expect(order1).not.toBe(order2);
    });
  });

  describe('dealCards', () => {
    it('should deal 3 cards from 40-card deck', () => {
      const deck = createDeck();
      const { dealt, remaining } = dealCards(deck, 3);

      expect(dealt).toHaveLength(3);
      expect(remaining).toHaveLength(37);
    });

    it('should remove dealt cards from remaining deck', () => {
      const deck = createDeck();
      const { dealt, remaining } = dealCards(deck, 3);

      const dealtIds = new Set(dealt.map((c) => c.id));
      for (const card of remaining) {
        expect(dealtIds.has(card.id)).toBe(false);
      }
    });

    it('should not mutate the original deck', () => {
      const deck = createDeck();
      const originalLength = deck.length;
      const originalFirst = deck[0].id;

      dealCards(deck, 3);

      expect(deck).toHaveLength(originalLength);
      expect(deck[0].id).toBe(originalFirst);
    });

    it('should deal from empty deck returning empty array', () => {
      const { dealt, remaining } = dealCards([], 3);

      expect(dealt).toHaveLength(0);
      expect(remaining).toHaveLength(0);
    });

    it('should deal only available cards if deck is smaller than requested', () => {
      const smallDeck: Card[] = [
        { suit: 'coins', value: 1, id: 'coins-1' },
        { suit: 'coins', value: 2, id: 'coins-2' },
      ];

      const { dealt, remaining } = dealCards(smallDeck, 5);

      expect(dealt).toHaveLength(2);
      expect(remaining).toHaveLength(0);
    });

    it('should deal cards from top of deck (first cards)', () => {
      const deck = createDeck();
      const { dealt } = dealCards(deck, 3);

      expect(dealt[0].id).toBe(deck[0].id);
      expect(dealt[1].id).toBe(deck[1].id);
      expect(dealt[2].id).toBe(deck[2].id);
    });
  });

  describe('isValidInitialDeal', () => {
    it('should return true for 4 non-king cards', () => {
      const tableCards: Card[] = [
        { suit: 'coins', value: 1, id: 'coins-1' },
        { suit: 'cups', value: 5, id: 'cups-5' },
        { suit: 'swords', value: 7, id: 'swords-7' },
        { suit: 'clubs', value: 3, id: 'clubs-3' },
      ];

      expect(isValidInitialDeal(tableCards)).toBe(true);
    });

    it('should return true for 2 kings and 2 other cards', () => {
      const tableCards: Card[] = [
        { suit: 'coins', value: 10, id: 'coins-10' },
        { suit: 'cups', value: 10, id: 'cups-10' },
        { suit: 'swords', value: 7, id: 'swords-7' },
        { suit: 'clubs', value: 3, id: 'clubs-3' },
      ];

      expect(isValidInitialDeal(tableCards)).toBe(true);
    });

    it('should return false for 3 kings and 1 other card', () => {
      const tableCards: Card[] = [
        { suit: 'coins', value: 10, id: 'coins-10' },
        { suit: 'cups', value: 10, id: 'cups-10' },
        { suit: 'swords', value: 10, id: 'swords-10' },
        { suit: 'clubs', value: 3, id: 'clubs-3' },
      ];

      expect(isValidInitialDeal(tableCards)).toBe(false);
    });

    it('should return false for 4 kings', () => {
      const tableCards: Card[] = [
        { suit: 'coins', value: 10, id: 'coins-10' },
        { suit: 'cups', value: 10, id: 'cups-10' },
        { suit: 'swords', value: 10, id: 'swords-10' },
        { suit: 'clubs', value: 10, id: 'clubs-10' },
      ];

      expect(isValidInitialDeal(tableCards)).toBe(false);
    });

    it('should return true for empty table', () => {
      expect(isValidInitialDeal([])).toBe(true);
    });
  });
});
