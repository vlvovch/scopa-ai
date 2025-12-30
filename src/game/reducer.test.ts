import { describe, it, expect } from 'vitest';
import {
  gameReducer,
  createInitialState,
  type GameAction,
} from './reducer';
import type { Card, GameState, Move } from './types';

// Helper to create cards
const card = (suit: Card['suit'], value: Card['value']): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

describe('Game State Management', () => {
  describe('createInitialState', () => {
    it('should return valid GameState object', () => {
      const state = createInitialState(11);

      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('round');
      expect(state).toHaveProperty('players');
      expect(state).toHaveProperty('scores');
      expect(state).toHaveProperty('roundNumber');
      expect(state).toHaveProperty('targetScore');
    });

    it('should have both players with empty hands and captured piles', () => {
      const state = createInitialState(11);

      expect(state.players.human.hand).toHaveLength(0);
      expect(state.players.human.captured).toHaveLength(0);
      expect(state.players.cpu.hand).toHaveLength(0);
      expect(state.players.cpu.captured).toHaveLength(0);
    });

    it('should have both scores as 0', () => {
      const state = createInitialState(11);

      expect(state.scores.human).toBe(0);
      expect(state.scores.cpu).toBe(0);
    });

    it('should have status as idle', () => {
      const state = createInitialState(11);

      expect(state.status).toBe('idle');
    });

    it('should use provided target score', () => {
      const state = createInitialState(21);

      expect(state.targetScore).toBe(21);
    });

    it('should default to 11 if no target score provided', () => {
      const state = createInitialState();

      expect(state.targetScore).toBe(11);
    });
  });

  describe('START_GAME action', () => {
    it('should set both players to have 3 cards', () => {
      const initial = createInitialState(11);
      const action: GameAction = { type: 'START_GAME', payload: { targetScore: 11 } };

      const state = gameReducer(initial, action);

      expect(state.players.human.hand).toHaveLength(3);
      expect(state.players.cpu.hand).toHaveLength(3);
    });

    it('should set table to have 4 cards', () => {
      const initial = createInitialState(11);
      const action: GameAction = { type: 'START_GAME', payload: { targetScore: 11 } };

      const state = gameReducer(initial, action);

      expect(state.round.table).toHaveLength(4);
    });

    it('should have 30 cards remaining in deck', () => {
      const initial = createInitialState(11);
      const action: GameAction = { type: 'START_GAME', payload: { targetScore: 11 } };

      const state = gameReducer(initial, action);

      // 40 - 6 hands - 4 table = 30
      expect(state.round.deck).toHaveLength(30);
    });

    it('should set status to playing', () => {
      const initial = createInitialState(11);
      const action: GameAction = { type: 'START_GAME', payload: { targetScore: 11 } };

      const state = gameReducer(initial, action);

      expect(state.status).toBe('playing');
    });

    it('should never have 3+ kings on table', () => {
      // Run multiple times to verify re-deal logic
      for (let i = 0; i < 20; i++) {
        const initial = createInitialState(11);
        const action: GameAction = { type: 'START_GAME', payload: { targetScore: 11 } };

        const state = gameReducer(initial, action);
        const kingCount = state.round.table.filter((c) => c.value === 10).length;

        expect(kingCount).toBeLessThanOrEqual(2);
      }
    });

    it('should set current player as opponent of dealer', () => {
      const initial = createInitialState(11);
      const action: GameAction = { type: 'START_GAME', payload: { targetScore: 11 } };

      const state = gameReducer(initial, action);

      // Current player should be opposite of dealer
      if (state.round.dealer === 'human') {
        expect(state.round.currentPlayer).toBe('cpu');
      } else {
        expect(state.round.currentPlayer).toBe('human');
      }
    });
  });

  describe('PLAY_CARD action', () => {
    const createPlayingState = (): GameState => ({
      status: 'playing',
      round: {
        deck: Array(30).fill(null).map((_, i) => card('coins', ((i % 10) + 1) as Card['value'])),
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

    it('should switch current player after move', () => {
      const state = createPlayingState();
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };
      const action: GameAction = { type: 'PLAY_CARD', payload: { move } };

      const newState = gameReducer(state, action);

      expect(newState.round.currentPlayer).toBe('cpu');
    });

    it('should remove played card from hand', () => {
      const state = createPlayingState();
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };
      const action: GameAction = { type: 'PLAY_CARD', payload: { move } };

      const newState = gameReducer(state, action);

      expect(newState.players.human.hand).toHaveLength(2);
      expect(newState.players.human.hand.some((c) => c.id === 'coins-7')).toBe(false);
    });

    it('should remove captured cards from table', () => {
      const state = createPlayingState();
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 7),
        capturedCards: [card('cups', 7)],
        isScopa: false,
      };
      const action: GameAction = { type: 'PLAY_CARD', payload: { move } };

      const newState = gameReducer(state, action);

      expect(newState.round.table.some((c) => c.id === 'cups-7')).toBe(false);
    });

    it('should add card to table when placing', () => {
      const state = createPlayingState();
      state.round.table = [card('swords', 2)]; // No matches for 5
      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 5),
        capturedCards: [],
        isScopa: false,
      };
      const action: GameAction = { type: 'PLAY_CARD', payload: { move } };

      const newState = gameReducer(state, action);

      expect(newState.round.table).toHaveLength(2);
      expect(newState.round.table.some((c) => c.id === 'coins-5')).toBe(true);
    });

    it('should reject move if not current players turn', () => {
      const state = createPlayingState();
      const move: Move = {
        player: 'cpu', // Not cpu's turn
        cardPlayed: card('swords', 4),
        capturedCards: [],
        isScopa: false,
      };
      const action: GameAction = { type: 'PLAY_CARD', payload: { move } };

      const newState = gameReducer(state, action);

      // State should be unchanged
      expect(newState).toEqual(state);
    });
  });

  describe('Re-deal logic (Step 6.5)', () => {
    it('should re-deal when both hands empty and deck has cards', () => {
      const state: GameState = {
        status: 'playing',
        round: {
          deck: Array(24).fill(null).map((_, i) => card('coins', ((i % 10) + 1) as Card['value'])),
          table: [card('cups', 5)],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: null,
        },
        players: {
          human: {
            hand: [card('coins', 5)], // Last card
            captured: [],
            scopaCount: 0, scopaCaptures: [],
          },
          cpu: {
            hand: [], // Already empty
            captured: [],
            scopaCount: 0, scopaCaptures: [],
          },
        },
        scores: { human: 0, cpu: 0 },
        roundNumber: 1,
        targetScore: 11,
      };

      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 5),
        capturedCards: [card('cups', 5)],
        isScopa: true,
      };
      const action: GameAction = { type: 'PLAY_CARD', payload: { move } };

      const newState = gameReducer(state, action);

      // Should have re-dealt
      expect(newState.players.human.hand).toHaveLength(3);
      expect(newState.players.cpu.hand).toHaveLength(3);
      expect(newState.round.deck).toHaveLength(18); // 24 - 6
    });

    it('should set status to roundEnd when deck and hands empty', () => {
      const state: GameState = {
        status: 'playing',
        round: {
          deck: [], // Empty deck
          table: [card('cups', 5)],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: null,
        },
        players: {
          human: {
            hand: [card('coins', 5)], // Last card
            captured: [],
            scopaCount: 0, scopaCaptures: [],
          },
          cpu: {
            hand: [],
            captured: [],
            scopaCount: 0, scopaCaptures: [],
          },
        },
        scores: { human: 0, cpu: 0 },
        roundNumber: 1,
        targetScore: 11,
      };

      const move: Move = {
        player: 'human',
        cardPlayed: card('coins', 5),
        capturedCards: [card('cups', 5)],
        isScopa: false, // Not scopa on last play
      };
      const action: GameAction = { type: 'PLAY_CARD', payload: { move } };

      const newState = gameReducer(state, action);

      expect(newState.status).toBe('roundEnd');
    });
  });

  describe('END_ROUND action', () => {
    it('should give remaining table cards to last capture player', () => {
      const state: GameState = {
        status: 'roundEnd',
        round: {
          deck: [],
          table: [card('coins', 3), card('cups', 4)],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: 'human',
        },
        players: {
          human: {
            hand: [],
            captured: [card('coins', 7)],
            scopaCount: 0, scopaCaptures: [],
          },
          cpu: {
            hand: [],
            captured: [],
            scopaCount: 0, scopaCaptures: [],
          },
        },
        scores: { human: 0, cpu: 0 },
        roundNumber: 1,
        targetScore: 11,
      };

      const action: GameAction = { type: 'END_ROUND' };
      const newState = gameReducer(state, action);

      expect(newState.round.table).toHaveLength(0);
      expect(newState.players.human.captured).toHaveLength(3); // 1 + 2 from table
    });

    it('should accumulate scores correctly', () => {
      const state: GameState = {
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
              // 22 cards, all coins, has 7 of coins, good prime
              ...Array(10).fill(null).map((_, i) => card('coins', (i + 1) as Card['value'])),
              ...Array(10).fill(null).map((_, i) => card('cups', (i + 1) as Card['value'])),
              card('swords', 7), card('clubs', 7),
            ],
            scopaCount: 2, scopaCaptures: [],
          },
          cpu: {
            hand: [],
            captured: [
              ...Array(8).fill(null).map((_, i) => card('swords', (i + 1) as Card['value'])),
              ...Array(8).fill(null).map((_, i) => card('clubs', (i + 1) as Card['value'])),
            ],
            scopaCount: 0, scopaCaptures: [],
          },
        },
        scores: { human: 3, cpu: 2 },
        roundNumber: 1,
        targetScore: 11,
      };

      const action: GameAction = { type: 'END_ROUND' };
      const newState = gameReducer(state, action);

      // Human should get: cards(1) + coins(1) + setteBello(1) + prime(1) + scopas(2) = 6
      expect(newState.scores.human).toBe(3 + 6);
      expect(newState.scores.cpu).toBe(2 + 0);
    });

    it('should set status to gameEnd when player reaches target', () => {
      const state: GameState = {
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
            captured: Array(22).fill(null).map((_, i) => {
              const suits: Card['suit'][] = ['coins', 'cups', 'swords', 'clubs'];
              return card(suits[i % 4], ((i % 10) + 1) as Card['value']);
            }),
            scopaCount: 3, scopaCaptures: [],
          },
          cpu: {
            hand: [],
            captured: Array(18).fill(null).map((_, i) => {
              const suits: Card['suit'][] = ['coins', 'cups', 'swords', 'clubs'];
              return card(suits[i % 4], ((i % 10) + 1) as Card['value']);
            }),
            scopaCount: 0, scopaCaptures: [],
          },
        },
        scores: { human: 9, cpu: 5 },
        roundNumber: 2,
        targetScore: 11,
      };

      const action: GameAction = { type: 'END_ROUND' };
      const newState = gameReducer(state, action);

      // Status stays 'roundEnd' but isGameOver flag is set
      expect(newState.status).toBe('roundEnd');
      expect(newState.isGameOver).toBe(true);
    });
  });

  describe('NEXT_ROUND action', () => {
    it('should rotate dealer', () => {
      const state: GameState = {
        status: 'roundEnd',
        round: {
          deck: [],
          table: [],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: 'human',
        },
        players: {
          human: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
          cpu: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
        },
        scores: { human: 5, cpu: 3 },
        roundNumber: 1,
        targetScore: 11,
      };

      const action: GameAction = { type: 'NEXT_ROUND' };
      const newState = gameReducer(state, action);

      expect(newState.round.dealer).toBe('human'); // Rotated from cpu
    });

    it('should preserve scores from previous round', () => {
      const state: GameState = {
        status: 'roundEnd',
        round: {
          deck: [],
          table: [],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: 'human',
        },
        players: {
          human: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
          cpu: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
        },
        scores: { human: 5, cpu: 3 },
        roundNumber: 1,
        targetScore: 11,
      };

      const action: GameAction = { type: 'NEXT_ROUND' };
      const newState = gameReducer(state, action);

      expect(newState.scores.human).toBe(5);
      expect(newState.scores.cpu).toBe(3);
    });

    it('should deal new full deck', () => {
      const state: GameState = {
        status: 'roundEnd',
        round: {
          deck: [],
          table: [],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: 'human',
        },
        players: {
          human: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
          cpu: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
        },
        scores: { human: 5, cpu: 3 },
        roundNumber: 1,
        targetScore: 11,
      };

      const action: GameAction = { type: 'NEXT_ROUND' };
      const newState = gameReducer(state, action);

      // 40 - 6 (hands) - 4 (table) = 30
      expect(newState.round.deck).toHaveLength(30);
      expect(newState.players.human.hand).toHaveLength(3);
      expect(newState.players.cpu.hand).toHaveLength(3);
      expect(newState.round.table).toHaveLength(4);
    });

    it('should increment round number', () => {
      const state: GameState = {
        status: 'roundEnd',
        round: {
          deck: [],
          table: [],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: 'human',
        },
        players: {
          human: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
          cpu: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
        },
        scores: { human: 5, cpu: 3 },
        roundNumber: 2,
        targetScore: 11,
      };

      const action: GameAction = { type: 'NEXT_ROUND' };
      const newState = gameReducer(state, action);

      expect(newState.roundNumber).toBe(3);
    });

    it('should set status to playing', () => {
      const state: GameState = {
        status: 'roundEnd',
        round: {
          deck: [],
          table: [],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: 'human',
        },
        players: {
          human: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
          cpu: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
        },
        scores: { human: 5, cpu: 3 },
        roundNumber: 1,
        targetScore: 11,
      };

      const action: GameAction = { type: 'NEXT_ROUND' };
      const newState = gameReducer(state, action);

      expect(newState.status).toBe('playing');
    });

    it('should reset scopa counts', () => {
      const state: GameState = {
        status: 'roundEnd',
        round: {
          deck: [],
          table: [],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: 'human',
        },
        players: {
          human: { hand: [], captured: [], scopaCount: 3, scopaCaptures: [] },
          cpu: { hand: [], captured: [], scopaCount: 1, scopaCaptures: [] },
        },
        scores: { human: 5, cpu: 3 },
        roundNumber: 1,
        targetScore: 11,
      };

      const action: GameAction = { type: 'NEXT_ROUND' };
      const newState = gameReducer(state, action);

      expect(newState.players.human.scopaCount).toBe(0);
      expect(newState.players.cpu.scopaCount).toBe(0);
    });
  });

  describe('RESET_GAME action', () => {
    it('should return to initial state', () => {
      const state: GameState = {
        status: 'gameEnd',
        round: {
          deck: [],
          table: [],
          currentPlayer: 'human',
          dealer: 'cpu',
          lastCapture: 'human',
        },
        players: {
          human: { hand: [], captured: [], scopaCount: 2, scopaCaptures: [] },
          cpu: { hand: [], captured: [], scopaCount: 1, scopaCaptures: [] },
        },
        scores: { human: 11, cpu: 8 },
        roundNumber: 4,
        targetScore: 11,
      };

      const action: GameAction = { type: 'RESET_GAME' };
      const newState = gameReducer(state, action);

      expect(newState.status).toBe('idle');
      expect(newState.scores.human).toBe(0);
      expect(newState.scores.cpu).toBe(0);
      expect(newState.roundNumber).toBe(1);
      expect(newState.targetScore).toBe(11); // Preserved
    });
  });
});
