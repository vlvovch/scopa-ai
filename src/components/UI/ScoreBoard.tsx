// Step 7.7: ScoreBoard Component

import type { ReactNode } from 'react';
import type { PlayerId } from '../../game/types';
import type { ExtendedAIType } from '../../ai';
import { AIPlayerLabel } from './AIPlayerLabel';
import { PersonIcon } from './PersonIcon';
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
  /** CPU AI name to display (fallback if cpuAIType not provided) */
  cpuName?: string;
  /** Human/Player 1 name (fallback, for non-spectator mode) */
  humanName?: string;
  /** Whether in spectator mode (CPU vs CPU) */
  isSpectatorMode?: boolean;
  /** Player 1 AI type (for spectator mode) */
  player1AIType?: ExtendedAIType;
  /** Player 1 model (for LLM AIs in spectator mode) */
  player1Model?: string;
  /** Player 2 (CPU) AI type */
  player2AIType?: ExtendedAIType;
  /** Player 2 (CPU) model (for LLM AIs) */
  player2Model?: string;
  /** Whether in multiplayer mode */
  isMultiplayer?: boolean;
  /** Player's nickname in multiplayer */
  playerNickname?: string;
  /** Opponent's nickname in multiplayer */
  opponentNickname?: string;
}

export function ScoreBoard({
  humanScore,
  cpuScore,
  roundNumber,
  targetScore,
  currentPlayer,
  cpuName = 'CPU',
  humanName,
  player1AIType,
  player1Model,
  player2AIType,
  player2Model,
  isMultiplayer,
  playerNickname,
  opponentNickname,
}: ScoreBoardProps) {
  // Render player names with proper icons
  const renderPlayer1Name = (): ReactNode => {
    // Multiplayer mode - show nickname with person icon
    if (isMultiplayer) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em' }}>
          <PersonIcon size="1em" />
          <span>{playerNickname || 'You'}</span>
        </span>
      );
    }
    if (player1AIType) {
      return <AIPlayerLabel aiType={player1AIType} model={player1Model} />;
    }
    // Human player with person icon
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em' }}>
        <PersonIcon size="1em" />
        <span>{humanName || 'You'}</span>
      </span>
    );
  };

  const renderPlayer2Name = (): ReactNode => {
    // Multiplayer mode - show opponent nickname with person icon
    if (isMultiplayer) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em' }}>
          <PersonIcon size="1em" />
          <span>{opponentNickname || 'Opponent'}</span>
        </span>
      );
    }
    if (player2AIType) {
      return <AIPlayerLabel aiType={player2AIType} model={player2Model} />;
    }
    return cpuName;
  };

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
            {renderPlayer2Name()}
          </span>
          <span className={styles.scoreValue}>{cpuScore}</span>
        </div>

        {/* Human/Player1 shown second (matches bottom position on game board) */}
        <div className={styles.playerScore}>
          <span
            className={`${styles.playerName} ${currentPlayer === 'human' ? styles.current : ''}`}
          >
            {renderPlayer1Name()}
          </span>
          <span className={styles.scoreValue}>{humanScore}</span>
        </div>
      </div>

      <div className={styles.targetScore}>Playing to {targetScore}</div>
    </div>
  );
}
