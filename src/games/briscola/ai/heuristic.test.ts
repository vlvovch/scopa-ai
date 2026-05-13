import { describe, it, expect } from 'vitest';
import { heuristicAI, scoreCandidate } from './heuristic';
import type { AIContext } from './types';
import type { Card, CardValue, Suit } from '../types';

const card = (suit: Suit, value: CardValue): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

const ctx = (hand: Card[], leadCard: Card | null = null, trumpSuit: Suit = 'coins'): AIContext => ({
  hand,
  player: 'cpu',
  trump: card(trumpSuit, 7),
  trumpSuit,
  leadCard,
  deckCount: 30,
});

describe('heuristicAI scoring — LEADING', () => {
  const trumpSuit: Suit = 'coins';

  it('prefers to lead a low scartina over an Ace', () => {
    const ace = card('cups', 1);
    const four = card('cups', 4);
    expect(scoreCandidate(four, null, trumpSuit, 'cpu'))
      .toBeGreaterThan(scoreCandidate(ace, null, trumpSuit, 'cpu'));
  });

  it('prefers to lead a non-trump scartina over a trump scartina', () => {
    const nonTrumpScartina = card('cups', 4);
    const trumpScartina = card('coins', 4);
    expect(scoreCandidate(nonTrumpScartina, null, trumpSuit, 'cpu'))
      .toBeGreaterThan(scoreCandidate(trumpScartina, null, trumpSuit, 'cpu'));
  });

  it('selectMove leading: picks the lowest scartina from a typical hand', () => {
    const hand = [
      card('cups', 1),    // Ace of cups (11 pts) — terrible to lead
      card('swords', 4),  // scartina, good to lead
      card('coins', 10),  // King of trumps — DO NOT lead
    ];
    const move = heuristicAI.selectMove(ctx(hand, null, trumpSuit));
    expect(move.cardPlayed.id).toBe('swords-4');
  });
});

describe('heuristicAI scoring — FOLLOWING', () => {
  const trumpSuit: Suit = 'coins';

  it('captures a high-points lead with a low trump (worth it)', () => {
    const hand = [
      card('cups', 4),    // can't win, lose 11 to ace
      card('coins', 2),   // 2 of trumps — wins the trick, captures Ace (11pts)
    ];
    const leadAceOfCups = card('cups', 1);
    const move = heuristicAI.selectMove(ctx(hand, leadAceOfCups, trumpSuit));
    expect(move.cardPlayed.id).toBe('coins-2');
  });

  it('does NOT waste a trump to win a 0-point trick', () => {
    const hand = [
      card('cups', 4),    // scartina (0 pts), loses
      card('coins', 2),   // 2 of trumps, would win
    ];
    // Opponent leads a worthless 2 of swords (0 pts)
    const leadJunk = card('swords', 2);
    const move = heuristicAI.selectMove(ctx(hand, leadJunk, trumpSuit));
    expect(move.cardPlayed.id).toBe('cups-4'); // dump scartina, save trump
  });

  it('when losing inevitably, dumps the lowest-value card (not the Ace)', () => {
    const hand = [
      card('cups', 1),    // Ace, 11 pts — never want to dump
      card('cups', 2),    // 2 of cups, 0 pts
    ];
    // Opponent leads with King of trumps — we cannot win
    const leadTrumpKing = card('coins', 10);
    const move = heuristicAI.selectMove(ctx(hand, leadTrumpKing, trumpSuit));
    expect(move.cardPlayed.id).toBe('cups-2');
  });

  it('wins a same-suit trick with the highest scoring card (captures more points)', () => {
    // Opponent leads 4 of cups (scartina, 0 pts). We have 5 and 10 (King) of cups.
    // Both win. King is the strategically correct play: we capture 4 pts (the
    // King's own value) plus 0 from the lead. Playing the 5 captures only 0
    // and "wastes" the King by keeping it in hand without point benefit.
    const hand = [
      card('cups', 5),
      card('cups', 10),
    ];
    const leadFour = card('cups', 4);
    const move = heuristicAI.selectMove(ctx(hand, leadFour, trumpSuit));
    expect(move.cardPlayed.id).toBe('cups-10');
  });
});

describe('heuristicAI never throws on a valid context', () => {
  it('always returns a move whose card is in hand', () => {
    const hand = [card('cups', 1), card('swords', 3), card('coins', 8)];
    const move1 = heuristicAI.selectMove(ctx(hand, null));
    expect(hand.some(c => c.id === move1.cardPlayed.id)).toBe(true);

    const move2 = heuristicAI.selectMove(ctx(hand, card('cups', 10)));
    expect(hand.some(c => c.id === move2.cardPlayed.id)).toBe(true);
  });

  it('throws on empty hand', () => {
    expect(() => heuristicAI.selectMove(ctx([]))).toThrow();
  });
});
