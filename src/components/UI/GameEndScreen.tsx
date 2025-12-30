// Step 8.5: GameEndScreen Component

import styles from './GameEndScreen.module.css';

interface GameEndScreenProps {
  humanScore: number;
  cpuScore: number;
  roundsPlayed: number;
  onPlayAgain: () => void;
}

export function GameEndScreen({
  humanScore,
  cpuScore,
  roundsPlayed,
  onPlayAgain,
}: GameEndScreenProps) {
  const humanWins = humanScore > cpuScore;
  const isTie = humanScore === cpuScore;

  let resultText: string;
  let resultClass: string;

  if (isTie) {
    resultText = "It's a Tie!";
    resultClass = styles.tie;
  } else if (humanWins) {
    resultText = 'You Win!';
    resultClass = styles.win;
  } else {
    resultText = 'CPU Wins!';
    resultClass = styles.lose;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.gameOver}>Game Over</h2>
        <h1 className={`${styles.result} ${resultClass}`}>{resultText}</h1>

        <div className={styles.finalScores}>
          <div className={`${styles.scoreBox} ${humanWins ? styles.winnerBox : ''}`}>
            <span className={styles.scoreLabel}>You</span>
            <span className={styles.scoreValue}>{humanScore}</span>
          </div>
          <span className={styles.scoreDivider}>-</span>
          <div className={`${styles.scoreBox} ${!humanWins && !isTie ? styles.winnerBox : ''}`}>
            <span className={styles.scoreLabel}>CPU</span>
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
