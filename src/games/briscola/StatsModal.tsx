// Briscola match-stats modal: per-bot summary table + recent matches list.
// Reuses Scopa's SettingsModal.module.css for the modal chrome (overlay,
// modal box, title, actions). Tables and rows are inline-styled here.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import settingsStyles from '../../components/UI/SettingsModal.module.css';
import type { CpuBotName } from './StartScreen';
import type { BotSummary, MatchRecord } from './hooks/useStats';

const BOT_LABELS: Record<CpuBotName, string> = {
  random: '🎲 Random',
  heuristic: '🦊 Heuristic',
};

const ALL_BOTS: CpuBotName[] = ['random', 'heuristic'];

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  getBotSummary: (bot: CpuBotName) => BotSummary;
  getRecentMatches: (limit?: number) => MatchRecord[];
  onClear: () => void;
}

export function StatsModal({
  isOpen,
  onClose,
  getBotSummary,
  getRecentMatches,
  onClear,
}: StatsModalProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const summaries = ALL_BOTS.map(getBotSummary);
  const recent = getRecentMatches(15);
  const totalMatches = summaries.reduce((s, b) => s + b.matchesPlayed, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={settingsStyles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={settingsStyles.modal}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={settingsStyles.title}>Statistics</h2>

            {totalMatches === 0 ? (
              <p style={emptyStyle}>
                No matches recorded yet. Win or lose, results show up here once
                a match ends.
              </p>
            ) : (
              <>
                <h3 style={sectionTitle}>By Opponent</h3>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Opponent</th>
                      <th style={thNum}>Matches</th>
                      <th style={thNum}>W</th>
                      <th style={thNum}>L</th>
                      <th style={thNum}>T</th>
                      <th style={thNum}>Win&nbsp;rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((s) => (
                      <tr key={s.cpuBot}>
                        <td style={td}>{BOT_LABELS[s.cpuBot]}</td>
                        <td style={tdNum}>{s.matchesPlayed}</td>
                        <td style={tdNum}>{s.wins}</td>
                        <td style={tdNum}>{s.losses}</td>
                        <td style={tdNum}>{s.ties}</td>
                        <td style={tdNum}>
                          {s.matchesPlayed > 0
                            ? `${Math.round(s.winRate * 100)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 style={sectionTitle}>Recent ({recent.length})</h3>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>When</th>
                      <th style={th}>Opponent</th>
                      <th style={th}>Result</th>
                      <th style={thNum}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((m) => (
                      <tr key={m.id}>
                        <td style={td}>{relativeTime(m.timestamp)}</td>
                        <td style={td}>{BOT_LABELS[m.cpuBot]}</td>
                        <td
                          style={{
                            ...td,
                            color:
                              m.winner === 'human'
                                ? '#7CB342'
                                : m.winner === 'cpu'
                                  ? '#E57373'
                                  : 'inherit',
                            fontWeight: 600,
                          }}
                        >
                          {m.winner === 'human'
                            ? 'Win'
                            : m.winner === 'cpu'
                              ? 'Loss'
                              : 'Tie'}
                        </td>
                        <td style={tdNum}>
                          {m.playerWins}–{m.cpuWins}
                          {m.bestOf > 1 && (
                            <span style={{ opacity: 0.6, fontSize: '0.85em' }}>
                              {' '}Bo{m.bestOf}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className={settingsStyles.actions}>
              {totalMatches > 0 &&
                (confirmingClear ? (
                  <>
                    <button
                      type="button"
                      className={settingsStyles.resetButton}
                      onClick={() => {
                        onClear();
                        setConfirmingClear(false);
                      }}
                    >
                      Confirm clear
                    </button>
                    <button
                      type="button"
                      className={settingsStyles.resetButton}
                      onClick={() => setConfirmingClear(false)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={settingsStyles.resetButton}
                    onClick={() => setConfirmingClear(true)}
                  >
                    Clear stats
                  </button>
                ))}
              <button
                type="button"
                className={settingsStyles.resetButton}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ---- Inline styles for the tables (overlay + modal chrome come from CSS) ----

const sectionTitle: React.CSSProperties = {
  fontSize: '0.85rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-text-secondary)',
  margin: '1rem 0 0.5rem',
};

const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
  marginBottom: '0.5rem',
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.15)',
  color: 'var(--color-text-secondary)',
  fontWeight: 500,
  fontSize: '0.8rem',
};

const thNum: React.CSSProperties = {
  ...th,
  textAlign: 'right',
};

const td: React.CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  color: 'var(--color-text-primary)',
};

const tdNum: React.CSSProperties = {
  ...td,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '2rem 1rem',
  color: 'var(--color-text-secondary)',
  fontSize: '0.95rem',
  fontStyle: 'italic',
};
