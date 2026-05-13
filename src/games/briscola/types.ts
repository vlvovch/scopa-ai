// Briscola types
//
// The physical card primitive (Card, Suit, CardValue) is shared with Scopa —
// it's the same 40-card Italian deck. Everything else (Move, GameState,
// RoundScore) is Briscola-specific.

export type { Card, Suit, CardValue } from '../scopa/types';

import type { Card, Suit } from '../scopa/types';

export type PlayerId = 'human' | 'cpu';

export type GameMode = 'pvsCPU' | 'cpuVsCPU';

export type GameStatus = 'idle' | 'dealing' | 'playing' | 'roundEnd' | 'gameEnd';

/** Per-player state during a round */
export interface PlayerState {
  /** Cards currently in hand (0–3) */
  hand: Card[];
  /** Cards won in tricks this round */
  captured: Card[];
}

/** State of the trick currently in progress. */
export interface TrickState {
  /** Card played by the leader; null if no trick in progress (about to lead) */
  leadCard: Card | null;
  /** Who led this trick (also who plays next if leadCard is null) */
  leader: PlayerId;
}

/** State of the current round */
export interface RoundState {
  /**
   * Cards remaining in the draw pile, ordered top-to-bottom.
   * The trump (briscola) is always the LAST element (drawn last).
   * Length 0 means the trump has been drawn into a hand.
   */
  deck: Card[];
  /** The briscola — visible to both players for the whole round */
  trump: Card;
  /** Convenience: same as trump.suit */
  trumpSuit: Suit;
  /** Current trick in progress */
  trick: TrickState;
  /** Whose turn it is to play */
  currentPlayer: PlayerId;
  /** Who dealt this round */
  dealer: PlayerId;
}

/** Complete game state */
export interface GameState {
  status: GameStatus;
  round: RoundState;
  players: Record<PlayerId, PlayerState>;
  /** Number of rounds won (not points — see RoundScore.points for that) */
  scores: Record<PlayerId, number>;
  roundNumber: number;
  /** Number of round-wins needed to win the match */
  targetScore: number;
  lastRoundScores?: {
    human: RoundScore;
    cpu: RoundScore;
  };
  isGameOver?: boolean;
  gameMode?: GameMode;
}

/** A player's move — just the card they played from hand */
export interface Move {
  player: PlayerId;
  cardPlayed: Card;
}

/** Score breakdown for a single round (a "mano") */
export interface RoundScore {
  /** Total point value of captured cards (0–120) */
  points: number;
  /**
   * Round outcome from this player's perspective.
   * - 'win'  if points >= 61
   * - 'tie'  if points === 60 (other player also has 60)
   * - 'loss' otherwise
   */
  outcome: 'win' | 'loss' | 'tie';
  /** Breakdown by card value (for display) */
  counts: {
    aces: number;     // value 1
    threes: number;   // value 3
    kings: number;    // value 10
    knights: number;  // value 9 (Q-equivalent)
    knaves: number;   // value 8 (J-equivalent)
  };
}
