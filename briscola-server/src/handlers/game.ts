// Game Message Handler for Briscola Multiplayer Server

import type {
  ClientMessage,
  ServerMessage,
  AuthenticatedWebSocket,
  MultiplayerMove,
} from '../types.js';
import {
  getRoom,
  sendToPlayer,
  broadcastToRoom,
  getPlayerVisibleState,
  getOpponent,
  updateNickname,
  startGame,
  shouldEndRound,
  endRound,
  startNextRound,
  resetTurnTimer,
  clearTurnTimer,
  deleteRoom,
} from '../room.js';
import { isValidMove, applyMove, getLegalMoves } from '../game/rules.js';
import type { GameState, Move } from '../game/types.js';

/**
 * Handle game-related messages (requires authenticated connection)
 */
export function handleGameMessage(
  ws: AuthenticatedWebSocket,
  message: ClientMessage
): void {
  const room = getRoom(ws.roomCode!);
  if (!room) {
    sendError(ws, 'ROOM_NOT_FOUND', 'Room not found');
    return;
  }

  switch (message.type) {
    case 'PLAY_MOVE':
      handlePlayMove(ws, message.payload.move);
      break;

    case 'START_NEW_GAME':
      handleNewGameRequest(ws);
      break;

    case 'RESTART_GAME':
      handleRestartGame(ws);
      break;

    case 'CONTINUE_ROUND':
      handleContinueRound(ws);
      break;

    case 'FORCE_MOVE':
      handleForceMove(ws);
      break;

    case 'UPDATE_NICKNAME':
      handleUpdateNickname(ws, message.payload.nickname);
      break;

    case 'LEAVE_ROOM':
      handleLeaveRoom(ws);
      break;
  }
}

/**
 * Build a Briscola GameState view from the room's MultiplayerGameState.
 * The shapes are identical (both keyed by 'player1'|'player2'); we just
 * widen the types here so the pure rules module can operate on it.
 *
 * Returns null if there's no active round to operate on.
 */
function toGameState(roomGameState: NonNullable<ReturnType<typeof getRoom>>['gameState']): GameState | null {
  if (!roomGameState || !roomGameState.round) return null;
  return {
    status: roomGameState.status,
    round: roomGameState.round,
    players: roomGameState.players,
    scores: roomGameState.scores,
    roundNumber: roomGameState.roundNumber,
    targetScore: roomGameState.targetScore,
    lastRoundScores: roomGameState.lastRoundScores,
    winner: roomGameState.winner,
  };
}

/**
 * Apply a Briscola move to the room state in place (using the pure rules
 * module to compute the new state, then copying the relevant fields back).
 */
function applyMoveToRoom(
  roomGameState: NonNullable<ReturnType<typeof getRoom>>['gameState'],
  move: Move
): GameState {
  if (!roomGameState || !roomGameState.round) {
    throw new Error('applyMoveToRoom called with no active round');
  }
  const before = toGameState(roomGameState)!;
  const after = applyMove(before, move);

  roomGameState.status = after.status;
  roomGameState.round = after.round;
  roomGameState.players = after.players;
  return after;
}

/**
 * Handle PLAY_MOVE message
 */
