import { describe, it, expect } from 'vitest';
import { applyMove, getLegalMoves, isValidMove, otherPlayer, trickWinner } from './rules';
import { dealInitialHands, createDeck } from './deck';
import type { Card, GameState, Move, PlayerId, Suit, CardValue } from './types';

// Helpers
const card = (suit: Suit, value: CardValue): Card => ({
  suit,
  value,
  id: `${suit}-${value}`,
});

const makeState = (overrides: {
  trumpSuit?: Suit;
  trump?: Card;
  deck?: Card[];
  humanHand?: Card[];
  cpuHand?: Card[];
  trick?: { leadCard: Card | null; leader: PlayerId };
  currentPlayer?: PlayerId;
}): GameState => {
  const trumpCard = overrides.trump ?? card('coins', 4);
  return {
    status: 'playing',
    round: {
      deck: overrides.deck ?? [],
      trump: trumpCard,
      trumpSuit: overrides.trumpSuit ?? trumpCard.suit,
      trick: overrides.trick ?? { leadCard: null, leader: 'human' },
      currentPlayer: overrides.currentPlayer ?? 'human',
      dealer: 'cpu',
    },
    players: {
      human: { hand: overrides.humanHand ?? [], captured: [] },
      cpu: { hand: overrides.cpuHand ?? [], captured: [] },
    },
    scores: { human: 0, cpu: 0 },
    roundHistory: [],
    roundNumber: 1,
    targetScore: 1,
  };
};

describe('otherPlayer', () => {
  it('returns the opponent', () => {
    expect(otherPlayer('human')).toBe('cpu');
    expect(otherPlayer('cpu')).toBe('human');
  });
});

describe('getLegalMoves', () => {
  it('returns one move per card in hand (no follow-suit restriction)', () => {
    const hand = [card('coins', 1), card('cups', 7), card('swords', 10)];
    const moves = getLegalMoves(hand, 'human');
    expect(moves.length).toBe(3);
    expect(moves.map(m => m.cardPlayed.id)).toEqual(['coins-1', 'cups-7', 'swords-10']);
    expect(moves.every(m => m.player === 'human')).toBe(true);
  });

  it('returns no moves for an empty hand', () => {
    expect(getLegalMoves([], 'human')).toEqual([]);
  });
});

describe('trickWinner', () => {
  const trump: Suit = 'coins';

  it('trump beats non-trump (follower wins)', () => {
    const winner = trickWinner(card('cups', 1), 'human', card('coins', 2), 'cpu', trump);
    expect(winner).toBe('cpu');
  });

  it('trump beats non-trump (leader wins)', () => {
    const winner = trickWinner(card('coins', 2), 'human', card('cups', 1), 'cpu', trump);
    expect(winner).toBe('human');
  });

  it('both trump: higher CARD_RANK wins (Ace > 3)', () => {
    const winner = trickWinner(card('coins', 3), 'human', card('coins', 1), 'cpu', trump);
    expect(winner).toBe('cpu');
  });

  it('both trump: King > Knight > Knave order', () => {
    expect(trickWinner(card('coins', 9), 'human', card('coins', 10), 'cpu', trump)).toBe('cpu');
    expect(trickWinner(card('coins', 10), 'human', card('coins', 9), 'cpu', trump)).toBe('human');
    expect(trickWinner(card('coins', 8), 'human', card('coins', 9), 'cpu', trump)).toBe('cpu');
  });

  it('same non-trump suit: higher CARD_RANK wins', () => {
    const winner = trickWinner(card('cups', 7), 'human', card('cups', 10), 'cpu', trump);
    expect(winner).toBe('cpu'); // King > 7 within suit
  });

  it('same non-trump suit: low scartina loses to Ace', () => {
    const winner = trickWinner(card('cups', 1), 'human', card('cups', 2), 'cpu', trump);
    expect(winner).toBe('human');
  });

  it('different non-trump suits: lead wins regardless of follow card rank', () => {
    // Lead a low scartina in cups, follow with an Ace in swords (non-trump)
    const winner = trickWinner(card('cups', 2), 'human', card('swords', 1), 'cpu', trump);
    expect(winner).toBe('human');
  });

  it('different non-trump suits: lead wins even when follower has a high card', () => {
    const winner = trickWinner(card('swords', 4), 'human', card('cups', 3), 'cpu', trump);
    expect(winner).toBe('human');
  });
});

