// Shared win-odds panel (analysis mode) — used by both Scopa and
// Briscola. Unobtrusive bottom-center readout of the round
// win/tie/loss estimate. Only mounted in single-player Play mode with
// the setting on. Shows a faint shimmer + the settling number while the
// worker streams, and a ± CI once it stabilises. Honest caption: it's a
// self-play estimate, not ground truth.

import type React from 'react';
import { useT } from '../../i18n/LanguageContext';

/** Minimal shape the panel needs. Briscola supplies win/tie/loss;
 *  Scopa additionally supplies expectedDiff/diffCi (metric="diff"). */
export interface WinOddsLike {
  winPct: number;
  tiePct: number;
  lossPct: number;
  samples: number;
  ciHalfWidth: number;
  /** Expected round-score margin (Scopa, metric="diff"). */
  expectedDiff?: number;
  /** ±95% CI half-width on expectedDiff, points. */
  diffCi?: number;
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

export function WinOddsPanel({
  odds,
  computing,
  caption,
  metric = 'win',
  title,
}: {
  odds: WinOddsLike | null;
  computing: boolean;
  /** Trailing footer caption, e.g. "Esperto self-play estimate". */
  caption?: string;
  /** 'win' = win/tie/loss% (Briscola); 'diff' = expected score margin
   *  (Scopa). Defaults to 'win'. */
  metric?: 'win' | 'diff';
  /** Panel title; defaults per metric. */
  title?: string;
}) {
  const t = useT();
  if (!odds && !computing) return null;
  const pct = (n: number) => `${Math.round(n)}%`;
  const captionText = caption ?? t.winOddsPanel.selfPlayEstimate;
  const heading =
    title ?? (metric === 'diff' ? t.winOddsPanel.expectedMargin : t.winOddsPanel.winOdds);

  return (
    <div style={winOddsPanel} aria-live="polite">
      <div style={winOddsTitle}>
        {heading}{' '}
        {computing && <span style={winOddsSpinner}>·{t.winOddsPanel.computing}·</span>}
      </div>
      {odds ? (
        metric === 'diff' ? (
          <>
            <div style={winOddsRow}>
              <strong
                style={{
                  color:
                    (odds.expectedDiff ?? 0) >= 0
                      ? 'var(--color-accent)'
                      : '#e57373',
                  fontSize: 'calc(16px * var(--font-scale, 1))',
                }}
              >
                {signed(odds.expectedDiff ?? 0)}
              </strong>
              <span style={{ opacity: 0.8 }}>{t.winOddsPanel.ptsPerRound}</span>
            </div>
            <div style={winOddsFoot}>
              ±{(odds.diffCi ?? 0).toFixed(1)} · {odds.samples} {t.winOddsPanel.sims} · {captionText}
            </div>
          </>
        ) : (
          <>
            <div style={winOddsRow}>
              <span>
                <strong style={{ color: 'var(--color-accent)' }}>
                  {pct(odds.winPct)}
                </strong>{' '}
                {t.winOddsPanel.win}
              </span>
              <span style={{ opacity: 0.8 }}>{pct(odds.tiePct)} {t.winOddsPanel.tie}</span>
              <span style={{ opacity: 0.8 }}>{pct(odds.lossPct)} {t.winOddsPanel.loss}</span>
            </div>
            <div style={winOddsFoot}>
              ±{Math.max(1, Math.round(odds.ciHalfWidth))}% · {odds.samples}{' '}
              {t.winOddsPanel.sims} · {captionText}
            </div>
          </>
        )
      ) : (
        <div style={winOddsFoot}>{t.winOddsPanel.simulating}</div>
      )}
    </div>
  );
}

const winOddsPanel: React.CSSProperties = {
  position: 'fixed',
  left: '50%',
  // Sit just above the fixed page footer (footer is at var(--space-1)
  // with a ~0.7rem line) so the two don't overlap.
  bottom: 'calc(var(--space-1) + 1.9rem)',
  transform: 'translateX(-50%)',
  textAlign: 'center',
  background: 'rgba(0,0,0,0.62)',
  color: 'var(--color-text-primary)',
  padding: '0.5rem 0.9rem',
  borderRadius: '10px',
  fontSize: 'calc(13px * var(--font-scale, 1))',
  lineHeight: 1.35,
  zIndex: 90,
  pointerEvents: 'none',
  maxWidth: '20rem',
  backdropFilter: 'blur(2px)',
};
const winOddsTitle: React.CSSProperties = {
  fontSize: 'calc(12px * var(--font-scale, 1))',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  opacity: 0.7,
  marginBottom: '2px',
};
const winOddsSpinner: React.CSSProperties = {
  fontStyle: 'italic',
  opacity: 0.6,
};
const winOddsRow: React.CSSProperties = {
  display: 'flex',
  gap: '0.6rem',
  alignItems: 'baseline',
  justifyContent: 'center',
  fontVariantNumeric: 'tabular-nums',
};
const winOddsFoot: React.CSSProperties = {
  fontSize: 'calc(11px * var(--font-scale, 1))',
  opacity: 0.6,
  marginTop: '3px',
};