function handlePlayMove(ws: AuthenticatedWebSocket, move: MultiplayerMove): void {
  const room = getRoom(ws.roomCode!);
  if (!room || !room.gameState || !room.gameState.round) {
    sendError(ws, 'GAME_NOT_STARTED', 'Game not started');
    return;
  }

  const state = room.gameState;
  const round = state.round!;
  const playerId = ws.playerId!;

  // Verify game is in playing state
  if (state.status !== 'playing') {
    sendError(ws, 'INVALID_MOVE', 'Cannot play during this game phase');
    return;
  }

  // Verify it's this player's turn
  if (round.currentPlayer !== playerId) {
    sendError(ws, 'NOT_YOUR_TURN', "It's not your turn");
    return;
  }

  // Verify the played card is well-formed and the player owns it
  if (!move.cardPlayed || typeof move.cardPlayed.id !== 'string') {
    sendError(ws, 'INVALID_MOVE', 'Invalid card payload');
    return;
  }
  if (move.player !== playerId) {
    sendError(ws, 'INVALID_MOVE', 'Move player does not match session');
    return;
  }

  const gameMove: Move = {
    player: playerId,
    cardPlayed: move.cardPlayed,
  };

  const gameStateView = toGameState(state)!;
  if (!isValidMove(gameStateView, gameMove)) {
    sendError(ws, 'INVALID_MOVE', 'Invalid move');
    return;
  }

  // Apply the move (this also handles drawing and trick resolution)
  applyMoveToRoom(state, gameMove);

  // Check if the round just ended
  if (shouldEndRound(room)) {
    const { scores, gameOver, winner } = endRound(room);

    broadcastToRoom(room, {
      type: 'ROUND_END',
      payload: {
        scores,
        cumulativeScores: state.scores,
        capturedCards: {
          player1: state.players.player1.captured,
          player2: state.players.player2.captured,
        },
      },
    });

    if (gameOver) {
      broadcastToRoom(room, {
        type: 'GAME_END',
        payload: {
          winner: winner!,
          finalScores: state.scores,
          roundScores: scores,
          capturedCards: {
            player1: state.players.player1.captured,
            player2: state.players.player2.captured,
          },
        },
      });
    } else {
      // Clear any previous next round requests; wait for both players to
      // click "Next Round" before continuing.
      room.nextRoundRequests.clear();
    }
  } else {
    // Send the (now server-canonical) move to both players
    const serverMove: MultiplayerMove = {
      player: playerId,
      cardPlayed: move.cardPlayed,
    };

    const p1State = getPlayerVisibleState(room, 'player1');
    const p2State = getPlayerVisibleState(room, 'player2');

    if (p1State) {
      sendToPlayer(room, 'player1', {
        type: 'MOVE_PLAYED',
        payload: { move: serverMove, state: p1State },
      });
    }
    if (p2State) {
      sendToPlayer(room, 'player2', {
        type: 'MOVE_PLAYED',
        payload: { move: serverMove, state: p2State },
      });
    }

    // Reset turn timer AFTER sending MOVE_PLAYED so client processes them in order
    resetTurnTimer(room);
  }

  console.log(
    `Move played in room ${room.code}: ${playerId} played ${move.cardPlayed.id}`
  );
}

/**
 * Handle START_NEW_GAME message
 */
function handleNewGameRequest(ws: AuthenticatedWebSocket): void {
  const room = getRoom(ws.roomCode!);
  if (!room || !room.gameState) {
    sendError(ws, 'GAME_NOT_STARTED', 'No game to restart');
    return;
  }

  const playerId = ws.playerId!;

  // Only allow new game request when game is over
  if (room.gameState.status !== 'gameEnd') {
    sendError(ws, 'INVALID_MOVE', 'Game is not over yet');
    return;
  }

  // Track who requested
  room.newGameRequests.add(playerId);

  // Notify opponent
  const opponent = getOpponent(room, playerId);
  if (opponent?.ws?.readyState === 1) {
    const msg: ServerMessage = {
      type: 'NEW_GAME_REQUESTED',
      payload: { by: playerId },
    };
    opponent.ws.send(JSON.stringify(msg));
  }

  // If both players requested, start new game
  if (room.newGameRequests.has('player1') && room.newGameRequests.has('player2')) {
    room.gameState.scores = { player1: 0, player2: 0 };
    room.gameState.roundNumber = 0;

    startGame(room);

    const p1State = getPlayerVisibleState(room, 'player1');
    const p2State = getPlayerVisibleState(room, 'player2');

    if (p1State) {
      sendToPlayer(room, 'player1', {
        type: 'NEW_GAME_STARTED',
        payload: { state: p1State },
      });
    }
    if (p2State) {
      sendToPlayer(room, 'player2', {
        type: 'NEW_GAME_STARTED',
        payload: { state: p2State },
      });
    }

    console.log(`New game started in room ${room.code}`);
  }
}

/**
 * Handle RESTART_GAME message (mid-game restart request)
 * Works during playing or roundEnd status - requires both players to accept
 */
