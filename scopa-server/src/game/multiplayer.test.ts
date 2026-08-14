import { describe, expect, it } from 'vitest';
import { createDeck } from './deck.js';
import {
  dealMultiplayerHands,
  MULTIPLAYER_SEATS,
  nextSeat,
  previousSeat,
} from './multiplayer.js';

describe('Scopa multiplayer seats', () => {
  it('rotates through active seats in circular order', () => {
    const seats = MULTIPLAYER_SEATS.slice(0, 6);

    expect(nextSeat('player6', seats)).toBe('player1');
    expect(previousSeat('player1', seats)).toBe('player6');
    expect(nextSeat('player2', seats.slice(0, 4))).toBe('player3');
  });

  it('deals three cards to six players without duplicating cards', () => {
    const deck = createDeck();
    const activeSeats = MULTIPLAYER_SEATS;
    const { hands, remaining } = dealMultiplayerHands(deck, activeSeats, 3);
    const dealt = activeSeats.flatMap((seat) => hands[seat]);
    const ids = dealt.map((card) => card.id);

    expect(dealt).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
    expect(remaining).toHaveLength(22);
  });

  it('rejects duplicate or invalid active seats', () => {
    expect(() => dealMultiplayerHands(createDeck(), ['player1', 'player1'], 3)).toThrow(
      'Active seats must be unique'
    );
    expect(() => dealMultiplayerHands(createDeck(), ['player1'], 3)).toThrow(
      'supports 2, 3, 4, or 6 players'
    );
  });
});