import { describe, it, expect } from 'vitest';
import {
  SUITS,
  CARD_VALUES,
  PRIME_VALUES,
  DEFAULT_TARGET_SCORE,
  CARDS_PER_HAND,
  INITIAL_TABLE_CARDS,
  DECK_SIZE,
} from './constants';

describe('Game Constants', () => {
  describe('SUITS', () => {
    it('should have exactly 4 suits', () => {
      expect(SUITS.length).toBe(4);
    });

    it('should contain all Italian deck suits', () => {
      expect(SUITS).toContain('coins');
      expect(SUITS).toContain('cups');
      expect(SUITS).toContain('swords');
      expect(SUITS).toContain('clubs');
    });
  });

  describe('CARD_VALUES', () => {
    it('should have exactly 10 values', () => {
      expect(CARD_VALUES.length).toBe(10);
    });

    it('should contain values 1 through 10', () => {
      for (let i = 1; i <= 10; i++) {
        expect(CARD_VALUES).toContain(i);
      }
    });
  });

  describe('PRIME_VALUES', () => {
    it('should give 7 the highest value (21)', () => {
      expect(PRIME_VALUES[7]).toBe(21);
    });

    it('should give 6 the second highest value (18)', () => {
      expect(PRIME_VALUES[6]).toBe(18);
    });

    it('should give Ace (1) value 16', () => {
      expect(PRIME_VALUES[1]).toBe(16);
    });

    it('should give face cards (8, 9, 10) value 10', () => {
      expect(PRIME_VALUES[8]).toBe(10);
      expect(PRIME_VALUES[9]).toBe(10);
      expect(PRIME_VALUES[10]).toBe(10);
    });

    it('should have values for all card values 1-10', () => {
      for (let i = 1; i <= 10; i++) {
        expect(PRIME_VALUES[i as keyof typeof PRIME_VALUES]).toBeDefined();
      }
    });
  });

  describe('Game rules constants', () => {
    it('should have default target score of 11', () => {
      expect(DEFAULT_TARGET_SCORE).toBe(11);
    });

    it('should deal 3 cards per hand', () => {
      expect(CARDS_PER_HAND).toBe(3);
    });

    it('should place 4 cards on table initially', () => {
      expect(INITIAL_TABLE_CARDS).toBe(4);
    });

    it('should have 40 cards in deck', () => {
      expect(DECK_SIZE).toBe(40);
    });
  });
});
