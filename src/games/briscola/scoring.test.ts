import { describe, it, expect } from 'vitest';
import { calculateRoundScore, sumPoints } from './scoring';
import { createDeck } from './deck';
import type { Card, CardValue, Suit } from './types';

const card = (suit: Suit, value: CardValue): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

describe('sumPoints', () => {
  it('returns 0 for an empty hand', () => {
    expect(sumPoints([])).toBe(0);
  });

  it('sums point cards correctly: Ace + 3 + King + Knight + Knave = 30', () => {
    expect(sumPoints([
      card('coins', 1),  // 11
      card('coins', 3),  // 10
      card('coins', 10), // 4
      card('coins', 9),  // 3
      card('coins', 8),  // 2
    ])).toBe(30);
  });

  it('counts scartine (2, 4, 5, 6, 7) as 0', () => {
    expect(sumPoints([
      card('cups', 2),
      card('cups', 4),
      card('cups', 5),
      card('cups', 6),
      card('cups', 7),
    ])).toBe(0);
  });

  it('a whole deck sums to 120 points', () => {
    expect(sumPoints(createDeck())).toBe(120);
  });
});

describe('calculateRoundScore', () => {
  it('returns the right counts breakdown', () => {
    const captured = [
      card('coins', 1),
      card('cups', 1),
      card('swords', 3),
      card('coins', 10),
      card('clubs', 9),
      card('swords', 8),
      card('cups', 7),    // scartina, not counted
    ];
    const score = calculateRoundScore(captured, []);
    expect(score.counts).toEqual({
      aces: 2,
      threes: 1,
      kings: 1,
      knights: 1,
      knaves: 1,
    });
    expect(score.points).toBe(11 + 11 + 10 + 4 + 3 + 2 + 0);
  });

  it('outcome=win when player has more points than opponent', () => {
    const winner = calculateRoundScore([card('coins', 1)], [card('cups', 2)]);
    expect(winner.outcome).toBe('win');
  });

  it('outcome=loss when player has fewer points', () => {
    const loser = calculateRoundScore([card('cups', 2)], [card('coins', 1)]);
    expect(loser.outcome).toBe('loss');
  });

  it('outcome=tie when both have equal points (e.g. 60-60)', () => {
    // 60 = Ace + King + Knight + Knave + Ace + 3 + Knight = 11+4+3+2+11+10+3 = 44, no.
    // Easier: use any equal totals
    const player = calculateRoundScore([card('coins', 1)], [card('cups', 1)]);
    expect(player.outcome).toBe('tie');
  });

  it('outcomes are opposite when scoring both perspectives of the same deal', () => {
    const split1 = [card('coins', 1), card('coins', 3)];   // 21
    const split2 = [card('cups', 10), card('cups', 9), card('cups', 8)];  // 9
    const scoreA = calculateRoundScore(split1, split2);
    const scoreB = calculateRoundScore(split2, split1);
    expect(scoreA.outcome).toBe('win');
    expect(scoreB.outcome).toBe('loss');
    expect(scoreA.points + scoreB.points).toBe(30);
  });
});