function handleRestartGame(ws: AuthenticatedWebSocket): void {
  const room = getRoom(ws.roomCode!);
  if (!room || !room.gameState) {
    sendError(ws, 'GAME_NOT_STARTED', 'No game in progress');
    return;
  }

  const playerId = ws.playerId!;
  const state = room.gameState;

  // Only allow during playing or roundEnd status (not gameEnd - use START_NEW_GAME for that)
  if (state.status !== 'playing' && state.status !== 'roundEnd') {
    sendError(ws, 'INVALID_MOVE', 'Cannot restart game at this time');
    return;
  }

  // If this player already requested, this is a cancel
  if (room.restartRequests.has(playerId)) {
    room.restartRequests.delete(playerId);
    broadcastToRoom(room, {
      type: 'RESTART_CANCELLED',
    });
    console.log(`Player ${playerId} cancelled restart request in room ${room.code}`);
    return;
  }

  // Track who requested
  room.restartRequests.add(playerId);

  const opponent = getOpponent(room, playerId);
  if (opponent?.ws?.readyState === 1) {
    const msg: ServerMessage = {
      type: 'RESTART_REQUESTED',
      payload: { by: playerId },
    };
    opponent.ws.send(JSON.stringify(msg));
  }

  console.log(`Player ${playerId} requested restart. Requests: [${[...room.restartRequests].join(', ')}]`);

  // If both players requested, restart the game
  if (room.restartRequests.has('player1') && room.restartRequests.has('player2')) {
    room.restartRequests.clear();

    state.scores = { player1: 0, player2: 0 };
    state.roundNumber = 0;

    room.nextRoundRequests.clear();
    clearTurnTimer(room.code);

    startGame(room);

    const p1State = getPlayerVisibleState(room, 'player1');
    const p2State = getPlayerVisibleState(room, 'player2');

    if (p1State) {
      sendToPlayer(room, 'player1', {
        type: 'NEW_GAME_STARTED',
        payload: { state: p1State },
      });
    }
    if (p2State) {
      sendToPlayer(room, 'player2', {
        type: 'NEW_GAME_STARTED',
        payload: { state: p2State },
      });
    }

    console.log(`Game restarted in room ${room.code}`);
  }
}

/**
 * Handle CONTINUE_ROUND message (when player clicks "Next Round" after round end)
 */
function handleContinueRound(ws: AuthenticatedWebSocket): void {
  const room = getRoom(ws.roomCode!);
  if (!room || !room.gameState) {
    sendError(ws, 'GAME_NOT_STARTED', 'No game in progress');
    return;
  }

  const playerId = ws.playerId!;

  if (room.gameState.status !== 'roundEnd') {
    sendError(ws, 'INVALID_MOVE', 'Round is not over yet');
    return;
  }

  room.nextRoundRequests.add(playerId);
  console.log(`Player ${playerId} requested next round. Requests: [${[...room.nextRoundRequests].join(', ')}]`);

  const opponent = getOpponent(room, playerId);
  if (opponent?.ws?.readyState === 1) {
    const msg: ServerMessage = {
      type: 'NEXT_ROUND_REQUESTED',
      payload: { by: playerId },
    };
    opponent.ws.send(JSON.stringify(msg));
  }

  // If both players requested, start next round
  if (room.nextRoundRequests.has('player1') && room.nextRoundRequests.has('player2')) {
    room.nextRoundRequests.clear();
    startNextRound(room);

    const p1State = getPlayerVisibleState(room, 'player1');
    const p2State = getPlayerVisibleState(room, 'player2');

    if (p1State) {
      sendToPlayer(room, 'player1', {
        type: 'NEXT_ROUND_STARTED',
        payload: { state: p1State },
      });
    }
    if (p2State) {
      sendToPlayer(room, 'player2', {
        type: 'NEXT_ROUND_STARTED',
        payload: { state: p2State },
      });
    }

    console.log(`Next round started in room ${room.code}`);
  }
}

/**
 * Handle FORCE_MOVE message (when opponent's timer expired).
 *
 * Picks a random legal card from the current player's hand. There's no
 * follow-suit rule in Briscola, so any card is legal.
 */
