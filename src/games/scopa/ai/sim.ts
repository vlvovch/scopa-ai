// Scopa head-to-head bot simulator (Esperto vs Furbo, etc).
// Run:  npx tsx src/games/scopa/ai/sim.ts
//
// Drives the real gameReducer end-to-end (same rules path as the live
// game) so any regression in Esperto, the endgame solver, redeal
// handling, residue, or last-hand scopa surfaces in the numbers.

import { gameReducer, createInitialState } from '../reducer';
import { selectExpertMoveWithState } from './expert';
import { heuristicAI } from './heuristic';
import type { GameState, Move } from '../types';

type Bot = 'expert' | 'heuristic';

function pickMove(state: GameState, bot: Bot): Move {
  if (bot === 'expert') return selectExpertMoveWithState(state);
  // heuristic uses the simple AIContext interface
  const player = state.round.currentPlayer;
  return heuristicAI.selectMove({
    hand: state.players[player].hand,
    table: state.round.table,
    player,
  });
}

interface RoundResult {
  human: number;       // round total for the 'human' seat
  cpu: number;         // round total for the 'cpu' seat
  margin: number;      // human - cpu
  cardsH: number; coinsH: number; setteH: number; primeH: number; scopaH: number;
  cardsC: number; coinsC: number; setteC: number; primeC: number; scopaC: number;
}

function playOneRound(humanBot: Bot, cpuBot: Bot): RoundResult {
  // Start a fresh game (which deals the initial round).
  let state = gameReducer(createInitialState(11), {
    type: 'START_GAME',
    payload: { targetScore: 11 },
  });
  let plies = 0;
  while (state.status === 'playing' && plies < 200) {
    const bot = state.round.currentPlayer === 'human' ? humanBot : cpuBot;
    const mv = pickMove(state, bot);
    state = gameReducer(state, { type: 'PLAY_CARD', payload: { move: mv } });
    plies++;
  }
  if (state.status !== 'roundEnd') {
    throw new Error(`round did not reach roundEnd (plies=${plies})`);
  }
  state = gameReducer(state, { type: 'END_ROUND' });
  const rs = state.lastRoundScores!;
  return {
    human: rs.human.total,
    cpu: rs.cpu.total,
    margin: rs.human.total - rs.cpu.total,
    cardsH: rs.human.cards, coinsH: rs.human.coins, setteH: rs.human.setteBello,
    primeH: rs.human.prime, scopaH: rs.human.scopas,
    cardsC: rs.cpu.cards, coinsC: rs.cpu.coins, setteC: rs.cpu.setteBello,
    primeC: rs.cpu.prime, scopaC: rs.cpu.scopas,
  };
}

interface Tally {
  rounds: number;
  wins: number; losses: number; draws: number;
  totalA: number; totalB: number;   // total round points for bot A / bot B
  marginSum: number;                // Σ (A_total - B_total)
  marginSqSum: number;              // for stddev
  marginMin: number; marginMax: number;
  catA: { cards: number; coins: number; sette: number; prime: number; scopa: number };
  catB: { cards: number; coins: number; sette: number; prime: number; scopa: number };
}

const fresh = (): Tally => ({
  rounds: 0, wins: 0, losses: 0, draws: 0,
  totalA: 0, totalB: 0, marginSum: 0, marginSqSum: 0,
  marginMin: Infinity, marginMax: -Infinity,
  catA: { cards: 0, coins: 0, sette: 0, prime: 0, scopa: 0 },
  catB: { cards: 0, coins: 0, sette: 0, prime: 0, scopa: 0 },
});