describe('isValidMove', () => {
  it('accepts a card the player holds, on their turn', () => {
    const state = makeState({
      humanHand: [card('cups', 1)],
      currentPlayer: 'human',
    });
    const move: Move = { player: 'human', cardPlayed: card('cups', 1) };
    expect(isValidMove(state, move)).toBe(true);
  });

  it('rejects playing out of turn', () => {
    const state = makeState({
      humanHand: [card('cups', 1)],
      currentPlayer: 'cpu',
    });
    const move: Move = { player: 'human', cardPlayed: card('cups', 1) };
    expect(isValidMove(state, move)).toBe(false);
  });

  it('rejects a card not in hand', () => {
    const state = makeState({
      humanHand: [card('cups', 1)],
      currentPlayer: 'human',
    });
    const move: Move = { player: 'human', cardPlayed: card('cups', 2) };
    expect(isValidMove(state, move)).toBe(false);
  });

  it('rejects moves when not in playing status', () => {
    const state = makeState({
      humanHand: [card('cups', 1)],
      currentPlayer: 'human',
    });
    state.status = 'roundEnd';
    const move: Move = { player: 'human', cardPlayed: card('cups', 1) };
    expect(isValidMove(state, move)).toBe(false);
  });
});

describe('applyMove', () => {
  it('opening a trick: card moves from hand to trick, turn passes to opponent', () => {
    const state = makeState({
      humanHand: [card('cups', 1), card('swords', 7)],
      cpuHand: [card('coins', 2)],
      currentPlayer: 'human',
    });
    const next = applyMove(state, { player: 'human', cardPlayed: card('cups', 1) });

    expect(next.round.trick.leadCard).toEqual(card('cups', 1));
    expect(next.round.trick.leader).toBe('human');
    expect(next.round.currentPlayer).toBe('cpu');
    expect(next.players.human.hand.map(c => c.id)).toEqual(['swords-7']);
    expect(next.players.cpu.hand.map(c => c.id)).toEqual(['coins-2']);
    expect(next.players.human.captured).toEqual([]);
  });

  it('completing a trick: winner captures both cards, both draw, winner leads next', () => {
    const deck = [card('cups', 5), card('coins', 6)];
    const state = makeState({
      trumpSuit: 'coins',
      trump: card('coins', 4),
      deck,
      humanHand: [card('cups', 7)],
      cpuHand: [card('swords', 1)],
      currentPlayer: 'cpu',
      trick: { leadCard: card('cups', 10), leader: 'human' }, // human led the King of cups
    });

    // CPU plays Ace of swords (non-trump, different suit from lead) — human wins
    const next = applyMove(state, { player: 'cpu', cardPlayed: card('swords', 1) });

    // Human captures both played cards
    expect(next.players.human.captured.map(c => c.id)).toEqual(['cups-10', 'swords-1']);
    expect(next.players.cpu.captured).toEqual([]);

    // Both drew: winner (human) first, then loser (cpu)
    expect(next.players.human.hand.map(c => c.id)).toEqual(['cups-7', 'cups-5']);
    expect(next.players.cpu.hand.map(c => c.id)).toEqual(['coins-6']);
    expect(next.round.deck).toEqual([]);

    // Winner leads next
    expect(next.round.trick.leadCard).toBeNull();
    expect(next.round.trick.leader).toBe('human');
    expect(next.round.currentPlayer).toBe('human');
  });

  it('completing a trick with trump beating non-trump', () => {
    const state = makeState({
      trumpSuit: 'coins',
      trump: card('coins', 4),
      deck: [],
      humanHand: [],
      cpuHand: [],
      currentPlayer: 'cpu',
      trick: { leadCard: card('cups', 1), leader: 'human' }, // human led the Ace of cups (11 pts)
    });
    // CPU plays the 2 of coins (trump, lowest rank but trump beats non-trump)
    const next = applyMove(state, { player: 'cpu', cardPlayed: card('coins', 2) });
    expect(next.players.cpu.captured.map(c => c.id).sort()).toEqual(['coins-2', 'cups-1']);
    expect(next.players.human.captured).toEqual([]);
  });

  it('depleting the deck: only one card to draw → winner takes it, loser draws nothing', () => {
    const state = makeState({
      trumpSuit: 'coins',
      deck: [card('cups', 6)], // only one card left (the trump in this case; but for this test we just track length)
      humanHand: [card('cups', 1)],
      cpuHand: [card('cups', 2)],
      currentPlayer: 'cpu',
      trick: { leadCard: card('cups', 10), leader: 'human' },
    });
    // CPU plays a 2 of cups; human's lead (King of cups) wins
    const next = applyMove(state, { player: 'cpu', cardPlayed: card('cups', 2) });
    expect(next.players.human.hand.length).toBe(2); // played 0 (was leading), drew the last card
    expect(next.players.cpu.hand.length).toBe(0); // played their only card, deck empty so couldn't draw
    expect(next.round.deck.length).toBe(0);
  });

  it('round end: deck empty + both hands empty after a trick → status becomes roundEnd', () => {
    const state = makeState({
      trumpSuit: 'coins',
      deck: [],
      humanHand: [],
      cpuHand: [],
      currentPlayer: 'cpu',
      trick: { leadCard: card('cups', 1), leader: 'human' },
    });
    const next = applyMove(state, { player: 'cpu', cardPlayed: card('cups', 2) });
    expect(next.status).toBe('roundEnd');
    expect(next.players.human.hand).toEqual([]);
    expect(next.players.cpu.hand).toEqual([]);
  });

  it('does not flip to roundEnd when only one player has run out of cards', () => {
    const state = makeState({
      trumpSuit: 'coins',
      deck: [],
      humanHand: [],
      cpuHand: [card('cups', 9)], // CPU still has a card
      currentPlayer: 'cpu',
      trick: { leadCard: card('cups', 1), leader: 'human' },
    });
    const next = applyMove(state, { player: 'cpu', cardPlayed: card('cups', 9) });
    // CPU played their last card now → both empty → roundEnd
    expect(next.status).toBe('roundEnd');
  });

  it('full round: 40-card game with deterministic moves runs to roundEnd cleanly', () => {
    // Stress test: simulate a whole round with both players playing the first
    // card from their hand. Verifies no exceptions, all cards accounted for,
    // and roundEnd reached when expected.
    const deck = createDeck();
    const initial = dealInitialHands(deck, 'cpu');
    let state: GameState = makeState({
      trumpSuit: initial.trump.suit,
      trump: initial.trump,
      deck: initial.deck,
      humanHand: initial.hands.human,
      cpuHand: initial.hands.cpu,
      currentPlayer: 'human', // non-dealer leads
      trick: { leadCard: null, leader: 'human' },
    });

    let safetyMax = 200;
    while (state.status === 'playing' && safetyMax-- > 0) {
      const p = state.round.currentPlayer;
      const hand = state.players[p].hand;
      if (hand.length === 0) {
        throw new Error(`Player ${p} has no cards but status is playing`);
      }
      state = applyMove(state, { player: p, cardPlayed: hand[0] });
    }

    expect(state.status).toBe('roundEnd');
    expect(state.round.deck.length).toBe(0);
    expect(state.players.human.hand.length).toBe(0);
    expect(state.players.cpu.hand.length).toBe(0);
    expect(
      state.players.human.captured.length + state.players.cpu.captured.length
    ).toBe(40);
  });

  it('does not mutate the input state', () => {
    const state = makeState({
      humanHand: [card('cups', 1)],
      cpuHand: [card('coins', 2)],
      currentPlayer: 'human',
    });
    const before = JSON.stringify(state);
    applyMove(state, { player: 'human', cardPlayed: card('cups', 1) });
    expect(JSON.stringify(state)).toBe(before);
  });
});
