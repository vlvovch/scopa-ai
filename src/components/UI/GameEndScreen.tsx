// Step 8.5: GameEndScreen Component - Enhanced with round history and category breakdown

import { useMemo, type ReactNode } from 'react';
import type { GeminiTokenStats, ExtendedAIType } from '../../ai';
import type { RoundHistoryEntry } from '../../game/types';
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
  /** History of all rounds played */
  roundHistory?: RoundHistoryEntry[];
}

/** Category totals for display */
interface CategoryTotals {
  cards: number;
  coins: number;
  setteBello: number;
  prime: number;
  scopas: number;
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
  roundHistory = [],
}: GameEndScreenProps) {
  const humanWins = humanScore > cpuScore;
  const isTie = humanScore === cpuScore;

  // Calculate category totals from round history
  const categoryTotals = useMemo(() => {
    const human: CategoryTotals = { cards: 0, coins: 0, setteBello: 0, prime: 0, scopas: 0 };
    const cpu: CategoryTotals = { cards: 0, coins: 0, setteBello: 0, prime: 0, scopas: 0 };

    for (const entry of roundHistory) {
      human.cards += entry.scores.human.cards;
      human.coins += entry.scores.human.coins;
      human.setteBello += entry.scores.human.setteBello;
      human.prime += entry.scores.human.prime;
      human.scopas += entry.scores.human.scopas;

      cpu.cards += entry.scores.cpu.cards;
      cpu.coins += entry.scores.cpu.coins;
      cpu.setteBello += entry.scores.cpu.setteBello;
      cpu.prime += entry.scores.cpu.prime;
      cpu.scopas += entry.scores.cpu.scopas;
    }

    return { human, cpu };
  }, [roundHistory]);

  // Render player names with proper AI icons
  const renderPlayer1Name = (): ReactNode => {
    if (player1AIType) {
      return <AIPlayerLabel aiType={player1AIType} model={player1Model} showModeIndicator={false} />;
    }
    return player1Name;
  };

  const renderPlayer2Name = (): ReactNode => {
    if (player2AIType) {
      return <AIPlayerLabel aiType={player2AIType} model={player2Model} showModeIndicator={false} />;
    }
    return player2Name;
  };

  // Short names for table headers
  const player1Short = player1AIType ? (
    <AIPlayerLabel aiType={player1AIType} model={player1Model} showModeIndicator={false} />
  ) : player1Name;

  const player2Short = player2AIType ? (
    <AIPlayerLabel aiType={player2AIType} model={player2Model} showModeIndicator={false} />
  ) : player2Name;

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

  // Category labels with Italian names
  const categories = [
    { key: 'cards', label: 'Carte', icon: '🃏' },
    { key: 'coins', label: 'Denari', icon: '🪙' },
    { key: 'setteBello', label: 'Sette Bello', icon: '7️⃣' },
    { key: 'prime', label: 'Primiera', icon: '⭐' },
    { key: 'scopas', label: 'Scope', icon: '🧹' },
  ] as const;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.gameOver}>Game Over</h2>
        <h1 className={`${styles.result} ${resultClass}`}>{resultText}</h1>

        {/* Final Scores */}
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

        {/* Category Breakdown */}
        {roundHistory.length > 0 && (
          <div className={styles.categoryBreakdown}>
            <h3 className={styles.sectionTitle}>Score Breakdown</h3>
            <table className={styles.categoryTable}>
              <thead>
                <tr>
                  <th className={styles.categoryHeader}>Category</th>
                  <th className={styles.playerHeader}>{player1Short}</th>
                  <th className={styles.playerHeader}>{player2Short}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(({ key, label, icon }) => {
                  const p1Val = categoryTotals.human[key];
                  const p2Val = categoryTotals.cpu[key];
                  const p1Wins = p1Val > p2Val;
                  const p2Wins = p2Val > p1Val;
                  return (
                    <tr key={key}>
                      <td className={styles.categoryCell}>
                        <span className={styles.categoryIcon}>{icon}</span>
                        {label}
                      </td>
                      <td className={`${styles.valueCell} ${p1Wins ? styles.winningValue : ''}`}>
                        {p1Val}
                      </td>
                      <td className={`${styles.valueCell} ${p2Wins ? styles.winningValue : ''}`}>
                        {p2Val}
                      </td>
                    </tr>
                  );
                })}
                <tr className={styles.totalRow}>
                  <td className={styles.categoryCell}>Total</td>
                  <td className={`${styles.valueCell} ${humanWins ? styles.winningValue : ''}`}>
                    {humanScore}
                  </td>
                  <td className={`${styles.valueCell} ${!humanWins && !isTie ? styles.winningValue : ''}`}>
                    {cpuScore}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Round-by-Round History */}
        {roundHistory.length > 1 && (
          <div className={styles.roundHistory}>
            <h3 className={styles.sectionTitle}>Round History</h3>
            <div className={styles.roundTableWrapper}>
              <table className={styles.roundTable}>
                <thead>
                  <tr>
                    <th className={styles.roundHeader}>Round</th>
                    <th className={styles.roundPlayerHeader}>{player1Short}</th>
                    <th className={styles.roundPlayerHeader}>{player2Short}</th>
                    <th className={styles.roundHeader}>Running</th>
                  </tr>
                </thead>
                <tbody>
                  {roundHistory.map((entry, index) => {
                    // Calculate running totals
                    const runningHuman = roundHistory
                      .slice(0, index + 1)
                      .reduce((sum, e) => sum + e.scores.human.total, 0);
                    const runningCpu = roundHistory
                      .slice(0, index + 1)
                      .reduce((sum, e) => sum + e.scores.cpu.total, 0);

                    const humanRoundWin = entry.scores.human.total > entry.scores.cpu.total;
                    const cpuRoundWin = entry.scores.cpu.total > entry.scores.human.total;

                    return (
                      <tr key={entry.roundNumber}>
                        <td className={styles.roundCell}>{entry.roundNumber}</td>
                        <td className={`${styles.roundValueCell} ${humanRoundWin ? styles.roundWin : ''}`}>
                          {entry.scores.human.total}
                        </td>
                        <td className={`${styles.roundValueCell} ${cpuRoundWin ? styles.roundWin : ''}`}>
                          {entry.scores.cpu.total}
                        </td>
                        <td className={styles.runningCell}>
                          {runningHuman} - {runningCpu}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
