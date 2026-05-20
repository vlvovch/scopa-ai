import { describe, it, expect } from 'vitest';
import {
  estimateWinOdds,
  moveKey,
  OVERALL_KEY,
  type ScopaWinOddsView,
} from './winOdds';
import {
  selectExpertMove,
  endgameValue,
  getAllMoves,
} from './expert';
import { gameReducer } from '../reducer';
import { createDeck } from '../deck';
import { getValidMoves } from '../rules';
import type { Card, GameState, PlayerId } from '../types';

const ALL = createDeck();
const byId = (id: string): Card => ALL.find((c) => c.id === id)!;
const ids = (xs: string[]) => xs.map(byId);

/** Minimal playing GameState. Caller guarantees the four visible piles
 *  (hand/table/captured) plus cpu hand + deck partition the 40 cards so
 *  the determinizer's info-set check passes. */
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

const valid = (o: { winPct: number; tiePct: number; lossPct: number }) =>
  o.winPct + o.tiePct + o.lossPct;

describe('estimateWinOdds (Scopa)', () => {
  it('is deterministic for a fixed seed + view', () => {
    const game = makeState({
      humanHand: ['coins-1', 'coins-2', 'coins-3'],
      table: ['coins-4', 'coins-5', 'coins-6', 'coins-7'],
      cpuHand: ['coins-8', 'coins-9', 'coins-10'],
      deck: ALL.filter((c) => c.suit !== 'coins').map((c) => c.id),
    });
    const view: ScopaWinOddsView = { game, player: 'human' };

    const a = estimateWinOdds(view, { samples: 16, seed: 42 });
    const b = estimateWinOdds(view, { samples: 16, seed: 42 });
    expect(b).toEqual(a);
    expect(a.samples).toBe(16);
    expect(valid(a)).toBeCloseTo(100, 6);

    // A different seed is still a valid distribution.
    const c = estimateWinOdds(view, { samples: 16, seed: 7 });
    expect(valid(c)).toBeCloseTo(100, 6);
    expect(c.ciHalfWidth).toBeGreaterThanOrEqual(0);
  });

  it('per-move always present; overall equals the best move; deterministic', () => {
    const game = makeState({
      humanHand: ['coins-1', 'cups-8', 'swords-5'],
      table: ['coins-4', 'cups-6', 'swords-2'],
      cpuHand: ['clubs-1', 'clubs-2', 'clubs-3'],
      deck: ALL.filter(
        (c) =>
          ![
            'coins-1',
            'cups-8',
            'swords-5',
            'coins-4',
            'cups-6',
            'swords-2',
            'clubs-1',
            'clubs-2',
            'clubs-3',
          ].includes(c.id)
      ).map((c) => c.id),
    });
    const view: ScopaWinOddsView = { game, player: 'human' };
    const odds = estimateWinOdds(view, { samples: 12, seed: 5 });

    // One entry per legal root move.
    const roots = view.game.players.human.hand.flatMap((card) =>
      getValidMoves(card, view.game.round.table, 'human')
    );
    expect(odds.perMove).toBeDefined();
    expect(Object.keys(odds.perMove!).sort()).toEqual(
      roots.map(moveKey).sort()
    );
    for (const o of Object.values(odds.perMove!)) {
      expect(valid(o)).toBeCloseTo(100, 6);
      expect(o.samples).toBe(12);
      expect(Number.isFinite(o.expectedDiff)).toBe(true);
      expect(o.diffCi).toBeGreaterThanOrEqual(0);
    }

    // Headline IS the best move's outcome — selected by max expected
    // score margin (the engine's own criterion).
    const bestDiff = Math.max(
      ...Object.values(odds.perMove!).map((o) => o.expectedDiff)
    );
    expect(odds.expectedDiff).toBe(bestDiff);

    const again = estimateWinOdds(view, { samples: 12, seed: 5 });
    expect(again).toEqual(odds);
  });

  it('keys distinguish multiple moves of the SAME card', () => {
    // coins-7 can capture either cups-7 OR swords-7 (two single-card
    // captures ⇒ two distinct moves for one hand card).
    const game = makeState({
      humanHand: ['coins-7', 'cups-1', 'swords-1'],
      table: ['cups-7', 'swords-7', 'coins-3', 'coins-4'],
      cpuHand: ['clubs-1', 'clubs-2', 'clubs-3'],
      deck: ALL.filter(
        (c) =>
          ![
            'coins-7',
            'cups-1',
            'swords-1',
            'cups-7',
            'swords-7',
            'coins-3',
            'coins-4',
            'clubs-1',
            'clubs-2',
            'clubs-3',
          ].includes(c.id)
      ).map((c) => c.id),
    });
    const view: ScopaWinOddsView = { game, player: 'human' };
    const odds = estimateWinOdds(view, { samples: 8, seed: 3 });

    const coinsSevenMoves = getValidMoves(
      byId('coins-7'),
      view.game.round.table,
      'human'
    );
    expect(coinsSevenMoves.length).toBe(2);
    const k1 = moveKey(coinsSevenMoves[0]);
    const k2 = moveKey(coinsSevenMoves[1]);
    expect(k1).not.toBe(k2);
    expect(odds.perMove![k1]).toBeDefined();
    expect(odds.perMove![k2]).toBeDefined();
  });

  it('returns a zeroed result when there is nothing to analyse', () => {
    const base = {
      humanHand: ['coins-1', 'coins-2', 'coins-3'],
      table: ['coins-4', 'coins-5'],
      cpuHand: ['coins-6', 'coins-7', 'coins-8'],
      deck: ALL.filter(
        (c) =>
          ![
            'coins-1',
            'coins-2',
            'coins-3',
            'coins-4',
            'coins-5',
            'coins-6',
            'coins-7',
            'coins-8',
          ].includes(c.id)
      ).map((c) => c.id),
    };

    // Empty hand → still zero (nothing to analyse, no rollouts to run).
    const emptyHand = estimateWinOdds({
      game: makeState({ ...base, humanHand: [] }),
      player: 'human',
    });
    expect(emptyHand.samples).toBe(0);
  });

  it('opponent-turn produces a single OVERALL estimate (no per-card)', () => {
    // Same valid mid-round position, but it's the CPU's turn. The
    // engine now computes an "if they play optimally from here" overall
    // outcome so the panel can show an intermediate glance before the
    // opponent plays (right after a deal, for instance).
    const game = makeState({
      humanHand: ['coins-1', 'coins-2', 'coins-3'],
      table: ['coins-4', 'coins-5'],
      cpuHand: ['coins-6', 'coins-7', 'coins-8'],
      deck: ALL.filter(
        (c) =>
          ![
            'coins-1', 'coins-2', 'coins-3',
            'coins-4', 'coins-5',
            'coins-6', 'coins-7', 'coins-8',
          ].includes(c.id)
      ).map((c) => c.id),
      currentPlayer: 'cpu',
    });
    const odds = estimateWinOdds(
      { game, player: 'human' },
      { samples: 8, seed: 11 }
    );
    expect(odds.samples).toBe(8);
    expect(valid(odds)).toBeCloseTo(100, 6);
    expect(Number.isFinite(odds.expectedDiff)).toBe(true);
    // perMove has exactly one synthetic OVERALL_KEY entry — no card-id
    // keys leak (the UI's per-card lookup keys off real card ids).
    expect(Object.keys(odds.perMove!).length).toBe(1);
    expect(odds.perMove![OVERALL_KEY]).toBeDefined();

    // Deterministic under fixed seed.
    const again = estimateWinOdds(
      { game, player: 'human' },
      { samples: 8, seed: 11 }
    );
    expect(again).toEqual(odds);
  });

  it('perfect-info endgame: exact integer margin, samples=1, ±0', () => {
    // Deck empty, human has 2 cards, cpu has 2 cards, the table has
    // some cards — unseen pool equals opp.handSize exactly, so the
    // engine short-circuits to a single deterministic alpha-beta solve.
    const game = makeState({
      humanHand: ['coins-1', 'cups-2'],
      table: ['swords-3', 'clubs-4'],
      cpuHand: ['coins-5', 'cups-6'],
      deck: [],
      humanCaptured: ALL.filter((c) =>
        ['coins', 'cups'].includes(c.suit) &&
        ![
          'coins-1', 'cups-2', 'coins-5', 'cups-6',
        ].includes(c.id)
      ).map((c) => c.id),
      cpuCaptured: ALL.filter((c) =>
        ['swords', 'clubs'].includes(c.suit) &&
        ![
          'swords-3', 'clubs-4',
        ].includes(c.id)
      ).map((c) => c.id),
    });
    // Sanity: unseen pool truly equals cpu hand size (=2), deck=0.
    // human captured 16 - 2 + 16 - 2? Let me just trust makeState built
    // it; the engine's isPerfectInfoEndgame check verifies it.
    const odds = estimateWinOdds({ game, player: 'human' });
    expect(odds.samples).toBe(1);
    expect(odds.diffCi).toBe(0);
    expect(odds.ciHalfWidth).toBe(0);
    // Exact integer margin (the alpha-beta solver returns integer
    // round-score differentials).
    expect(Number.isInteger(odds.expectedDiff)).toBe(true);
    // perMove entries are also exact integers with samples=1.
    for (const o of Object.values(odds.perMove!)) {
      expect(o.samples).toBe(1);
      expect(o.diffCi).toBe(0);
      expect(Number.isInteger(o.expectedDiff)).toBe(true);
    }
  });

  it('selectExpertMove picks a game-theoretically optimal move in the perfect-info endgame', () => {
    // Regression: Esperto's endgame branch used to leaf on the
    // heuristic evaluateState (alphaBeta) — which ignores the
    // table-residue → lastCapture rule AND the last-hand-scopa rule,
    // so it occasionally gave up scopas / cards. Now it uses the
    // exact endgameValue solver. This test passes Esperto a perfect-
    // info endgame state and asserts the move it chooses matches the
    // game-theoretic optimum (max over the endgame solver's values).
    const game = makeState({
      humanHand: ['coins-1', 'cups-2'],
      table: ['swords-3', 'clubs-4'],
      cpuHand: ['coins-5', 'cups-6'],
      deck: [],
      humanCaptured: ALL.filter(
        (c) =>
          (c.suit === 'coins' || c.suit === 'cups') &&
          !['coins-1', 'cups-2', 'coins-5', 'cups-6'].includes(c.id)
      ).map((c) => c.id),
      cpuCaptured: ALL.filter(
        (c) =>
          (c.suit === 'swords' || c.suit === 'clubs') &&
          !['swords-3', 'clubs-4'].includes(c.id)
      ).map((c) => c.id),
      currentPlayer: 'cpu',
    });

    const player = game.round.currentPlayer;
    const moves = getAllMoves(game);
    expect(moves.length).toBeGreaterThan(0);
    const bestScore = Math.max(
      ...moves.map((m) =>
        endgameValue(
          gameReducer(game, { type: 'PLAY_CARD', payload: { move: m } }),
          player,
          -Infinity,
          Infinity
        )
      )
    );

    const chosen = selectExpertMove(game, moves);
    const chosenScore = endgameValue(
      gameReducer(game, { type: 'PLAY_CARD', payload: { move: chosen } }),
      player,
      -Infinity,
      Infinity
    );
    expect(chosenScore).toBe(bestScore);
  });

  it('deep policy is a valid distribution and deterministic', () => {
    const game = makeState({
      humanHand: ['coins-1', 'cups-8', 'swords-5'],
      table: ['coins-4', 'cups-6', 'swords-2'],
      cpuHand: ['clubs-1', 'clubs-2', 'clubs-3'],
      deck: ALL.filter(
        (c) =>
          ![
            'coins-1', 'cups-8', 'swords-5',
            'coins-4', 'cups-6', 'swords-2',
            'clubs-1', 'clubs-2', 'clubs-3',
          ].includes(c.id)
      ).map((c) => c.id),
    });
    const view: ScopaWinOddsView = { game, player: 'human' };

    const a = estimateWinOdds(view, { samples: 8, seed: 9, deep: true });
    const b = estimateWinOdds(view, { samples: 8, seed: 9, deep: true });
    expect(b).toEqual(a);
    expect(a.samples).toBe(8);
    expect(valid(a)).toBeCloseTo(100, 6);
    for (const o of Object.values(a.perMove!)) {
      expect(valid(o)).toBeCloseTo(100, 6);
      expect(Number.isFinite(o.expectedDiff)).toBe(true);
    }
  });
});
