// Room Management for Briscola Multiplayer

import { customAlphabet } from 'nanoid';

const nanoidAlphanumeric = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 4);
import { v4 as uuidv4 } from 'uuid';
import type WebSocket from 'ws';
import type {
  RoomState,
  PlayerSession,
  MultiplayerPlayerId,
  MultiplayerRoundState,
  PlayerVisibleGameState,
  ServerMessage,
  ErrorCode,
} from './types.js';
import type { RoundScore } from './game/types.js';
import { createDeck, shuffleDeck, dealInitialHands } from './game/deck.js';
import { calculateRoundScore, sumPoints } from './game/scoring.js';
import {
  ROOM_EXPIRY_MS,
  DEFAULT_TURN_TIMER_SECONDS,
  DEFAULT_TARGET_SCORE,
} from './game/constants.js';

// ============================================================================
// Room Storage
// ============================================================================

const rooms = new Map<string, RoomState>();
const turnTimers = new Map<string, NodeJS.Timeout>();

// ============================================================================
// Room Code Generation
// ============================================================================

/**
 * Generate a unique room code in format BRISCOLA-XXXX
 */
export function generateRoomCode(): string {
  let code: string;
  do {
    const suffix = nanoidAlphanumeric();
    code = `BRISCOLA-${suffix}`;
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
  pileViewEnabled: boolean,
  pileStatsEnabled: boolean,
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
      // No round dealt yet — we don't have a trump card until startGame() runs.
      round: null,
      players: {
        player1: { hand: [], captured: [] },
        player2: { hand: [], captured: [] },
      },
      scores: { player1: 0, player2: 0 },
      roundNumber: 0,
      targetScore,
    },
    turnTimerEnabled,
    pileViewEnabled,
    pileStatsEnabled,
    turnTimerSeconds: DEFAULT_TURN_TIMER_SECONDS,
    currentTurnStartedAt: null,
    newGameRequests: new Set(),
    nextRoundRequests: new Set(),
    restartRequests: new Set(),
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
 * Start a new game in the room.
 * Briscola has no king-restriction on the initial deal — a single shuffle
 * + dealInitialHands is all we need.
 */
export function startGame(room: RoomState): void {
  const previousState = room.gameState;
  const targetScore = previousState?.targetScore ?? DEFAULT_TARGET_SCORE;
  const scores = previousState?.scores ?? { player1: 0, player2: 0 };
  const roundNumber = (previousState?.roundNumber ?? 0) + 1;

  // Randomly select dealer; the opposing player leads the first trick
  const dealer: MultiplayerPlayerId = Math.random() < 0.5 ? 'player1' : 'player2';
  const firstPlayer: MultiplayerPlayerId = dealer === 'player1' ? 'player2' : 'player1';

  const shuffled = shuffleDeck(createDeck());
  const { hands, trump, deck } = dealInitialHands(shuffled, dealer);

  const round: MultiplayerRoundState = {
    deck,
    trump,
    trumpSuit: trump.suit,
    trick: { leadCard: null, leader: firstPlayer },
    currentPlayer: firstPlayer,
    dealer,
  };

  room.gameState = {
    status: 'playing',
    round,
    players: {
      player1: { hand: hands.player1, captured: [] },
      player2: { hand: hands.player2, captured: [] },
    },
    scores,
    roundNumber,
    targetScore,
  };

  room.lastActivity = Date.now();
  room.newGameRequests.clear();

  // Start turn timer if enabled
  if (room.turnTimerEnabled) {
    startTurnTimer(room);
  }
}

/**
 * Check if the round should end.
 *
 * In Briscola, draws happen automatically as part of `applyMove` after each
 * completed trick, so we just check whether everything is empty.
 */
export function shouldEndRound(room: RoomState): boolean {
  const state = room.gameState;
  if (!state || !state.round || state.status !== 'playing') return false;

  return (
    state.players.player1.hand.length === 0 &&
    state.players.player2.hand.length === 0 &&
    state.round.deck.length === 0 &&
    state.round.trick.leadCard === null
  );
}

/**
 * End the current round and calculate scores.
 *
 * At the end of a Briscola round, every card has already been captured via
 * trick-taking — there's nothing left on the table or in the deck. We just
 * tally each player's pile and award a round-win to the higher score (or
 * neither, on a 60-60 tie).
 */
export function endRound(room: RoomState): {
  scores: Record<MultiplayerPlayerId, RoundScore>;
  gameOver: boolean;
  winner?: MultiplayerPlayerId | 'tie';
} {
  const state = room.gameState;
  if (!state) throw new Error('No game state');

  const p1Captured = state.players.player1.captured;
  const p2Captured = state.players.player2.captured;

  const roundScores: Record<MultiplayerPlayerId, RoundScore> = {
    player1: calculateRoundScore(p1Captured, p2Captured),
    player2: calculateRoundScore(p2Captured, p1Captured),
  };

  // Award a round-win to whichever player scored more points (ties give nothing)
  if (roundScores.player1.outcome === 'win') {
    state.scores.player1 += 1;
  } else if (roundScores.player2.outcome === 'win') {
    state.scores.player2 += 1;
  }

  state.lastRoundScores = roundScores;
  state.status = 'roundEnd';

  // Check for match end
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
 * Start a new round (after round end, if game not over).
 * Rotates the dealer.
 */
export function startNextRound(room: RoomState): void {
  const state = room.gameState;
  if (!state || state.status !== 'roundEnd') return;

  // Rotate the dealer; if for some reason there's no prior round, start at player1.
  const previousDealer: MultiplayerPlayerId = state.round?.dealer ?? 'player1';
  const newDealer: MultiplayerPlayerId = previousDealer === 'player1' ? 'player2' : 'player1';
  const firstPlayer: MultiplayerPlayerId = newDealer === 'player1' ? 'player2' : 'player1';

  const shuffled = shuffleDeck(createDeck());
  const { hands, trump, deck } = dealInitialHands(shuffled, newDealer);

  state.round = {
    deck,
    trump,
    trumpSuit: trump.suit,
    trick: { leadCard: null, leader: firstPlayer },
    currentPlayer: firstPlayer,
    dealer: newDealer,
  };

  state.players = {
    player1: { hand: hands.player1, captured: [] },
    player2: { hand: hands.player2, captured: [] },
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
  if (!room.turnTimerEnabled || !room.gameState || !room.gameState.round) return;

  // Clear existing timer
  clearTurnTimer(room.code);

  room.currentTurnStartedAt = Date.now();

  // Send TIMER_START message - client handles countdown locally
  broadcastToRoom(room, {
    type: 'TIMER_START',
    payload: {
      seconds: room.turnTimerSeconds,
      player: room.gameState.round.currentPlayer,
    },
  });

  // Set expiry timer - server only sends TIMER_EXPIRED when time is up
  const timer = setTimeout(() => {
    if (room.gameState && room.gameState.round && room.gameState.status === 'playing') {
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

  const selfCaptured = state.players[playerId].captured;
  const opponentCaptured = state.players[opponentId].captured;

  return {
    status: state.status,
    round: state.round
      ? {
          deckCount: state.round.deck.length,
          trump: state.round.trump,
          trumpSuit: state.round.trumpSuit,
          trick: state.round.trick,
          currentPlayer: state.round.currentPlayer,
          dealer: state.round.dealer,
        }
      : null,
    self: {
      hand: state.players[playerId].hand,
      capturedCount: selfCaptured.length,
      points: sumPoints(selfCaptured),
      // Briscola tricks are face-up — captured piles are public info, so
      // both sides are always sent. The pileViewEnabled flag only gates
      // the client UI affordance, not data visibility.
      captured: selfCaptured,
    },
    opponent: {
      handCount: state.players[opponentId].hand.length,
      capturedCount: opponentCaptured.length,
      points: sumPoints(opponentCaptured),
      captured: opponentCaptured,
    },
    scores: state.scores,
    roundNumber: state.roundNumber,
    targetScore: state.targetScore,
    pileViewEnabled: room.pileViewEnabled,
    pileStatsEnabled: room.pileStatsEnabled,
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
