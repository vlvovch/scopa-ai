// Game Types for Briscola Multiplayer Server
// Adapted from client Briscola types with PlayerId = 'player1' | 'player2'

/** The four suits in an Italian deck */
export type Suit = 'coins' | 'cups' | 'swords' | 'clubs';

/** Card values 1-10 (1=Ace, 8=Knave, 9=Knight, 10=King) */
export type CardValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** A single playing card */
export interface Card {
  suit: Suit;
  value: CardValue;
  /** Unique identifier in format '{suit}-{value}', e.g., 'coins-7' */
  id: string;
}

/** Player identifier for multiplayer */
export type PlayerId = 'player1' | 'player2';

/** Current phase of the game */
export type GameStatus = 'waiting' | 'playing' | 'roundEnd' | 'gameEnd';

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
  /** Number of rounds won (not points) */
  scores: Record<PlayerId, number>;
  roundNumber: number;
  /** Number of round-wins needed to win the match */
  targetScore: number;
  lastRoundScores?: Record<PlayerId, RoundScore>;
  /** Winner of the game (set when status is gameEnd) */
  winner?: PlayerId | 'tie';
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
