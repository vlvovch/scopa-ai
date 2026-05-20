// Expert AI Player - Uses Information Set Monte Carlo Tree Search (ISMCTS)
// with alpha-beta pruning and determinization for hidden information

import type { Card, GameState, Move, PlayerId } from '../types';
import type { AIPlayer, AIContext } from './types';
import { getValidMoves } from '../rules';
import { executeMove } from '../rules';
import { PRIME_VALUES, SUITS } from '../constants';
import { createDeck } from '../deck';

// ============================================================================
// Configuration
// ============================================================================

export interface ExpertOptions {
  timeBudgetMs?: number;
  maxDepth?: number;
  determinizations?: number;
  rollouts?: number;
  rolloutDepth?: number;
}

const DEFAULT_TIME_BUDGET_MS = 50;
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_DETERMINIZATIONS = 6;
const DEFAULT_ROLLOUTS = 1;
const DEFAULT_ROLLOUT_DEPTH = 6;

// ============================================================================
// Random Number Generator
// ============================================================================

export interface Rng {
  nextInt(max: number): number;
}

function createRng(): Rng {
  return {
    nextInt(max: number): number {
      return Math.floor(Math.random() * max);
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const isSetteBello = (card: Card): boolean =>
  card.suit === 'coins' && card.value === 7;

const sortIds = (cards: Card[] | undefined): string[] =>
  (cards ?? []).map((card) => card.id).sort();

export const moveKey = (move: Move): string =>
  `${move.cardPlayed.id}:${sortIds(move.capturedCards).join('+')}`;

const countCoins = (cards: Card[]): number =>
  cards.reduce((count, card) => count + (card.suit === 'coins' ? 1 : 0), 0);

export const getOpponent = (player: PlayerId): PlayerId =>
  player === 'human' ? 'cpu' : 'human';

// ============================================================================
// Primiera Scoring (adapted for this webapp's types)
// ============================================================================

const getPrimieraValue = (card: Card): number => PRIME_VALUES[card.value];

const getBestPrimieraBySuit = (cards: Card[]): Record<string, number> => {
  const best: Record<string, number> = {};
  for (const suit of SUITS) {
    const suitCards = cards.filter((c) => c.suit === suit);
    if (suitCards.length > 0) {
      best[suit] = Math.max(...suitCards.map(getPrimieraValue));
    }
  }
  return best;
};

const getPrimieraTotal = (bySuit: Record<string, number>): number => {
  let total = 0;
  for (const suit of SUITS) {
    if (bySuit[suit] !== undefined) {
      total += bySuit[suit];
    }
  }
  return total;
};

const getPrimieraScore = (cards: Card[]): number =>
  getPrimieraTotal(getBestPrimieraBySuit(cards));

// ============================================================================
// Card Knowledge Functions
// ============================================================================

const buildKnownCards = (state: GameState, player: PlayerId): Card[] => [
  ...state.round.table,
  ...state.players[player].hand,
  ...state.players.human.captured,
  ...state.players.cpu.captured,
];

const getUnknownCards = (state: GameState, player: PlayerId): Card[] => {
  const knownIds = new Set(buildKnownCards(state, player).map((card) => card.id));
  return createDeck().filter((card) => !knownIds.has(card.id));
};

const drawRandomCards = (pool: Card[], count: number, rng: Rng): Card[] => {
  const drawn: Card[] = [];
  const poolCopy = [...pool];
  for (let i = 0; i < count; i += 1) {
    if (poolCopy.length === 0) break;
    const index = rng.nextInt(poolCopy.length);
    const [card] = poolCopy.splice(index, 1);
    drawn.push(card);
  }
  return drawn;
};

// ============================================================================
// State Determinization
// ============================================================================

export const determinizeState = (state: GameState, player: PlayerId, rng: Rng): GameState => {
  const opponent = getOpponent(player);
  const unknownCards = getUnknownCards(state, player);
  const opponentHandSize = state.players[opponent].hand.length;
  const deckSize = state.round.deck.length;

  if (unknownCards.length !== opponentHandSize + deckSize) {
    // Information mismatch - return state as-is
    return state;
  }

  const pool = [...unknownCards];
  const opponentHand = drawRandomCards(pool, opponentHandSize, rng);
  const deck = drawRandomCards(pool, deckSize, rng);

  return {
    ...state,
    round: {
      ...state.round,
      deck,
    },
    players: {
      ...state.players,
      [opponent]: {
        ...state.players[opponent],
        hand: opponentHand,
      },
    },
  };
};

// ============================================================================
// Evaluation Functions
// ============================================================================

const getSetteBelloScore = (state: GameState, player: PlayerId): number => {
  const opponent = getOpponent(player);
  const ownedByPlayer = state.players[player].captured.some(isSetteBello);
  const ownedByOpponent = state.players[opponent].captured.some(isSetteBello);

  if (ownedByPlayer) return 1;
  if (ownedByOpponent) return -1;
  if (state.players[player].hand.some(isSetteBello)) return 0.7;
  if (state.players[opponent].hand.some(isSetteBello)) return -0.7;
  if (state.round.table.some(isSetteBello)) return 0.3;
  return 0;
};

const countCapturingCards = (hand: Card[], table: Card[]): number =>
  hand.reduce((count, card) => {
    const moves = getValidMoves(card, table, 'cpu');
    const hasCapture = moves.some((m) => m.capturedCards.length > 0);
    return count + (hasCapture ? 1 : 0);
  }, 0);

/**
 * Evaluate a game state from the perspective of a player.
 * Returns a score where positive = good for player, negative = bad.
 */
const evaluateState = (state: GameState, player: PlayerId): number => {
  const opponent = getOpponent(player);

  // Terminal state: use actual round scores
  if (state.status === 'roundEnd' || state.status === 'gameEnd') {
    // Calculate a simplified round score difference
    const playerCaptured = state.players[player].captured;
    const opponentCaptured = state.players[opponent].captured;

    let score = 0;

    // Cards point
    if (playerCaptured.length > opponentCaptured.length) score += 1;
    else if (opponentCaptured.length > playerCaptured.length) score -= 1;

    // Coins point
    const playerCoins = countCoins(playerCaptured);
    const opponentCoins = countCoins(opponentCaptured);
    if (playerCoins > opponentCoins) score += 1;
    else if (opponentCoins > playerCoins) score -= 1;

    // Sette Bello point
    if (playerCaptured.some(isSetteBello)) score += 1;
    else if (opponentCaptured.some(isSetteBello)) score -= 1;

    // Prime point (simplified - just compare totals)
    const playerPrime = getPrimieraScore(playerCaptured);
    const opponentPrime = getPrimieraScore(opponentCaptured);
    if (playerPrime > opponentPrime) score += 1;
    else if (opponentPrime > playerPrime) score -= 1;

    // Scopas
    score += state.players[player].scopaCount;
    score -= state.players[opponent].scopaCount;

    return score * 1000;
  }

  // Non-terminal: heuristic evaluation
  const captureDiff =
    state.players[player].captured.length - state.players[opponent].captured.length;
  const denariDiff =
    countCoins(state.players[player].captured) - countCoins(state.players[opponent].captured);
  const scopaDiff =
    state.players[player].scopaCount - state.players[opponent].scopaCount;
  const primieraCapturedDiff =
    getPrimieraScore(state.players[player].captured) -
    getPrimieraScore(state.players[opponent].captured);
  const primieraPotentialDiff =
    getPrimieraScore([...state.players[player].captured, ...state.players[player].hand]) -
    getPrimieraScore([...state.players[opponent].captured, ...state.players[opponent].hand]);
  const setteBelloScore = getSetteBelloScore(state, player);
  const lastCapturerBonus =
    state.round.lastCapture === player ? 0.6 : state.round.lastCapture === opponent ? -0.6 : 0;
  const playerCaptureCount = countCapturingCards(state.players[player].hand, state.round.table);
  const opponentCaptureCount = countCapturingCards(state.players[opponent].hand, state.round.table);

  return (
    scopaDiff * 120 +
    denariDiff * 18 +
    captureDiff * 4 +
    primieraCapturedDiff * 8 +
    primieraPotentialDiff * 2 +
    setteBelloScore * 120 +
    lastCapturerBonus * 15 +
    playerCaptureCount * 6 -
    opponentCaptureCount * 9 +
    (state.round.currentPlayer === player ? 5 : -5)
  );
};

// ============================================================================
// Rollout Evaluation
// ============================================================================

const evaluateWithRollouts = (
  state: GameState,
  player: PlayerId,
  rng: Rng,
  deadline: number,
  options: ExpertOptions
): number => {
  const baseScore = evaluateState(state, player);
  const rolloutCount = options.rollouts ?? DEFAULT_ROLLOUTS;
  const rolloutDepth = options.rolloutDepth ?? DEFAULT_ROLLOUT_DEPTH;

  if (rolloutCount <= 0 || rolloutDepth <= 0) {
    return baseScore;
  }

  let total = baseScore;
  let count = 1;

  for (let i = 0; i < rolloutCount; i += 1) {
    if (now() >= deadline) break;

    let current = state;
    for (let step = 0; step < rolloutDepth; step += 1) {
      if (current.status !== 'playing' || now() >= deadline) break;

      const legalMoves = getAllMoves(current);
      if (legalMoves.length === 0) break;

      const move = legalMoves[rng.nextInt(legalMoves.length)];
      current = executeMove(current, move);
    }
    total += evaluateState(current, player);
    count += 1;
  }

  return total / count;
};

// ============================================================================
// Move Ordering
// ============================================================================

export const orderMoves = (state: GameState, moves: Move[]): Move[] => {
  const scoreMove = (move: Move): number => {
    if (move.capturedCards.length === 0) {
      return -5;
    }

    const capturedCards = [move.cardPlayed, ...move.capturedCards];
    const clearsTable = move.capturedCards.length === state.round.table.length;
    const denariCount = countCoins(capturedCards);
    const primieraValue = capturedCards.reduce(
      (total, card) => total + getPrimieraValue(card),
      0
    );
    const setteBelloBonus = capturedCards.some(isSetteBello) ? 80 : 0;

    return (
      (clearsTable ? 1000 : 0) +
      setteBelloBonus +
      denariCount * 20 +
      primieraValue +
      capturedCards.length * 6
    );
  };

  return [...moves].sort((a, b) => scoreMove(b) - scoreMove(a));
};

// ============================================================================
// Alpha-Beta Search
// ============================================================================

export const alphaBeta = (
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  player: PlayerId,
  rng: Rng,
  deadline: number,
  options: ExpertOptions
): number => {
  if (now() >= deadline) {
    return evaluateState(state, player);
  }

  if (depth <= 0 || state.status !== 'playing') {
    return evaluateWithRollouts(state, player, rng, deadline, options);
  }

  const legalMoves = getAllMoves(state);
  if (legalMoves.length === 0) {
    return evaluateState(state, player);
  }

  const orderedMoves = orderMoves(state, legalMoves);
  const maximizing = state.round.currentPlayer === player;

  if (maximizing) {
    let value = -Infinity;
    for (const move of orderedMoves) {
      const nextState = executeMove(state, move);
      value = Math.max(
        value,
        alphaBeta(nextState, depth - 1, alpha, beta, player, rng, deadline, options)
      );
      alpha = Math.max(alpha, value);
      if (alpha >= beta || now() >= deadline) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of orderedMoves) {
    const nextState = executeMove(state, move);
    value = Math.min(
      value,
      alphaBeta(nextState, depth - 1, alpha, beta, player, rng, deadline, options)
    );
    beta = Math.min(beta, value);
    if (beta <= alpha || now() >= deadline) break;
  }
  return value;
};

// ============================================================================
// Move Generation
// ============================================================================

/**
 * Get all legal moves for the current player
 */
export function getAllMoves(state: GameState): Move[] {
  const player = state.round.currentPlayer;
  const hand = state.players[player].hand;
  const table = state.round.table;

  const allMoves: Move[] = [];
  for (const card of hand) {
    const moves = getValidMoves(card, table, player);
    allMoves.push(...moves);
  }
  return allMoves;
}

// ============================================================================
// Main Expert Move Selection
// ============================================================================

export const selectExpertMove = (
  state: GameState,
  legalMoves: Move[],
  options: ExpertOptions = {}
): Move => {
  if (legalMoves.length === 0) {
    throw new Error('No legal moves available for expert CPU.');
  }

  // Single move - no need for search
  if (legalMoves.length === 1) {
    return legalMoves[0];
  }

  const rng = createRng();
  const player = state.round.currentPlayer;
  const opponent = getOpponent(player);
  const unknownCards = getUnknownCards(state, player);
  const endgamePerfectInfo =
    state.round.deck.length === 0 &&
    unknownCards.length === state.players[opponent].hand.length;

  // Calculate search depth
  const baseDepth =
    options.maxDepth ??
    (legalMoves.length > 8 ? Math.max(2, DEFAULT_MAX_DEPTH - 1) : DEFAULT_MAX_DEPTH);
  const endgameDepth =
    state.players.human.hand.length + state.players.cpu.hand.length;
  const depth = endgamePerfectInfo ? Math.max(baseDepth, endgameDepth) : baseDepth;

  const deadline = now() + (options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS);
  const orderedMoves = orderMoves(state, legalMoves);

  // Endgame with perfect information
  if (endgamePerfectInfo) {
    const determinized: GameState = {
      ...state,
      round: {
        ...state.round,
        deck: [],
      },
      players: {
        ...state.players,
        [opponent]: {
          ...state.players[opponent],
          hand: unknownCards,
        },
      },
    };

    let bestMove = orderedMoves[0];
    let bestScore = -Infinity;
    for (const move of orderedMoves) {
      const nextState = executeMove(determinized, move);
      const score = alphaBeta(
        nextState,
        depth - 1,
        -Infinity,
        Infinity,
        player,
        rng,
        deadline,
        options
      );
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  // General case: sample multiple determinizations
  const maxSamples = options.determinizations ?? DEFAULT_DETERMINIZATIONS;
  const totals = new Map<string, { sum: number; count: number }>();

  for (const move of orderedMoves) {
    totals.set(moveKey(move), { sum: 0, count: 0 });
  }

  for (let sampleIndex = 0; sampleIndex < maxSamples; sampleIndex += 1) {
    if (now() >= deadline) break;

    const determinized = determinizeState(state, player, rng);

    for (const move of orderedMoves) {
      if (now() >= deadline) break;

      const nextState = executeMove(determinized, move);
      const score = alphaBeta(
        nextState,
        depth - 1,
        -Infinity,
        Infinity,
        player,
        rng,
        deadline,
        options
      );
      const key = moveKey(move);
      const entry = totals.get(key);
      if (entry) {
        entry.sum += score;
        entry.count += 1;
      }
    }
  }

  let bestMove = orderedMoves[0];
  let bestScore = -Infinity;
  for (const move of orderedMoves) {
    const entry = totals.get(moveKey(move));
    const average = entry && entry.count > 0 ? entry.sum / entry.count : -Infinity;
    if (average > bestScore) {
      bestScore = average;
      bestMove = move;
    }
  }

  return bestMove;
};

// ============================================================================
// AI Player Interface
// ============================================================================

/**
 * Expert AI that uses ISMCTS with alpha-beta pruning.
 * Handles hidden information through determinization sampling.
 */
export const expertAI: AIPlayer = {
  name: 'Expert',

  selectMove(context: AIContext): Move {
    const { hand, table, player } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    // Get all possible moves
    const allMoves: Move[] = [];
    for (const card of hand) {
      const moves = getValidMoves(card, table, player);
      allMoves.push(...moves);
    }

    if (allMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    // For the basic AIContext, we don't have full game state
    // Use heuristic-style scoring as fallback
    // The full expert search is used when called with full state via selectExpertMove

    // Simple heuristic fallback for AIContext-only calls
    const scoreMove = (move: Move): number => {
      let score = 0;

      if (move.capturedCards.length === 0) {
        // Placing - prefer low-value non-coins
        if (move.cardPlayed.suit === 'coins') score -= 10;
        if (move.cardPlayed.value === 7) score -= 20;
        if (move.cardPlayed.value >= 8) score += 5;
        return score;
      }

      score += 100;
      if (move.isScopa) score += 1000;
      if (move.capturedCards.some(isSetteBello)) score += 500;

      const coinsCount = move.capturedCards.filter((c) => c.suit === 'coins').length;
      score += coinsCount * 50;

      for (const card of move.capturedCards) {
        score += getPrimieraValue(card);
      }

      score += move.capturedCards.length * 5;

      return score;
    };

    let bestMove = allMoves[0];
    let bestScore = scoreMove(bestMove);
    for (const move of allMoves) {
      const score = scoreMove(move);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  },
};

/**
 * Factory function to create an expert AI player
 */
export function createExpertAI(): AIPlayer {
  return expertAI;
}

/**
 * Extended expert AI that accepts full game state for proper ISMCTS search.
 * Use this when you have access to the complete GameState.
 */
export function selectExpertMoveWithState(
  state: GameState,
  options?: ExpertOptions
): Move {
  const player = state.round.currentPlayer;
  const hand = state.players[player].hand;
  const table = state.round.table;

  const allMoves: Move[] = [];
  for (const card of hand) {
    const moves = getValidMoves(card, table, player);
    allMoves.push(...moves);
  }

  if (allMoves.length === 0) {
    throw new Error('No valid moves available');
  }

  return selectExpertMove(state, allMoves, options);
}
