// Room Management for Scopa Multiplayer

import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';
import type WebSocket from 'ws';
import type {
  RoomState,
  PlayerSession,
  MultiplayerPlayerId,
  PlayerVisibleGameState,
  ServerMessage,
  ErrorCode,
} from './types.js';
import type { Card, GameState, RoundScore } from './game/types.js';
import { createDeck, shuffleDeck, dealCards, isValidInitialDeal } from './game/deck.js';
import { calculateRoundScore } from './game/scoring.js';
import {
  ROOM_EXPIRY_MS,
  DEFAULT_TURN_TIMER_SECONDS,
  CARDS_PER_HAND,
  INITIAL_TABLE_CARDS,
} from './game/constants.js';

// ============================================================================
// Room Storage
// ============================================================================

const rooms = new Map<string, RoomState>();
const turnTimers = new Map<string, NodeJS.Timeout>();
const timerIntervals = new Map<string, NodeJS.Timeout>();

// ============================================================================
// Room Code Generation
// ============================================================================

/**
 * Generate a unique room code in format SCOPA-XXXX
 */
export function generateRoomCode(): string {
  let code: string;
  do {
    const suffix = nanoid(4).toUpperCase();
    code = `SCOPA-${suffix}`;
  } while (rooms.has(code)); // Ensure uniqueness
  return code;
}

/**
 * Generate a UUID session token for player authentication
 */
export function generateSessionToken(): string {
  return uuidv4();
}

// ============================================================================
// Room CRUD Operations
// ============================================================================

/**
 * Create a new room
 */
export function createRoom(
  nickname: string,
  targetScore: number,
  turnTimerEnabled: boolean,
  ws: WebSocket
): { room: RoomState; sessionToken: string } {
  const code = generateRoomCode();
  const sessionToken = generateSessionToken();

  const room: RoomState = {
    code,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    player1: {
      id: 'player1',
      sessionToken,
      nickname: sanitizeNickname(nickname),
      ws,
      lastSeen: Date.now(),
    },
    player2: null,
    gameState: {
      status: 'waiting',
      round: {
        deck: [],
        table: [],
        currentPlayer: 'player1',
        dealer: 'player1',
        lastCapture: null,
      },
      players: {
        player1: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
        player2: { hand: [], captured: [], scopaCount: 0, scopaCaptures: [] },
      },
      scores: { player1: 0, player2: 0 },
      roundNumber: 0,
      targetScore,
    },
    turnTimerEnabled,
    turnTimerSeconds: DEFAULT_TURN_TIMER_SECONDS,
    currentTurnStartedAt: null,
    newGameRequests: new Set(),
  };

  rooms.set(code, room);
  return { room, sessionToken };
}

/**
 * Join an existing room
 */
export function joinRoom(
  roomCode: string,
  nickname: string,
  ws: WebSocket
):
  | { success: true; room: RoomState; sessionToken: string; playerId: MultiplayerPlayerId }
  | { success: false; error: ErrorCode; message: string } {
  const room = rooms.get(roomCode.toUpperCase());

  if (!room) {
    return { success: false, error: 'ROOM_NOT_FOUND', message: 'Room not found' };
  }

  if (room.player2 !== null) {
    return { success: false, error: 'ROOM_FULL', message: 'Room is already full' };
  }

  const sessionToken = generateSessionToken();
  room.player2 = {
    id: 'player2',
    sessionToken,
    nickname: sanitizeNickname(nickname),
    ws,
    lastSeen: Date.now(),
  };
  room.lastActivity = Date.now();

  return { success: true, room, sessionToken, playerId: 'player2' };
}

/**
 * Reconnect a player to their room
 */
export function reconnectPlayer(
  roomCode: string,
  sessionToken: string,
  ws: WebSocket
):
  | { success: true; room: RoomState; playerId: MultiplayerPlayerId }
  | { success: false; error: ErrorCode; message: string } {
  const room = rooms.get(roomCode.toUpperCase());

  if (!room) {
    return { success: false, error: 'ROOM_NOT_FOUND', message: 'Room not found' };
  }

  // Check if session token matches either player
  if (room.player1?.sessionToken === sessionToken) {
    room.player1.ws = ws;
    room.player1.lastSeen = Date.now();
    room.lastActivity = Date.now();
    return { success: true, room, playerId: 'player1' };
  }

  if (room.player2?.sessionToken === sessionToken) {
    room.player2.ws = ws;
    room.player2.lastSeen = Date.now();
    room.lastActivity = Date.now();
    return { success: true, room, playerId: 'player2' };
  }

  return { success: false, error: 'INVALID_SESSION', message: 'Invalid session token' };
}

