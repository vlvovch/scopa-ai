import { describe, it, expect } from 'vitest';
import { POINT_VALUES, CARD_RANK, TOTAL_POINTS_PER_ROUND, POINTS_TO_WIN_ROUND } from './constants';
import type { CardValue } from './types';

describe('Briscola constants', () => {
  it('POINT_VALUES sums to 30 per suit', () => {
    const perSuit = Object.values(POINT_VALUES).reduce((a, b) => a + b, 0);
    expect(perSuit).toBe(30);
  });

  it('TOTAL_POINTS_PER_ROUND equals 30 × 4 suits', () => {
    expect(TOTAL_POINTS_PER_ROUND).toBe(120);
  });

  it('POINTS_TO_WIN_ROUND is strictly greater than half', () => {
    expect(POINTS_TO_WIN_ROUND).toBe(61);
    expect(POINTS_TO_WIN_ROUND).toBeGreaterThan(TOTAL_POINTS_PER_ROUND / 2);
  });

  it('Ace is worth 11, Three is worth 10, King 4, Knight 3, Knave 2', () => {
    expect(POINT_VALUES[1]).toBe(11);
    expect(POINT_VALUES[3]).toBe(10);
    expect(POINT_VALUES[10]).toBe(4);
    expect(POINT_VALUES[9]).toBe(3);
    expect(POINT_VALUES[8]).toBe(2);
  });

  it('scartine (2, 4, 5, 6, 7) are worth 0', () => {
    for (const v of [2, 4, 5, 6, 7] as CardValue[]) {
      expect(POINT_VALUES[v]).toBe(0);
    }
  });

  it('CARD_RANK is a total ordering: Ace > 3 > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 2', () => {
    expect(CARD_RANK[1]).toBeGreaterThan(CARD_RANK[3]);
    expect(CARD_RANK[3]).toBeGreaterThan(CARD_RANK[10]);
    expect(CARD_RANK[10]).toBeGreaterThan(CARD_RANK[9]);
    expect(CARD_RANK[9]).toBeGreaterThan(CARD_RANK[8]);
    expect(CARD_RANK[8]).toBeGreaterThan(CARD_RANK[7]);
    expect(CARD_RANK[7]).toBeGreaterThan(CARD_RANK[6]);
    expect(CARD_RANK[6]).toBeGreaterThan(CARD_RANK[5]);
    expect(CARD_RANK[5]).toBeGreaterThan(CARD_RANK[4]);
    expect(CARD_RANK[4]).toBeGreaterThan(CARD_RANK[2]);
  });

  it('CARD_RANK uses distinct values for every card', () => {
    const ranks = Object.values(CARD_RANK);
    const unique = new Set(ranks);
    expect(unique.size).toBe(ranks.length);
  });
});
