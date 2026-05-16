// Quick Furbo (heuristic) vs Esperto (expert) tournament.
// Run with: npx tsx scripts/briscola-sim.ts

import { applyMove } from '../src/games/briscola/rules';
import { createDeck, shuffleDeck, dealInitialHands } from '../src/games/briscola/deck';
import { calculateRoundScore } from '../src/games/briscola/scoring';
import type { GameState, PlayerId } from '../src/games/briscola/types';
import type { AIPlayer } from '../src/games/briscola/ai/types';
import { heuristicAI } from '../src/games/briscola/ai/heuristic';
import { expertAI } from '../src/games/briscola/ai/expert';

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

  while (state.status === 'playing') {
    const p = state.round.currentPlayer;
    const opp: PlayerId = p === 'human' ? 'cpu' : 'human';
    const move = bots[p].selectMove({
      hand: state.players[p].hand,
      player: p,
      trump: state.round.trump,
      trumpSuit: state.round.trumpSuit,
      leadCard: state.round.trick.leadCard,
      deckCount: state.round.deck.length,
      myCaptured: state.players[p].captured,
      oppCaptured: state.players[opp].captured,
    });
    state = applyMove(state, move);
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

function runTournament(label: string, leftBot: AIPlayer, rightBot: AIPlayer, rounds: number) {
  const start = Date.now();
  let leftWins = 0,
    rightWins = 0,
    ties = 0;
  let leftPointsTotal = 0,
    rightPointsTotal = 0;
  let leftMargin = 0; // sum of (left - right) per round
  let biggestLeftWin = -Infinity;
  let biggestRightWin = -Infinity;

  for (let i = 0; i < rounds; i++) {
    // Alternate seats so neither bot gets a "first to lead" advantage.
    const swapSeats = i % 2 === 1;
    const human = swapSeats ? rightBot : leftBot;
    const cpu = swapSeats ? leftBot : rightBot;
    const { humanPoints, cpuPoints } = playOneRound(human, cpu);
    const leftPts = swapSeats ? cpuPoints : humanPoints;
    const rightPts = swapSeats ? humanPoints : cpuPoints;

    leftPointsTotal += leftPts;
    rightPointsTotal += rightPts;
    leftMargin += leftPts - rightPts;
    if (leftPts > rightPts) {
      leftWins++;
      biggestLeftWin = Math.max(biggestLeftWin, leftPts - rightPts);
    } else if (rightPts > leftPts) {
      rightWins++;
      biggestRightWin = Math.max(biggestRightWin, rightPts - leftPts);
    } else {
      ties++;
    }
  }

  const dur = ((Date.now() - start) / 1000).toFixed(1);
  const winRate = ((leftWins / rounds) * 100).toFixed(1);
  const avgLeft = (leftPointsTotal / rounds).toFixed(1);
  const avgRight = (rightPointsTotal / rounds).toFixed(1);
  const avgMargin = (leftMargin / rounds).toFixed(2);

  console.log(`\n=== ${label} (${rounds} rounds, ${dur}s) ===`);
  console.log(`  Wins:    ${leftWins} - ${rightWins} (ties: ${ties})`);
  console.log(`  Win rate (left side): ${winRate}%`);
  console.log(`  Avg points/round: ${avgLeft} vs ${avgRight}`);
  console.log(`  Avg margin (left − right): ${avgMargin}`);
  console.log(`  Biggest wins: left +${biggestLeftWin === -Infinity ? 'n/a' : biggestLeftWin}, right +${biggestRightWin === -Infinity ? 'n/a' : biggestRightWin}`);
}

const ROUNDS = Number(process.env.ROUNDS ?? 1000);

console.log(`Briscola tournament — ${ROUNDS} rounds per matchup, seats swapped every other round.`);
runTournament('Furbo vs Esperto', heuristicAI, expertAI, ROUNDS);
