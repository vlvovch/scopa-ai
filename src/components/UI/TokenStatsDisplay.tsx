// Token Stats Display Component for Gemini AI

import type { GeminiTokenStats, GeminiTokenDelta } from '../../ai';
import styles from './TokenStatsDisplay.module.css';

interface TokenStatsDisplayProps {
  stats: GeminiTokenStats | null;
  delta?: GeminiTokenDelta | null;
  show?: boolean;
}

export function TokenStatsDisplay({ stats, delta, show = false }: TokenStatsDisplayProps) {
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
  const s = stats || {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    requestCount: 0,
  };

  return (
    <div className={styles.wrapper}>
      {/* Compact icon showing total tokens */}
      <div className={styles.icon} title="Token Usage">
        <svg className={styles.tokenIcon} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
          <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor">T</text>
        </svg>
        <span className={styles.iconText}>{formatCompact(s.totalTokens)}</span>
      </div>

      {/* Popup table on hover */}
      <div className={styles.popup}>
        <div className={styles.header}>Token Usage</div>
        <table className={styles.table}>
          <tbody>
            <tr>
              <td className={styles.label}>Turns</td>
              <td className={styles.value}>{formatNumber(s.requestCount)}</td>
            </tr>
            <tr>
              <td className={styles.label}>Input</td>
              <td className={styles.value}>{formatWithDelta(s.promptTokens, delta?.promptTokens)}</td>
            </tr>
            <tr>
              <td className={styles.label}>Output</td>
              <td className={styles.value}>{formatWithDelta(s.responseTokens, delta?.responseTokens)}</td>
            </tr>
            {s.thoughtTokens > 0 && (
              <tr>
                <td className={styles.label}>Thought</td>
                <td className={styles.value}>{formatWithDelta(s.thoughtTokens, delta?.thoughtTokens)}</td>
              </tr>
            )}
            <tr className={styles.totalRow}>
              <td className={styles.label}>Total</td>
              <td className={styles.value}>{formatWithDelta(s.totalTokens, delta?.totalTokens)}</td>
            </tr>
            {s.cachedTokens > 0 && (
              <tr>
                <td className={styles.label}>Cached</td>
                <td className={styles.value}>{formatNumber(s.cachedTokens)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
