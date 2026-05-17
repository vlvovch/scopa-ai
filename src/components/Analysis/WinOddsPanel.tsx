// Shared win-odds panel (analysis mode) — used by both Scopa and
// Briscola. Unobtrusive bottom-center readout of the round
// win/tie/loss estimate. Only mounted in single-player Play mode with
// the setting on. Shows a faint shimmer + the settling number while the
// worker streams, and a ± CI once it stabilises. Honest caption: it's a
// self-play estimate, not ground truth.

import type React from 'react';

/** Minimal shape the panel needs — both games' WinOdds satisfy it
 *  (Scopa adds perMove, Briscola perCard; neither is read here). */
export interface WinOddsLike {
  winPct: number;
  tiePct: number;
  lossPct: number;
  samples: number;
  ciHalfWidth: number;
}

export function WinOddsPanel({
  odds,
  computing,
  caption = 'self-play estimate',
}: {
  odds: WinOddsLike | null;
  computing: boolean;
  /** Trailing footer caption, e.g. "Esperto self-play estimate". */
  caption?: string;
}) {
  if (!odds && !computing) return null;
  const pct = (n: number) => `${Math.round(n)}%`;

  return (
    <div style={winOddsPanel} aria-live="polite">
      <div style={winOddsTitle}>
        Win odds{' '}
        {computing && <span style={winOddsSpinner}>·computing·</span>}
      </div>
      {odds ? (
        <>
          <div style={winOddsRow}>
            <span>
              <strong style={{ color: 'var(--color-accent)' }}>
                {pct(odds.winPct)}
              </strong>{' '}
              win
            </span>
            <span style={{ opacity: 0.8 }}>{pct(odds.tiePct)} tie</span>
            <span style={{ opacity: 0.8 }}>{pct(odds.lossPct)} loss</span>
          </div>
          <div style={winOddsFoot}>
            ±{Math.max(1, Math.round(odds.ciHalfWidth))}% · {odds.samples} sims
            · {caption}
          </div>
        </>
      ) : (
        <div style={winOddsFoot}>simulating…</div>
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
  fontSize: '13px',
  lineHeight: 1.35,
  zIndex: 90,
  pointerEvents: 'none',
  maxWidth: '20rem',
  backdropFilter: 'blur(2px)',
};
const winOddsTitle: React.CSSProperties = {
  fontSize: '11px',
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
  fontSize: '10px',
  opacity: 0.55,
  marginTop: '3px',
};
