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
  /** Total number of matches in storage. Used to assign each visible match
   *  its absolute match number (most recent = total, oldest visible = total
   *  - recent.length + 1). */
  totalMatches: number;
  onClear: () => void;
}

export function StatsModal({
  isOpen,
  onClose,
  getBotSummary,
  getRecentMatches,
  totalMatches,
  onClear,
}: StatsModalProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const summaries = ALL_BOTS.map(getBotSummary);
  const recent = getRecentMatches(15);

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
                <div style={matchList}>
                  {recent.map((m, i) => {
                    // recent is sorted newest-first, so the first item is
                    // the most-recently-finished match (= totalMatches).
                    const matchNumber = totalMatches - i;
                    const winnerColor =
                      m.winner === 'human'
                        ? '#7CB342'
                        : m.winner === 'cpu'
                          ? '#E57373'
                          : '#aaaaaa';
                    const resultLabel =
                      m.winner === 'human'
                        ? 'Win'
                        : m.winner === 'cpu'
                          ? 'Loss'
                          : 'Tie';
                    return (
                      <div key={m.id} style={matchBlock}>
                        <div style={matchHeader}>
                          <span style={matchLabel}>Match #{matchNumber}</span>
                          <span style={matchHeaderMeta}>
                            {relativeTime(m.timestamp)} · {BOT_LABELS[m.cpuBot]}
                            {m.bestOf > 1 && ` · Bo${m.bestOf}`}
                          </span>
                          <span style={{ ...matchResult, color: winnerColor }}>
                            {resultLabel} {m.playerWins}–{m.cpuWins}
                          </span>
                        </div>
                        <div style={roundChips}>
                          {(m.rounds ?? []).map((r, idx) => {
                            const roundWinner =
                              r.playerPoints > r.cpuPoints
                                ? 'human'
                                : r.cpuPoints > r.playerPoints
                                  ? 'cpu'
                                  : 'tie';
                            const chipColor =
                              roundWinner === 'human'
                                ? 'rgba(124, 179, 66, 0.18)'
                                : roundWinner === 'cpu'
                                  ? 'rgba(229, 115, 115, 0.18)'
                                  : 'rgba(255, 255, 255, 0.08)';
                            return (
                              <span
                                key={idx}
                                style={{ ...roundChip, background: chipColor }}
                              >
                                <span style={roundChipLabel}>R{idx + 1}</span>
                                <span style={roundChipScore}>
                                  <strong>{r.playerPoints}</strong>
                                  <span style={{ opacity: 0.6 }}>–</span>
                                  <strong>{r.cpuPoints}</strong>
                                </span>
                              </span>
                            );
                          })}
                          {(m.rounds ?? []).length === 0 && (
                            // Backward-compat for matches recorded before
                            // rounds[] was added.
                            <span style={{ opacity: 0.5, fontSize: '0.85em' }}>
                              No per-round data
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
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

// ---- Recent matches layout (one card per match) ----
const matchList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const matchBlock: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.25)',
  borderRadius: '6px',
  padding: '8px 10px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
};

const matchHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  flexWrap: 'wrap',
  marginBottom: '6px',
};

const matchLabel: React.CSSProperties = {
  fontWeight: 700,
  fontSize: '0.85rem',
  color: 'var(--color-accent)',
};

const matchHeaderMeta: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--color-text-secondary)',
  flex: 1,
};

const matchResult: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '0.85rem',
};

const roundChips: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

const roundChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 8px',
  borderRadius: '12px',
  fontSize: '0.8rem',
  fontVariantNumeric: 'tabular-nums',
};

const roundChipLabel: React.CSSProperties = {
  opacity: 0.65,
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const roundChipScore: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '2px',
};
