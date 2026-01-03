// Phase 6: Game State Management

import type { Card, GameState, GameMode, Move, PlayerId } from './types';
import { DEFAULT_TARGET_SCORE, CARDS_PER_HAND, INITIAL_TABLE_CARDS } from './constants';
import { createDeck, shuffleDeck, dealCards, isValidInitialDeal } from './deck';
import { executeMove, isValidMove } from './rules';
import { calculateRoundScore } from './scoring';

// Step 6.1: Game Reducer Actions

export type GameAction =
  | { type: 'START_GAME'; payload: { targetScore: number; gameMode?: GameMode } }
  | { type: 'DEAL_CARDS' }
  | { type: 'PLAY_CARD'; payload: { move: Move } }
  | { type: 'END_ROUND' }
  | { type: 'NEXT_ROUND' }
  | { type: 'SHOW_GAME_END' }
  | { type: 'RESET_GAME' };

/**
 * Step 6.2: Create the initial game state.
 */
export function createInitialState(targetScore: number = DEFAULT_TARGET_SCORE): GameState {
  return {
    status: 'idle',
    round: {
      deck: [],
      table: [],
      currentPlayer: 'human',
      dealer: 'cpu',
      lastCapture: null,
    },
    players: {
      human: {
        hand: [],
        captured: [],
        scopaCount: 0,
        scopaCaptures: [],
      },
      cpu: {
        hand: [],
        captured: [],
        scopaCount: 0,
        scopaCaptures: [],
      },
    },
    scores: {
      human: 0,
      cpu: 0,
    },
    roundNumber: 1,
    targetScore,
    roundHistory: [],
  };
}

/**
 * Helper: Deal initial hands and table cards for a new round/game.
 */
function dealInitialCards(state: GameState): GameState {
  let deck = shuffleDeck(createDeck());
  let table: Card[];
  let remaining: Card[];

  // Keep re-dealing until we get valid initial table (not 3+ kings)
  do {
    deck = shuffleDeck(createDeck());
    const tableResult = dealCards(deck, INITIAL_TABLE_CARDS);
    table = tableResult.dealt;
    remaining = tableResult.remaining;
  } while (!isValidInitialDeal(table));

  // Deal hands to both players
  const humanDeal = dealCards(remaining, CARDS_PER_HAND);
  const cpuDeal = dealCards(humanDeal.remaining, CARDS_PER_HAND);

  // Current player is opponent of dealer (to the right)
  const currentPlayer: PlayerId = state.round.dealer === 'human' ? 'cpu' : 'human';

  return {
    ...state,
    status: 'playing',
    round: {
      ...state.round,
      deck: cpuDeal.remaining,
      table,
      currentPlayer,
      lastCapture: null,
    },
    players: {
      human: {
        ...state.players.human,
        hand: humanDeal.dealt,
      },
      cpu: {
        ...state.players.cpu,
        hand: cpuDeal.dealt,
      },
    },
  };
}

/**
 * Step 6.3: Handle START_GAME action.
 */
function handleStartGame(_state: GameState, targetScore: number, gameMode: GameMode = 'pvsCPU'): GameState {
  // Reset to initial state with target score
  const freshState = createInitialState(targetScore);
  freshState.gameMode = gameMode;

  // Randomly select first dealer
  const dealer: PlayerId = Math.random() < 0.5 ? 'human' : 'cpu';
  freshState.round.dealer = dealer;

  // Deal cards
  return dealInitialCards(freshState);
}

/**
 * Step 6.4: Handle PLAY_CARD action.
 */
function handlePlayCard(state: GameState, move: Move): GameState {
  // Validate it's the current player's turn
  if (move.player !== state.round.currentPlayer) {
    return state; // Invalid: not this player's turn
  }

  // Validate the move is legal
  const hand = state.players[move.player].hand;
  const table = state.round.table;
  if (!isValidMove(move, hand, table)) {
    return state; // Invalid move
  }

  // Execute the move
  let newState = executeMove(state, move);

  // Step 6.5: Check if re-deal needed (both hands empty, deck has cards)
  const humanHandEmpty = newState.players.human.hand.length === 0;
  const cpuHandEmpty = newState.players.cpu.hand.length === 0;

  if (humanHandEmpty && cpuHandEmpty) {
    if (newState.round.deck.length > 0) {
      // Re-deal: give 3 cards to each player
      const humanDeal = dealCards(newState.round.deck, CARDS_PER_HAND);
      const cpuDeal = dealCards(humanDeal.remaining, CARDS_PER_HAND);

      newState = {
        ...newState,
        round: {
          ...newState.round,
          deck: cpuDeal.remaining,
        },
        players: {
          human: {
            ...newState.players.human,
            hand: humanDeal.dealt,
          },
          cpu: {
            ...newState.players.cpu,
            hand: cpuDeal.dealt,
          },
        },
      };
    } else {
      // Deck empty and hands empty = round end
      // IMPORTANT: Scopa on the last hand doesn't count!
      // If the move was a scopa, undo it
      if (move.isScopa) {
        const playerState = newState.players[move.player];
        newState = {
          ...newState,
          players: {
            ...newState.players,
            [move.player]: {
              ...playerState,
              scopaCount: playerState.scopaCount - 1,
              scopaCaptures: playerState.scopaCaptures.slice(0, -1),
            },
          },
        };
      }
      newState = {
        ...newState,
        status: 'roundEnd',
      };
    }
  }

  return newState;
}

