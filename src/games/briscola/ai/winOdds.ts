// Live win-odds engine for Briscola (analysis mode, single-player only).
//
// Estimates P(win / tie / loss) for the CURRENT round from player 1's
// information set, assuming both seats play like Esperto from here:
//
//   1. The hidden state (opponent's hand + deck order) is sampled from the
//      cards player 1 hasn't seen — exactly Esperto's determinization.
//   2. Each sampled world is now perfect-information; play it out to the
//      end of the round with BOTH seats using capped-depth alpha-beta
//      (Esperto's core search; the per-mover re-determinization is
//      unnecessary here because the world is already determinized).
//   3. Tally the round outcome (final captured points vs 60) and average
//      over all samples.
//
// Pure and deterministic under a fixed seed (the RNG is threaded all the
// way into Esperto's sampler), so it is straightforward to unit-test and
// safe to run in a Web Worker (Phase B).
//
// Reuses Esperto's exact SimState / playCard / search / determinization
// (exported from ./expert) — no duplicated game logic.

import type { AIContext } from './types';
import {
  type SimState,
  playCard,
  pickMovePerfectInfo,
  buildUnseen,
  sampleDeterminization,
  otherPlayer,
  SEARCH_PLIES,
  ENDGAME_PLIES,
} from './expert';
import { sumPoints } from '../scoring';

export interface WinOdds {
  /** Probability player 1 takes the round (>60 pts), as a 0–100 percentage. */
  winPct: number;
  /** Probability of a 60–60 tie, 0–100. */
  tiePct: number;
  /** Probability player 1 loses the round (<60 pts), 0–100. */
  lossPct: number;
  /** Number of determinizations actually simulated. */
  samples: number;
  /** ±half-width of the 95% confidence interval on winPct (percentage
   *  points). Shrinks as samples grow; useful for a "still computing" UI. */
  ciHalfWidth: number;
  /**
   * Per-card win odds — present only when the per-card option is on.
   * Keyed by card id; each value is the odds *if you play that card now*
   * (then both seats continue as Esperto), measured in the **same**
   * sampled worlds as every other card (common random numbers ⇒ a fair,
   * low-variance ranking).
   */
  perCard?: Record<string, WinOdds>;
}

export interface WinOddsOptions {
  /** Number of determinizations to simulate. Default 200. */
  samples?: number;
  /** RNG seed (any integer). Same seed + same view ⇒ identical result. */
  seed?: number;
  /**
   * Capped alpha-beta depth used for each move decision in the rollout.
   * Defaults to Esperto's own SEARCH_PLIES mid-round (and the deeper
   * ENDGAME_PLIES once the deck is empty, where terminal is reachable
   * cheaply). Lower = faster / rougher.
   */
  maxPlies?: number;
  /**
   * Also compute per-card odds (each hand card forced as the first move,
   * in the same sampled worlds). ~hand-size× more rollouts per sample —
   * opt-in. Does not change the RNG stream, so the overall figure is
   * identical with it on or off.
   */
  perCard?: boolean;
}

/** Raw outcome counts from a batch of determinizations. Accumulatable
 *  across chunks (the Web Worker sums these to stream a settling estimate). */
export interface WinOddsTally {
  wins: number;
  ties: number;
  losses: number;
  played: number;
  /** Per-card raw tallies (present only when the per-card option is on).
   *  Keyed by card id; merged across chunks by the worker. */
  perCard?: Record<string, OutcomeTally>;
}

/** Bare win/tie/loss/played counts (one card, or the overall figure). */
export interface OutcomeTally {
  wins: number;
  ties: number;
  losses: number;
  played: number;
}

/** mulberry32 — tiny, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run a batch of `samples` determinizations and return raw outcome
 * counts. Pure and deterministic under `seed`. The degenerate "round
 * already finished" case is handled by the caller (estimateWinOdds) — by
 * the time this is called there is at least one card to play.
 *
 * Exposed so the Web Worker can run the work in chunks (each chunk a
 * separate seed) and accumulate the tallies into a settling estimate.
 */
/** Play a determinized world to the end of the round, both seats acting
 *  as capped-depth Esperto, and return the final SimState. */
function rolloutToEnd(start: SimState, maxPlies?: number): SimState {
  let s = start;
  let guard = 0;
  while (
    !(s.myHand.length === 0 && s.oppHand.length === 0 && s.leadCard === null)
  ) {
    const plies =
      maxPlies ?? (s.deckQueue.length === 0 ? ENDGAME_PLIES : SEARCH_PLIES);
    s = playCard(s, pickMovePerfectInfo(s, plies));
    if (++guard > 80) break; // safety; a round is ≤40 plies
  }
  return s;
}