/**
 * Get a room by code
 */
export function getRoom(roomCode: string): RoomState | undefined {
  return rooms.get(roomCode.toUpperCase());
}

/**
 * Remove a room
 */
export function deleteRoom(roomCode: string): void {
  const code = roomCode.toUpperCase();
  clearTurnTimer(code);
  rooms.delete(code);
}

/**
 * Mark a player as disconnected (but keep their session)
 */
export function disconnectPlayer(roomCode: string, playerId: MultiplayerPlayerId): void {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return;

  const player = room[playerId];
  if (player) {
    player.ws = null;
    player.lastSeen = Date.now();
  }
}

// ============================================================================
// Game Logic
// ============================================================================

/**
 * Start a new game in the room
 */
export function startGame(room: RoomState): void {
  // Create and shuffle deck
  let deck = shuffleDeck(createDeck());

  // Deal initial table cards (re-deal if 3+ kings)
  let tableCards: Card[];
  do {
    deck = shuffleDeck(createDeck());
    const tableResult = dealCards(deck, INITIAL_TABLE_CARDS);
    tableCards = tableResult.dealt;
    deck = tableResult.remaining;
  } while (!isValidInitialDeal(tableCards));

  // Deal hands
  const p1Hand = dealCards(deck, CARDS_PER_HAND);
  deck = p1Hand.remaining;
  const p2Hand = dealCards(deck, CARDS_PER_HAND);
  deck = p2Hand.remaining;

  // Randomly select dealer
  const dealer: MultiplayerPlayerId = Math.random() < 0.5 ? 'player1' : 'player2';
  // Opponent of dealer plays first
  const firstPlayer: MultiplayerPlayerId = dealer === 'player1' ? 'player2' : 'player1';

  room.gameState = {
    status: 'playing',
    round: {
      deck,
      table: tableCards,
      currentPlayer: firstPlayer,
      dealer,
      lastCapture: null,
    },
    players: {
      player1: { hand: p1Hand.dealt, captured: [], scopaCount: 0, scopaCaptures: [] },
      player2: { hand: p2Hand.dealt, captured: [], scopaCount: 0, scopaCaptures: [] },
    },
    scores: room.gameState?.scores ?? { player1: 0, player2: 0 },
    roundNumber: (room.gameState?.roundNumber ?? 0) + 1,
    targetScore: room.gameState?.targetScore ?? 11,
  };

  room.lastActivity = Date.now();
  room.newGameRequests.clear();

  // Start turn timer if enabled
  if (room.turnTimerEnabled) {
    startTurnTimer(room);
  }
}

/**
 * Deal new hands when both players are out of cards
 */
export function dealNewHands(room: RoomState): boolean {
  const state = room.gameState;
  if (!state || state.status !== 'playing') return false;

  // Check if both hands are empty and deck has cards
  if (
    state.players.player1.hand.length === 0 &&
    state.players.player2.hand.length === 0 &&
    state.round.deck.length > 0
  ) {
    const p1Hand = dealCards(state.round.deck, CARDS_PER_HAND);
    const p2Hand = dealCards(p1Hand.remaining, CARDS_PER_HAND);

    state.players.player1.hand = p1Hand.dealt;
    state.players.player2.hand = p2Hand.dealt;
    state.round.deck = p2Hand.remaining;

    room.lastActivity = Date.now();
    return true;
  }

  return false;
}

/**
 * Check if the round should end
 */
export function shouldEndRound(room: RoomState): boolean {
  const state = room.gameState;
  if (!state || state.status !== 'playing') return false;

  return (
    state.players.player1.hand.length === 0 &&
    state.players.player2.hand.length === 0 &&
    state.round.deck.length === 0
  );
}

/**
 * End the current round and calculate scores
 */
