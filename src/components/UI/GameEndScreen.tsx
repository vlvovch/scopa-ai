// Step 8.5: GameEndScreen Component - Enhanced with round history and category breakdown

import { useMemo, type ReactNode } from 'react';
import type { GeminiTokenStats, ExtendedAIType } from '../../ai';
import type { RoundHistoryEntry } from '../../games/scopa/types';
import { TokenStatsDisplay } from './TokenStatsDisplay';
import { AIPlayerLabel } from './AIPlayerLabel';
import { PersonIcon } from './PersonIcon';
import { useDeck } from '../../contexts/DeckContext';
import type { DeckType } from '../../hooks/useSettings';
import styles from './GameEndScreen.module.css';

// Custom SVG icons for score categories (matching RoundEndScreen)
function CardsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      {/* Stack of cards - 3 cards fanned */}
      <rect x="1" y="5" width="12" height="16" rx="1.5" fill="#f5f5dc" stroke="#666" strokeWidth="0.8" transform="rotate(-10 7 13)"/>
      <rect x="6" y="4" width="12" height="16" rx="1.5" fill="#f5f5dc" stroke="#666" strokeWidth="0.8"/>
      <rect x="11" y="5" width="12" height="16" rx="1.5" fill="#f5f5dc" stroke="#666" strokeWidth="0.8" transform="rotate(10 17 13)"/>
    </svg>
  );
}

function CoinIcon({ deckType }: { deckType: DeckType }) {
  const coinPath = `/cards/${deckType}/suits/coins.svg`;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      <image href={coinPath} x="2" y="2" width="20" height="20" />
    </svg>
  );
}

function SetteBelloIcon({ deckType }: { deckType: DeckType }) {
  const coinSize = 4.5;
  const coinPath = `/cards/${deckType}/suits/coins.svg`;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      {/* Card background */}
      <rect x="3" y="1" width="18" height="22" rx="2" fill="#f5f5dc" stroke="#333" strokeWidth="1"/>
      {/* Row 1 - 2 coins */}
      <image href={coinPath} x={9 - coinSize/2} y={4.5 - coinSize/2} width={coinSize} height={coinSize} />
      <image href={coinPath} x={15 - coinSize/2} y={4.5 - coinSize/2} width={coinSize} height={coinSize} />
      {/* Row 2 - 1 coin */}
      <image href={coinPath} x={12 - coinSize/2} y={9 - coinSize/2} width={coinSize} height={coinSize} />
      {/* Row 3 - 2 coins */}
      <image href={coinPath} x={9 - coinSize/2} y={14 - coinSize/2} width={coinSize} height={coinSize} />
      <image href={coinPath} x={15 - coinSize/2} y={14 - coinSize/2} width={coinSize} height={coinSize} />
      {/* Row 4 - 2 coins */}
      <image href={coinPath} x={9 - coinSize/2} y={19 - coinSize/2} width={coinSize} height={coinSize} />
      <image href={coinPath} x={15 - coinSize/2} y={19 - coinSize/2} width={coinSize} height={coinSize} />
    </svg>
  );
}

function PrimieraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={styles.categoryIconSvg}>
      <polygon
        points="12,2 15,9 22,9 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9 9,9"
        fill="url(#starGradientGame)"
        stroke="#8B6914"
        strokeWidth="1"
      />
      <defs>
        <linearGradient id="starGradientGame" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="100%" stopColor="#DAA520"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function ScopaIcon() {
  return <span className={styles.emojiIcon}>🧹</span>;
}

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
  /** History of recent rounds played (may be truncated) */
  roundHistory?: RoundHistoryEntry[];
  /** Cumulative category totals across ALL rounds */
  categoryTotals?: {
    human: { cards: number; coins: number; setteBello: number; prime: number; scopas: number };
    cpu: { cards: number; coins: number; setteBello: number; prime: number; scopas: number };
  };
  // Multiplayer rematch props
  /** Whether rematch has been requested by player 1 (current player) */
  rematchRequested?: boolean;
  /** Whether opponent has requested rematch */
  opponentRequestedRematch?: boolean;
  /** Opponent's name for rematch message */
  opponentName?: string;
  /** Callback for leaving multiplayer game */
  onLeaveGame?: () => void;
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
  categoryTotals: propCategoryTotals,
  rematchRequested,
  opponentRequestedRematch,
  opponentName,
  onLeaveGame,
}: GameEndScreenProps) {
  const deckType = useDeck();
  const isMultiplayer = onLeaveGame !== undefined;
  const humanWins = humanScore > cpuScore;
  const isTie = humanScore === cpuScore;

  // Use prop categoryTotals if available (tracks ALL rounds), otherwise calculate from history
  const categoryTotals = useMemo(() => {
    if (propCategoryTotals) {
      // Use the cumulative totals from game state (not truncated)
      const humanTotal = propCategoryTotals.human.cards + propCategoryTotals.human.coins +
        propCategoryTotals.human.setteBello + propCategoryTotals.human.prime + propCategoryTotals.human.scopas;
      const cpuTotal = propCategoryTotals.cpu.cards + propCategoryTotals.cpu.coins +
        propCategoryTotals.cpu.setteBello + propCategoryTotals.cpu.prime + propCategoryTotals.cpu.scopas;
      return { human: propCategoryTotals.human, cpu: propCategoryTotals.cpu, humanTotal, cpuTotal };
    }

    // Fallback: calculate from round history (may be truncated)
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

    const humanTotal = human.cards + human.coins + human.setteBello + human.prime + human.scopas;
    const cpuTotal = cpu.cards + cpu.coins + cpu.setteBello + cpu.prime + cpu.scopas;

    return { human, cpu, humanTotal, cpuTotal };
  }, [propCategoryTotals, roundHistory]);

  // Render player names with proper AI icons
  const renderPlayer1Name = (): ReactNode => {
    if (player1AIType) {
      return <AIPlayerLabel aiType={player1AIType} model={player1Model} showModeIndicator={false} />;
    }
    // Human player with person icon
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em' }}>
        <PersonIcon size="1em" />
        <span>{player1Name}</span>
      </span>
    );
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
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3em' }}>
      <PersonIcon size="1em" />
      <span>{player1Name}</span>
    </span>
  );

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

  // Category labels with Italian names and SVG icons (matching RoundEndScreen)
  const categories = [
    { key: 'cards', label: 'Carte', icon: <CardsIcon /> },
    { key: 'coins', label: 'Denari', icon: <CoinIcon deckType={deckType} /> },
    { key: 'setteBello', label: 'Sette Bello', icon: <SetteBelloIcon deckType={deckType} /> },
    { key: 'prime', label: 'Primiera', icon: <PrimieraIcon /> },
    { key: 'scopas', label: 'Scopas', icon: <ScopaIcon /> },
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
                  <td className={`${styles.valueCell} ${categoryTotals.humanTotal > categoryTotals.cpuTotal ? styles.winningValue : ''}`}>
                    {categoryTotals.humanTotal}
                  </td>
                  <td className={`${styles.valueCell} ${categoryTotals.cpuTotal > categoryTotals.humanTotal ? styles.winningValue : ''}`}>
                    {categoryTotals.cpuTotal}
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

        {/* Multiplayer rematch UI */}
        {isMultiplayer && (
          <div className={styles.rematchSection}>
            {opponentRequestedRematch && !rematchRequested ? (
              <p className={styles.rematchMessage}>{opponentName} wants a rematch!</p>
            ) : rematchRequested ? (
              <p className={styles.rematchMessage}>Waiting for opponent to accept rematch...</p>
            ) : null}
          </div>
        )}

        <button
          className={`${styles.playAgainButton} ${rematchRequested ? styles.disabledButton : ''}`}
          onClick={onPlayAgain}
          disabled={rematchRequested}
        >
          {isMultiplayer
            ? (opponentRequestedRematch ? 'Accept Rematch' : 'Request Rematch')
            : 'Play Again'}
        </button>

        {isMultiplayer && onLeaveGame && (
          <button className={styles.leaveButton} onClick={onLeaveGame}>
            Leave Game
          </button>
        )}
      </div>
    </div>
  );
}
