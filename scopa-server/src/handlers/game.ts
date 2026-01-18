// Game Message Handler for Scopa Multiplayer Server

import type {
  ClientMessage,
  ServerMessage,
  AuthenticatedWebSocket,
  MultiplayerMove,
  MultiplayerPlayerId,
} from '../types.js';
import {
  getRoom,
  sendToPlayer,
  broadcastToRoom,
  getPlayerVisibleState,
  getOpponent,
  updateNickname,
  startGame,
  dealNewHands,
  shouldEndRound,
  endRound,
  startNextRound,
  resetTurnTimer,
  clearTurnTimer,
  deleteRoom,
} from '../room.js';
import { isValidMove, executeMove, getRandomMove } from '../game/rules.js';
import type { Move, GameState } from '../game/types.js';

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
 * Handle PLAY_MOVE message
 */
function handlePlayMove(ws: AuthenticatedWebSocket, move: MultiplayerMove): void {
  const room = getRoom(ws.roomCode!);
  if (!room || !room.gameState) {
    sendError(ws, 'GAME_NOT_STARTED', 'Game not started');
    return;
  }

  const state = room.gameState;
  const playerId = ws.playerId!;

  // Verify it's this player's turn
  if (state.round.currentPlayer !== playerId) {
    sendError(ws, 'NOT_YOUR_TURN', "It's not your turn");
    return;
  }

  // Verify game is in playing state
  if (state.status !== 'playing') {
    sendError(ws, 'INVALID_MOVE', 'Cannot play during this game phase');
    return;
  }

  // Validate the move
  const playerHand = state.players[playerId].hand;
  const tableCards = state.round.table;
  const otherPlayerId: MultiplayerPlayerId = playerId === 'player1' ? 'player2' : 'player1';
  const otherHand = state.players[otherPlayerId].hand;

  // Calculate server-authoritative isScopa:
  // 1. Must be a capture that clears the table
  // 2. Must NOT be the last play of the round (no scopa on final card)
  const clearsTable = move.capturedCards.length > 0 && move.capturedCards.length === tableCards.length;
  // Last play = after this move, both players have 0 cards and deck is empty
  // playerHand.length is BEFORE the move, so after playing it becomes playerHand.length - 1
  const isLastPlay = (playerHand.length - 1) === 0 && otherHand.length === 0 && state.round.deck.length === 0;
  const serverIsScopa = clearsTable && !isLastPlay;

  const gameMove: Move = {
    player: playerId,
    cardPlayed: move.cardPlayed,
    capturedCards: move.capturedCards,
    isScopa: serverIsScopa,
  };

  if (!isValidMove(gameMove, playerHand, tableCards)) {
    sendError(ws, 'INVALID_MOVE', 'Invalid move');
    return;
  }

  // Execute the move
  const tempState: GameState = {
    status: state.status as any,
    round: state.round as any,
    players: state.players as any,
    scores: state.scores as any,
    roundNumber: state.roundNumber,
    targetScore: state.targetScore,
  };

  const newTempState = executeMove(tempState, gameMove);

  // Update room state
  state.round = newTempState.round as any;
  state.players = newTempState.players as any;

  // Check if we need to deal new hands
  dealNewHands(room);

  // Check if round should end
  if (shouldEndRound(room)) {
    // Capture remaining table cards BEFORE endRound gives them to last capturer
    const remainingTableCards = [...state.round.table];
    const { scores, gameOver, winner } = endRound(room);

    // Always send ROUND_END first so clients can show round summary
    // (even on the final round before GAME_END)
    broadcastToRoom(room, {
      type: 'ROUND_END',
      payload: {
        scores,
        cumulativeScores: state.scores,
        capturedCards: {
          player1: state.players.player1.captured,
          player2: state.players.player2.captured,
        },
        scopaCaptures: {
          player1: state.players.player1.scopaCaptures,
          player2: state.players.player2.scopaCaptures,
        },
        lastCapture: state.round.lastCapture!,
        remainingTableCards,
      },
    });

    if (gameOver) {
      // Also send GAME_END after ROUND_END so clients know the game is over
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
      // Clear any previous next round requests
      room.nextRoundRequests.clear();
      // Wait for both players to click "Next Round" before continuing
    }
  } else {
    // Send move update to both players
    // Use server-computed isScopa (gameMove) instead of client-provided value (move)
    const serverMove: MultiplayerMove = {
      player: playerId,
      cardPlayed: gameMove.cardPlayed,
      capturedCards: gameMove.capturedCards,
      isScopa: gameMove.isScopa,
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

    // Reset turn timer AFTER sending MOVE_PLAYED so client processes them in correct order
    resetTurnTimer(room);
  }

  console.log(
    `Move played in room ${room.code}: ${playerId} played ${move.cardPlayed.id}` +
      (move.capturedCards.length > 0
        ? `, captured ${move.capturedCards.map((c) => c.id).join(', ')}`
        : ', placed on table')
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
    // Reset scores for new game
    room.gameState.scores = { player1: 0, player2: 0 };
    room.gameState.roundNumber = 0;

    startGame(room);

    // Send new game state to both players
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
    // Notify opponent that restart was cancelled
    broadcastToRoom(room, {
      type: 'RESTART_CANCELLED',
    });
    console.log(`Player ${playerId} cancelled restart request in room ${room.code}`);
    return;
  }

  // Track who requested
  room.restartRequests.add(playerId);

  // Notify opponent
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

    // Reset scores for new game
    state.scores = { player1: 0, player2: 0 };
    state.roundNumber = 0;

    // Clear any pending requests
    room.nextRoundRequests.clear();

    // Clear turn timer
    clearTurnTimer(room.code);

    startGame(room);

    // Send new game state to both players (reuse NEW_GAME_STARTED message)
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

  // Only allow continue round request when round is over
  if (room.gameState.status !== 'roundEnd') {
    sendError(ws, 'INVALID_MOVE', 'Round is not over yet');
    return;
  }

  // Track who requested
  room.nextRoundRequests.add(playerId);
  console.log(`Player ${playerId} requested next round. Requests: [${[...room.nextRoundRequests].join(', ')}]`);

  // Notify opponent that this player is ready
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

    // Send new game state to both players
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
 * Handle FORCE_MOVE message (when opponent's timer expired)
 */
function handleForceMove(ws: AuthenticatedWebSocket): void {
  const room = getRoom(ws.roomCode!);
  if (!room || !room.gameState) {
    sendError(ws, 'GAME_NOT_STARTED', 'Game not started');
    return;
  }

  const state = room.gameState;
  const playerId = ws.playerId!;

  // Verify game is in playing state
  if (state.status !== 'playing') {
    sendError(ws, 'INVALID_MOVE', 'Cannot force move during this game phase');
    return;
  }

  // Verify it's opponent's turn (not the requester's)
  if (state.round.currentPlayer === playerId) {
    sendError(ws, 'NOT_YOUR_TURN', "You can't force your own move");
    return;
  }

  // Verify timer has expired (check if currentTurnStartedAt + turnTimerSeconds has passed)
  if (room.turnTimerEnabled && room.currentTurnStartedAt) {
    const elapsed = (Date.now() - room.currentTurnStartedAt) / 1000;
    if (elapsed < room.turnTimerSeconds) {
      sendError(ws, 'INVALID_MOVE', 'Timer has not expired yet');
      return;
    }
  }

  // Get random move for the current player
  const currentPlayer = state.round.currentPlayer;
  const playerHand = state.players[currentPlayer].hand;
  const tableCards = state.round.table;

  const randomMove = getRandomMove(playerHand, tableCards, currentPlayer);
  if (!randomMove) {
    sendError(ws, 'INVALID_MOVE', 'No valid moves available');
    return;
  }

  // Execute the forced move
  const tempState: GameState = {
    status: state.status as any,
    round: state.round as any,
    players: state.players as any,
    scores: state.scores as any,
    roundNumber: state.roundNumber,
    targetScore: state.targetScore,
  };

  const newTempState = executeMove(tempState, randomMove);

  // Update room state
  state.round = newTempState.round as any;
  state.players = newTempState.players as any;

  // Check for new hands or round end (same logic as regular move)
  dealNewHands(room);

  if (shouldEndRound(room)) {
    // Capture remaining table cards BEFORE endRound gives them to last capturer
    const remainingTableCards = [...state.round.table];
    const { scores, gameOver, winner } = endRound(room);

    // Always send ROUND_END first so clients can show round summary
    // (even on the final round before GAME_END)
    broadcastToRoom(room, {
      type: 'ROUND_END',
      payload: {
        scores,
        cumulativeScores: state.scores,
        capturedCards: {
          player1: state.players.player1.captured,
          player2: state.players.player2.captured,
        },
        scopaCaptures: {
          player1: state.players.player1.scopaCaptures,
          player2: state.players.player2.scopaCaptures,
        },
        lastCapture: state.round.lastCapture!,
        remainingTableCards,
      },
    });

    if (gameOver) {
      // Also send GAME_END after ROUND_END so clients know the game is over
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
      // Clear any previous next round requests
      room.nextRoundRequests.clear();
      // Wait for both players to click "Next Round" before continuing
    }
  } else {
    // Send move update
    const multiplayerMove: MultiplayerMove = {
      player: currentPlayer,
      cardPlayed: randomMove.cardPlayed,
      capturedCards: randomMove.capturedCards,
      isScopa: randomMove.isScopa,
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

    // Reset turn timer AFTER sending MOVE_PLAYED so client processes them in correct order
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

  // Notify both players
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

  // Notify opponent
  const opponent = getOpponent(room, playerId);
  if (opponent?.ws?.readyState === 1) {
    const msg: ServerMessage = { type: 'OPPONENT_DISCONNECTED' };
    opponent.ws.send(JSON.stringify(msg));
  }

  // Delete the room (game is over if someone leaves)
  deleteRoom(room.code);

  // Clear connection info
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
