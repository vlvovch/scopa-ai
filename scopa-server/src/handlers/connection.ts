// Connection Handler for Scopa Multiplayer Server

import type {
  ClientMessage,
  ServerMessage,
  AuthenticatedWebSocket,
} from '../types.js';
import {
  createRoom,
  joinRoom,
  reconnectPlayer,
  getRoom,
  disconnectPlayer,
  sendToPlayer,
  getOpponent,
  getPlayerVisibleState,
  startGame,
} from '../room.js';
import { handleGameMessage } from './game.js';

/**
 * Handle a new WebSocket connection
 */
export function handleConnection(ws: AuthenticatedWebSocket): void {
  console.log('New connection established');

  ws.on('message', (data: Buffer) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      handleMessage(ws, message);
    } catch (error) {
      console.error('Failed to parse message:', error);
      sendError(ws, 'INVALID_SESSION', 'Invalid message format');
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
}

/**
 * Handle incoming messages
 */
function handleMessage(ws: AuthenticatedWebSocket, message: ClientMessage): void {
  switch (message.type) {
    case 'CREATE_ROOM':
      handleCreateRoom(ws, message.payload);
      break;

    case 'JOIN_ROOM':
      handleJoinRoom(ws, message.payload);
      break;

    case 'RECONNECT':
      handleReconnect(ws, message.payload);
      break;

    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG' } satisfies ServerMessage));
      break;

    // Game-related messages require authentication
    case 'PLAY_MOVE':
    case 'START_NEW_GAME':
    case 'RESTART_GAME':
    case 'CONTINUE_ROUND':
    case 'FORCE_MOVE':
    case 'UPDATE_NICKNAME':
    case 'LEAVE_ROOM':
      if (!ws.roomCode || !ws.playerId) {
        sendError(ws, 'INVALID_SESSION', 'Not in a room');
        return;
      }
      handleGameMessage(ws, message);
      break;

    default:
      console.warn('Unknown message type:', (message as any).type);
  }
}

/**
 * Handle CREATE_ROOM message
 */
function handleCreateRoom(
  ws: AuthenticatedWebSocket,
  payload: {
    nickname: string;
    targetScore: number;
    turnTimerEnabled: boolean;
    pileViewEnabled: boolean;
    pileStatsEnabled: boolean;
  }
): void {
  const { nickname, targetScore, turnTimerEnabled, pileViewEnabled, pileStatsEnabled } =
    payload;

  // Validate inputs
  if (!nickname || nickname.trim().length === 0) {
    sendError(ws, 'INVALID_SESSION', 'Nickname is required');
    return;
  }

  if (targetScore < 1 || targetScore > 100) {
    sendError(ws, 'INVALID_SESSION', 'Invalid target score');
    return;
  }

  // Create the room
  const { room, sessionToken } = createRoom(
    nickname,
    targetScore,
    turnTimerEnabled,
    pileViewEnabled,
    pileStatsEnabled,
    ws
  );

  // Store connection info on WebSocket
  ws.roomCode = room.code;
  ws.playerId = 'player1';
  ws.sessionToken = sessionToken;

  // Send response
  const response: ServerMessage = {
    type: 'ROOM_CREATED',
    payload: {
      roomCode: room.code,
      sessionToken,
      playerId: 'player1',
    },
  };

  ws.send(JSON.stringify(response));
  console.log(`Room ${room.code} created by ${nickname}`);
}

/**
 * Handle JOIN_ROOM message
 */
function handleJoinRoom(
  ws: AuthenticatedWebSocket,
  payload: { roomCode: string; nickname: string }
): void {
  const { roomCode, nickname } = payload;

  // Validate inputs
  if (!nickname || nickname.trim().length === 0) {
    sendError(ws, 'INVALID_SESSION', 'Nickname is required');
    return;
  }

  if (!roomCode || roomCode.trim().length === 0) {
    sendError(ws, 'ROOM_NOT_FOUND', 'Room code is required');
    return;
  }

  // Try to join the room
  const result = joinRoom(roomCode, nickname, ws);

  if (!result.success) {
    sendError(ws, result.error, result.message);
    return;
  }

  const { room, sessionToken, playerId } = result;

  // Store connection info on WebSocket
  ws.roomCode = room.code;
  ws.playerId = playerId;
  ws.sessionToken = sessionToken;

  // Send response to joiner
  const joinResponse: ServerMessage = {
    type: 'ROOM_JOINED',
    payload: {
      roomCode: room.code,
      sessionToken,
      playerId,
      opponentNickname: room.player1!.nickname,
      targetScore: room.gameState!.targetScore,
      turnTimerEnabled: room.turnTimerEnabled,
      pileViewEnabled: room.pileViewEnabled,
      pileStatsEnabled: room.pileStatsEnabled,
    },
  };
  ws.send(JSON.stringify(joinResponse));

  // Notify the room creator
  const opponentJoinedMsg: ServerMessage = {
    type: 'OPPONENT_JOINED',
    payload: {
      opponentNickname: nickname,
    },
  };
  sendToPlayer(room, 'player1', opponentJoinedMsg);

  console.log(`${nickname} joined room ${room.code}`);

  // Start the game automatically when second player joins
  startGame(room);

  // Send game state to both players
  const p1State = getPlayerVisibleState(room, 'player1');
  const p2State = getPlayerVisibleState(room, 'player2');

  if (p1State) {
    sendToPlayer(room, 'player1', {
      type: 'GAME_START',
      payload: { state: p1State, playerId: 'player1' },
    });
  }

  if (p2State) {
    sendToPlayer(room, 'player2', {
      type: 'GAME_START',
      payload: { state: p2State, playerId: 'player2' },
    });
  }

  console.log(`Game started in room ${room.code}`);
}

/**
 * Handle RECONNECT message
 */
function handleReconnect(
  ws: AuthenticatedWebSocket,
  payload: { sessionToken: string; roomCode: string }
): void {
  const { sessionToken, roomCode } = payload;

  const result = reconnectPlayer(roomCode, sessionToken, ws);

  if (!result.success) {
    sendError(ws, result.error, result.message);
    return;
  }

  const { room, playerId } = result;

  // Store connection info on WebSocket
  ws.roomCode = room.code;
  ws.playerId = playerId;
  ws.sessionToken = sessionToken;

  // Get opponent info
  const opponent = getOpponent(room, playerId);
  const opponentNickname = opponent?.nickname || null;
  const opponentConnected = opponent?.ws?.readyState === 1;

  // Send reconnect success with all necessary info
  const state = getPlayerVisibleState(room, playerId);
  const successMsg: ServerMessage = {
    type: 'RECONNECT_SUCCESS',
    payload: {
      playerId,
      opponentNickname,
      opponentConnected,
      targetScore: room.gameState?.targetScore ?? 11,
      turnTimerEnabled: room.turnTimerEnabled,
      pileViewEnabled: room.pileViewEnabled,
      pileStatsEnabled: room.pileStatsEnabled,
      state,
    },
  };
  ws.send(JSON.stringify(successMsg));

  // Notify opponent of reconnection
  if (opponentConnected && opponent?.ws) {
    const reconnectMsg: ServerMessage = { type: 'OPPONENT_RECONNECTED' };
    opponent.ws.send(JSON.stringify(reconnectMsg));
  }

  console.log(`Player ${playerId} reconnected to room ${room.code}`);
}

/**
 * Handle WebSocket disconnect
 */
function handleDisconnect(ws: AuthenticatedWebSocket): void {
  if (!ws.roomCode || !ws.playerId) {
    console.log('Unauthenticated connection closed');
    return;
  }

  const room = getRoom(ws.roomCode);
  if (!room) {
    console.log(`Room ${ws.roomCode} not found for disconnect`);
    return;
  }

  // Mark player as disconnected
  disconnectPlayer(ws.roomCode, ws.playerId);

  // Notify opponent
  const opponent = getOpponent(room, ws.playerId);
  if (opponent?.ws?.readyState === 1) {
    const disconnectMsg: ServerMessage = { type: 'OPPONENT_DISCONNECTED' };
    opponent.ws.send(JSON.stringify(disconnectMsg));
  }

  console.log(`Player ${ws.playerId} disconnected from room ${ws.roomCode}`);
}

/**
 * Send an error message to a WebSocket
 */
function sendError(
  ws: AuthenticatedWebSocket,
  code: string,
  message: string
): void {
  const errorMsg: ServerMessage = {
    type: 'ERROR',
    payload: { code: code as any, message },
  };
  ws.send(JSON.stringify(errorMsg));
}
