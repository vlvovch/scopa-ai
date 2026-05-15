// Briscola statistics modal — mirrors Scopa's two-level StatsModal:
//   Main view: total + one row per opponent (clickable).
//   Detail view: stat cards + game-by-game table (one row per 120-point
//   round).
// Reuses Scopa's StatsModal.module.css verbatim for the chrome.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../../components/UI/StatsModal.module.css';
import type { CpuBotName } from './StartScreen';
import type { BotSummary, RoundEntry } from './hooks/useStats';

const ALL_BOTS: CpuBotName[] = ['random', 'heuristic'];

const BOT_INFO: Record<CpuBotName, { icon: string; name: string }> = {
  random: { icon: '🎲', name: 'Random' },
  heuristic: { icon: '🦊', name: 'Heuristic' },
};

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  getBotSummary: (bot: CpuBotName) => BotSummary;
  getRoundsAgainst: (bot: CpuBotName) => RoundEntry[];
  onClear: () => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function BotLabel({ bot }: { bot: CpuBotName }) {
  const info = BOT_INFO[bot];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
      <span style={{ fontSize: '1.1em' }}>{info.icon}</span>
      <span>{info.name}</span>
    </span>
  );
}

function OpponentRow({
  bot,
  summary,
  onClick,
}: {
  bot: CpuBotName;
  summary: BotSummary;
  onClick: () => void;
}) {
  const hasGames = summary.gamesPlayed > 0;
  return (
    <button
      type="button"
      className={`${styles.opponentRow} ${hasGames ? styles.clickable : ''}`}
      onClick={hasGames ? onClick : undefined}
      disabled={!hasGames}
    >
      <div className={styles.opponentInfo}>
        <BotLabel bot={bot} />
      </div>
      <div className={styles.statsInfo}>
        {hasGames ? (
          <>
            <span className={styles.record}>
              <span className={styles.wins}>{summary.wins}W</span>
              {' - '}
              <span className={styles.losses}>{summary.losses}L</span>
              {summary.ties > 0 && (
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

function RoundRow({ round, index }: { round: RoundEntry; index: number }) {
  const cls =
    round.outcome === 'win'
      ? styles.win
      : round.outcome === 'loss'
        ? styles.loss
        : undefined;
  const label =
    round.outcome === 'win' ? 'W' : round.outcome === 'loss' ? 'L' : 'T';
  return (
    <div className={styles.gameRow}>
      <div className={styles.gameIndex}>#{index}</div>
      <div className={styles.gameDate}>
        {formatDate(round.timestamp)} {formatTime(round.timestamp)}
      </div>
      <div className={styles.gameScore}>
        <span className={cls}>
          {round.playerPoints}–{round.cpuPoints}
        </span>
      </div>
      <div className={styles.gameResult}>
        <span className={cls}>{label}</span>
      </div>
    </div>
  );
}

export function StatsModal({
  isOpen,
  onClose,
  getBotSummary,
  getRoundsAgainst,
  onClear,
}: StatsModalProps) {
  const [selectedBot, setSelectedBot] = useState<CpuBotName | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClose = () => {
    setSelectedBot(null);
    setConfirmClear(false);
    onClose();
  };
  const handleBack = () => setSelectedBot(null);
  const handleClear = () => {
    if (confirmClear) {
      onClear();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
    }
  };

  const selectedSummary = selectedBot ? getBotSummary(selectedBot) : null;
  const selectedRounds = selectedBot ? getRoundsAgainst(selectedBot) : [];

  // Aggregate totals across all bots (round-level).
  const totals = ALL_BOTS.reduce(
    (acc, bot) => {
      const s = getBotSummary(bot);
      acc.games += s.gamesPlayed;
      acc.wins += s.wins;
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
              {selectedBot ? (
                <button className={styles.backButton} onClick={handleBack}>
                  ← Back
                </button>
              ) : (
                <div />
              )}
              <h2 className={styles.title}>
                {selectedBot ? <BotLabel bot={selectedBot} /> : 'Statistics'}
              </h2>
              <div />
            </div>

            <div className={styles.content}>
              {selectedBot && selectedSummary ? (
                <>
                  <div className={styles.detailStats}>
                    <div className={styles.statBox}>
                      <span className={styles.statValue}>
                        {selectedSummary.gamesPlayed}
                      </span>
                      <span className={styles.statLabel}>Games</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={`${styles.statValue} ${styles.wins}`}>
                        {selectedSummary.wins}
                      </span>
                      <span className={styles.statLabel}>Wins</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={`${styles.statValue} ${styles.losses}`}>
                        {selectedSummary.losses}
                      </span>
                      <span className={styles.statLabel}>Losses</span>
                    </div>
                    <div className={styles.statBox}>
                      <span className={styles.statValue}>
                        {Math.round(selectedSummary.winRate * 100)}%
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
                    {selectedRounds.length > 0 ? (
                      // Match Scopa's numbering: most recent round = #1,
                      // oldest = #N. We display oldest at top, newest at
                      // bottom (the natural reading order).
                      [...selectedRounds].reverse().map((round, i) => (
                        <RoundRow
                          key={round.id}
                          round={round}
                          index={selectedRounds.length - i}
                        />
                      ))
                    ) : (
                      <div className={styles.noGamesMessage}>
                        No rounds played
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
                    {ALL_BOTS.map((bot) => (
                      <OpponentRow
                        key={bot}
                        bot={bot}
                        summary={getBotSummary(bot)}
                        onClick={() => setSelectedBot(bot)}
                      />
                    ))}
                  </div>

                  {totals.games === 0 && (
                    <div className={styles.emptyState}>
                      <p>No rounds played yet.</p>
                      <p className={styles.hint}>
                        Play against a CPU opponent to start tracking!
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className={styles.footer}>
              {!selectedBot && totals.games > 0 && (
                <button
                  className={`${styles.clearButton} ${confirmClear ? styles.confirm : ''}`}
                  onClick={handleClear}
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