export function endRound(room: RoomState): {
  scores: Record<MultiplayerPlayerId, RoundScore>;
  gameOver: boolean;
  winner?: MultiplayerPlayerId | 'tie';
} {
  const state = room.gameState;
  if (!state) throw new Error('No game state');

  // Award remaining table cards to last capturer
  if (state.round.lastCapture && state.round.table.length > 0) {
    const lastCapturer = state.round.lastCapture;
    state.players[lastCapturer].captured.push(...state.round.table);
    state.round.table = [];
  }

  // Calculate round scores
  const tempState: GameState = {
    status: 'roundEnd',
    round: state.round as any,
    players: state.players as any,
    scores: state.scores as any,
    roundNumber: state.roundNumber,
    targetScore: state.targetScore,
  };
  const roundScores = calculateRoundScore(tempState);

  // Update cumulative scores
  state.scores.player1 += roundScores.player1.total;
  state.scores.player2 += roundScores.player2.total;

  state.lastRoundScores = roundScores;
  state.status = 'roundEnd';

  // Check for game end
  const p1Score = state.scores.player1;
  const p2Score = state.scores.player2;
  const targetScore = state.targetScore;

  let gameOver = false;
  let winner: MultiplayerPlayerId | 'tie' | undefined;

  if (p1Score >= targetScore || p2Score >= targetScore) {
    gameOver = true;
    if (p1Score > p2Score) {
      winner = 'player1';
    } else if (p2Score > p1Score) {
      winner = 'player2';
    } else {
      winner = 'tie';
    }
    state.status = 'gameEnd';
    state.winner = winner;
  }

  clearTurnTimer(room.code);
  room.lastActivity = Date.now();

  return { scores: roundScores, gameOver, winner };
}

/**
 * Start a new round (after round end, if game not over)
 */
export function startNextRound(room: RoomState): void {
  const state = room.gameState;
  if (!state || state.status !== 'roundEnd') return;

  // Create and shuffle deck
  let deck = shuffleDeck(createDeck());

  // Deal initial table cards (re-deal if 3+ kings)
  let tableCards: Card[];
  do {
    deck = shuffleDeck(createDeck());
    const tableResult = dealCards(deck, INITIAL_TABLE_CARDS);
    tableCards = tableResult.dealt;
    deck = tableResult.remaining;
  } while (!isValidInitialDeal(tableCards));

  // Deal hands
  const p1Hand = dealCards(deck, CARDS_PER_HAND);
  deck = p1Hand.remaining;
  const p2Hand = dealCards(deck, CARDS_PER_HAND);
  deck = p2Hand.remaining;

  // Rotate dealer
  const newDealer: MultiplayerPlayerId =
    state.round.dealer === 'player1' ? 'player2' : 'player1';
  const firstPlayer: MultiplayerPlayerId =
    newDealer === 'player1' ? 'player2' : 'player1';

  state.round = {
    deck,
    table: tableCards,
    currentPlayer: firstPlayer,
    dealer: newDealer,
    lastCapture: null,
  };

  state.players = {
    player1: { hand: p1Hand.dealt, captured: [], scopaCount: 0, scopaCaptures: [] },
    player2: { hand: p2Hand.dealt, captured: [], scopaCount: 0, scopaCaptures: [] },
  };

  state.roundNumber++;
  state.status = 'playing';
  state.lastRoundScores = undefined;

  room.lastActivity = Date.now();

  // Start turn timer if enabled
  if (room.turnTimerEnabled) {
    startTurnTimer(room);
  }
}

// ============================================================================
// Turn Timer
// ============================================================================

/**
 * Start the turn timer for the current player
 */
export function startTurnTimer(room: RoomState): void {
  if (!room.turnTimerEnabled || !room.gameState) return;

  // Clear existing timer
  clearTurnTimer(room.code);

  room.currentTurnStartedAt = Date.now();

  // Send updates every 10 seconds
  const interval = setInterval(() => {
    if (!room.currentTurnStartedAt || !room.gameState) {
      clearInterval(interval);
      return;
    }

    const elapsed = (Date.now() - room.currentTurnStartedAt) / 1000;
    const remaining = Math.max(0, room.turnTimerSeconds - elapsed);

    broadcastToRoom(room, {
      type: 'TIMER_UPDATE',
      payload: {
        secondsRemaining: Math.ceil(remaining),
        player: room.gameState.round.currentPlayer,
      },
    });
  }, 10000);

  timerIntervals.set(room.code, interval);

  // Set expiry timer
  const timer = setTimeout(() => {
    clearInterval(interval);
    timerIntervals.delete(room.code);

    if (room.gameState && room.gameState.status === 'playing') {
      // Notify opponent they can force a move
      const currentPlayer = room.gameState.round.currentPlayer;

      broadcastToRoom(room, {
        type: 'TIMER_EXPIRED',
        payload: { player: currentPlayer },
      });
    }
  }, room.turnTimerSeconds * 1000);

  turnTimers.set(room.code, timer);
}

