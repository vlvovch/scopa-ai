// Integration test: bot vs bot playing full rounds.
// Verifies (a) bots never crash from any legal state, (b) heuristic beats
// random over many games (statistical sanity check, not strict ordering).

import { describe, it, expect } from 'vitest';
import { applyMove } from '../rules';
import { dealInitialHands, createDeck, shuffleDeck } from '../deck';
import { calculateRoundScore } from '../scoring';
import type { GameState, PlayerId } from '../types';
import type { AIPlayer } from './types';
import { randomAI } from './random';
import { heuristicAI } from './heuristic';

function playOneRound(
  humanBot: AIPlayer,
  cpuBot: AIPlayer
): { humanPoints: number; cpuPoints: number } {
  const deck = shuffleDeck(createDeck());
  const initial = dealInitialHands(deck, 'cpu');

  let state: GameState = {
    status: 'playing',
    round: {
      deck: initial.deck,
      trump: initial.trump,
      trumpSuit: initial.trump.suit,
      trick: { leadCard: null, leader: 'human' },
      currentPlayer: 'human',
      dealer: 'cpu',
    },
    players: {
      human: { hand: initial.hands.human, captured: [] },
      cpu: { hand: initial.hands.cpu, captured: [] },
    },
    scores: { human: 0, cpu: 0 },
    roundHistory: [],
    roundNumber: 1,
    targetScore: 1,
  };

  const bots: Record<PlayerId, AIPlayer> = { human: humanBot, cpu: cpuBot };

  let safety = 200;
  while (state.status === 'playing' && safety-- > 0) {
    const p = state.round.currentPlayer;
    const move = bots[p].selectMove({
      hand: state.players[p].hand,
      player: p,
      trump: state.round.trump,
      trumpSuit: state.round.trumpSuit,
      leadCard: state.round.trick.leadCard,
      deckCount: state.round.deck.length,
    });
    state = applyMove(state, move);
  }

  if (state.status !== 'roundEnd') {
    throw new Error('Round did not terminate within 200 plies');
  }
  const humanScore = calculateRoundScore(
    state.players.human.captured,
    state.players.cpu.captured
  );
  const cpuScore = calculateRoundScore(
    state.players.cpu.captured,
    state.players.human.captured
  );
  return { humanPoints: humanScore.points, cpuPoints: cpuScore.points };
}

describe('bot vs bot integration', () => {
  it('random vs random: every round ends with point totals summing to 120', () => {
    for (let i = 0; i < 20; i++) {
      const { humanPoints, cpuPoints } = playOneRound(randomAI, randomAI);
      expect(humanPoints + cpuPoints).toBe(120);
    }
  });

  it('heuristic vs heuristic: every round ends with point totals summing to 120', () => {
    for (let i = 0; i < 20; i++) {
      const { humanPoints, cpuPoints } = playOneRound(heuristicAI, heuristicAI);
      expect(humanPoints + cpuPoints).toBe(120);
    }
  });

  it('heuristic beats random more often than not over 100 rounds', () => {
    // Heuristic should win the majority — a simple sanity check that the
    // heuristic does something useful. Not asserting a specific margin to
    // keep the test stable; just "more wins than losses".
    let heuristicWins = 0;
    let randomWins = 0;
    let ties = 0;
    const games = 100;
    for (let i = 0; i < games; i++) {
      const { humanPoints, cpuPoints } = playOneRound(randomAI, heuristicAI);
      if (cpuPoints > humanPoints) heuristicWins++;
      else if (humanPoints > cpuPoints) randomWins++;
      else ties++;
    }
    // Heuristic should win substantially more games. Anything under ~65% would
    // be surprising over 100 games — using 60 as a safety margin against flakes.
    expect(heuristicWins).toBeGreaterThan(60);
    // Sanity: total tracked rounds matches
    expect(heuristicWins + randomWins + ties).toBe(games);
  });
});
