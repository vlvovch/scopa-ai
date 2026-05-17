// Multiplayer Types for Briscola Client
// These types mirror the Briscola server's wire protocol for WebSocket
// communication. Message names match Scopa's protocol (CREATE_ROOM,
// JOIN_ROOM, PLAY_MOVE, …) but the payload shapes are Briscola-specific:
// no table, no captures-in-move, just lead/follow tricks with a trump.

import type { Card, Suit, RoundScore as GameRoundScore } from '../types';

// Re-export RoundScore for use in useBriscolaMultiplayer hook
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

/**
 * Trick state in multiplayer context. Mirrors Briscola's local TrickState
 * but with `leader` as a MultiplayerPlayerId rather than 'human' | 'cpu'.
 */
export interface MultiplayerTrickState {
  /** Card played by the leader; null if no trick in progress (about to lead) */
  leadCard: Card | null;
  /** Who led this trick (also who plays next if leadCard is null) */
  leader: MultiplayerPlayerId;
}

/** Move in multiplayer context — Briscola moves are just the card played */
export interface MultiplayerMove {
  player: MultiplayerPlayerId;
  cardPlayed: Card;
}

/**
 * Game state visible to a specific player (hides opponent's hand).
 *
 * `round` is null while the room is waiting for the second player — Briscola
 * has no trump card until the round is dealt.
 */
export interface PlayerVisibleGameState {
  status: MultiplayerGameStatus;
  round: {
    deckCount: number;
    trump: Card;
    trumpSuit: Suit;
    trick: MultiplayerTrickState;
    currentPlayer: MultiplayerPlayerId;
    dealer: MultiplayerPlayerId;
  } | null;
  self: {
    hand: Card[];
    capturedCount: number;
    /** Running point total from captured pile (0–120) */
    points: number;
    /** Full captured pile (Briscola tricks are face-up = public info). */
    captured: Card[];
  };
  opponent: {
    handCount: number;
    capturedCount: number;
    points: number;
    captured: Card[];
  };
  scores: Record<MultiplayerPlayerId, number>;
  roundNumber: number;
  targetScore: number;
  /** Host option: gates the pile-review UI (data is always present). */
  pileViewEnabled: boolean;
  /** Host option: gates the mid-game captured-pile stats badge. */
  pileStatsEnabled: boolean;
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
        pileViewEnabled: boolean;
        pileStatsEnabled: boolean;
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
        pileViewEnabled: boolean;
        pileStatsEnabled: boolean;
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
        pileViewEnabled: boolean;
        pileStatsEnabled: boolean;
        state: PlayerVisibleGameState | null;
      };
    }
  | {
      type: 'TIMER_START';
      payload: {
        seconds: number;
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
  pileViewEnabled: boolean;
  pileStatsEnabled: boolean;

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
