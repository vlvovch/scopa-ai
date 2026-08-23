import { describe, expect, it } from 'vitest';
import { applyMultiplayerMove, createMultiplayerGame } from './multiplayerEngine.js';
import { MULTIPLAYER_SEATS } from './multiplayer.js';
import { getValidMoves } from './rules.js';

describe('Scopa multiplayer engine', () => {
  it('creates a six-player round with three cards per hand', () => {
    const state = createMultiplayerGame(MULTIPLAYER_SEATS, 11, 'player1');
    const cards = MULTIPLAYER_SEATS.flatMap((seat) => state.players[seat].hand);

    expect(state.round.currentPlayer).toBe('player2');
    expect(state.round.table).toHaveLength(4);
    expect(cards).toHaveLength(18);
    expect(state.round.deck).toHaveLength(18);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
  });

  it('supports a two-player round through the same engine', () => {
    const seats = MULTIPLAYER_SEATS.slice(0, 2);
    const state = createMultiplayerGame(seats, 11, 'player2');

    expect(state.round.currentPlayer).toBe('player1');
    expect(state.players.player1.hand).toHaveLength(3);
    expect(state.players.player2.hand).toHaveLength(3);
  });

  it('supports five seats through the initial deal', () => {
    const seats = MULTIPLAYER_SEATS.slice(0, 5);
    const state = createMultiplayerGame(seats, 11, 'player1');

    expect(state.players.player5.hand).toHaveLength(3);
    expect(state.round.deck).toHaveLength(21);
  });

  it('advances from a seat to the next active seat', () => {
    const state = createMultiplayerGame(MULTIPLAYER_SEATS, 11, 'player1');
    const card = state.players.player2.hand[0];
    const legalMove = getValidMoves(card, state.round.table, 'player1')[0];
    const nextState = applyMultiplayerMove(state, MULTIPLAYER_SEATS, {
      player: 'player2',
      cardPlayed: legalMove.cardPlayed,
      capturedCards: legalMove.capturedCards,
    });

    expect(nextState.round.currentPlayer).toBe('player3');
  });
});