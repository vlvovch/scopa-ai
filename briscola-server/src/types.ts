// Message Protocol Types for Briscola Multiplayer

import type { WebSocket } from 'ws';
import type { Card, RoundScore, Suit, TrickState } from './game/types.js';

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
  /** Host option: when true, players may open the captured-pile review
   *  modal. Briscola piles are public info so the data is always sent;
   *  this only gates the UI affordance ("play from memory" if false). */
  pileViewEnabled: boolean;
  turnTimerSeconds: number;
  currentTurnStartedAt: number | null;
  newGameRequests: Set<MultiplayerPlayerId>;
  nextRoundRequests: Set<MultiplayerPlayerId>;
  restartRequests: Set<MultiplayerPlayerId>;
}

// ============================================================================
// Game State (Multiplayer variant)
// ============================================================================

/** Player state in multiplayer */
export interface MultiplayerPlayerState {
  hand: Card[];
  captured: Card[];
}

/** Round state in multiplayer */
export interface MultiplayerRoundState {
  /**
   * Draw pile (top-to-bottom). The trump is the LAST element (drawn last).
   * Length 0 means the trump has been drawn.
   */
  deck: Card[];
  /** The briscola card (also at the bottom of the deck) */
  trump: Card;
  /** Convenience: same as trump.suit */
  trumpSuit: Suit;
  /** Current trick in progress */
  trick: TrickState;
  currentPlayer: MultiplayerPlayerId;
  dealer: MultiplayerPlayerId;
}

/** Game status for multiplayer */
export type MultiplayerGameStatus = 'waiting' | 'playing' | 'roundEnd' | 'gameEnd';

/** Complete game state for multiplayer */
export interface MultiplayerGameState {
  status: MultiplayerGameStatus;
  /**
   * Round state. May be `null` while the room is waiting for the second
   * player (no round has been dealt yet, so there's no trump card).
   */
  round: MultiplayerRoundState | null;
  players: Record<MultiplayerPlayerId, MultiplayerPlayerState>;
  /** Number of rounds won by each player */
  scores: Record<MultiplayerPlayerId, number>;
  roundNumber: number;
  /** Number of round-wins needed to win the match */
  targetScore: number;
  lastRoundScores?: Record<MultiplayerPlayerId, RoundScore>;
  winner?: MultiplayerPlayerId | 'tie';
}

/** Move in multiplayer context — just the card played */
export interface MultiplayerMove {
  player: MultiplayerPlayerId;
  cardPlayed: Card;
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

/** Game state sent to a specific player (hides opponent's hand) */
export interface PlayerVisibleGameState {
  status: MultiplayerGameStatus;
  /**
   * Round details visible to this player. `null` while the room is still
   * waiting for the second player.
   */
  round: {
    deckCount: number; // Only count, not actual cards
    trump: Card;
    trumpSuit: Suit;
    trick: TrickState;
    currentPlayer: MultiplayerPlayerId;
    dealer: MultiplayerPlayerId;
  } | null;
  self: {
    hand: Card[];
    capturedCount: number;
    /** Running point total from captured pile (0–120) */
    points: number;
    /** Full captured pile. Briscola tricks are face-up so this is public
     *  info for both players — sent for the pile-review modal. */
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
  /** Host option mirrored to clients (gates the pile-review UI). */
  pileViewEnabled: boolean;
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
        pileViewEnabled: boolean;
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
        pileViewEnabled: boolean;
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
// Helper type for WebSocket with player info
// ============================================================================

export interface AuthenticatedWebSocket extends WebSocket {
  playerId?: MultiplayerPlayerId;
  roomCode?: string;
  sessionToken?: string;
}
