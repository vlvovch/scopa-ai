// Message Protocol Types for Scopa Multiplayer

import type { WebSocket } from 'ws';
import type { Card, RoundScore } from './game/types.js';

// ============================================================================
// Player & Room Types
// ============================================================================

/** Player identifier for multiplayer (not 'human'/'cpu') */
export type MultiplayerPlayerId = 'player1' | 'player2';

/** Error codes sent to clients */
export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_SESSION'
  | 'NOT_YOUR_TURN'
  | 'INVALID_MOVE'
  | 'GAME_NOT_STARTED'
  | 'GAME_ALREADY_STARTED'
  | 'OPPONENT_NOT_CONNECTED';

/** Player session stored on server */
export interface PlayerSession {
  id: MultiplayerPlayerId;
  sessionToken: string;
  nickname: string;
  ws: WebSocket | null;
  lastSeen: number;
}

/** Room state stored on server */
export interface RoomState {
  code: string;
  createdAt: number;
  lastActivity: number;
  player1: PlayerSession | null;
  player2: PlayerSession | null;
  gameState: MultiplayerGameState | null;
  turnTimerEnabled: boolean;
  turnTimerSeconds: number;
  currentTurnStartedAt: number | null;
  newGameRequests: Set<MultiplayerPlayerId>;
  nextRoundRequests: Set<MultiplayerPlayerId>;
}

// ============================================================================
// Game State (Multiplayer variant)
// ============================================================================

/** Player state in multiplayer */
export interface MultiplayerPlayerState {
  hand: Card[];
  captured: Card[];
  scopaCount: number;
  scopaCaptures: Card[][];
}

/** Round state in multiplayer */
export interface MultiplayerRoundState {
  deck: Card[];
  table: Card[];
  currentPlayer: MultiplayerPlayerId;
  dealer: MultiplayerPlayerId;
  lastCapture: MultiplayerPlayerId | null;
}

/** Game status for multiplayer */
export type MultiplayerGameStatus = 'waiting' | 'playing' | 'roundEnd' | 'gameEnd';

/** Complete game state for multiplayer */
export interface MultiplayerGameState {
  status: MultiplayerGameStatus;
  round: MultiplayerRoundState;
  players: Record<MultiplayerPlayerId, MultiplayerPlayerState>;
  scores: Record<MultiplayerPlayerId, number>;
  roundNumber: number;
  targetScore: number;
  lastRoundScores?: Record<MultiplayerPlayerId, RoundScore>;
  winner?: MultiplayerPlayerId | 'tie';
}

/** Move in multiplayer context */
export interface MultiplayerMove {
  player: MultiplayerPlayerId;
  cardPlayed: Card;
  capturedCards: Card[];
  isScopa: boolean;
}

// ============================================================================
// Client → Server Messages
// ============================================================================

export type ClientMessage =
  | {
      type: 'CREATE_ROOM';
      payload: {
        nickname: string;
        targetScore: number;
        turnTimerEnabled: boolean;
      };
    }
  | {
      type: 'JOIN_ROOM';
      payload: {
        roomCode: string;
        nickname: string;
      };
    }
  | {
      type: 'RECONNECT';
      payload: {
        sessionToken: string;
        roomCode: string;
      };
    }
  | {
      type: 'PLAY_MOVE';
      payload: {
        move: MultiplayerMove;
      };
    }
  | { type: 'START_NEW_GAME' }
  | { type: 'CONTINUE_ROUND' }
  | { type: 'FORCE_MOVE' }
  | {
      type: 'UPDATE_NICKNAME';
      payload: {
        nickname: string;
      };
    }
  | { type: 'LEAVE_ROOM' }
  | { type: 'PING' };

// ============================================================================
// Server → Client Messages
// ============================================================================

