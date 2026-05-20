// One-off perf check for the Scopa win-odds engine: time tallyWinOdds
// on a representative mid-round position across several rollout-policy
// depths. Run with:
//   npx tsx src/games/scopa/ai/winOdds.bench.ts
// (Or rename to .test.ts and run via vitest if you prefer.)
import { tallyWinOdds } from './winOdds';
import { createDeck } from '../deck';
import type { GameState, PlayerId } from '../types';

const ALL = createDeck();
const byId = (id: string) => ALL.find((c) => c.id === id)!;
const ids = (xs: string[]) => xs.map(byId);

function makeState(opts: {
  humanHand: string[];
  cpuHand: string[];
  table: string[];
  deck: string[];
  humanCaptured?: string[];
  cpuCaptured?: string[];
  currentPlayer?: PlayerId;
}): GameState {
  return {
    status: 'playing',
    round: {
      deck: ids(opts.deck),
      table: ids(opts.table),
      currentPlayer: opts.currentPlayer ?? 'human',
      dealer: 'cpu',
      lastCapture: null,
    },
    players: {
      human: {
        hand: ids(opts.humanHand),
        captured: ids(opts.humanCaptured ?? []),
        scopaCount: 0,
        scopaCaptures: [],
      },
      cpu: {
        hand: ids(opts.cpuHand),
        captured: ids(opts.cpuCaptured ?? []),
        scopaCount: 0,
        scopaCaptures: [],
      },
    },
    scores: { human: 0, cpu: 0 },
    roundNumber: 1,
    targetScore: 11,
    roundHistory: [],
  };
}

// Mid-round position: 3-card hands, 4 table cards, mid-deck. Branching
// is realistic for the rollout policy.
const used = [
  'coins-1', 'cups-8', 'swords-5',
  'coins-4', 'cups-6', 'swords-2', 'clubs-3',
  'clubs-1', 'clubs-2', 'clubs-9',
];
const game = makeState({
  humanHand: ['coins-1', 'cups-8', 'swords-5'],
  cpuHand: ['clubs-1', 'clubs-2', 'clubs-9'],
  table: ['coins-4', 'cups-6', 'swords-2', 'clubs-3'],
  deck: ALL.filter((c) => !used.includes(c.id)).map((c) => c.id),
});
const view = { game, player: 'human' as const };

function bench(label: string, opts: { deepPlies?: number }) {
  // warm-up
  tallyWinOdds(view, { samples: 20, seed: 1, ...opts });
  const SAMPLES = 300;
  const t0 = performance.now();
  const tally = tallyWinOdds(view, { samples: SAMPLES, seed: 1, ...opts });
  const ms = performance.now() - t0;
  // sanity touch
  const k = Object.keys(tally.perMove)[0];
  void tally.perMove[k];
  console.log(
    `  ${label.padEnd(14)}  ${ms.toFixed(0).padStart(5)} ms   (${SAMPLES} samples, ${
      Object.keys(tally.perMove).length
    } root moves)`
  );
}

console.log('Scopa win-odds bench (mid-round, 3-card hands, 4 table cards):');
bench('greedy (0)', { deepPlies: 0 });
bench('deep 1-ply', { deepPlies: 1 });
bench('deep 2-ply', { deepPlies: 2 });
bench('deep 3-ply', { deepPlies: 3 });
bench('deep 4-ply', { deepPlies: 4 });
bench('deep 5-ply', { deepPlies: 5 });
