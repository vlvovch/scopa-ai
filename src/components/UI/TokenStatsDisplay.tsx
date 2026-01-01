// Token Stats Display Component for Gemini AI

import type { GeminiTokenStats, GeminiTokenDelta } from '../../ai';
import styles from './TokenStatsDisplay.module.css';

interface TokenStatsDisplayProps {
  stats: GeminiTokenStats | null;
  delta?: GeminiTokenDelta | null;
  show?: boolean;
  /** Position of popup: 'top' opens upward, 'bottom' opens downward */
  position?: 'top' | 'bottom';
  /** Display mode: 'round' shows round-only stats, 'game' shows cumulative */
  mode?: 'round' | 'game';
}

export function TokenStatsDisplay({
  stats,
  delta,
  show = false,
  position = 'top',
  mode = 'game',
}: TokenStatsDisplayProps) {
  // Show if explicitly requested or if there are stats
  if (!show && (!stats || stats.requestCount === 0)) {
    return null;
  }

  const formatNumber = (n: number) => n.toLocaleString();
  const formatCompact = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  const formatWithDelta = (total: number, deltaN?: number) => {
    if (deltaN && deltaN > 0) {
      return (
        <>
          {formatNumber(total)}
          <span className={styles.delta}> (+{formatNumber(deltaN)})</span>
        </>
      );
    }
    return formatNumber(total);
  };

  // Use zeros if stats not yet available
  const defaultStats: GeminiTokenStats = {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    requestCount: 0,
    roundPromptTokens: 0,
    roundResponseTokens: 0,
    roundThoughtTokens: 0,
    roundTotalTokens: 0,
    roundRequestCount: 0,
    modelId: '',
    modelDisplayName: 'Gemini',
    totalTimeMs: 0,
    lastTurnTimeMs: 0,
    minTurnTimeMs: 0,
    maxTurnTimeMs: 0,
    roundTotalTimeMs: 0,
  };
  const s = stats || defaultStats;

  // Format time in seconds
  const formatTime = (ms: number) => {
    if (ms === 0) return '-';
    const seconds = ms / 1000;
    if (seconds < 10) return `${seconds.toFixed(2)}s`;
    return `${seconds.toFixed(1)}s`;
  };

  // Calculate average time per turn
  const avgTimeMs = s.requestCount > 0 ? s.totalTimeMs / s.requestCount : 0;
  const roundAvgTimeMs = s.roundRequestCount > 0 ? s.roundTotalTimeMs / s.roundRequestCount : 0;

  // Select which stats to display based on mode
  const displayStats = mode === 'round' ? {
    promptTokens: s.roundPromptTokens,
    responseTokens: s.roundResponseTokens,
    thoughtTokens: s.roundThoughtTokens,
    totalTokens: s.roundTotalTokens,
    requestCount: s.roundRequestCount,
    cachedTokens: 0, // Not tracked per-round
  } : {
    promptTokens: s.promptTokens,
    responseTokens: s.responseTokens,
    thoughtTokens: s.thoughtTokens,
    totalTokens: s.totalTokens,
    requestCount: s.requestCount,
    cachedTokens: s.cachedTokens,
  };

  // Icon shows round tokens in round mode, total in game mode
  const iconTokens = mode === 'round' ? s.roundTotalTokens : s.totalTokens;

  const positionClass = position === 'bottom' ? styles.popupBottom : styles.popupTop;

  return (
    <div className={styles.wrapper}>
      {/* Compact icon showing total tokens */}
      <div className={styles.icon} title="Token Usage">
        <svg className={styles.tokenIcon} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
          <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor">T</text>
        </svg>
        <span className={styles.iconText}>{formatCompact(iconTokens)}</span>
      </div>

      {/* Popup table on hover */}
      <div className={`${styles.popup} ${positionClass}`}>
        <div className={styles.header}>
          {s.modelDisplayName || 'Gemini'}
          <span className={styles.modeLabel}>
            {mode === 'round' ? ' (Round)' : ' (Game)'}
          </span>
        </div>
        <table className={styles.table}>
          <tbody>
            <tr>
              <td className={styles.label}>Turns</td>
              <td className={styles.value}>{formatNumber(displayStats.requestCount)}</td>
            </tr>
            <tr>
              <td className={styles.label}>Input</td>
              <td className={styles.value}>
                {mode === 'game'
                  ? formatWithDelta(displayStats.promptTokens, delta?.promptTokens)
                  : formatNumber(displayStats.promptTokens)}
              </td>
            </tr>
            <tr>
              <td className={styles.label}>Output</td>
              <td className={styles.value}>
                {mode === 'game'
                  ? formatWithDelta(displayStats.responseTokens, delta?.responseTokens)
                  : formatNumber(displayStats.responseTokens)}
              </td>
            </tr>
            {displayStats.thoughtTokens > 0 && (
              <tr>
                <td className={styles.label}>Thought</td>
                <td className={styles.value}>
                  {mode === 'game'
                    ? formatWithDelta(displayStats.thoughtTokens, delta?.thoughtTokens)
                    : formatNumber(displayStats.thoughtTokens)}
                </td>
              </tr>
            )}
            <tr className={styles.totalRow}>
              <td className={styles.label}>Total</td>
              <td className={styles.value}>
                {mode === 'game'
                  ? formatWithDelta(displayStats.totalTokens, delta?.totalTokens)
                  : formatNumber(displayStats.totalTokens)}
              </td>
            </tr>
            {mode === 'game' && displayStats.cachedTokens > 0 && (
              <tr>
                <td className={styles.label}>Cached</td>
                <td className={styles.value}>{formatNumber(displayStats.cachedTokens)}</td>
              </tr>
            )}
            {/* Timing stats */}
            <tr className={styles.timingHeader}>
              <td colSpan={2} className={styles.label}>Timing</td>
            </tr>
            <tr>
              <td className={styles.label}>Last</td>
              <td className={styles.value}>{formatTime(s.lastTurnTimeMs)}</td>
            </tr>
            <tr>
              <td className={styles.label}>Avg</td>
              <td className={styles.value}>{formatTime(mode === 'round' ? roundAvgTimeMs : avgTimeMs)}</td>
            </tr>
            {mode === 'game' && s.minTurnTimeMs > 0 && (
              <tr>
                <td className={styles.label}>Min/Max</td>
                <td className={styles.value}>{formatTime(s.minTurnTimeMs)} / {formatTime(s.maxTurnTimeMs)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
