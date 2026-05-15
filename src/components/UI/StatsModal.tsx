// Generic statistics modal. Shared between Scopa and Briscola via a
// game-agnostic data shape: each caller computes `opponents` (with their own
// label nodes + summary) and supplies a `getGames(key)` function returning
// per-game rows. Outcome can be 'win' | 'loss' | 'tie', enabling Briscola's
// 60-60 ties to render naturally.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './StatsModal.module.css';

export interface StatsModalSummary {
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties?: number;
  winRate: number;
}

export interface StatsModalOpponent {
  /** Stable key — used as React key and passed back to getGames(). */
  key: string;
  /** Rendered label for both the list row and the detail-view title. */
  label: ReactNode;
  summary: StatsModalSummary;
}

export interface StatsModalGame {
  id: string;
  timestamp: number;
  playerScore: number;
  opponentScore: number;
  outcome: 'win' | 'loss' | 'tie';
  /** Optional indicator chip (e.g. Scopa's AI mode emoji). */
  modeIndicator?: { text: string; title?: string };
}

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  opponents: StatsModalOpponent[];
  getGames: (opponentKey: string) => StatsModalGame[];
  onClearStats: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function outcomeClass(outcome: StatsModalGame['outcome']): string | undefined {
  if (outcome === 'win') return styles.win;
  if (outcome === 'loss') return styles.loss;
  return undefined;
}

function outcomeLabel(outcome: StatsModalGame['outcome']): string {
  return outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'T';
}

function OpponentRow({
  opponent,
  onClick,
}: {
  opponent: StatsModalOpponent;
  onClick: () => void;
}) {
  const { summary, label } = opponent;
  const hasGames = summary.gamesPlayed > 0;

  return (
    <button
      type="button"
      className={`${styles.opponentRow} ${hasGames ? styles.clickable : ''}`}
      onClick={hasGames ? onClick : undefined}
      disabled={!hasGames}
    >
      <div className={styles.opponentInfo}>{label}</div>
      <div className={styles.statsInfo}>
        {hasGames ? (
          <>
            <span className={styles.record}>
              <span className={styles.wins}>{summary.wins}W</span>
              {' - '}
              <span className={styles.losses}>{summary.losses}L</span>
              {summary.ties !== undefined && summary.ties > 0 && (
                <>
                  {' - '}
                  <span>{summary.ties}T</span>
                </>
              )}
            </span>
            <span className={styles.winRate}>
              {Math.round(summary.winRate * 100)}%
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

function GameRow({ game, index }: { game: StatsModalGame; index: number }) {
  const cls = outcomeClass(game.outcome);
  return (
    <div className={styles.gameRow}>
      <div className={styles.gameIndex}>#{index}</div>
      <div className={styles.gameDate}>
        {formatDate(game.timestamp)} {formatTime(game.timestamp)}
        {game.modeIndicator && (
          <span className={styles.gameMode} title={game.modeIndicator.title}>
            {game.modeIndicator.text}
          </span>
        )}
      </div>
      <div className={styles.gameScore}>
        <span className={cls}>
          {game.playerScore}–{game.opponentScore}
        </span>
      </div>
      <div className={styles.gameResult}>
        <span className={cls}>{outcomeLabel(game.outcome)}</span>
      </div>
    </div>
  );
}

export function StatsModal({
  isOpen,
  onClose,
  opponents,
  getGames,
  onClearStats,
}: StatsModalProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClose = () => {
    setSelectedKey(null);
    setConfirmClear(false);
    onClose();
  };
  const handleBack = () => setSelectedKey(null);
  const handleClearStats = () => {
    if (confirmClear) {
      onClearStats();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  };

  const selectedOpponent = selectedKey
    ? opponents.find((o) => o.key === selectedKey) ?? null
    : null;
  const selectedGames = selectedOpponent ? getGames(selectedOpponent.key) : [];

  const totals = opponents.reduce(
    (acc, o) => {
      acc.games += o.summary.gamesPlayed;
      acc.wins += o.summary.wins;
      return acc;
    },
    { games: 0, wins: 0 }
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
            <div className={styles.header}>
              {selectedOpponent ? (
                <button className={styles.backButton} onClick={handleBack}>
                  ← Back
                </button>
              ) : (
                <div />
              )}
              <h2 className={styles.title}>
                {selectedOpponent ? selectedOpponent.label : 'Statistics'}
              </h2>
              <div />
            </div>

            <div className={styles.content}>
              {selectedOpponent ? (
                <>
                  <div
                    className={styles.detailStats}
                    style={
                      (selectedOpponent.summary.ties ?? 0) > 0
                        ? { gridTemplateColumns: 'repeat(5, 1fr)' }
                        : undefined
                    }
                  >
                    <div className={styles.statBox}>
                      <span className={styles.statValue}>
                        {selectedOpponent.summary.gamesPlayed}
                      </span>
                      <span className={styles.statLabel}>Games</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={`${styles.statValue} ${styles.wins}`}>
                        {selectedOpponent.summary.wins}
                      </span>
                      <span className={styles.statLabel}>Wins</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={`${styles.statValue} ${styles.losses}`}>
                        {selectedOpponent.summary.losses}
                      </span>
                      <span className={styles.statLabel}>Losses</span>
                    </div>
                    {(selectedOpponent.summary.ties ?? 0) > 0 && (
                      <div className={styles.statBox}>
                        <span className={styles.statValue}>
                          {selectedOpponent.summary.ties}
                        </span>
                        <span className={styles.statLabel}>Ties</span>
                      </div>
                    )}
                    <div className={styles.statBox}>
                      <span className={styles.statValue}>
                        {Math.round(selectedOpponent.summary.winRate * 100)}%
                      </span>
                      <span className={styles.statLabel}>Win Rate</span>
                    </div>
                  </div>

                  <div className={styles.gamesList}>
                    <div className={styles.gamesHeader}>
                      <span>#</span>
                      <span>Date</span>
                      <span>Score</span>
                      <span></span>
                    </div>
                    {selectedGames.length > 0 ? (
                      [...selectedGames]
                        .reverse()
                        .map((game, i) => (
                          <GameRow
                            key={game.id}
                            game={game}
                            index={selectedGames.length - i}
                          />
                        ))
                    ) : (
                      <div className={styles.noGamesMessage}>
                        No games played
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {totals.games > 0 && (
                    <div className={styles.totalStats}>
                      <span>
                        Total: <strong>{totals.wins}</strong> wins /{' '}
                        <strong>{totals.games}</strong> games (
                        {Math.round((totals.wins / totals.games) * 100)}%)
                      </span>
                    </div>
                  )}

                  <div className={styles.opponentsList}>
                    {opponents.map((opponent) => (
                      <OpponentRow
                        key={opponent.key}
                        opponent={opponent}
                        onClick={() => setSelectedKey(opponent.key)}
                      />
                    ))}
                  </div>

                  {totals.games === 0 && (
                    <div className={styles.emptyState}>
                      <p>No games played yet.</p>
                      <p className={styles.hint}>
                        Play against a CPU opponent to start tracking!
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className={styles.footer}>
              {!selectedOpponent && totals.games > 0 && (
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
