// Phase 5: Scoring System

import type { Card, GameState, RoundScore } from './types';
import { PRIME_VALUES, SUITS } from './constants';

/** Score result for a category */
interface CategoryScore {
  human: number;
  cpu: number;
}

/**
 * Step 5.1: Determine who wins the "most cards" point.
 * Player with more cards gets 1 point. Tie = no points.
 */
export function scoreCards(
  humanCaptured: Card[],
  cpuCaptured: Card[]
): CategoryScore {
  if (humanCaptured.length > cpuCaptured.length) {
    return { human: 1, cpu: 0 };
  } else if (cpuCaptured.length > humanCaptured.length) {
    return { human: 0, cpu: 1 };
  }
  return { human: 0, cpu: 0 };
}

/**
 * Step 5.2: Determine who wins the "most coins" point.
 * Player with more coins suit cards gets 1 point. Tie = no points.
 */
export function scoreCoins(
  humanCaptured: Card[],
  cpuCaptured: Card[]
): CategoryScore {
  const humanCoins = humanCaptured.filter((c) => c.suit === 'coins').length;
  const cpuCoins = cpuCaptured.filter((c) => c.suit === 'coins').length;

  if (humanCoins > cpuCoins) {
    return { human: 1, cpu: 0 };
  } else if (cpuCoins > humanCoins) {
    return { human: 0, cpu: 1 };
  }
  return { human: 0, cpu: 0 };
}

/**
 * Step 5.3: Determine who captured the 7 of coins (Sette Bello).
 * Worth 1 point to whoever has it.
 */
export function scoreSetteBello(
  humanCaptured: Card[],
  cpuCaptured: Card[]
): CategoryScore {
  const humanHas = humanCaptured.some(
    (c) => c.suit === 'coins' && c.value === 7
  );
  const cpuHas = cpuCaptured.some((c) => c.suit === 'coins' && c.value === 7);

  if (humanHas) {
    return { human: 1, cpu: 0 };
  } else if (cpuHas) {
    return { human: 0, cpu: 1 };
  }
  // Should not happen in a real game, but handle gracefully
  return { human: 0, cpu: 0 };
}

/**
 * Step 5.4: Calculate a player's prime (primiera) score.
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
 * Step 5.5: Determine who wins the prime point.
 * Higher prime wins. If either is null (missing suit), other wins.
 * If both null or tied, no points.
 */
export function scorePrime(
  humanCaptured: Card[],
  cpuCaptured: Card[]
): CategoryScore {
  const humanPrime = calculatePrime(humanCaptured);
  const cpuPrime = calculatePrime(cpuCaptured);

  // Both missing suits
  if (humanPrime === null && cpuPrime === null) {
    return { human: 0, cpu: 0 };
  }

  // One missing suit, other wins
  if (humanPrime === null) {
    return { human: 0, cpu: 1 };
  }
  if (cpuPrime === null) {
    return { human: 1, cpu: 0 };
  }

  // Compare primes
  if (humanPrime > cpuPrime) {
    return { human: 1, cpu: 0 };
  } else if (cpuPrime > humanPrime) {
    return { human: 0, cpu: 1 };
  }
  return { human: 0, cpu: 0 };
}

/**
 * Step 5.6: Calculate complete round scores for both players.
 */
export function calculateRoundScore(state: GameState): {
  human: RoundScore;
  cpu: RoundScore;
} {
  const humanCaptured = state.players.human.captured;
  const cpuCaptured = state.players.cpu.captured;

  const cardsScore = scoreCards(humanCaptured, cpuCaptured);
  const coinsScore = scoreCoins(humanCaptured, cpuCaptured);
  const setteBelloScore = scoreSetteBello(humanCaptured, cpuCaptured);
  const primeScore = scorePrime(humanCaptured, cpuCaptured);

  const humanScopas = state.players.human.scopaCount;
  const cpuScopas = state.players.cpu.scopaCount;

  const humanTotal =
    cardsScore.human +
    coinsScore.human +
    setteBelloScore.human +
    primeScore.human +
    humanScopas;

  const cpuTotal =
    cardsScore.cpu +
    coinsScore.cpu +
    setteBelloScore.cpu +
    primeScore.cpu +
    cpuScopas;

  return {
    human: {
      cards: cardsScore.human,
      coins: coinsScore.human,
      setteBello: setteBelloScore.human,
      prime: primeScore.human,
      scopas: humanScopas,
      total: humanTotal,
    },
    cpu: {
      cards: cardsScore.cpu,
      coins: coinsScore.cpu,
      setteBello: setteBelloScore.cpu,
      prime: primeScore.cpu,
      scopas: cpuScopas,
      total: cpuTotal,
    },
  };
}