function record(t: Tally, r: RoundResult, swap: boolean) {
  // After swap, the 'human' seat is bot B and 'cpu' is bot A.
  const aIsHuman = !swap;
  const aTotal = aIsHuman ? r.human : r.cpu;
  const bTotal = aIsHuman ? r.cpu : r.human;
  const margin = aTotal - bTotal;
  t.rounds++;
  t.totalA += aTotal;
  t.totalB += bTotal;
  t.marginSum += margin;
  t.marginSqSum += margin * margin;
  if (margin > t.marginMax) t.marginMax = margin;
  if (margin < t.marginMin) t.marginMin = margin;
  if (margin > 0) t.wins++;
  else if (margin < 0) t.losses++;
  else t.draws++;
  if (aIsHuman) {
    t.catA.cards += r.cardsH; t.catA.coins += r.coinsH; t.catA.sette += r.setteH; t.catA.prime += r.primeH; t.catA.scopa += r.scopaH;
    t.catB.cards += r.cardsC; t.catB.coins += r.coinsC; t.catB.sette += r.setteC; t.catB.prime += r.primeC; t.catB.scopa += r.scopaC;
  } else {
    t.catA.cards += r.cardsC; t.catA.coins += r.coinsC; t.catA.sette += r.setteC; t.catA.prime += r.primeC; t.catA.scopa += r.scopaC;
    t.catB.cards += r.cardsH; t.catB.coins += r.coinsH; t.catB.sette += r.setteH; t.catB.prime += r.primeH; t.catB.scopa += r.scopaH;
  }
}

function report(label: string, t: Tally, nameA: string, nameB: string, ms: number) {
  const mean = t.marginSum / t.rounds;
  const variance = Math.max(0, t.marginSqSum / t.rounds - mean * mean);
  const stddev = Math.sqrt(variance);
  // 95% CI on the mean margin (SE of mean = stddev / sqrt(n))
  const se = stddev / Math.sqrt(t.rounds);
  const ciLo = mean - 1.96 * se;
  const ciHi = mean + 1.96 * se;
  const wr = (100 * t.wins) / t.rounds;
  const lr = (100 * t.losses) / t.rounds;
  const dr = (100 * t.draws) / t.rounds;
  console.log(
    `\n=== ${label}  (${t.rounds} rounds, ${(ms / 1000).toFixed(1)}s) ===`
  );
  console.log(
    `  ${nameA}  wins ${t.wins} (${wr.toFixed(1)}%) | draws ${t.draws} (${dr.toFixed(1)}%) | losses ${t.losses} (${lr.toFixed(1)}%)`
  );
  console.log(
    `  mean margin (${nameA} - ${nameB}):  ${mean.toFixed(3)}  (95% CI ${ciLo.toFixed(2)} .. ${ciHi.toFixed(2)}, σ=${stddev.toFixed(2)}, min ${t.marginMin}, max ${t.marginMax})`
  );
  console.log(
    `  avg round score:  ${nameA} ${(t.totalA / t.rounds).toFixed(2)}  vs  ${nameB} ${(t.totalB / t.rounds).toFixed(2)}`
  );
  const cat = (c: Tally['catA']) =>
    `cards ${(c.cards / t.rounds).toFixed(2)}  coins ${(c.coins / t.rounds).toFixed(2)}  sette ${(c.sette / t.rounds).toFixed(2)}  prime ${(c.prime / t.rounds).toFixed(2)}  scopas ${(c.scopa / t.rounds).toFixed(2)}`;
  console.log(`  ${nameA} categories (avg/round):  ${cat(t.catA)}`);
  console.log(`  ${nameB} categories (avg/round):  ${cat(t.catB)}`);
}

function runHeadToHead(
  N: number,
  nameA: string, botA: Bot,
  nameB: string, botB: Bot
) {
  const t = fresh();
  const t0 = performance.now();
  // Half the rounds with A as 'human', half with A as 'cpu' (to wash
  // out any first-mover / dealer bias).
  for (let i = 0; i < N; i++) {
    const swap = i % 2 === 1;
    const r = swap
      ? playOneRound(botB, botA)   // B is 'human', A is 'cpu'
      : playOneRound(botA, botB);
    record(t, r, swap);
  }
  const ms = performance.now() - t0;
  report(`${nameA}  vs  ${nameB}`, t, nameA, nameB, ms);
}

// --- run ---
console.log('Scopa head-to-head simulation');
// Sanity baselines.
runHeadToHead(500, 'Furbo', 'heuristic', 'Furbo*', 'heuristic');
// Headline: Esperto vs Furbo.
runHeadToHead(1000, 'Esperto', 'expert', 'Furbo', 'heuristic');
