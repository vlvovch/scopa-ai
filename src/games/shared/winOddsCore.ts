// Shared win-odds primitives (game-agnostic).
//
// Both the Scopa and Briscola live-odds engines tally Bernoulli-ish
// win/tie/loss outcomes over many seeded rollouts and format them with a
// 95% confidence interval. The PRNG, the tally shape, the bucketing rule
// and the CI math are identical across games and live here so there is a
// single, unit-testable home for them.
//
// (Briscola currently still carries its own private copies — it shipped
// first and is being kept frozen during an active deploy; migrating it
// onto this module is a safe follow-up, not done here.)

/** Win/tie/loss percentages plus a 95% CI half-width, for one option. */
export interface OutcomeOdds {
  /** P(analysed seat wins the round), 0–100. */
  winPct: number;
  /** P(tie), 0–100. */
  tiePct: number;
  /** P(loss), 0–100. */
  lossPct: number;
  /** Rollouts actually simulated for this option. */
  samples: number;
  /** ±half-width of the 95% CI on winPct (percentage points). */
  ciHalfWidth: number;
}

/** Bare win/tie/loss/played counts, accumulatable across worker chunks. */
export interface OutcomeTally {
  wins: number;
  ties: number;
  losses: number;
  played: number;
}

export const emptyTally = (): OutcomeTally => ({
  wins: 0,
  ties: 0,
  losses: 0,
  played: 0,
});

/** mulberry32 — tiny, fast, deterministic PRNG. Same seed ⇒ same stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bucket one finished rollout into a tally (analysed seat's perspective). */
export function bucketOutcome(
  t: OutcomeTally,
  mine: number,
  theirs: number
): void {
  if (mine > theirs) t.wins++;
  else if (mine === theirs) t.ties++;
  else t.losses++;
  t.played++;
}

/** Turn raw counts into displayable percentages + a 95% CI half-width. */
export function formatOutcome(t: OutcomeTally): OutcomeOdds {
  if (t.played === 0) {
    return { winPct: 0, tiePct: 0, lossPct: 0, samples: 0, ciHalfWidth: 0 };
  }
  const winP = t.wins / t.played;
  return {
    winPct: (t.wins / t.played) * 100,
    tiePct: (t.ties / t.played) * 100,
    lossPct: (t.losses / t.played) * 100,
    samples: t.played,
    ciHalfWidth: 1.96 * Math.sqrt((winP * (1 - winP)) / t.played) * 100,
  };
}
