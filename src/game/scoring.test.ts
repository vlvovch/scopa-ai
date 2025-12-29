import { describe, it, expect } from 'vitest';
import {
  scoreCards,
  scoreCoins,
  scoreSetteBello,
  calculatePrime,
  scorePrime,
  calculateRoundScore,
} from './scoring';
import type { Card, GameState } from './types';

// Helper to create cards
const card = (suit: Card['suit'], value: Card['value']): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

describe('Scoring System', () => {
  describe('scoreCards', () => {
    it('should give point to human with more cards', () => {
      const human = Array(21).fill(null).map((_, i) => card('coins', ((i % 10) + 1) as Card['value']));
      const cpu = Array(19).fill(null).map((_, i) => card('cups', ((i % 10) + 1) as Card['value']));

      const result = scoreCards(human, cpu);

      expect(result).toEqual({ human: 1, cpu: 0 });
    });

    it('should give point to cpu with more cards', () => {
      const human = Array(18).fill(null).map((_, i) => card('coins', ((i % 10) + 1) as Card['value']));
      const cpu = Array(22).fill(null).map((_, i) => card('cups', ((i % 10) + 1) as Card['value']));

      const result = scoreCards(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 1 });
    });

    it('should give no points on tie', () => {
      const human = Array(20).fill(null).map((_, i) => card('coins', ((i % 10) + 1) as Card['value']));
      const cpu = Array(20).fill(null).map((_, i) => card('cups', ((i % 10) + 1) as Card['value']));

      const result = scoreCards(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 0 });
    });
  });

  describe('scoreCoins', () => {
    it('should give point to human with more coins', () => {
      const human = [
        card('coins', 1), card('coins', 2), card('coins', 3),
        card('coins', 4), card('coins', 5), card('coins', 6),
      ];
      const cpu = [
        card('coins', 7), card('coins', 8), card('coins', 9), card('coins', 10),
      ];

      const result = scoreCoins(human, cpu);

      expect(result).toEqual({ human: 1, cpu: 0 });
    });

    it('should give point to cpu with more coins', () => {
      const human = [card('coins', 1), card('coins', 2), card('coins', 3)];
      const cpu = [
        card('coins', 4), card('coins', 5), card('coins', 6),
        card('coins', 7), card('coins', 8), card('coins', 9), card('coins', 10),
      ];

      const result = scoreCoins(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 1 });
    });

    it('should give no points on tie', () => {
      const human = [card('coins', 1), card('coins', 2), card('coins', 3), card('coins', 4), card('coins', 5)];
      const cpu = [card('coins', 6), card('coins', 7), card('coins', 8), card('coins', 9), card('coins', 10)];

      const result = scoreCoins(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 0 });
    });

    it('should only count coins suit', () => {
      const human = [card('coins', 1), card('cups', 2), card('swords', 3)];
      const cpu = [card('coins', 4), card('coins', 5), card('clubs', 6)];

      const result = scoreCoins(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 1 }); // 1 vs 2 coins
    });
  });

  describe('scoreSetteBello', () => {
    it('should give point to human with 7 of coins', () => {
      const human = [card('coins', 7), card('cups', 3)];
      const cpu = [card('swords', 7), card('clubs', 5)];

      const result = scoreSetteBello(human, cpu);

      expect(result).toEqual({ human: 1, cpu: 0 });
    });

    it('should give point to cpu with 7 of coins', () => {
      const human = [card('coins', 6), card('cups', 7)];
      const cpu = [card('coins', 7), card('clubs', 5)];

      const result = scoreSetteBello(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 1 });
    });

    it('should correctly identify by suit AND value', () => {
      const human = [card('cups', 7), card('swords', 7)]; // 7s but not coins
      const cpu = [card('coins', 7)];

      const result = scoreSetteBello(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 1 });
    });
  });

  describe('calculatePrime', () => {
    it('should return 84 for all four 7s', () => {
      const captured = [
        card('coins', 7),
        card('cups', 7),
        card('swords', 7),
        card('clubs', 7),
      ];

      const prime = calculatePrime(captured);

      expect(prime).toBe(84); // 21 * 4
    });

    it('should return 81 for three 7s and one 6', () => {
      const captured = [
        card('coins', 7),
        card('cups', 7),
        card('swords', 7),
        card('clubs', 6),
      ];

      const prime = calculatePrime(captured);

      expect(prime).toBe(81); // 21*3 + 18
    });

    it('should return null when missing a suit', () => {
      const captured = [
        card('coins', 7),
        card('cups', 7),
        card('swords', 7),
        // No clubs
      ];

      const prime = calculatePrime(captured);

      expect(prime).toBeNull();
    });

    it('should use highest prime value in each suit', () => {
      const captured = [
        card('coins', 7), card('coins', 6), // 7 is better (21 vs 18)
        card('cups', 1), card('cups', 2),   // Ace is better (16 vs 12)
        card('swords', 5),                   // 15
        card('clubs', 10),                   // 10 (face card)
      ];

      const prime = calculatePrime(captured);

      expect(prime).toBe(21 + 16 + 15 + 10); // 62
    });

    it('should give 10 for face cards', () => {
      const captured = [
        card('coins', 8),   // 10
        card('cups', 9),    // 10
        card('swords', 10), // 10
        card('clubs', 8),   // 10
      ];

      const prime = calculatePrime(captured);

      expect(prime).toBe(40);
    });
  });

  describe('scorePrime', () => {
    it('should give point to human with higher prime', () => {
      const human = [
        card('coins', 7), card('cups', 7), card('swords', 7), card('clubs', 6),
      ]; // 81
      const cpu = [
        card('coins', 6), card('cups', 6), card('swords', 6), card('clubs', 5),
      ]; // 69

      const result = scorePrime(human, cpu);

      expect(result).toEqual({ human: 1, cpu: 0 });
    });

    it('should give no points on tie', () => {
      const human = [
        card('coins', 7), card('cups', 6), card('swords', 5), card('clubs', 4),
      ]; // 21+18+15+14 = 68
      const cpu = [
        card('coins', 6), card('cups', 7), card('swords', 4), card('clubs', 5),
      ]; // 18+21+14+15 = 68

      const result = scorePrime(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 0 });
    });

    it('should give point to cpu when human missing suit', () => {
      const human = [card('coins', 7), card('cups', 7), card('swords', 7)]; // null
      const cpu = [
        card('coins', 5), card('cups', 5), card('swords', 5), card('clubs', 5),
      ]; // 60

      const result = scorePrime(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 1 });
    });

    it('should give no points when both missing suits', () => {
      const human = [card('coins', 7), card('cups', 7)];
      const cpu = [card('swords', 7), card('clubs', 7)];

      const result = scorePrime(human, cpu);

      expect(result).toEqual({ human: 0, cpu: 0 });
    });
  });

  describe('calculateRoundScore', () => {
    const createTestState = (): GameState => ({
      status: 'roundEnd',
      round: {
        deck: [],
        table: [],
        currentPlayer: 'human',
        dealer: 'cpu',
        lastCapture: 'human',
      },
      players: {
        human: {
          hand: [],
          captured: [
            // 22 cards, 6 coins, has 7 of coins, good prime
            card('coins', 1), card('coins', 2), card('coins', 3),
            card('coins', 5), card('coins', 6), card('coins', 7),
            card('cups', 1), card('cups', 2), card('cups', 3),
            card('cups', 4), card('cups', 5), card('cups', 7),
            card('swords', 1), card('swords', 2), card('swords', 3),
            card('swords', 4), card('swords', 7),
            card('clubs', 1), card('clubs', 2), card('clubs', 3),
            card('clubs', 6), card('clubs', 7),
          ],
          scopaCount: 2,
        },
        cpu: {
          hand: [],
          captured: [
            // 18 cards, 4 coins, no 7 of coins
            card('coins', 4), card('coins', 8), card('coins', 9), card('coins', 10),
            card('cups', 6), card('cups', 8), card('cups', 9), card('cups', 10),
            card('swords', 5), card('swords', 6), card('swords', 8),
            card('swords', 9), card('swords', 10),
            card('clubs', 4), card('clubs', 5), card('clubs', 8),
            card('clubs', 9), card('clubs', 10),
          ],
          scopaCount: 1,
        },
      },
      scores: { human: 5, cpu: 3 },
      roundNumber: 2,
      targetScore: 11,
    });

    it('should return complete breakdown for both players', () => {
      const state = createTestState();
      const result = calculateRoundScore(state);

      expect(result.human).toHaveProperty('cards');
      expect(result.human).toHaveProperty('coins');
      expect(result.human).toHaveProperty('setteBello');
      expect(result.human).toHaveProperty('prime');
      expect(result.human).toHaveProperty('scopas');
      expect(result.human).toHaveProperty('total');

      expect(result.cpu).toHaveProperty('cards');
      expect(result.cpu).toHaveProperty('coins');
      expect(result.cpu).toHaveProperty('setteBello');
      expect(result.cpu).toHaveProperty('prime');
      expect(result.cpu).toHaveProperty('scopas');
      expect(result.cpu).toHaveProperty('total');
    });

    it('should have all categories as numbers', () => {
      const state = createTestState();
      const result = calculateRoundScore(state);

      expect(typeof result.human.cards).toBe('number');
      expect(typeof result.human.coins).toBe('number');
      expect(typeof result.human.setteBello).toBe('number');
      expect(typeof result.human.prime).toBe('number');
      expect(typeof result.human.scopas).toBe('number');
      expect(typeof result.human.total).toBe('number');
    });

    it('should have totals equal sum of categories', () => {
      const state = createTestState();
      const result = calculateRoundScore(state);

      const humanSum =
        result.human.cards +
        result.human.coins +
        result.human.setteBello +
        result.human.prime +
        result.human.scopas;

      const cpuSum =
        result.cpu.cards +
        result.cpu.coins +
        result.cpu.setteBello +
        result.cpu.prime +
        result.cpu.scopas;

      expect(result.human.total).toBe(humanSum);
      expect(result.cpu.total).toBe(cpuSum);
    });

    it('should correctly pull scopa counts from player state', () => {
      const state = createTestState();
      const result = calculateRoundScore(state);

      expect(result.human.scopas).toBe(2);
      expect(result.cpu.scopas).toBe(1);
    });

    it('should calculate correct scores for test state', () => {
      const state = createTestState();
      const result = calculateRoundScore(state);

      // Human: 22 cards vs 18 = 1 point
      expect(result.human.cards).toBe(1);
      expect(result.cpu.cards).toBe(0);

      // Human: 6 coins vs 4 = 1 point
      expect(result.human.coins).toBe(1);
      expect(result.cpu.coins).toBe(0);

      // Human has 7 of coins
      expect(result.human.setteBello).toBe(1);
      expect(result.cpu.setteBello).toBe(0);

      // Human has better prime (has 7s in all suits)
      expect(result.human.prime).toBe(1);
      expect(result.cpu.prime).toBe(0);

      // Scopas
      expect(result.human.scopas).toBe(2);
      expect(result.cpu.scopas).toBe(1);

      // Totals
      expect(result.human.total).toBe(6); // 1+1+1+1+2
      expect(result.cpu.total).toBe(1);   // 0+0+0+0+1
    });
  });
});
