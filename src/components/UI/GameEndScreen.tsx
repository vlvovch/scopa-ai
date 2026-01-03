// Step 8.5: GameEndScreen Component

import type { ReactNode } from 'react';
import type { GeminiTokenStats, ExtendedAIType } from '../../ai';
import { TokenStatsDisplay } from './TokenStatsDisplay';
import { AIPlayerLabel } from './AIPlayerLabel';
import styles from './GameEndScreen.module.css';

interface GameEndScreenProps {
  humanScore: number;
  cpuScore: number;
  roundsPlayed: number;
  onPlayAgain: () => void;
  /** Player 1 name (defaults to "You", fallback if AI type not provided) */
  player1Name?: string;
  /** Player 2 name (defaults to "CPU", fallback if AI type not provided) */
  player2Name?: string;
  /** Token stats for player 1 (if using LLM) */
  player1TokenStats?: GeminiTokenStats | null;
  /** Token stats for player 2 (if using LLM) */
  player2TokenStats?: GeminiTokenStats | null;
  /** Player 1 AI type (for rendering proper icon) */
  player1AIType?: ExtendedAIType;
  /** Player 1 model (for LLM AIs) */
  player1Model?: string;
  /** Player 2 AI type (for rendering proper icon) */
  player2AIType?: ExtendedAIType;
  /** Player 2 model (for LLM AIs) */
  player2Model?: string;
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
  player1AIType,
  player1Model,
  player2AIType,
  player2Model,
}: GameEndScreenProps) {
  const humanWins = humanScore > cpuScore;
  const isTie = humanScore === cpuScore;

  // Render player names with proper AI icons
  const renderPlayer1Name = (): ReactNode => {
    if (player1AIType) {
      return <AIPlayerLabel aiType={player1AIType} model={player1Model} />;
    }
    return player1Name;
  };

  const renderPlayer2Name = (): ReactNode => {
    if (player2AIType) {
      return <AIPlayerLabel aiType={player2AIType} model={player2Model} />;
    }
    return player2Name;
  };

  let resultText: ReactNode;
  let resultClass: string;

  if (isTie) {
    resultText = "It's a Tie!";
    resultClass = styles.tie;
  } else if (humanWins) {
    // Use "Win" for "You", "Wins" for AI names
    const verb = !player1AIType && player1Name === 'You' ? 'Win' : 'Wins';
    resultText = <>{renderPlayer1Name()} {verb}!</>;
    resultClass = styles.win;
  } else {
    // Use "Win" for "You", "Wins" for AI names
    const verb = !player2AIType && player2Name === 'You' ? 'Win' : 'Wins';
    resultText = <>{renderPlayer2Name()} {verb}!</>;
    resultClass = styles.lose;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.gameOver}>Game Over</h2>
        <h1 className={`${styles.result} ${resultClass}`}>{resultText}</h1>

        <div className={styles.finalScores}>
          <div className={styles.scoreColumn}>
            <div className={`${styles.scoreBox} ${humanWins ? styles.winnerBox : ''}`}>
              <span className={styles.scoreLabel}>{renderPlayer1Name()}</span>
              <span className={styles.scoreValue}>{humanScore}</span>
            </div>
            {player1TokenStats && (
              <div className={styles.tokenRow}>
                <TokenStatsDisplay stats={player1TokenStats} show mode="game" position="bottom" modelName={player1Model} />
              </div>
            )}
          </div>
          <span className={styles.scoreDivider}>-</span>
          <div className={styles.scoreColumn}>
            <div className={`${styles.scoreBox} ${!humanWins && !isTie ? styles.winnerBox : ''}`}>
              <span className={styles.scoreLabel}>{renderPlayer2Name()}</span>
              <span className={styles.scoreValue}>{cpuScore}</span>
            </div>
            {player2TokenStats && (
              <div className={styles.tokenRow}>
                <TokenStatsDisplay stats={player2TokenStats} show mode="game" position="bottom" modelName={player2Model} />
              </div>
            )}
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