/** Game state sent to a specific player (hides opponent's hand) */
export interface PlayerVisibleGameState {
  status: MultiplayerGameStatus;
  round: {
    deckCount: number; // Only count, not actual cards
    table: Card[];
    currentPlayer: MultiplayerPlayerId;
    dealer: MultiplayerPlayerId;
    lastCapture: MultiplayerPlayerId | null;
  };
  self: {
    hand: Card[];
    capturedCount: number;
    scopaCount: number;
  };
  opponent: {
    handCount: number; // Only count, not actual cards
    capturedCount: number;
    scopaCount: number;
  };
  scores: Record<MultiplayerPlayerId, number>;
  roundNumber: number;
  targetScore: number;
}

export type ServerMessage =
  | {
      type: 'ROOM_CREATED';
      payload: {
        roomCode: string;
        sessionToken: string;
        playerId: MultiplayerPlayerId;
      };
    }
  | {
      type: 'ROOM_JOINED';
      payload: {
        roomCode: string;
        sessionToken: string;
        playerId: MultiplayerPlayerId;
        opponentNickname: string;
        targetScore: number;
        turnTimerEnabled: boolean;
      };
    }
  | {
      type: 'OPPONENT_JOINED';
      payload: {
        opponentNickname: string;
      };
    }
  | {
      type: 'GAME_START';
      payload: {
        state: PlayerVisibleGameState;
        playerId: MultiplayerPlayerId;
      };
    }
  | {
      type: 'GAME_STATE';
      payload: {
        state: PlayerVisibleGameState;
      };
    }
  | {
      type: 'MOVE_PLAYED';
      payload: {
        move: MultiplayerMove;
        state: PlayerVisibleGameState;
      };
    }
  | {
      type: 'ROUND_END';
      payload: {
        scores: Record<MultiplayerPlayerId, RoundScore>;
        cumulativeScores: Record<MultiplayerPlayerId, number>;
        capturedCards: Record<MultiplayerPlayerId, Card[]>;
        lastCapture: MultiplayerPlayerId;
        /** Cards remaining on table that go to lastCapture player (for animation) */
        remainingTableCards: Card[];
      };
    }
  | {
      type: 'GAME_END';
      payload: {
        winner: MultiplayerPlayerId | 'tie';
        finalScores: Record<MultiplayerPlayerId, number>;
        roundScores: Record<MultiplayerPlayerId, RoundScore>;
        capturedCards: Record<MultiplayerPlayerId, Card[]>;
      };
    }
  | { type: 'OPPONENT_DISCONNECTED' }
  | { type: 'OPPONENT_RECONNECTED' }
  | {
      type: 'RECONNECT_SUCCESS';
      payload: {
        playerId: MultiplayerPlayerId;
        opponentNickname: string | null;
        opponentConnected: boolean;
        targetScore: number;
        turnTimerEnabled: boolean;
        state: PlayerVisibleGameState | null;
      };
    }
  | {
      type: 'TIMER_UPDATE';
      payload: {
        secondsRemaining: number;
        player: MultiplayerPlayerId;
      };
    }
  | {
      type: 'TIMER_EXPIRED';
      payload: {
        player: MultiplayerPlayerId;
      };
    }
  | {
      type: 'NEW_GAME_REQUESTED';
      payload: {
        by: MultiplayerPlayerId;
      };
    }
  | {
      type: 'NEW_GAME_STARTED';
      payload: {
        state: PlayerVisibleGameState;
      };
    }
  | {
      type: 'NEXT_ROUND_REQUESTED';
      payload: {
        by: MultiplayerPlayerId;
      };
    }
  | {
      type: 'NEXT_ROUND_STARTED';
      payload: {
        state: PlayerVisibleGameState;
      };
    }
  | {
      type: 'NICKNAME_UPDATED';
      payload: {
        playerId: MultiplayerPlayerId;
        nickname: string;
      };
    }
  | {
      type: 'ERROR';
      payload: {
        code: ErrorCode;
        message: string;
      };
    }
  | { type: 'PONG' };

// ============================================================================
// Helper type for WebSocket with player info
// ============================================================================

export interface AuthenticatedWebSocket extends WebSocket {
  playerId?: MultiplayerPlayerId;
  roomCode?: string;
  sessionToken?: string;
}
