import { describe, it, expect } from 'vitest';
import type {
  Card,
  Suit,
  CardValue,
  PlayerId,
  GameStatus,
  PlayerState,
  GameState,
  Move,
} from './types';

describe('Type Definitions', () => {
  describe('Card type', () => {
    it('should allow valid card objects', () => {
      const card: Card = {
        suit: 'coins',
        value: 7,
        id: 'coins-7',
      };
      expect(card.suit).toBe('coins');
      expect(card.value).toBe(7);
      expect(card.id).toBe('coins-7');
    });

    it('should allow all valid suits', () => {
      const suits: Suit[] = ['coins', 'cups', 'swords', 'clubs'];
      suits.forEach((suit) => {
        const card: Card = { suit, value: 1, id: `${suit}-1` };
        expect(card.suit).toBe(suit);
      });
    });

    it('should allow all valid card values', () => {
      const values: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      values.forEach((value) => {
        const card: Card = { suit: 'coins', value, id: `coins-${value}` };
        expect(card.value).toBe(value);
      });
    });
  });

  describe('PlayerId type', () => {
    it('should allow human and cpu', () => {
      const human: PlayerId = 'human';
      const cpu: PlayerId = 'cpu';
      expect(human).toBe('human');
      expect(cpu).toBe('cpu');
    });
  });

  describe('GameStatus type', () => {
    it('should allow all valid statuses', () => {
      const statuses: GameStatus[] = ['idle', 'dealing', 'playing', 'roundEnd', 'gameEnd'];
      expect(statuses).toHaveLength(5);
    });
  });

  describe('PlayerState type', () => {
    it('should allow valid player state', () => {
      const state: PlayerState = {
        hand: [],
        captured: [],
        scopaCount: 0, scopaCaptures: [],
      };
      expect(state.hand).toEqual([]);
      expect(state.captured).toEqual([]);
      expect(state.scopaCount).toBe(0);
    });
  });

  describe('Move type', () => {
    it('should allow a capture move', () => {
      const playedCard: Card = { suit: 'coins', value: 7, id: 'coins-7' };
      const capturedCard: Card = { suit: 'cups', value: 7, id: 'cups-7' };

      const move: Move = {
        player: 'human',
        cardPlayed: playedCard,
        capturedCards: [capturedCard],
        isScopa: false,
      };

      expect(move.capturedCards).toHaveLength(1);
      expect(move.isScopa).toBe(false);
    });

    it('should allow a place move (empty capturedCards)', () => {
      const playedCard: Card = { suit: 'swords', value: 3, id: 'swords-3' };

      const move: Move = {
        player: 'cpu',
        cardPlayed: playedCard,
        capturedCards: [],
        isScopa: false,
      };

      expect(move.capturedCards).toHaveLength(0);
    });

    it('should allow a scopa move', () => {
      const playedCard: Card = { suit: 'clubs', value: 5, id: 'clubs-5' };
      const tableCard: Card = { suit: 'coins', value: 5, id: 'coins-5' };

      const move: Move = {
        player: 'human',
        cardPlayed: playedCard,
        capturedCards: [tableCard],
        isScopa: true,
      };

      expect(move.isScopa).toBe(true);
    });
  });

  describe('GameState type', () => {
    it('should allow a valid initial game state', () => {
      const state: GameState = {
        status: 'idle',
        round: {
          deck: [],
          table: [],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: null,
        },
        players: {
          human: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
          cpu: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
        },
        scores: {
          human: 0,
          cpu: 0,
        },
        roundNumber: 1,
      roundHistory: [],
        targetScore: 11,
      };

      expect(state.status).toBe('idle');
      expect(state.roundNumber).toBe(1);
      expect(state.targetScore).toBe(11);
      expect(state.scores.human).toBe(0);
      expect(state.scores.cpu).toBe(0);
    });
  });
});
