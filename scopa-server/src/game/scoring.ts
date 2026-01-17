// Scoring System for Scopa

import type { Card, GameState, PlayerId, RoundScore } from './types.js';
import { PRIME_VALUES, SUITS } from './constants.js';

/** Score result for a category */
interface CategoryScore {
  player1: number;
  player2: number;
}

/**
 * Determine who wins the "most cards" point.
 * Player with more cards gets 1 point. Tie = no points.
 */
export function scoreCards(
  player1Captured: Card[],
  player2Captured: Card[]
): CategoryScore {
  if (player1Captured.length > player2Captured.length) {
    return { player1: 1, player2: 0 };
  } else if (player2Captured.length > player1Captured.length) {
    return { player1: 0, player2: 1 };
  }
  return { player1: 0, player2: 0 };
}

/**
 * Determine who wins the "most coins" point.
 * Player with more coins suit cards gets 1 point. Tie = no points.
 */
export function scoreCoins(
  player1Captured: Card[],
  player2Captured: Card[]
): CategoryScore {
  const player1Coins = player1Captured.filter((c) => c.suit === 'coins').length;
  const player2Coins = player2Captured.filter((c) => c.suit === 'coins').length;

  if (player1Coins > player2Coins) {
    return { player1: 1, player2: 0 };
  } else if (player2Coins > player1Coins) {
    return { player1: 0, player2: 1 };
  }
  return { player1: 0, player2: 0 };
}

/**
 * Determine who captured the 7 of coins (Sette Bello).
 * Worth 1 point to whoever has it.
 */
export function scoreSetteBello(
  player1Captured: Card[],
  player2Captured: Card[]
): CategoryScore {
  const player1Has = player1Captured.some(
    (c) => c.suit === 'coins' && c.value === 7
  );
  const player2Has = player2Captured.some(
    (c) => c.suit === 'coins' && c.value === 7
  );

  if (player1Has) {
    return { player1: 1, player2: 0 };
  } else if (player2Has) {
    return { player1: 0, player2: 1 };
  }
  // Should not happen in a real game, but handle gracefully
  return { player1: 0, player2: 0 };
}

/**
 * Calculate a player's prime (primiera) score.
 * Sum of highest prime value card from each suit.
 * Returns null if player is missing any suit.
 */
export function calculatePrime(captured: Card[]): number | null {
  let total = 0;

  for (const suit of SUITS) {
    const suitCards = captured.filter((c) => c.suit === suit);

    if (suitCards.length === 0) {
      // Missing a suit = cannot compete for prime
      return null;
    }

    // Find highest prime value in this suit
    const maxPrime = Math.max(
      ...suitCards.map((c) => PRIME_VALUES[c.value])
    );
    total += maxPrime;
  }

  return total;
}

/**
 * Determine who wins the prime point.
 * Higher prime wins. If either is null (missing suit), other wins.
 * If both null or tied, no points.
 */
export function scorePrime(
  player1Captured: Card[],
  player2Captured: Card[]
): CategoryScore {
  const player1Prime = calculatePrime(player1Captured);
  const player2Prime = calculatePrime(player2Captured);

  // Both missing suits
  if (player1Prime === null && player2Prime === null) {
    return { player1: 0, player2: 0 };
  }

  // One missing suit, other wins
  if (player1Prime === null) {
    return { player1: 0, player2: 1 };
  }
  if (player2Prime === null) {
    return { player1: 1, player2: 0 };
  }

  // Compare primes
  if (player1Prime > player2Prime) {
    return { player1: 1, player2: 0 };
  } else if (player2Prime > player1Prime) {
    return { player1: 0, player2: 1 };
  }
  return { player1: 0, player2: 0 };
}

/**
 * Calculate complete round scores for both players.
 */
export function calculateRoundScore(state: GameState): Record<PlayerId, RoundScore> {
  const player1Captured = state.players.player1.captured;
  const player2Captured = state.players.player2.captured;

  const cardsScore = scoreCards(player1Captured, player2Captured);
  const coinsScore = scoreCoins(player1Captured, player2Captured);
  const setteBelloScore = scoreSetteBello(player1Captured, player2Captured);
  const primeScore = scorePrime(player1Captured, player2Captured);

  const player1Scopas = state.players.player1.scopaCount;
  const player2Scopas = state.players.player2.scopaCount;

  // Calculate raw counts for display
  const player1CardCount = player1Captured.length;
  const player2CardCount = player2Captured.length;
  const player1CoinCount = player1Captured.filter((c) => c.suit === 'coins').length;
  const player2CoinCount = player2Captured.filter((c) => c.suit === 'coins').length;
  const player1PrimeValue = calculatePrime(player1Captured);
  const player2PrimeValue = calculatePrime(player2Captured);

  const player1Total =
    cardsScore.player1 +
    coinsScore.player1 +
    setteBelloScore.player1 +
    primeScore.player1 +
    player1Scopas;

  const player2Total =
    cardsScore.player2 +
    coinsScore.player2 +
    setteBelloScore.player2 +
    primeScore.player2 +
    player2Scopas;

  return {
    player1: {
      cards: cardsScore.player1,
      coins: coinsScore.player1,
      setteBello: setteBelloScore.player1,
      prime: primeScore.player1,
      scopas: player1Scopas,
      total: player1Total,
      counts: {
        cards: player1CardCount,
        coins: player1CoinCount,
        prime: player1PrimeValue,
      },
    },
    player2: {
      cards: cardsScore.player2,
      coins: coinsScore.player2,
      setteBello: setteBelloScore.player2,
      prime: primeScore.player2,
      scopas: player2Scopas,
      total: player2Total,
      counts: {
        cards: player2CardCount,
        coins: player2CoinCount,
        prime: player2PrimeValue,
      },
    },
  };
}
