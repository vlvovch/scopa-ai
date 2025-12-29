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
}

export function ScoreBoard({
  humanScore,
  cpuScore,
  roundNumber,
  targetScore,
  currentPlayer,
}: ScoreBoardProps) {
  return (
    <div className={styles.scoreBoard}>
      <div className={styles.header}>
        <div className={styles.roundLabel}>Round</div>
        <div className={styles.roundNumber}>{roundNumber}</div>
      </div>

      <div className={styles.scores}>
        <div className={styles.playerScore}>
          <span
            className={`${styles.playerName} ${currentPlayer === 'human' ? styles.current : ''}`}
          >
            You
          </span>
          <span className={styles.scoreValue}>{humanScore}</span>
        </div>

        <div className={styles.playerScore}>
          <span
            className={`${styles.playerName} ${currentPlayer === 'cpu' ? styles.current : ''}`}
          >
            CPU
          </span>
          <span className={styles.scoreValue}>{cpuScore}</span>
        </div>
      </div>

      <div className={styles.targetScore}>Playing to {targetScore}</div>
    </div>
  );
}
