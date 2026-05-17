import { describe, it, expect } from 'vitest';
import { estimateWinOdds, moveKey, type ScopaWinOddsView } from './winOdds';
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
    }

    // Headline IS the best move's outcome (max win%).
    const bestWin = Math.max(
      ...Object.values(odds.perMove!).map((o) => o.winPct)
    );
    expect(odds.winPct).toBe(bestWin);

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

    // Not the human's turn.
    const cpuTurn = estimateWinOdds({
      game: makeState({ ...base, currentPlayer: 'cpu' }),
      player: 'human',
    });
    expect(cpuTurn.samples).toBe(0);
    expect(cpuTurn.winPct).toBe(0);

    // Empty hand.
    const emptyHand = estimateWinOdds({
      game: makeState({ ...base, humanHand: [] }),
      player: 'human',
    });
    expect(emptyHand.samples).toBe(0);
  });
});
