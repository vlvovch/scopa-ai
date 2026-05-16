import { describe, it, expect } from 'vitest';
import { expertAI } from './expert';
import type { AIContext } from './types';
import type { Card, CardValue, Suit } from '../types';

const card = (suit: Suit, value: CardValue): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

const ctx = (
  hand: Card[],
  leadCard: Card | null = null,
  trumpSuit: Suit = 'coins',
  overrides: Partial<AIContext> = {}
): AIContext => ({
  hand,
  player: 'cpu',
  trump: card(trumpSuit, 7),
  trumpSuit,
  leadCard,
  deckCount: 30,
  myCaptured: [],
  oppCaptured: [],
  ...overrides,
});

describe('expertAI', () => {
  it('returns a card that is in hand', () => {
    const hand = [card('cups', 1), card('swords', 3), card('clubs', 10)];
    const move = expertAI.selectMove(ctx(hand));
    expect(hand.some((c) => c.id === move.cardPlayed.id)).toBe(true);
    expect(move.player).toBe('cpu');
  });

  it('throws on empty hand', () => {
    expect(() => expertAI.selectMove(ctx([]))).toThrow();
  });

  it('plays the only card when hand has one card', () => {
    const move = expertAI.selectMove(ctx([card('clubs', 5)]));
    expect(move.cardPlayed.id).toBe('clubs-5');
  });

  it('captures the Ace lead with a cheap trump (free 11 points)', () => {
    // Opponent leads the Ace of cups (11 pts). We hold a low trump and a
    // worthless scartina. Taking with the cheapest trump is the correct play.
    const hand = [card('cups', 4), card('coins', 2)];
    const move = expertAI.selectMove(ctx(hand, card('cups', 1)));
    expect(move.cardPlayed.id).toBe('coins-2');
  });

  it('dumps the lowest-value card when forced to lose the trick', () => {
    // Opponent leads the King of trumps. We can't beat it; lose the cheapest card.
    const hand = [card('cups', 1), card('cups', 2)];
    const move = expertAI.selectMove(ctx(hand, card('coins', 10)));
    expect(move.cardPlayed.id).toBe('cups-2');
  });

  it('does not crash when the unseen pool is small (late game)', () => {
    // Almost everything captured already; only 1 card left in hand and deck empty.
    const allButOne: Card[] = [];
    const fullDeck = [
      ...['coins', 'cups', 'swords', 'clubs'].flatMap((s) =>
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) =>
          card(s as Suit, v as CardValue)
        )
      ),
    ];
    // Hand = the Ace of coins; everything else split between captured piles.
    const hand = [card('coins', 1)];
    const split = fullDeck.filter((c) => c.id !== 'coins-1');
    for (let i = 0; i < split.length; i++) {
      allButOne.push(split[i]);
    }
    const myCaptured = allButOne.slice(0, 20);
    const oppCaptured = allButOne.slice(20);

    const move = expertAI.selectMove(
      ctx(hand, null, 'coins', { deckCount: 0, myCaptured, oppCaptured })
    );
    expect(move.cardPlayed.id).toBe('coins-1');
  });
});
