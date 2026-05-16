// Briscola AI types

import type { Card, Move, PlayerId, Suit } from '../types';

/**
 * Context provided to a Briscola AI for picking its move.
 * Contains exactly the information a player on the table would see.
 */
export interface AIContext {
  /** Cards in the AI player's hand */
  hand: Card[];
  /** AI player's identity */
  player: PlayerId;
  /** The briscola card (face-up next to the deck) */
  trump: Card;
  /** Suit of the trump card */
  trumpSuit: Suit;
  /**
   * Card led by the opponent in the current trick. null means the AI is
   * leading the trick (no card on the table yet).
   */
  leadCard: Card | null;
  /** Number of cards remaining in the draw pile (includes trump at bottom) */
  deckCount: number;
  /**
   * Cards this player has captured so far this round. Used by the expert
   * bot to determinize the unseen card pool. Optional — random/heuristic
   * ignore it.
   */
  myCaptured?: Card[];
  /** Cards the opponent has captured so far this round. */
  oppCaptured?: Card[];
}

/** Synchronous AI player (CPU bots) */
export interface AIPlayer {
  readonly name: string;
  selectMove(context: AIContext): Move;
}

/** Asynchronous AI player (LLM bots — added later) */
export interface AsyncAIPlayer {
  readonly name: string;
  readonly isAsync: true;
  selectMove(context: AIContext): Promise<Move>;
  startRound?(): void;
  endRound?(): void;
}

export type AnyAIPlayer = AIPlayer | AsyncAIPlayer;

export function isAsyncAI(ai: AnyAIPlayer): ai is AsyncAIPlayer {
  return 'isAsync' in ai && ai.isAsync === true;
}

export type AIPlayerFactory = () => AIPlayer;
