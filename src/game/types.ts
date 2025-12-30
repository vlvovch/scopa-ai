// Step 2.1: Card Types

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

// Step 2.2: Game State Types

/** Player identifier */
export type PlayerId = 'human' | 'cpu';

/** Game mode */
export type GameMode = 'pvsCPU' | 'cpuVsCPU';

/** Current phase of the game */
export type GameStatus = 'idle' | 'dealing' | 'playing' | 'roundEnd' | 'gameEnd';

/** State of a single player */
export interface PlayerState {
  /** Cards currently in hand (0-3) */
  hand: Card[];
  /** All cards captured this round */
  captured: Card[];
  /** Number of scopas scored this round */
  scopaCount: number;
  /** Cards captured in each scopa (for highlighting) */
  scopaCaptures: Card[][];
}

/** State of the current round */
export interface RoundState {
  /** Cards remaining in the deck */
  deck: Card[];
  /** Cards currently on the table */
  table: Card[];
  /** Whose turn it is */
  currentPlayer: PlayerId;
  /** Who dealt this round */
  dealer: PlayerId;
  /** Who made the last capture (gets remaining table cards at round end) */
  lastCapture: PlayerId | null;
}

/** Complete game state */
export interface GameState {
  /** Current game phase */
  status: GameStatus;
  /** Current round state */
  round: RoundState;
  /** State for each player */
  players: Record<PlayerId, PlayerState>;
  /** Cumulative scores across all rounds */
  scores: Record<PlayerId, number>;
  /** Current round number (starts at 1) */
  roundNumber: number;
  /** Points needed to win the game */
  targetScore: number;
  /** Last calculated round scores (for display in round end screen) */
  lastRoundScores?: {
    human: RoundScore;
    cpu: RoundScore;
  };
  /** Whether the game is over (show round summary first, then game end) */
  isGameOver?: boolean;
  /** Game mode (player vs CPU or spectator) */
  gameMode?: GameMode;
}

// Step 2.3: Move Types

/** Type of move a player can make */
export type MoveType = 'capture' | 'place';

/** A player's move */
export interface Move {
  /** Who made the move */
  player: PlayerId;
  /** The card played from hand */
  cardPlayed: Card;
  /** Cards captured from table (empty array if placing) */
  capturedCards: Card[];
  /** Whether this move cleared the table (scopa) */
  isScopa: boolean;
}

/** Score breakdown for a single round */
export interface RoundScore {
  /** Point for most cards (1 or 0) */
  cards: number;
  /** Point for most coins (1 or 0) */
  coins: number;
  /** Point for capturing 7 of coins (1 or 0) */
  setteBello: number;
  /** Point for best prime (1 or 0) */
  prime: number;
  /** Points from scopas */
  scopas: number;
  /** Total points this round */
  total: number;
  /** Raw counts for display */
  counts: {
    /** Total cards captured */
    cards: number;
    /** Total coins captured */
    coins: number;
    /** Primiera score (null if missing a suit) */
    prime: number | null;
  };
}
