import { describe, it, expect } from 'vitest';
import { randomAI } from './random';
import type { AIContext } from './types';
import type { Card, CardValue, Suit } from '../types';

const card = (suit: Suit, value: CardValue): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

const ctx = (hand: Card[], leadCard: Card | null = null): AIContext => ({
  hand,
  player: 'cpu',
  trump: card('coins', 7),
  trumpSuit: 'coins',
  leadCard,
  deckCount: 30,
});

describe('randomAI', () => {
  it('returns a move whose card is in hand', () => {
    const hand = [card('cups', 1), card('swords', 3), card('clubs', 10)];
    for (let i = 0; i < 30; i++) {
      const move = randomAI.selectMove(ctx(hand));
      expect(hand.some(c => c.id === move.cardPlayed.id)).toBe(true);
      expect(move.player).toBe('cpu');
    }
  });

  it('throws on an empty hand', () => {
    expect(() => randomAI.selectMove(ctx([]))).toThrow();
  });

  it('picks the only card if hand size is 1', () => {
    const hand = [card('clubs', 5)];
    const move = randomAI.selectMove(ctx(hand));
    expect(move.cardPlayed.id).toBe('clubs-5');
  });
});
