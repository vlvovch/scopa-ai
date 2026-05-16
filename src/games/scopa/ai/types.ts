// AI Player Types and Interface

import type { Card, Move, PlayerId } from '../types';

/**
 * Context provided to AI for decision making
 */
export interface AIContext {
  /** Cards in the AI player's hand */
  hand: Card[];
  /** Cards currently on the table */
  table: Card[];
  /** The AI player's identity */
  player: PlayerId;
}

/**
 * Extended context for LLM-based AI players
 */
export interface LLMAIContext extends AIContext {
  /** Current cumulative scores */
  scores: { self: number; opponent: number };
  /** Target score to win */
  targetScore: number;
  /** Current round number */
  roundNumber: number;
  /** Number of cards in opponent's hand */
  opponentHandCount: number;
  /** Number of cards captured by self this round */
  selfCapturedCount: number;
  /** Number of cards captured by opponent this round */
  opponentCapturedCount: number;
  /** Cards remaining in deck */
  deckCount: number;
  /** Last move made by opponent (null if first move of round) */
  lastOpponentMove: Move | null;
  /** Last move made by self (null if first move of round for this player) */
  lastSelfMove: Move | null;
  /** All valid moves available for this turn */
  validMoves: Move[];
}

/**
 * Response structure from LLM AI
 */
export interface LLMResponse {
  /** Index into the validMoves array */
  moveIndex: number;
  /** Brief explanation of the move choice */
  reasoning: string;
}

/**
 * Interface for AI player implementations
 */
export interface AIPlayer {
  /** Display name for this AI */
  readonly name: string;

  /**
   * Select a move to play.
   * @param context - The current game context
   * @returns The move to execute
   */
  selectMove(context: AIContext): Move;
}

/**
 * Interface for async (LLM-based) AI player implementations
 */
export interface AsyncAIPlayer {
  /** Display name for this AI */
  readonly name: string;

  /** Whether this AI requires async operation */
  readonly isAsync: true;

  /**
   * Select a move to play asynchronously.
   * @param context - The extended game context with scores
   * @returns Promise resolving to the move to execute
   */
  selectMove(context: LLMAIContext): Promise<Move>;

  /**
   * Start a new round/session
   */
  startRound?(): void;

  /**
   * End the current round/session
   */
  endRound?(): void;
}

/**
 * Union type for any AI player (sync or async)
 */
export type AnyAIPlayer = AIPlayer | AsyncAIPlayer;

/**
 * Seat the bot instance is bound to. In single-player (Play) mode the
 * bot always sits in the 'cpu' seat. In spectator mode (CPU vs CPU) the
 * two seats need distinct instances — otherwise same-provider self-play
 * (e.g. Gemini 2.5 Flash vs Gemini 2.5 Flash) would share a single chat
 * session / message array / conversation id / token tracker, with both
 * players' moves intermixed inside one conversation. Each factory
 * includes this in its cache key.
 */
export type Seat = 'cpu' | 'p1' | 'p2';

/**
 * Type guard to check if an AI player is async
 */
export function isAsyncAI(ai: AnyAIPlayer): ai is AsyncAIPlayer {
  return 'isAsync' in ai && ai.isAsync === true;
}

/**
 * Factory function type for creating AI players
 */
export type AIPlayerFactory = () => AIPlayer;

/**
 * Factory function type for creating async AI players
 */
export type AsyncAIPlayerFactory = () => AsyncAIPlayer;