function bucket(t: OutcomeTally, myPoints: number): void {
  if (myPoints > 60) t.wins++;
  else if (myPoints === 60) t.ties++;
  else t.losses++;
  t.played++;
}

const emptyTally = (): OutcomeTally => ({
  wins: 0,
  ties: 0,
  losses: 0,
  played: 0,
});

export function tallyWinOdds(
  ctx: AIContext,
  options: WinOddsOptions = {}
): WinOddsTally {
  const samples = Math.max(1, options.samples ?? 200);
  const rng = mulberry32(options.seed ?? 0x9e3779b9);

  const me = ctx.player;
  const opp = otherPlayer(me);

  const myPoints0 = sumPoints(ctx.myCaptured ?? []);
  const oppPoints0 = sumPoints(ctx.oppCaptured ?? []);

  const unseen = buildUnseen(ctx);
  // Same opponent-hand-size logic Esperto uses: if a card is led, the
  // opponent has played one more card than us this trick.
  const oppHandSize =
    ctx.leadCard !== null
      ? Math.max(0, ctx.hand.length - 1)
      : ctx.hand.length;
  const drawableOppHandSize = Math.min(oppHandSize, unseen.length);

  const overall = emptyTally();
  const perCard: Record<string, OutcomeTally> | undefined = options.perCard
    ? Object.fromEntries(ctx.hand.map((c) => [c.id, emptyTally()]))
    : undefined;

  for (let i = 0; i < samples; i++) {
    // ONE determinization per sample — reused for the overall figure and
    // every candidate card (common random numbers ⇒ fair comparison).
    // This single rng-consuming call keeps the stream independent of the
    // perCard flag, so the overall result is identical either way.
    const det = sampleDeterminization(
      unseen,
      drawableOppHandSize,
      ctx.trump,
      ctx.deckCount,
      rng
    );

    const base: SimState = {
      me,
      trumpSuit: ctx.trumpSuit,
      myHand: ctx.hand,
      oppHand: det.oppHand,
      deckQueue: det.deckQueue,
      leadCard: ctx.leadCard,
      leader: ctx.leadCard !== null ? opp : me,
      toMove: me,
      myPoints: myPoints0,
      oppPoints: oppPoints0,
    };

    // Overall: both seats play Esperto from here (Esperto picks our move).
    bucket(overall, rolloutToEnd(base, options.maxPlies).myPoints);

    // Per-card: force each hand card as our move now, then continue as
    // Esperto for both — same sampled world.
    if (perCard) {
      for (const c of ctx.hand) {
        const after = playCard(base, c);
        bucket(perCard[c.id], rolloutToEnd(after, options.maxPlies).myPoints);
      }
    }
  }

  return {
    wins: overall.wins,
    ties: overall.ties,
    losses: overall.losses,
    played: overall.played,
    ...(perCard ? { perCard } : {}),
  };
}

function formatOutcome(t: OutcomeTally): WinOdds {
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

/** Turn raw tallies into the displayable WinOdds (percentages + 95% CI
 *  half-width on winPct), including per-card if present. Shared by
 *  estimateWinOdds and the worker so the pct/CI math has a single home. */
export function formatWinOdds(tally: WinOddsTally): WinOdds {
  const base = formatOutcome(tally);
  if (!tally.perCard) return base;
  const perCard: Record<string, WinOdds> = {};
  for (const [id, t] of Object.entries(tally.perCard)) {
    perCard[id] = formatOutcome(t);
  }
  return { ...base, perCard };
}

/**
 * Estimate round win/tie/loss odds for `ctx.player` (the analysed seat,
 * normally 'human') given only that player's information set.
 *
 * `ctx` is the standard Briscola info-set view — the same shape the bots
 * receive — so callers must pass a player-1-visible context (own hand,
 * trump, lead card, deck count, both captured piles). It never sees the
 * real opponent hand or deck order; those are sampled.
 */
export function estimateWinOdds(
  ctx: AIContext,
  options: WinOddsOptions = {}
): WinOdds {
  // Degenerate guard: nothing left to decide — outcome is whatever's
  // banked. Only triggers at a fully-finished round.
  if (ctx.hand.length === 0) {
    const myPoints0 = sumPoints(ctx.myCaptured ?? []);
    const win = myPoints0 > 60;
    const tie = myPoints0 === 60;
    return {
      winPct: win ? 100 : 0,
      tiePct: tie ? 100 : 0,
      lossPct: !win && !tie ? 100 : 0,
      samples: 0,
      ciHalfWidth: 0,
    };
  }

  return formatWinOdds(tallyWinOdds(ctx, options));
}
