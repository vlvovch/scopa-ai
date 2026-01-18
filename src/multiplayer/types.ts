// Multiplayer Types for Scopa Client
// These types mirror the server types for WebSocket communication

import type { Card, RoundScore as GameRoundScore } from '../game/types';

// Re-export RoundScore for use in useMultiplayer hook
export type RoundScore = GameRoundScore;

// ============================================================================
// Player & Room Types
// ============================================================================

/** Player identifier for multiplayer */
export type MultiplayerPlayerId = 'player1' | 'player2';

/** Error codes from server */
export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_SESSION'
  | 'NOT_YOUR_TURN'
  | 'INVALID_MOVE'
  | 'GAME_NOT_STARTED'
  | 'GAME_ALREADY_STARTED'
  | 'OPPONENT_NOT_CONNECTED';

// ============================================================================
// Game State (Multiplayer variant)
// ============================================================================

/** Game status for multiplayer */
export type MultiplayerGameStatus = 'waiting' | 'playing' | 'roundEnd' | 'gameEnd';

/** Move in multiplayer context */
export interface MultiplayerMove {
  player: MultiplayerPlayerId;
  cardPlayed: Card;
  capturedCards: Card[];
  isScopa: boolean;
}

/** Game state visible to a specific player (hides opponent's hand) */
export interface PlayerVisibleGameState {
  status: MultiplayerGameStatus;
  round: {
    deckCount: number;
    table: Card[];
    currentPlayer: MultiplayerPlayerId;
    dealer: MultiplayerPlayerId;
    lastCapture: MultiplayerPlayerId | null;
  };
  self: {
    hand: Card[];
    capturedCount: number;
    scopaCount: number;
    coinsCount: number; // Number of coins (denari) captured
    hasSetteBello: boolean; // Whether player has the 7 of coins
  };
  opponent: {
    handCount: number;
    capturedCount: number;
    scopaCount: number;
    coinsCount: number; // Number of coins (denari) captured
    hasSetteBello: boolean; // Whether opponent has the 7 of coins
  };
  scores: Record<MultiplayerPlayerId, number>;
  roundNumber: number;
  targetScore: number;
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
  | { type: 'RESTART_GAME' }
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
        scores: Record<MultiplayerPlayerId, GameRoundScore>;
        cumulativeScores: Record<MultiplayerPlayerId, number>;
        capturedCards: Record<MultiplayerPlayerId, Card[]>;
        /** Cards captured during each scopa (for highlighting in round summary) */
        scopaCaptures: Record<MultiplayerPlayerId, Card[][]>;
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
        roundScores: Record<MultiplayerPlayerId, GameRoundScore>;
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
      type: 'RESTART_REQUESTED';
      payload: {
        by: MultiplayerPlayerId;
      };
    }
  | {
      type: 'RESTART_CANCELLED';
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
// Session Storage
// ============================================================================

export interface MultiplayerSession {
  sessionToken: string;
  roomCode: string;
  playerId: MultiplayerPlayerId;
  nickname: string;
}

// ============================================================================
// Connection State
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface MultiplayerState {
  // Connection
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // Room
  roomCode: string | null;
  playerId: MultiplayerPlayerId | null;
  nickname: string;
  opponentNickname: string | null;
  isOpponentConnected: boolean;

  // Game settings
  targetScore: number;
  turnTimerEnabled: boolean;

  // Game state
  gameState: PlayerVisibleGameState | null;

  // Timer
  turnTimerSeconds: number | null;
  canForceMove: boolean;

  // Round/Game end
  roundEndData: {
    scores: Record<MultiplayerPlayerId, GameRoundScore>;
    cumulativeScores: Record<MultiplayerPlayerId, number>;
    capturedCards: Record<MultiplayerPlayerId, Card[]>;
  } | null;
  gameEndData: {
    winner: MultiplayerPlayerId | 'tie';
    finalScores: Record<MultiplayerPlayerId, number>;
    roundScores: Record<MultiplayerPlayerId, GameRoundScore>;
    capturedCards: Record<MultiplayerPlayerId, Card[]>;
  } | null;

  // Rematch
  newGameRequestedBy: MultiplayerPlayerId | null;
}
