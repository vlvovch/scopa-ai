import type { Card } from './types.js';

/** Seats supported by the multiplayer Scopa room. */
export type MultiplayerSeatId = `player${1 | 2 | 3 | 4 | 5 | 6}`;

export const MAX_PLAYERS = 6;
export const SUPPORTED_PLAYER_COUNTS: readonly number[] = [2, 3, 4, 5, 6];
export const MULTIPLAYER_SEATS: readonly MultiplayerSeatId[] = [
  'player1',
  'player2',
  'player3',
  'player4',
  'player5',
  'player6',
];

export function isMultiplayerSeatId(id: string): id is MultiplayerSeatId {
  return MULTIPLAYER_SEATS.includes(id as MultiplayerSeatId);
}

export function nextSeat(
  seat: MultiplayerSeatId,
  activeSeats: readonly MultiplayerSeatId[]
): MultiplayerSeatId {
  const index = activeSeats.indexOf(seat);
  if (index < 0 || activeSeats.length === 0) {
    throw new Error(`Seat ${seat} is not active`);
  }
  return activeSeats[(index + 1) % activeSeats.length];
}

export function previousSeat(
  seat: MultiplayerSeatId,
  activeSeats: readonly MultiplayerSeatId[]
): MultiplayerSeatId {
  const index = activeSeats.indexOf(seat);
  if (index < 0 || activeSeats.length === 0) {
    throw new Error(`Seat ${seat} is not active`);
  }
  return activeSeats[(index - 1 + activeSeats.length) % activeSeats.length];
}

export function dealMultiplayerHands(
  deck: readonly Card[],
  activeSeats: readonly MultiplayerSeatId[],
  cardsPerHand: number
): { hands: Record<MultiplayerSeatId, Card[]>; remaining: Card[] } {
  if (!SUPPORTED_PLAYER_COUNTS.includes(activeSeats.length)) {
    throw new Error('Scopa multiplayer supports 2, 3, 4, 5, or 6 players');
  }
  if (new Set(activeSeats).size !== activeSeats.length) {
    throw new Error('Active seats must be unique');
  }

  const hands = {} as Record<MultiplayerSeatId, Card[]>;
  let offset = 0;
  for (const seat of activeSeats) {
    hands[seat] = deck.slice(offset, offset + cardsPerHand);
    offset += cardsPerHand;
  }

  return { hands, remaining: deck.slice(offset) };
}

export function emptySeatRecord<T>(
  activeSeats: readonly MultiplayerSeatId[],
  create: (seat: MultiplayerSeatId) => T
): Record<MultiplayerSeatId, T> {
  return Object.fromEntries(
    activeSeats.map((seat) => [seat, create(seat)])
  ) as Record<MultiplayerSeatId, T>;
}
