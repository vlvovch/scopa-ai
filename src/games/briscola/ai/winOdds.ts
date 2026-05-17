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
  const samples = Math.max(1, options.samples ?? 200);
  const rng = mulberry32(options.seed ?? 0x9e3779b9);

  const me = ctx.player;
  const opp = otherPlayer(me);

  // Points already banked this round (POINT_VALUES sum of each pile).
  const myPoints0 = sumPoints(ctx.myCaptured ?? []);
  const oppPoints0 = sumPoints(ctx.oppCaptured ?? []);

  // Degenerate guard: nothing left to decide — outcome is whatever's banked
  // (plus any single lead card already on the table is ignored; this path
  // only triggers at a fully-finished round).
  if (ctx.hand.length === 0) {
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

  const unseen = buildUnseen(ctx);
  // Same opponent-hand-size logic Esperto uses: if a card is led, the
  // opponent has played one more card than us this trick.
  const oppHandSize =
    ctx.leadCard !== null
      ? Math.max(0, ctx.hand.length - 1)
      : ctx.hand.length;
  const drawableOppHandSize = Math.min(oppHandSize, unseen.length);

  let wins = 0;
  let ties = 0;
  let played = 0;

  for (let i = 0; i < samples; i++) {
    const det = sampleDeterminization(
      unseen,
      drawableOppHandSize,
      ctx.trump,
      ctx.deckCount,
      rng
    );

    let s: SimState = {
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

    // Roll out to the end of the round. Once the deck is empty the round
    // is short enough that the deeper endgame depth still reaches terminal
    // cheaply (mirrors Esperto's own depth choice).
    let guard = 0;
    while (
      !(s.myHand.length === 0 && s.oppHand.length === 0 && s.leadCard === null)
    ) {
      const plies =
        options.maxPlies ??
        (s.deckQueue.length === 0 ? ENDGAME_PLIES : SEARCH_PLIES);
      const card = pickMovePerfectInfo(s, plies);
      s = playCard(s, card);
      if (++guard > 80) break; // safety; a round is ≤40 plies
    }

    if (s.myPoints > 60) wins++;
    else if (s.myPoints === 60) ties++;
    played++;
  }

  const winP = wins / played;
  const ciHalfWidth = 1.96 * Math.sqrt((winP * (1 - winP)) / played) * 100;

  return {
    winPct: (wins / played) * 100,
    tiePct: (ties / played) * 100,
    lossPct: ((played - wins - ties) / played) * 100,
    samples: played,
    ciHalfWidth,
  };
}