/**
 * Clear the turn timer
 */
export function clearTurnTimer(roomCode: string): void {
  const timer = turnTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomCode);
  }

  const interval = timerIntervals.get(roomCode);
  if (interval) {
    clearInterval(interval);
    timerIntervals.delete(roomCode);
  }
}

/**
 * Reset turn timer (called after a move is made)
 */
export function resetTurnTimer(room: RoomState): void {
  if (room.turnTimerEnabled) {
    startTurnTimer(room);
  }
}

// ============================================================================
// State Visibility
// ============================================================================

/**
 * Create a player-visible version of the game state
 * (hides opponent's hand and deck contents)
 */
export function getPlayerVisibleState(
  room: RoomState,
  playerId: MultiplayerPlayerId
): PlayerVisibleGameState | null {
  const state = room.gameState;
  if (!state) return null;

  const opponentId: MultiplayerPlayerId = playerId === 'player1' ? 'player2' : 'player1';

  return {
    status: state.status,
    round: {
      deckCount: state.round.deck.length,
      table: state.round.table,
      currentPlayer: state.round.currentPlayer,
      dealer: state.round.dealer,
      lastCapture: state.round.lastCapture,
    },
    self: {
      hand: state.players[playerId].hand,
      capturedCount: state.players[playerId].captured.length,
      scopaCount: state.players[playerId].scopaCount,
    },
    opponent: {
      handCount: state.players[opponentId].hand.length,
      capturedCount: state.players[opponentId].captured.length,
      scopaCount: state.players[opponentId].scopaCount,
    },
    scores: state.scores,
    roundNumber: state.roundNumber,
    targetScore: state.targetScore,
  };
}

// ============================================================================
// Messaging
// ============================================================================

/**
 * Send a message to a specific player
 */
export function sendToPlayer(
  room: RoomState,
  playerId: MultiplayerPlayerId,
  message: ServerMessage
): void {
  const player = room[playerId];
  if (player?.ws?.readyState === 1) {
    // WebSocket.OPEN
    player.ws.send(JSON.stringify(message));
  }
}

/**
 * Broadcast a message to all connected players in a room
 */
export function broadcastToRoom(room: RoomState, message: ServerMessage): void {
  if (room.player1?.ws?.readyState === 1) {
    room.player1.ws.send(JSON.stringify(message));
  }
  if (room.player2?.ws?.readyState === 1) {
    room.player2.ws.send(JSON.stringify(message));
  }
}

/**
 * Get the opponent player
 */
export function getOpponent(
  room: RoomState,
  playerId: MultiplayerPlayerId
): PlayerSession | null {
  return playerId === 'player1' ? room.player2 : room.player1;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up expired rooms (run periodically)
 */
export function cleanupExpiredRooms(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_EXPIRY_MS) {
      clearTurnTimer(code);
      rooms.delete(code);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Get statistics about current rooms
 */
export function getRoomStats(): {
  totalRooms: number;
  waitingRooms: number;
  activeGames: number;
} {
  let waiting = 0;
  let active = 0;

  for (const room of rooms.values()) {
    if (room.gameState?.status === 'waiting') {
      waiting++;
    } else if (room.gameState?.status === 'playing') {
      active++;
    }
  }

  return {
    totalRooms: rooms.size,
    waitingRooms: waiting,
    activeGames: active,
  };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sanitize a nickname (max 20 chars, remove HTML)
 */
function sanitizeNickname(nickname: string): string {
  return nickname
    .trim()
    .slice(0, 20)
    .replace(/[<>&"']/g, '');
}

/**
 * Update player nickname
 */
export function updateNickname(
  room: RoomState,
  playerId: MultiplayerPlayerId,
  nickname: string
): void {
  const player = room[playerId];
  if (player) {
    player.nickname = sanitizeNickname(nickname);
    room.lastActivity = Date.now();
  }
}
