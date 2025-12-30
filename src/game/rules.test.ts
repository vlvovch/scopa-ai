import { describe, it, expect } from 'vitest';
import {
  findSingleCaptures,
  findSumCaptures,
  getValidMoves,
  isValidMove,
  executeMove,
} from './rules';
import type { Card, GameState, Move } from './types';

// Helper to create cards
const card = (suit: Card['suit'], value: Card['value']): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

describe('Game Rules Engine', () => {
  describe('findSingleCaptures', () => {
    it('should find matching card on table', () => {
      const played = card('coins', 7);
      const table = [card('cups', 7), card('swords', 3), card('clubs', 5)];

      const captures = findSingleCaptures(played, table);

      expect(captures).toHaveLength(1);
      expect(captures[0].id).toBe('cups-7');
    });

    it('should return empty array when no match', () => {
      const played = card('coins', 7);
      const table = [card('cups', 3), card('swords', 4), card('clubs', 5)];

      const captures = findSingleCaptures(played, table);

      expect(captures).toHaveLength(0);
    });

    it('should find multiple matching cards (same rank, different suits)', () => {
      const played = card('coins', 5);
      const table = [card('cups', 5), card('swords', 5), card('clubs', 3)];

      const captures = findSingleCaptures(played, table);

      expect(captures).toHaveLength(2);
      expect(captures.map((c) => c.id)).toContain('cups-5');
      expect(captures.map((c) => c.id)).toContain('swords-5');
    });

    it('should find King matching King', () => {
      const played = card('coins', 10);
      const table = [card('cups', 10), card('swords', 3)];

      const captures = findSingleCaptures(played, table);

      expect(captures).toHaveLength(1);
      expect(captures[0].value).toBe(10);
    });

    it('should return empty for empty table', () => {
      const played = card('coins', 5);

      const captures = findSingleCaptures(played, []);

      expect(captures).toHaveLength(0);
    });
  });

  describe('findSumCaptures', () => {
    it('should find pairs that sum to played card value', () => {
      const played = card('coins', 7);
      const table = [card('cups', 3), card('swords', 4), card('clubs', 2), card('coins', 5)];

      const captures = findSumCaptures(played, table);

      expect(captures).toHaveLength(2); // [3,4] and [2,5]

      const sums = captures.map((combo) =>
        combo.reduce((sum, c) => sum + c.value, 0)
      );
      expect(sums.every((s) => s === 7)).toBe(true);
    });

    it('should find triple that sums to played card value', () => {
      const played = card('coins', 6);
      const table = [card('cups', 1), card('swords', 2), card('clubs', 3)];

      const captures = findSumCaptures(played, table);

      expect(captures).toHaveLength(1);
      expect(captures[0]).toHaveLength(3);
    });

    it('should return empty when no valid sum exists', () => {
      const played = card('coins', 2);
      const table = [card('cups', 5), card('swords', 6), card('clubs', 7)];

      const captures = findSumCaptures(played, table);

      expect(captures).toHaveLength(0);
    });

    it('should find 4-card combination summing to 10', () => {
      const played = card('coins', 10);
      const table = [card('cups', 1), card('swords', 2), card('clubs', 3), card('coins', 4)];

      const captures = findSumCaptures(played, table);

      expect(captures).toHaveLength(1);
      expect(captures[0]).toHaveLength(4);
    });

    it('should not include single card matches (only 2+ cards)', () => {
      const played = card('coins', 5);
      const table = [card('cups', 5), card('swords', 2), card('clubs', 3)];

      const captures = findSumCaptures(played, table);

      // Should find [2,3] but NOT [5] alone
      expect(captures).toHaveLength(1);
      expect(captures[0]).toHaveLength(2);
    });
  });

  describe('getValidMoves', () => {
    it('should return single capture move when card matches', () => {
      const played = card('coins', 7);
      const table = [card('cups', 7), card('swords', 3)];

      const moves = getValidMoves(played, table, 'human');

      expect(moves).toHaveLength(1);
      expect(moves[0].capturedCards).toHaveLength(1);
      expect(moves[0].capturedCards[0].id).toBe('cups-7');
    });

    it('should return only single capture when both single and sum match (priority rule)', () => {
      const played = card('coins', 7);
      // Table has a 7 AND cards that sum to 7 (3+4)
      const table = [card('cups', 7), card('swords', 3), card('clubs', 4)];

      const moves = getValidMoves(played, table, 'human');

      // Should only return the single card capture
      expect(moves).toHaveLength(1);
      expect(moves[0].capturedCards).toHaveLength(1);
      expect(moves[0].capturedCards[0].id).toBe('cups-7');
    });

    it('should return multiple moves when multiple single cards match', () => {
      const played = card('coins', 5);
      const table = [card('cups', 5), card('swords', 5)];

      const moves = getValidMoves(played, table, 'human');

      expect(moves).toHaveLength(2);
      moves.forEach((m) => {
        expect(m.capturedCards).toHaveLength(1);
        expect(m.capturedCards[0].value).toBe(5);
      });
    });

    it('should return all sum captures when no single match', () => {
      const played = card('coins', 7);
      const table = [card('cups', 3), card('swords', 4), card('clubs', 2), card('coins', 5)];

      const moves = getValidMoves(played, table, 'human');

      expect(moves).toHaveLength(2); // [3,4] and [2,5]
      moves.forEach((m) => {
        expect(m.capturedCards.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should return place move when no captures possible', () => {
      const played = card('coins', 7);
      const table = [card('cups', 1), card('swords', 2)];

      const moves = getValidMoves(played, table, 'human');

      expect(moves).toHaveLength(1);
      expect(moves[0].capturedCards).toHaveLength(0);
      expect(moves[0].isScopa).toBe(false);
    });

    it('should mark move as scopa when capture clears table', () => {
      const played = card('coins', 5);
      const table = [card('cups', 5)];

      const moves = getValidMoves(played, table, 'human');

      expect(moves).toHaveLength(1);
      expect(moves[0].isScopa).toBe(true);
    });

    it('should mark sum capture as scopa when it clears table', () => {
      const played = card('coins', 7);
      const table = [card('cups', 3), card('swords', 4)];

      const moves = getValidMoves(played, table, 'human');

      expect(moves).toHaveLength(1);
      expect(moves[0].isScopa).toBe(true);
    });
  });

  describe('isValidMove', () => {
    it('should return true for valid capture move', () => {
      const hand = [card('coins', 7), card('cups', 3)];
      const table = [card('swords', 7), card('clubs', 2)];
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('swords', 7)],
        isScopa: false,
      };

      expect(isValidMove(move, hand, table)).toBe(true);
    });

    it('should return false when card not in hand', () => {
      const hand = [card('cups', 3)];
      const table = [card('swords', 7)];
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('swords', 7)],
        isScopa: false,
      };

      expect(isValidMove(move, hand, table)).toBe(false);
    });

    it('should return false when captured card not on table', () => {
      const hand = [card('coins', 7)];
      const table = [card('cups', 3)];
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('swords', 7)], // Not on table
        isScopa: false,
      };

      expect(isValidMove(move, hand, table)).toBe(false);
    });

    it('should return false for place move when capture was possible', () => {
      const hand = [card('coins', 7)];
      const table = [card('swords', 7), card('cups', 3)];
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [], // Trying to place when capture exists
        isScopa: false,
      };

      expect(isValidMove(move, hand, table)).toBe(false);
    });

    it('should return true for valid place move when no capture possible', () => {
      const hand = [card('coins', 7)];
      const table = [card('swords', 2), card('cups', 3)];
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [],
        isScopa: false,
      };

      expect(isValidMove(move, hand, table)).toBe(true);
    });

    it('should return false for sum capture when single capture was available', () => {
      const hand = [card('coins', 7)];
      const table = [card('swords', 7), card('cups', 3), card('clubs', 4)];
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 3), card('clubs', 4)], // Sum when single exists
        isScopa: false,
      };

      expect(isValidMove(move, hand, table)).toBe(false);
    });

    it('should return false when sum does not match', () => {
      const hand = [card('coins', 7)];
      const table = [card('cups', 3), card('clubs', 5)]; // 3+5=8, not 7
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 3), card('clubs', 5)],
        isScopa: false,
      };

      expect(isValidMove(move, hand, table)).toBe(false);
    });
  });

  describe('executeMove', () => {
    const createTestState = (): GameState => ({
      status: 'playing',
      round: {
        deck: [],
        table: [card('cups', 7), card('swords', 3), card('clubs', 2)],
        currentPlayer: 'human',
        dealer: 'cpu',
        lastCapture: null,
      },
      players: {
        human: {
          hand: [card('coins', 7), card('coins', 5), card('coins', 1)],
          captured: [],
          scopaCount: 0, scopaCaptures: [],
        },
        cpu: {
          hand: [card('swords', 4), card('cups', 6), card('clubs', 9)],
          captured: [],
          scopaCount: 0, scopaCaptures: [],
        },
      },
      scores: { human: 0, cpu: 0 },
      roundNumber: 1,
      targetScore: 11,
    });

    it('should remove played card from hand after capture', () => {
      const state = createTestState();
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };

      const newState = executeMove(state, move);

      expect(newState.players.human.hand).toHaveLength(2);
      expect(newState.players.human.hand.some((c) => c.id === 'coins-7')).toBe(false);
    });

    it('should add captured cards and played card to captured pile', () => {
      const state = createTestState();
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };

      const newState = executeMove(state, move);

      expect(newState.players.human.captured).toHaveLength(2);
      expect(newState.players.human.captured.some((c) => c.id === 'coins-7')).toBe(true);
      expect(newState.players.human.captured.some((c) => c.id === 'cups-7')).toBe(true);
    });

    it('should remove captured cards from table', () => {
      const state = createTestState();
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };

      const newState = executeMove(state, move);

      expect(newState.round.table).toHaveLength(2);
      expect(newState.round.table.some((c) => c.id === 'cups-7')).toBe(false);
    });

    it('should add card to table when placing', () => {
      const state = createTestState();
      state.round.table = [card('swords', 2)]; // No captures possible for 5
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 5),
        capturedCards: [],
        isScopa: false,
      };

      const newState = executeMove(state, move);

      expect(newState.round.table).toHaveLength(2);
      expect(newState.round.table.some((c) => c.id === 'coins-5')).toBe(true);
    });

    it('should increment scopa count on scopa', () => {
      const state = createTestState();
      state.round.table = [card('cups', 7)]; // Only one card, will be scopa
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: true,
      };

      const newState = executeMove(state, move);

      expect(newState.players.human.scopaCount).toBe(1);
    });

    it('should switch current player after move', () => {
      const state = createTestState();
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };

      const newState = executeMove(state, move);

      expect(newState.round.currentPlayer).toBe('cpu');
    });

    it('should update lastCapture on capture', () => {
      const state = createTestState();
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };

      const newState = executeMove(state, move);

      expect(newState.round.lastCapture).toBe('human');
    });

    it('should not update lastCapture on place', () => {
      const state = createTestState();
      state.round.table = [card('swords', 2)];
      state.round.lastCapture = 'cpu';
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 5),
        capturedCards: [],
        isScopa: false,
      };

      const newState = executeMove(state, move);

      expect(newState.round.lastCapture).toBe('cpu');
    });

    it('should not mutate original state', () => {
      const state = createTestState();
      const originalTableLength = state.round.table.length;
      const originalHandLength = state.players.human.hand.length;

      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };

      executeMove(state, move);

      expect(state.round.table).toHaveLength(originalTableLength);
      expect(state.players.human.hand).toHaveLength(originalHandLength);
    });
  });
});
