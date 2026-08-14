import type { Card, Move } from './types.js';
import { CARDS_PER_HAND, INITIAL_TABLE_CARDS } from './constants.js';
import { createDeck, dealCards, isValidInitialDeal, shuffleDeck } from './deck.js';
import { isValidMove } from './rules.js';
import {
  dealMultiplayerHands,
  emptySeatRecord,
  MULTIPLAYER_SEATS,
  MultiplayerSeatId,
  nextSeat,
} from './multiplayer.js';

export interface MultiplayerPlayerState {
  hand: Card[];
  captured: Card[];
  scopaCount: number;
  scopaCaptures: Card[][];
}

export interface MultiplayerRoundState {
  deck: Card[];
  table: Card[];
  currentPlayer: MultiplayerSeatId;
  dealer: MultiplayerSeatId;
  lastCapture: MultiplayerSeatId | null;
}

export interface MultiplayerGameState {
  round: MultiplayerRoundState;
  players: Record<MultiplayerSeatId, MultiplayerPlayerState>;
  scores: Record<MultiplayerSeatId, number>;
  targetScore: number;
  roundNumber: number;
}

export interface MultiplayerMove {
  player: MultiplayerSeatId;
  cardPlayed: Card;
  capturedCards: Card[];
}

function dealRound(
  activeSeats: readonly MultiplayerSeatId[],
  dealer: MultiplayerSeatId,
  previousScores: Record<MultiplayerSeatId, number>,
  targetScore: number,
  roundNumber: number
): MultiplayerGameState {
  let deck: Card[];
  let table: Card[];
  do {
    deck = shuffleDeck(createDeck());
    const tableDeal = dealCards(deck, INITIAL_TABLE_CARDS);
    table = tableDeal.dealt;
    deck = tableDeal.remaining;
  } while (!isValidInitialDeal(table));

  const firstPlayer = nextSeat(dealer, activeSeats);
  const { hands, remaining } = dealMultiplayerHands(deck, activeSeats, CARDS_PER_HAND);
  const players = emptySeatRecord(activeSeats, (seat) => ({
    hand: hands[seat],
    captured: [],
    scopaCount: 0,
    scopaCaptures: [],
  }));

  return {
    round: {
      deck: remaining,
      table,
      currentPlayer: firstPlayer,
      dealer,
      lastCapture: null,
    },
    players,
    scores: { ...previousScores },
    targetScore,
    roundNumber,
  };
}

export function createMultiplayerGame(
  activeSeats: readonly MultiplayerSeatId[],
  targetScore: number,
  dealer: MultiplayerSeatId = activeSeats[0]
): MultiplayerGameState {
  if (!activeSeats.every((seat) => MULTIPLAYER_SEATS.includes(seat))) {
    throw new Error('Unknown multiplayer seat');
  }
  if (!activeSeats.includes(dealer)) {
    throw new Error('Dealer must be an active seat');
  }

  return dealRound(
    activeSeats,
    dealer,
    emptySeatRecord(activeSeats, () => 0),
    targetScore,
    1
  );
}

export function applyMultiplayerMove(
  state: MultiplayerGameState,
  activeSeats: readonly MultiplayerSeatId[],
  move: MultiplayerMove
): MultiplayerGameState {
  const player = move.player;
  if (state.round.currentPlayer !== player) {
    throw new Error('It is not this seat\'s turn');
  }

  const playerState = state.players[player];
  const validationMove: Move = {
    ...move,
    // Move legality depends on the card and table, not the seat identity.
    player: 'player1',
    isScopa: false,
  };
  if (!playerState || !isValidMove(validationMove, playerState.hand, state.round.table)) {
    throw new Error('Invalid move');
  }

  const newHand = playerState.hand.filter((card) => card.id !== move.cardPlayed.id);
  const capturedIds = new Set(move.capturedCards.map((card) => card.id));
  const newTable = move.capturedCards.length > 0
    ? state.round.table.filter((card) => !capturedIds.has(card.id))
    : [...state.round.table, move.cardPlayed];
  const newCaptured = move.capturedCards.length > 0
    ? [...playerState.captured, move.cardPlayed, ...move.capturedCards]
    : playerState.captured;
  const handsAfterMove = {
    ...state.players,
    [player]: { ...playerState, hand: newHand, captured: newCaptured },
  };
  const isLastPlay = activeSeats.every((seat) => handsAfterMove[seat].hand.length === 0)
    && state.round.deck.length === 0;
  const actualIsScopa = move.capturedCards.length > 0 && newTable.length === 0 && !isLastPlay;
  const nextPlayers = {
    ...handsAfterMove,
    [player]: {
      ...handsAfterMove[player],
      scopaCount: playerState.scopaCount + (actualIsScopa ? 1 : 0),
      scopaCaptures: actualIsScopa
        ? [...playerState.scopaCaptures, [move.cardPlayed, ...move.capturedCards]]
        : playerState.scopaCaptures,
    },
  };

  if (isLastPlay) {
    return {
      ...state,
      round: {
        ...state.round,
        table: newTable,
        currentPlayer: nextSeat(player, activeSeats),
        lastCapture: move.capturedCards.length > 0 ? player : state.round.lastCapture,
      },
      players: nextPlayers as Record<MultiplayerSeatId, MultiplayerPlayerState>,
    };
  }

  const allHandsEmpty = activeSeats.every((seat) => nextPlayers[seat].hand.length === 0);
  if (allHandsEmpty && state.round.deck.length > 0) {
    const cardsPerSeat = Math.min(
      CARDS_PER_HAND,
      Math.max(1, Math.ceil(state.round.deck.length / activeSeats.length))
    );
    const { hands, remaining } = dealMultiplayerHands(
      state.round.deck,
      activeSeats,
      cardsPerSeat
    );
    return {
      ...state,
      round: {
        ...state.round,
        deck: remaining,
        table: newTable,
        currentPlayer: nextSeat(player, activeSeats),
        lastCapture: move.capturedCards.length > 0 ? player : state.round.lastCapture,
      },
      players: emptySeatRecord(activeSeats, (seat) => ({
        ...nextPlayers[seat],
        hand: hands[seat],
      })),
    };
  }

  let nextPlayer = nextSeat(player, activeSeats);
  for (let offset = 0; offset < activeSeats.length; offset += 1) {
    if (nextPlayers[nextPlayer].hand.length > 0) break;
    nextPlayer = nextSeat(nextPlayer, activeSeats);
  }

  return {
    ...state,
    round: {
      ...state.round,
      table: newTable,
      currentPlayer: nextPlayer,
      lastCapture: move.capturedCards.length > 0 ? player : state.round.lastCapture,
    },
    players: nextPlayers as Record<MultiplayerSeatId, MultiplayerPlayerState>,
  };
}

export function startNextMultiplayerRound(
  state: MultiplayerGameState,
  activeSeats: readonly MultiplayerSeatId[]
): MultiplayerGameState {
  const dealer = nextSeat(state.round.dealer, activeSeats);
  return dealRound(activeSeats, dealer, state.scores, state.targetScore, state.roundNumber + 1);
}