// Token Stats Display Component for LLM AIs (Gemini, OpenAI, Claude, OpenRouter)

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { GeminiTokenStats, GeminiTokenDelta } from '../../games/scopa/ai';
import { estimateCostUsd, formatCostUsd, isExactCost } from '../../ai/pricing';
import { openRouterModelDisplayName } from '../../ai/openrouterProvider';
import { useT } from '../../i18n/LanguageContext';
import styles from './TokenStatsDisplay.module.css';

interface TokenStatsDisplayProps {
  stats: GeminiTokenStats | null;
  delta?: GeminiTokenDelta | null;
  show?: boolean;
  /** Position of popup: 'top' opens upward, 'bottom' opens downward */
  position?: 'top' | 'bottom';
  /** Display mode: 'round' shows round-only stats, 'game' shows cumulative */
  mode?: 'round' | 'game';
  /** Model name to display when stats not yet available */
  modelName?: string;
  /** Error message to display (e.g., API failure) */
  error?: string | null;
  /** Callback to dismiss error */
  onDismissError?: () => void;
}

export function TokenStatsDisplay({
  stats,
  delta,
  show = false,
  position = 'top',
  mode = 'game',
  modelName,
  error,
  onDismissError,
}: TokenStatsDisplayProps) {
  const t = useT();
  // The popup grows from the badge's left edge; when the badge sits near the
  // right edge of the screen (the opponent's corner in a game) that runs off
  // screen, so open it towards whichever side has more room. Measured when
  // the badge appears (it renders nothing until the first request), on
  // resize and as the pointer arrives.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [opensLeft, setOpensLeft] = useState(false);
  const measure = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth * 0.9);
    const roomRight = window.innerWidth - rect.left;
    setOpensLeft(roomRight < width && rect.right > roomRight);
  }, []);
  // Show if explicitly requested, if there are stats, or if there's an error
  const visible = show || (!!stats && stats.requestCount > 0) || !!error;
  useLayoutEffect(() => {
    if (!visible) return;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, visible]);
  if (!visible) {
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
    modelDisplayName: modelName || 'AI',
    totalTimeMs: 0,
    lastTurnTimeMs: 0,
    minTurnTimeMs: 0,
    maxTurnTimeMs: 0,
    roundTotalTimeMs: 0,
  };
  const s = stats || defaultStats;

  // Use modelName prop if provided, otherwise fall back to stats modelDisplayName
  const displayModelName = modelName || s.modelDisplayName || 'AI';

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

  // Spend: the provider's own figure where it reports one (OpenRouter),
  // else an estimate from list prices (null for unknown/free models)
  const estCost = mode === 'game' ? estimateCostUsd(s) : null;
  const exactCost = isExactCost(s);
  // Badge-sized cost: two decimals once past a cent, three below
  const formatCostCompact = (c: number) =>
    c >= 0.01 ? `$${c.toFixed(2)}` : `$${c.toFixed(3)}`;

  const positionClass = position === 'bottom' ? styles.popupBottom : styles.popupTop;

  return (
    <div className={styles.wrapper} ref={wrapperRef} onMouseEnter={measure} onTouchStart={measure}>
      {/* Compact icon showing total tokens */}
      <div className={styles.icon} title={t.tokenStats.tokenUsage}>
        <svg className={styles.tokenIcon} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
          <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor">T</text>
        </svg>
        <span className={styles.iconText}>
          {formatCompact(iconTokens)}
          {estCost !== null && estCost > 0 && (
            <span className={styles.iconCost}> · {formatCostCompact(estCost)}</span>
          )}
        </span>
      </div>

      {/* Error indicator */}
      {error && (
        <div
          className={styles.errorBadge}
          title={error}
          onClick={onDismissError}
        >
          {t.tokenStats.apiError}
        </div>
      )}

      {/* Popup table on hover */}
      <div className={`${styles.popup} ${positionClass} ${opensLeft ? styles.popupLeft : ''}`}>
        <div className={styles.header}>
          {displayModelName}
          <span className={styles.modeLabel}>
            {' '}{mode === 'round' ? t.tokenStats.round : t.tokenStats.game}
          </span>
        </div>
        <table className={styles.table}>
          <tbody>
            <tr>
              <td className={styles.label}>{t.tokenStats.turns}</td>
              <td className={styles.value}>{formatNumber(displayStats.requestCount)}</td>
            </tr>
            <tr>
              <td className={styles.label}>{t.tokenStats.input}</td>
              <td className={styles.value}>
                {mode === 'game'
                  ? formatWithDelta(displayStats.promptTokens, delta?.promptTokens)
                  : formatNumber(displayStats.promptTokens)}
              </td>
            </tr>
            <tr>
              <td className={styles.label}>{t.tokenStats.output}</td>
              <td className={styles.value}>
                {mode === 'game'
                  ? formatWithDelta(displayStats.responseTokens, delta?.responseTokens)
                  : formatNumber(displayStats.responseTokens)}
              </td>
            </tr>
            {displayStats.thoughtTokens > 0 && (
              <tr>
                <td className={styles.label}>{t.tokenStats.thought}</td>
                <td className={styles.value}>
                  {mode === 'game'
                    ? formatWithDelta(displayStats.thoughtTokens, delta?.thoughtTokens)
                    : formatNumber(displayStats.thoughtTokens)}
                </td>
              </tr>
            )}
            <tr className={styles.totalRow}>
              <td className={styles.label}>{t.tokenStats.total}</td>
              <td className={styles.value}>
                {mode === 'game'
                  ? formatWithDelta(displayStats.totalTokens, delta?.totalTokens)
                  : formatNumber(displayStats.totalTokens)}
              </td>
            </tr>
            {mode === 'game' && displayStats.cachedTokens > 0 && (
              <tr>
                <td className={styles.label}>{t.tokenStats.cached}</td>
                <td className={styles.value}>{formatNumber(displayStats.cachedTokens)}</td>
              </tr>
            )}
            {mode === 'game' && (s.cacheCreationTokens ?? 0) > 0 && (
              <tr>
                <td className={styles.label}>{t.tokenStats.cacheWrites}</td>
                <td className={styles.value}>{formatNumber(s.cacheCreationTokens ?? 0)}</td>
              </tr>
            )}
            {mode === 'game' && estCost !== null && estCost > 0 && (
              <tr>
                <td className={styles.label}>{exactCost ? t.tokenStats.cost : t.tokenStats.estCost}</td>
                <td className={styles.value}>{exactCost ? '' : '≈'}{formatCostUsd(estCost)}</td>
              </tr>
            )}
            {mode === 'game' && s.servedModel && (
              <tr>
                <td className={styles.label}>{t.tokenStats.servedBy}</td>
                <td className={styles.value}>{openRouterModelDisplayName(s.servedModel)}</td>
              </tr>
            )}
            {/* Timing stats */}
            <tr className={styles.timingHeader}>
              <td colSpan={2} className={styles.label}>{t.tokenStats.timing}</td>
            </tr>
            <tr>
              <td className={styles.label}>{t.tokenStats.last}</td>
              <td className={styles.value}>{formatTime(s.lastTurnTimeMs)}</td>
            </tr>
            <tr>
              <td className={styles.label}>{t.tokenStats.avg}</td>
              <td className={styles.value}>{formatTime(mode === 'round' ? roundAvgTimeMs : avgTimeMs)}</td>
            </tr>
            {mode === 'game' && s.minTurnTimeMs > 0 && (
              <tr>
                <td className={styles.label}>{t.tokenStats.minMax}</td>
                <td className={styles.value}>{formatTime(s.minTurnTimeMs)} / {formatTime(s.maxTurnTimeMs)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
