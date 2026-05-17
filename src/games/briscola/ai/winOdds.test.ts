import { describe, it, expect } from 'vitest';
import { estimateWinOdds } from './winOdds';
import { createDeck } from '../deck';
import type { AIContext } from './types';
import type { Card, CardValue, Suit } from '../types';

const card = (suit: Suit, value: CardValue): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

const ALL = createDeck();
const byId = (id: string) => ALL.find((c) => c.id === id)!;

describe('estimateWinOdds', () => {
  it('reports a near-certain win when the round is already decided', () => {
    // Player 1 has banked the 4 aces + 4 threes (84 pts). Deck empty, one
    // 0-point card left in each hand → the final trick cannot drop P1 to
    // ≤60, so every determinization is a win.
    const p1Hand = [card('cups', 4)]; // 0 pts
    const p1CapIds = new Set([
      'coins-1', 'cups-1', 'swords-1', 'clubs-1', // aces  (4×11)
      'coins-3', 'cups-3', 'swords-3', 'clubs-3', // threes (4×10)
    ]);
    const oppHandId = 'swords-4'; // hidden; the only unseen card
    const excluded = new Set<string>([...p1CapIds, 'cups-4', oppHandId]);
    const p1Captured = ALL.filter((c) => p1CapIds.has(c.id));
    const oppCaptured = ALL.filter((c) => !excluded.has(c.id)); // 30 cards

    const ctx: AIContext = {
      hand: p1Hand,
      player: 'human',
      trump: card('coins', 7), // 0-pt card, sits in oppCaptured → "seen"
      trumpSuit: 'coins',
      leadCard: null,
      deckCount: 0,
      myCaptured: p1Captured,
      oppCaptured,
    };

    const odds = estimateWinOdds(ctx, { samples: 40, seed: 1 });
    expect(odds.winPct).toBe(100);
    expect(odds.tiePct).toBe(0);
    expect(odds.lossPct).toBe(0);
    expect(odds.samples).toBe(40);
  });

  it('is deterministic for a fixed seed + view', () => {
    const ctx: AIContext = {
      hand: [card('cups', 1), card('swords', 7), card('clubs', 9)],
      player: 'human',
      trump: card('coins', 2),
      trumpSuit: 'coins',
      leadCard: null,
      deckCount: 28,
      myCaptured: [],
      oppCaptured: [],
    };
    const a = estimateWinOdds(ctx, { samples: 24, seed: 42, maxPlies: 2 });
    const b = estimateWinOdds(ctx, { samples: 24, seed: 42, maxPlies: 2 });
    expect(b).toEqual(a);

    // A different seed is still a valid distribution (may differ).
    const c = estimateWinOdds(ctx, { samples: 24, seed: 7, maxPlies: 2 });
    expect(c.winPct + c.tiePct + c.lossPct).toBeCloseTo(100, 6);
    expect(c.samples).toBe(24);
  });

  it('per-card always present; overall equals the best card; deterministic', () => {
    const ctx: AIContext = {
      hand: [byId('coins-1'), byId('cups-8'), byId('swords-5')],
      player: 'human',
      trump: card('coins', 7),
      trumpSuit: 'coins',
      leadCard: null,
      deckCount: 30,
      myCaptured: [],
      oppCaptured: [],
    };
    const odds = estimateWinOdds(ctx, { samples: 16, seed: 5, maxPlies: 2 });

    // One per-card entry per hand card, each a valid distribution.
    expect(odds.perCard).toBeDefined();
    expect(Object.keys(odds.perCard!).sort()).toEqual(
      ['coins-1', 'cups-8', 'swords-5'].sort()
    );
    for (const o of Object.values(odds.perCard!)) {
      expect(o.winPct + o.tiePct + o.lossPct).toBeCloseTo(100, 6);
      expect(o.samples).toBe(16);
    }

    // The headline IS the best card's outcome (max win%).
    const bestWin = Math.max(
      ...Object.values(odds.perCard!).map((o) => o.winPct)
    );
    expect(odds.winPct).toBe(bestWin);
    const bestCard = Object.values(odds.perCard!).find(
      (o) => o.winPct === bestWin
    )!;
    expect(odds.tiePct).toBe(bestCard.tiePct);
    expect(odds.lossPct).toBe(bestCard.lossPct);

    // Deterministic under a fixed seed.
    const again = estimateWinOdds(ctx, { samples: 16, seed: 5, maxPlies: 2 });
    expect(again).toEqual(odds);
  });

  it('returns a valid distribution for a fresh mid-deal position', () => {
    const ctx: AIContext = {
      hand: [byId('coins-1'), byId('cups-8'), byId('swords-5')],
      player: 'human',
      trump: card('coins', 7),
      trumpSuit: 'coins',
      leadCard: null,
      deckCount: 30,
      myCaptured: [],
      oppCaptured: [],
    };
    const odds = estimateWinOdds(ctx, { samples: 20, seed: 3, maxPlies: 2 });
    expect(odds.winPct).toBeGreaterThanOrEqual(0);
    expect(odds.lossPct).toBeGreaterThanOrEqual(0);
    expect(odds.tiePct).toBeGreaterThanOrEqual(0);
    expect(odds.winPct + odds.tiePct + odds.lossPct).toBeCloseTo(100, 6);
    expect(odds.samples).toBe(20);
    expect(odds.ciHalfWidth).toBeGreaterThanOrEqual(0);
  });

  it('handles the degenerate empty-hand position', () => {
    const winCtx: AIContext = {
      hand: [],
      player: 'human',
      trump: card('coins', 7),
      trumpSuit: 'coins',
      leadCard: null,
      deckCount: 0,
      myCaptured: [card('coins', 1), card('cups', 1), card('swords', 1),
        card('clubs', 1), card('coins', 3), card('cups', 3), card('swords', 3)],
      oppCaptured: [],
    }; // 7×(11/10) ≈ 74 pts → > 60
    const odds = estimateWinOdds(winCtx);
    expect(odds.winPct).toBe(100);
    expect(odds.samples).toBe(0);
  });
});
