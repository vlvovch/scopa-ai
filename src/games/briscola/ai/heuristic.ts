// Heuristic Briscola AI — greedy single-ply move scorer
//
// When LEADING: prefer to lead a low-point non-trump card so we give little
// away if opponent takes the trick. Avoid leading Aces / 3s and avoid wasting
// trumps. Within "safe" leads, prefer the lowest CARD_RANK to keep good cards
// in hand.
//
// When FOLLOWING: we know exactly who wins the trick (lead-or-follow is a
// deterministic function of the two cards). So:
//  - If we can win, take the trick — but discount wins where we burn a high
//    trump on a low-value lead.
//  - If we must lose, dump our lowest-point, lowest-rank card.

import type { AIContext, AIPlayer } from './types';
import type { Card, Move, Suit } from '../types';
import { CARD_RANK, POINT_VALUES } from '../constants';
import { trickWinner } from '../rules';

/**
 * Score a single candidate card. Higher is better.
 * The score is on an arbitrary scale; only comparisons matter.
 */
export function scoreCandidate(
  candidate: Card,
  leadCard: Card | null,
  trumpSuit: Suit,
  player: AIContext['player']
): number {
  const candPoints = POINT_VALUES[candidate.value];
  const candRank = CARD_RANK[candidate.value];
  const candIsTrump = candidate.suit === trumpSuit;

  // ---- LEADING ----
  if (leadCard === null) {
    let score = 0;
    // Each point given away if opponent takes the trick costs us.
    score -= candPoints * 5;
    // Don't waste trumps when leading — they're scarce and best used to take points.
    if (candIsTrump) score -= 15;
    // Prefer keeping high-rank cards in hand for future tricks.
    score -= candRank * 0.5;
    return score;
  }

  // ---- FOLLOWING ----
  const opponent = player === 'human' ? 'cpu' : 'human';
  // We're the follower; lead came from opponent.
  const winner = trickWinner(leadCard, opponent, candidate, player, trumpSuit);
  const weWin = winner === player;
  const leadPoints = POINT_VALUES[leadCard.value];

  if (weWin) {
    // Burning a trump on a low-value lead is bad — we'd give up future
    // trick-taking ability for almost nothing. Refuse outright on leads
    // below 4 pts (scartine, Knaves).
    if (candIsTrump && leadPoints < 4) {
      return -20 - candRank;
    }
    // Reward = points captured from opponent + value of own card we played
    // (we keep our card too — winning the trick captures both).
    let score = 100 + leadPoints + candPoints;
    if (candIsTrump) {
      score -= candRank * 2; // mild cost for burning a trump on a valuable lead
    }
    return score;
  }

  // We lose the trick — minimize the points/value we surrender.
  let score = -candPoints * 10;
  // Trumps are precious; never throw a trump on a losing trick if we can help it.
  if (candIsTrump) score -= 30;
  // Among equally-zero-value losers, prefer dumping the lowest rank.
  score -= candRank * 0.3;
  return score;
}

export const heuristicAI: AIPlayer = {
  name: 'Heuristic',

  selectMove(context: AIContext): Move {
    const { hand, player, leadCard, trumpSuit } = context;
    if (hand.length === 0) {
      throw new Error('heuristicAI: cannot select move with empty hand');
    }

    let best = hand[0];
    let bestScore = scoreCandidate(best, leadCard, trumpSuit, player);
    for (let i = 1; i < hand.length; i++) {
      const s = scoreCandidate(hand[i], leadCard, trumpSuit, player);
      if (s > bestScore) {
        bestScore = s;
        best = hand[i];
      }
    }
    return { player, cardPlayed: best };
  },
};

export function createHeuristicAI(): AIPlayer {
  return heuristicAI;
}
