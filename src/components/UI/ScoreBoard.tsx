// Step 7.7: ScoreBoard Component

import type { PlayerId } from '../../game/types';
import styles from './ScoreBoard.module.css';

interface ScoreBoardProps {
  /** Human player's cumulative score */
  humanScore: number;
  /** CPU player's cumulative score */
  cpuScore: number;
  /** Current round number */
  roundNumber: number;
  /** Target score to win */
  targetScore: number;
  /** Whose turn it is (optional) */
  currentPlayer?: PlayerId;
  /** CPU AI name to display */
  cpuName?: string;
  /** Human/Player 1 name (for spectator mode) */
  humanName?: string;
  /** Whether in spectator mode (CPU vs CPU) */
  isSpectatorMode?: boolean;
}

export function ScoreBoard({
  humanScore,
  cpuScore,
  roundNumber,
  targetScore,
  currentPlayer,
  cpuName = 'CPU',
  humanName,
  isSpectatorMode = false,
}: ScoreBoardProps) {
  // In spectator mode, show AI names with (CPU) suffix
  const player1DisplayName = isSpectatorMode && humanName
    ? `${humanName} (CPU)`
    : humanName || 'You';
  const player2DisplayName = isSpectatorMode
    ? `${cpuName} (CPU)`
    : cpuName;

  return (
    <div className={styles.scoreBoard}>
      <div className={styles.header}>
        <div className={styles.roundLabel}>Round</div>
        <div className={styles.roundNumber}>{roundNumber}</div>
      </div>

      <div className={styles.scores}>
        {/* CPU shown first (matches top position on game board) */}
        <div className={styles.playerScore}>
          <span
            className={`${styles.playerName} ${currentPlayer === 'cpu' ? styles.current : ''}`}
          >
            {player2DisplayName}
          </span>
          <span className={styles.scoreValue}>{cpuScore}</span>
        </div>

        {/* Human/Player1 shown second (matches bottom position on game board) */}
        <div className={styles.playerScore}>
          <span
            className={`${styles.playerName} ${currentPlayer === 'human' ? styles.current : ''}`}
          >
            {player1DisplayName}
          </span>
          <span className={styles.scoreValue}>{humanScore}</span>
        </div>
      </div>

      <div className={styles.targetScore}>Playing to {targetScore}</div>
    </div>
  );
}
