// Shared win-odds panel (analysis mode) — used by both Scopa and
// Briscola. Unobtrusive bottom-center readout of the round
// win/tie/loss estimate. Only mounted in single-player Play mode with
// the setting on. Shows a faint shimmer + the settling number while the
// worker streams, and a ± CI once it stabilises. Honest caption: it's a
// self-play estimate, not ground truth.

import { useT } from '../../i18n/LanguageContext';
import styles from './WinOddsPanel.module.css';

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
    <div className={styles.panel} aria-live="polite">
      <div className={styles.title}>
        {heading}{' '}
        {computing && <span className={styles.spinner}>·{t.winOddsPanel.computing}·</span>}
      </div>
      {odds ? (
        metric === 'diff' ? (
          <>
            <div className={styles.row}>
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
            <div className={styles.foot}>
              ±{(odds.diffCi ?? 0).toFixed(1)} · {odds.samples} {t.winOddsPanel.sims} · {captionText}
            </div>
          </>
        ) : (
          <>
            <div className={styles.row}>
              <span>
                <strong style={{ color: 'var(--color-accent)' }}>
                  {pct(odds.winPct)}
                </strong>{' '}
                {t.winOddsPanel.win}
              </span>
              <span style={{ opacity: 0.8 }}>{pct(odds.tiePct)} {t.winOddsPanel.tie}</span>
              <span style={{ opacity: 0.8 }}>{pct(odds.lossPct)} {t.winOddsPanel.loss}</span>
            </div>
            <div className={styles.foot}>
              ±{Math.max(1, Math.round(odds.ciHalfWidth))}% · {odds.samples}{' '}
              {t.winOddsPanel.sims} · {captionText}
            </div>
          </>
        )
      ) : (
        <div className={styles.foot}>{t.winOddsPanel.simulating}</div>
      )}
    </div>
  );
}
