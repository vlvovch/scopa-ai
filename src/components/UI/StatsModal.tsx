// Statistics Modal - Shows win/loss records against opponents

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ExtendedAIType } from '../../ai';
import type { GameRecord, OpponentStats } from '../../hooks/useStats';
import { AIPlayerLabel } from './AIPlayerLabel';
import styles from './StatsModal.module.css';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** All opponents to display */
  opponents: Array<{ type: ExtendedAIType; model?: string }>;
  /** Function to get stats for an opponent */
  getOpponentStats: (type: ExtendedAIType, model?: string) => OpponentStats;
  /** Function to get games against an opponent */
  getGamesAgainst: (type: ExtendedAIType, model?: string) => GameRecord[];
  /** Function to clear all stats */
  onClearStats: () => void;
}

/** Format date for display */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format time for display */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Opponent row in summary view */
function OpponentRow({
  opponent,
  stats,
  onClick,
}: {
  opponent: { type: ExtendedAIType; model?: string };
  stats: OpponentStats;
  onClick: () => void;
}) {
  const hasGames = stats.gamesPlayed > 0;

  return (
    <button
      className={`${styles.opponentRow} ${hasGames ? styles.clickable : ''}`}
      onClick={hasGames ? onClick : undefined}
      disabled={!hasGames}
    >
      <div className={styles.opponentInfo}>
        <AIPlayerLabel aiType={opponent.type} model={opponent.model} showModeIndicator={false} />
      </div>
      <div className={styles.statsInfo}>
        {hasGames ? (
          <>
            <span className={styles.record}>
              <span className={styles.wins}>{stats.wins}W</span>
              {' - '}
              <span className={styles.losses}>{stats.losses}L</span>
            </span>
            <span className={styles.winRate}>
              {Math.round(stats.winRate * 100)}%
            </span>
          </>
        ) : (
          <span className={styles.noGames}>No games</span>
        )}
      </div>
      {hasGames && <span className={styles.arrow}>›</span>}
    </button>
  );
}

/** Game row in detail view */
function GameRow({ game }: { game: GameRecord }) {
  const resultClass = game.playerWon ? styles.win : styles.loss;

  return (
    <div className={styles.gameRow}>
      <div className={styles.gameDate}>
        <span>{formatDate(game.timestamp)}</span>
        <span className={styles.gameTime}>{formatTime(game.timestamp)}</span>
      </div>
      <div className={styles.gameScore}>
        <span className={resultClass}>
          {game.playerScore} - {game.opponentScore}
        </span>
      </div>
      <div className={styles.gameResult}>
        <span className={resultClass}>
          {game.playerWon ? 'WIN' : 'LOSS'}
        </span>
      </div>
    </div>
  );
}

export function StatsModal({
  isOpen,
  onClose,
  opponents,
  getOpponentStats,
  getGamesAgainst,
  onClearStats,
}: StatsModalProps) {
  // Selected opponent for detail view (null = summary view)
  const [selectedOpponent, setSelectedOpponent] = useState<{
    type: ExtendedAIType;
    model?: string;
  } | null>(null);

  // Confirmation state for clearing stats
  const [confirmClear, setConfirmClear] = useState(false);

  // Handle close - reset state
  const handleClose = () => {
    setSelectedOpponent(null);
    setConfirmClear(false);
    onClose();
  };

  // Handle back from detail view
  const handleBack = () => {
    setSelectedOpponent(null);
  };

  // Handle clear stats
  const handleClearStats = () => {
    if (confirmClear) {
      onClearStats();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  };

  // Get data for current view
  const selectedStats = selectedOpponent
    ? getOpponentStats(selectedOpponent.type, selectedOpponent.model)
    : null;
  const selectedGames = selectedOpponent
    ? getGamesAgainst(selectedOpponent.type, selectedOpponent.model)
    : [];

  // Calculate total stats
  const totalGames = opponents.reduce(
    (sum, o) => sum + getOpponentStats(o.type, o.model).gamesPlayed,
    0
  );
  const totalWins = opponents.reduce(
    (sum, o) => sum + getOpponentStats(o.type, o.model).wins,
    0
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className={styles.modal}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={styles.header}>
              {selectedOpponent ? (
                <button className={styles.backButton} onClick={handleBack}>
                  ‹ Back
                </button>
              ) : (
                <div />
              )}
              <h2 className={styles.title}>
                {selectedOpponent ? (
                  <AIPlayerLabel
                    aiType={selectedOpponent.type}
                    model={selectedOpponent.model}
                    showModeIndicator={false}
                  />
                ) : (
                  'Statistics'
                )}
              </h2>
              <div />
            </div>

            {/* Content */}
            <div className={styles.content}>
              {selectedOpponent && selectedStats ? (
                // Detail view - game history
                <>
                  <div className={styles.detailStats}>
                    <div className={styles.statBox}>
                      <span className={styles.statValue}>{selectedStats.gamesPlayed}</span>
                      <span className={styles.statLabel}>Games</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={`${styles.statValue} ${styles.wins}`}>{selectedStats.wins}</span>
                      <span className={styles.statLabel}>Wins</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={`${styles.statValue} ${styles.losses}`}>{selectedStats.losses}</span>
                      <span className={styles.statLabel}>Losses</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={styles.statValue}>{Math.round(selectedStats.winRate * 100)}%</span>
                      <span className={styles.statLabel}>Win Rate</span>
                    </div>
                  </div>

                  <div className={styles.gamesList}>
                    <div className={styles.gamesHeader}>
                      <span>Date</span>
                      <span>Score</span>
                      <span>Result</span>
                    </div>
                    {selectedGames.length > 0 ? (
                      selectedGames.map((game) => (
                        <GameRow key={game.id} game={game} />
                      ))
                    ) : (
                      <div className={styles.noGamesMessage}>No games played</div>
                    )}
                  </div>
                </>
              ) : (
                // Summary view - opponent list
                <>
                  {totalGames > 0 && (
                    <div className={styles.totalStats}>
                      <span>
                        Total: <strong>{totalWins}</strong> wins / <strong>{totalGames}</strong> games
                        ({totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0}%)
                      </span>
                    </div>
                  )}

                  <div className={styles.opponentsList}>
                    {opponents.map((opponent) => (
                      <OpponentRow
                        key={`${opponent.type}-${opponent.model || ''}`}
                        opponent={opponent}
                        stats={getOpponentStats(opponent.type, opponent.model)}
                        onClick={() => setSelectedOpponent(opponent)}
                      />
                    ))}
                  </div>

                  {totalGames === 0 && (
                    <div className={styles.emptyState}>
                      <p>No games played yet.</p>
                      <p className={styles.hint}>Play against a CPU opponent to start tracking!</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              {!selectedOpponent && totalGames > 0 && (
                <button
                  className={`${styles.clearButton} ${confirmClear ? styles.confirm : ''}`}
                  onClick={handleClearStats}
                >
                  {confirmClear ? 'Confirm Clear' : 'Clear All'}
                </button>
              )}
              <button className={styles.closeButton} onClick={handleClose}>
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
