// AI Player Types and Interface

import type { Card, Move, PlayerId } from '../game/types';

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
 * Factory function type for creating AI players
 */
export type AIPlayerFactory = () => AIPlayer;