/**
 * Step 6.6: Handle END_ROUND action.
 */
function handleEndRound(state: GameState): GameState {
  // Award remaining table cards to last capture player
  let finalState = state;

  if (state.round.table.length > 0 && state.round.lastCapture) {
    const lastPlayer = state.round.lastCapture;
    finalState = {
      ...state,
      round: {
        ...state.round,
        table: [],
      },
      players: {
        ...state.players,
        [lastPlayer]: {
          ...state.players[lastPlayer],
          captured: [...state.players[lastPlayer].captured, ...state.round.table],
        },
      },
    };
  }

  // Calculate round scores
  const roundScores = calculateRoundScore(finalState);

  // Add round scores to cumulative scores
  const newHumanScore = finalState.scores.human + roundScores.human.total;
  const newCpuScore = finalState.scores.cpu + roundScores.cpu.total;

  // Check if game should end
  const humanReachedTarget = newHumanScore >= finalState.targetScore;
  const cpuReachedTarget = newCpuScore >= finalState.targetScore;
  const isGameOver = humanReachedTarget || cpuReachedTarget;

  // Add to round history
  const historyEntry = {
    roundNumber: finalState.roundNumber,
    scores: roundScores,
  };

  // Accumulate category totals (tracks ALL rounds, not truncated)
  const prevTotals = finalState.categoryTotals || {
    human: { cards: 0, coins: 0, setteBello: 0, prime: 0, scopas: 0 },
    cpu: { cards: 0, coins: 0, setteBello: 0, prime: 0, scopas: 0 },
  };
  const newCategoryTotals = {
    human: {
      cards: prevTotals.human.cards + roundScores.human.cards,
      coins: prevTotals.human.coins + roundScores.human.coins,
      setteBello: prevTotals.human.setteBello + roundScores.human.setteBello,
      prime: prevTotals.human.prime + roundScores.human.prime,
      scopas: prevTotals.human.scopas + roundScores.human.scopas,
    },
    cpu: {
      cards: prevTotals.cpu.cards + roundScores.cpu.cards,
      coins: prevTotals.cpu.coins + roundScores.cpu.coins,
      setteBello: prevTotals.cpu.setteBello + roundScores.cpu.setteBello,
      prime: prevTotals.cpu.prime + roundScores.cpu.prime,
      scopas: prevTotals.cpu.scopas + roundScores.cpu.scopas,
    },
  };

  // Always show round summary first (status stays 'roundEnd')
  // isGameOver flag indicates whether to show "See Results" vs "Next Round"
  return {
    ...finalState,
    status: 'roundEnd',
    scores: {
      human: newHumanScore,
      cpu: newCpuScore,
    },
    lastRoundScores: roundScores,
    // Limit history to last 100 rounds to prevent memory issues
    roundHistory: [...finalState.roundHistory.slice(-9999), historyEntry],
    categoryTotals: newCategoryTotals,
    isGameOver,
  };
}

/**
 * Step 6.7: Handle NEXT_ROUND action.
 */
function handleNextRound(state: GameState): GameState {
  // Rotate dealer
  const newDealer: PlayerId = state.round.dealer === 'human' ? 'cpu' : 'human';

  // Reset round-specific state but keep scores
  const nextRoundState: GameState = {
    ...state,
    status: 'playing',
    round: {
      deck: [],
      table: [],
      currentPlayer: newDealer === 'human' ? 'cpu' : 'human', // Opponent of dealer goes first
      dealer: newDealer,
      lastCapture: null,
    },
    players: {
      human: {
        hand: [],
        captured: [],
        scopaCount: 0,
        scopaCaptures: [],
      },
      cpu: {
        hand: [],
        captured: [],
        scopaCount: 0,
        scopaCaptures: [],
      },
    },
    roundNumber: state.roundNumber + 1,
    // Clear lastRoundScores so endRound() triggers on next round end
    lastRoundScores: undefined,
  };

  // Deal new cards
  return dealInitialCards(nextRoundState);
}

/**
 * Main game reducer.
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return handleStartGame(state, action.payload.targetScore, action.payload.gameMode);

    case 'PLAY_CARD':
      return handlePlayCard(state, action.payload.move);

    case 'END_ROUND':
      return handleEndRound(state);

    case 'NEXT_ROUND':
      return handleNextRound(state);

    case 'SHOW_GAME_END':
      return { ...state, status: 'gameEnd' };

    case 'RESET_GAME':
      return createInitialState(state.targetScore);

    case 'DEAL_CARDS':
      // Re-deal if needed (mostly handled in PLAY_CARD)
      return dealInitialCards(state);

    default:
      return state;
  }
}
