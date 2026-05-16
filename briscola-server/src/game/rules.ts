// Briscola rules

import type { Card, GameState, Move, PlayerId, PlayerState, Suit, TrickState } from './types.js';
import { CARD_RANK } from './constants.js';
import { dealCards } from './deck.js';

/** The other player. */
export function otherPlayer(p: PlayerId): PlayerId {
  return p === 'player1' ? 'player2' : 'player1';
}

/**
 * Legal moves in Briscola: there is no follow-suit rule, so a player may play
 * any card in their hand.
 */
export function getLegalMoves(hand: Card[], player: PlayerId): Move[] {
  return hand.map(card => ({ player, cardPlayed: card }));
}

/**
 * Determine the winner of a completed trick.
 *
 *  - Trump always beats non-trump.
 *  - Both trump: higher CARD_RANK wins.
 *  - Both same non-trump suit (the led suit): higher CARD_RANK wins.
 *  - Different non-trump suits: the lead card wins (the follower played a card
 *    of an unrelated suit, which can't take the trick).
 */
export function trickWinner(
  leadCard: Card,
  leadPlayer: PlayerId,
  followCard: Card,
  followPlayer: PlayerId,
  trumpSuit: Suit
): PlayerId {
  const leadIsTrump = leadCard.suit === trumpSuit;
  const followIsTrump = followCard.suit === trumpSuit;

  if (followIsTrump && !leadIsTrump) return followPlayer;
  if (leadIsTrump && !followIsTrump) return leadPlayer;

  if (leadCard.suit === followCard.suit) {
    return CARD_RANK[followCard.value] > CARD_RANK[leadCard.value]
      ? followPlayer
      : leadPlayer;
  }

  // Different non-trump suits — lead wins by default
  return leadPlayer;
}

/** True if a move is legal in the given state. */
export function isValidMove(state: GameState, move: Move): boolean {
  if (state.status !== 'playing') return false;
  if (move.player !== state.round.currentPlayer) return false;
  const hand = state.players[move.player].hand;
  return hand.some(c => c.id === move.cardPlayed.id);
}

/**
 * Apply a move to a game state and return the new state. Pure: does not
 * mutate the input. Caller is responsible for validating with `isValidMove`
 * first if they want to reject ill-formed moves; this function trusts its input.
 *
 * Two cases:
 *  1) Trick is empty (no leadCard): the played card becomes the lead card,
 *     turn passes to the opponent.
 *  2) Trick has a lead card: the trick resolves. Winner captures both cards,
 *     both players draw (winner first), winner leads the next trick.
 */
export function applyMove(state: GameState, move: Move): GameState {
  const { player } = move;
  const opponent = otherPlayer(player);

  // Remove the played card from the player's hand (preserve order)
  const newHand = state.players[player].hand.filter(
    c => c.id !== move.cardPlayed.id
  );

  // Case 1: opening a trick
  if (state.round.trick.leadCard === null) {
    const nextTrick: TrickState = {
      leadCard: move.cardPlayed,
      leader: player,
    };
    return {
      ...state,
      round: {
        ...state.round,
        trick: nextTrick,
        currentPlayer: opponent,
      },
      players: {
        ...state.players,
        [player]: {
          ...state.players[player],
          hand: newHand,
        },
      },
    };
  }

  // Case 2: completing a trick
  const leadCard = state.round.trick.leadCard;
  const leadPlayer = state.round.trick.leader;
  const winner = trickWinner(
    leadCard,
    leadPlayer,
    move.cardPlayed,
    player,
    state.round.trumpSuit
  );
  const loser = otherPlayer(winner);

  // Build a hands map after the move (before drawing)
  const handsAfterPlay: Record<PlayerId, Card[]> = {
    player1: state.players.player1.hand,
    player2: state.players.player2.hand,
  };
  handsAfterPlay[player] = newHand;

  // Both players draw (winner first), if deck has cards
  let deck = state.round.deck;
  let winnerHand = handsAfterPlay[winner];
  let loserHand = handsAfterPlay[loser];

  if (deck.length > 0) {
    const winnerDraw = dealCards(deck, 1);
    winnerHand = [...winnerHand, ...winnerDraw.dealt];
    deck = winnerDraw.remaining;
  }
  if (deck.length > 0) {
    const loserDraw = dealCards(deck, 1);
    loserHand = [...loserHand, ...loserDraw.dealt];
    deck = loserDraw.remaining;
  }

  // Winner captures both cards in the trick
  const capturedCards = [leadCard, move.cardPlayed];

  const newPlayers: Record<PlayerId, PlayerState> = {
    [winner]: {
      hand: winnerHand,
      captured: [...state.players[winner].captured, ...capturedCards],
    },
    [loser]: {
      hand: loserHand,
      captured: state.players[loser].captured,
    },
  } as Record<PlayerId, PlayerState>;

  // Round ends when no cards remain anywhere
  const roundEnded =
    deck.length === 0 &&
    newPlayers.player1.hand.length === 0 &&
    newPlayers.player2.hand.length === 0;

  return {
    ...state,
    status: roundEnded ? 'roundEnd' : state.status,
    round: {
      ...state.round,
      deck,
      trick: { leadCard: null, leader: winner },
      currentPlayer: winner,
    },
    players: newPlayers,
  };
}