function handleForceMove(ws: AuthenticatedWebSocket): void {
  const room = getRoom(ws.roomCode!);
  if (!room || !room.gameState || !room.gameState.round) {
    sendError(ws, 'GAME_NOT_STARTED', 'Game not started');
    return;
  }

  const state = room.gameState;
  const round = state.round!;
  const playerId = ws.playerId!;

  if (state.status !== 'playing') {
    sendError(ws, 'INVALID_MOVE', 'Cannot force move during this game phase');
    return;
  }

  // Verify it's opponent's turn (not the requester's)
  if (round.currentPlayer === playerId) {
    sendError(ws, 'NOT_YOUR_TURN', "You can't force your own move");
    return;
  }

  // Verify timer has actually expired
  if (room.turnTimerEnabled && room.currentTurnStartedAt) {
    const elapsed = (Date.now() - room.currentTurnStartedAt) / 1000;
    if (elapsed < room.turnTimerSeconds) {
      sendError(ws, 'INVALID_MOVE', 'Timer has not expired yet');
      return;
    }
  }

  const currentPlayer = round.currentPlayer;
  const playerHand = state.players[currentPlayer].hand;

  const legalMoves = getLegalMoves(playerHand, currentPlayer);
  if (legalMoves.length === 0) {
    sendError(ws, 'INVALID_MOVE', 'No valid moves available');
    return;
  }

  const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];

  applyMoveToRoom(state, randomMove);

  if (shouldEndRound(room)) {
    const { scores, gameOver, winner } = endRound(room);

    broadcastToRoom(room, {
      type: 'ROUND_END',
      payload: {
        scores,
        cumulativeScores: state.scores,
        capturedCards: {
          player1: state.players.player1.captured,
          player2: state.players.player2.captured,
        },
      },
    });

    if (gameOver) {
      broadcastToRoom(room, {
        type: 'GAME_END',
        payload: {
          winner: winner!,
          finalScores: state.scores,
          roundScores: scores,
          capturedCards: {
            player1: state.players.player1.captured,
            player2: state.players.player2.captured,
          },
        },
      });
    } else {
      room.nextRoundRequests.clear();
    }
  } else {
    const multiplayerMove: MultiplayerMove = {
      player: currentPlayer,
      cardPlayed: randomMove.cardPlayed,
    };

    const p1State = getPlayerVisibleState(room, 'player1');
    const p2State = getPlayerVisibleState(room, 'player2');

    if (p1State) {
      sendToPlayer(room, 'player1', {
        type: 'MOVE_PLAYED',
        payload: { move: multiplayerMove, state: p1State },
      });
    }
    if (p2State) {
      sendToPlayer(room, 'player2', {
        type: 'MOVE_PLAYED',
        payload: { move: multiplayerMove, state: p2State },
      });
    }

    resetTurnTimer(room);
  }

  console.log(`Forced random move in room ${room.code} for ${currentPlayer}`);
}

/**
 * Handle UPDATE_NICKNAME message
 */
function handleUpdateNickname(ws: AuthenticatedWebSocket, nickname: string): void {
  const room = getRoom(ws.roomCode!);
  if (!room) {
    sendError(ws, 'ROOM_NOT_FOUND', 'Room not found');
    return;
  }

  if (!nickname || nickname.trim().length === 0) {
    sendError(ws, 'INVALID_SESSION', 'Nickname cannot be empty');
    return;
  }

  const playerId = ws.playerId!;
  updateNickname(room, playerId, nickname);

  broadcastToRoom(room, {
    type: 'NICKNAME_UPDATED',
    payload: { playerId, nickname },
  });

  console.log(`Player ${playerId} updated nickname to ${nickname} in room ${room.code}`);
}

/**
 * Handle LEAVE_ROOM message
 */
function handleLeaveRoom(ws: AuthenticatedWebSocket): void {
  const room = getRoom(ws.roomCode!);
  if (!room) {
    return;
  }

  const playerId = ws.playerId!;

  const opponent = getOpponent(room, playerId);
  if (opponent?.ws?.readyState === 1) {
    const msg: ServerMessage = { type: 'OPPONENT_DISCONNECTED' };
    opponent.ws.send(JSON.stringify(msg));
  }

  // Delete the room (game is over if someone leaves)
  deleteRoom(room.code);

  ws.roomCode = undefined;
  ws.playerId = undefined;
  ws.sessionToken = undefined;

  console.log(`Player ${playerId} left room ${room.code}`);
}

/**
 * Send an error message
 */
function sendError(ws: AuthenticatedWebSocket, code: string, message: string): void {
  const errorMsg: ServerMessage = {
    type: 'ERROR',
    payload: { code: code as any, message },
  };
  ws.send(JSON.stringify(errorMsg));
}
