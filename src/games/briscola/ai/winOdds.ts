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
import {
  mulberry32,
  emptyTally,
  formatOutcome,
  bucketOutcome,
  type OutcomeTally,
} from '../../shared/winOddsCore';

// Re-exported so the Briscola worker's existing
// `import { type OutcomeTally } from '../ai/winOdds'` keeps resolving.
export type { OutcomeTally };

export interface WinOdds {
  /**
   * Probability player 1 takes the round (>60 pts), 0–100. This is the
   * **best card's** win% — i.e. odds assuming you play the strongest
   * card and then both seats continue as Esperto. It equals
   * max(perCard[*].winPct) by construction (so the headline always
   * matches the best card), and is computed the honest way Esperto
   * itself decides: commit to ONE card, then average over sampled
   * worlds — never re-choosing the first move per world.
   */
  winPct: number;
  /** Tie (60–60) % for the best card, 0–100. */
  tiePct: number;
  /** Loss (<60 pts) % for the best card, 0–100. */
  lossPct: number;
  /** Number of determinizations actually simulated. */
  samples: number;
  /** ±half-width of the 95% confidence interval on winPct (percentage
   *  points). Shrinks as samples grow; useful for a "still computing" UI. */
  ciHalfWidth: number;
  /**
   * Per-card win odds, keyed by card id — the odds *if you play that
   * card now* then both seats continue as Esperto, measured in the
   * **same** sampled worlds as every other card (common random numbers
   * ⇒ a fair, low-variance ranking). Always present; the UI decides
   * whether to surface it.
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
}

/** Per-card raw counts from a batch of determinizations. Accumulatable
 *  across chunks (the Web Worker sums these to stream a settling
 *  estimate). One determinization per sample is reused for every card
 *  (common random numbers). */
export interface WinOddsTally {
  /** Number of determinizations simulated (each card played once each). */
  played: number;
  /** Per-card outcome counts, keyed by card id. */
  perCard: Record<string, OutcomeTally>;
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

  // Every hand card gets its own running tally. Each sample draws ONE
  // determinization and plays every card through it (common random
  // numbers ⇒ a fair, low-variance comparison). The first move is the
  // forced card — never re-chosen per world — so there's no
  // value-of-clairvoyance inflation; this is exactly how Esperto
  // decides (commit one card, then average over sampled worlds).
  const perCard: Record<string, OutcomeTally> = Object.fromEntries(
    ctx.hand.map((c) => [c.id, emptyTally()])
  );

  for (let i = 0; i < samples; i++) {
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

    for (const c of ctx.hand) {
      const after = playCard(base, c);
      // bucketOutcome(t, mine, theirs): theirs=60 reproduces the exact
      // >60 win / ===60 tie / <60 loss buckets the old local helper used.
      bucketOutcome(
        perCard[c.id],
        rolloutToEnd(after, options.maxPlies).myPoints,
        60
      );
    }
  }

  return { played: samples, perCard };
}

/**
 * Turn raw per-card tallies into displayable WinOdds. The headline
 * (winPct/tiePct/lossPct/CI) is the **best card's** outcome — the card
 * with the highest win rate, ties broken by hand order for determinism.
 * `perCard` carries every card's odds. Shared by estimateWinOdds and
 * the worker so the math has a single home.
 */
export function formatWinOdds(tally: WinOddsTally): WinOdds {
  const entries = Object.entries(tally.perCard);
  if (entries.length === 0) {
    return { winPct: 0, tiePct: 0, lossPct: 0, samples: 0, ciHalfWidth: 0 };
  }
  const perCard: Record<string, WinOdds> = {};
  let best: OutcomeTally | null = null;
  let bestRate = -1;
  for (const [id, t] of entries) {
    perCard[id] = formatOutcome(t);
    const rate = t.played > 0 ? t.wins / t.played : 0;
    if (rate > bestRate) {
      bestRate = rate;
      best = t;
    }
  }
  return { ...formatOutcome(best!), perCard };
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
