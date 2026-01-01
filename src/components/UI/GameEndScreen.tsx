// Step 8.5: GameEndScreen Component

import type { GeminiTokenStats } from '../../ai';
import { TokenStatsDisplay } from './TokenStatsDisplay';
import styles from './GameEndScreen.module.css';

interface GameEndScreenProps {
  humanScore: number;
  cpuScore: number;
  roundsPlayed: number;
  onPlayAgain: () => void;
  /** Player 1 name (defaults to "You") */
  player1Name?: string;
  /** Player 2 name (defaults to "CPU") */
  player2Name?: string;
  /** Token stats for player 1 (if using Gemini) */
  player1TokenStats?: GeminiTokenStats | null;
  /** Token stats for player 2 (if using Gemini) */
  player2TokenStats?: GeminiTokenStats | null;
}

export function GameEndScreen({
  humanScore,
  cpuScore,
  roundsPlayed,
  onPlayAgain,
  player1Name = 'You',
  player2Name = 'CPU',
  player1TokenStats,
  player2TokenStats,
}: GameEndScreenProps) {
  const humanWins = humanScore > cpuScore;
  const isTie = humanScore === cpuScore;

  let resultText: string;
  let resultClass: string;

  if (isTie) {
    resultText = "It's a Tie!";
    resultClass = styles.tie;
  } else if (humanWins) {
    resultText = `${player1Name} Wins!`;
    resultClass = styles.win;
  } else {
    resultText = `${player2Name} Wins!`;
    resultClass = styles.lose;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.gameOver}>Game Over</h2>
        <h1 className={`${styles.result} ${resultClass}`}>{resultText}</h1>

        <div className={styles.finalScores}>
          <div className={`${styles.scoreBox} ${humanWins ? styles.winnerBox : ''}`}>
            <div className={styles.scoreLabelRow}>
              <span className={styles.scoreLabel}>{player1Name}</span>
              {player1TokenStats && <TokenStatsDisplay stats={player1TokenStats} show mode="game" position="bottom" />}
            </div>
            <span className={styles.scoreValue}>{humanScore}</span>
          </div>
          <span className={styles.scoreDivider}>-</span>
          <div className={`${styles.scoreBox} ${!humanWins && !isTie ? styles.winnerBox : ''}`}>
            <div className={styles.scoreLabelRow}>
              <span className={styles.scoreLabel}>{player2Name}</span>
              {player2TokenStats && <TokenStatsDisplay stats={player2TokenStats} show mode="game" position="bottom" />}
            </div>
            <span className={styles.scoreValue}>{cpuScore}</span>
          </div>
        </div>

        <p className={styles.roundsInfo}>
          Completed in {roundsPlayed} round{roundsPlayed !== 1 ? 's' : ''}
        </p>

        <button className={styles.playAgainButton} onClick={onPlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}
