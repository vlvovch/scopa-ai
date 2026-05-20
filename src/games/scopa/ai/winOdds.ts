// Live win-odds engine for Scopa (analysis mode, single-player only).
//
// Estimates P(win / tie / loss) for the CURRENT round from the human's
// information set, assuming both seats play a sensible policy from here:
//
//   1. The hidden state (opponent's hand + deck order) is sampled from
//      the cards the human hasn't seen — exactly Expert's
//      determinization (`determinizeState`, reused verbatim).
//   2. Each sampled world is now perfect-information; for EACH of the
//      human's legal moves, commit that move then play the rest of the
//      deal out with BOTH seats using Expert's fast greedy move-ordering
//      policy, reusing the real `gameReducer` so every rule (mandatory
//      capture, single-card priority, re-deal, last-hand scopa rule,
//      end-of-round table residue → last capturer) is exactly the game's.
//   3. Compare the two players' round totals; tally per move.
//
// Scopa differs from Briscola in that ONE hand card can yield several
// legal moves (different single / sum captures, or a trail). So the
// tally is keyed per MOVE (Expert's `moveKey`), not per card. The UI
// shows the best move's % under each card and every option's % in the
// capture-choice modal. The headline is the best move overall — exactly
// how the engine would itself pick — so it never diverges from what the
// per-move numbers say (same anti-clairvoyance reasoning as Briscola).
//
// Pure and deterministic under a fixed seed (the RNG is threaded into
// the determinizer), so it is unit-testable and safe in a Web Worker.
// Reuses Expert's determinization + move ordering and the game reducer —
// no duplicated game logic.

import type { GameState, Move, PlayerId } from '../types';
import { getValidMoves } from '../rules';
import { gameReducer } from '../reducer';
import {
  determinizeState,
  orderMoves,
  getAllMoves,
  getOpponent,
  moveKey,
  alphaBeta,
  type Rng,
  type ExpertOptions,
} from './expert';
import { createDeck } from '../deck';
import {
  type OutcomeOdds,
  type OutcomeTally,
  emptyTally,
  mulberry32,
  bucketOutcome,
  formatOutcome,
} from '../../shared/winOddsCore';

// Re-export so the UI computes capture-option keys with the SAME
// function the engine tallies under (no key drift).
export { moveKey };
export type { OutcomeOdds, OutcomeTally };

/** Synthetic perMove key used when it's NOT the analysed seat's turn:
 *  the engine then tallies a single OVERALL outcome (no root-move
 *  breakdown), so the headline still has data to drive the panel. The
 *  UI's per-card lookup keys off real card ids so this never collides. */
export const OVERALL_KEY = '__overall__';

/** Odds for one move: the shared win/tie/loss view PLUS the expected
 *  round-score margin (my round total − opponent's, averaged over the
 *  sampled worlds) and its 95% CI. Scopa surfaces the margin rather
 *  than win% — in a cumulative race-to-target game the point spread is
 *  more actionable than a binary win flag. */
export interface MoveOdds extends OutcomeOdds {
  /** E[my round total − opponent round total] over the sampled worlds. */
  expectedDiff: number;
  /** ±half-width of the 95% CI on expectedDiff (points). */
  diffCi: number;
}

export interface WinOdds extends MoveOdds {
  /**
   * Per-move odds keyed by Expert's `moveKey` — the round outlook *if
   * you make that move now* then both seats continue greedily, measured
   * in the **same** sampled worlds as every other move (common random
   * numbers ⇒ a fair, low-variance ranking). Always present; the UI
   * decides whether to surface it (under-card best move + capture
   * modal). The headline above equals the best move's outlook.
   */
  perMove?: Record<string, MoveOdds>;
}

/** Per-move raw stats: shared win/tie/loss counts PLUS running sums for
 *  the score-margin mean & its variance. Accumulatable across chunks. */
export interface MoveTally extends OutcomeTally {
  /** Σ (my round total − opponent round total). */
  sumDiff: number;
  /** Σ (my round total − opponent round total)². */
  sumSqDiff: number;
}

const emptyMoveTally = (): MoveTally => ({
  ...emptyTally(),
  sumDiff: 0,
  sumSqDiff: 0,
});

/** Mean margin + 95% CI from the running sums. */
function formatMove(t: MoveTally): MoveOdds {
  const base = formatOutcome(t);
  if (t.played === 0) return { ...base, expectedDiff: 0, diffCi: 0 };
  const mean = t.sumDiff / t.played;
  const variance = Math.max(0, t.sumSqDiff / t.played - mean * mean);
  return {
    ...base,
    expectedDiff: mean,
    diffCi: 1.96 * Math.sqrt(variance / t.played),
  };
}

export interface WinOddsOptions {
  /** Number of determinizations to simulate. Default 200. Ignored in
   *  the perfect-information endgame (single deterministic solve). */
  samples?: number;
  /** RNG seed (any integer). Same seed + same view ⇒ identical result. */
  seed?: number;
  /** Use an alpha-beta rollout policy instead of the fast greedy one
   *  (mid-round only). Stronger but slower. Endgame is always exact
   *  regardless. Convenience: maps to deepPlies=1 if deepPlies isn't
   *  set explicitly. */
  deep?: boolean;
  /** Depth of the alpha-beta lookahead used per playout decision when
   *  deep is on (1 = 1-ply lookahead, etc.). Overrides `deep` when
   *  set explicitly. Default: 1 when deep is true, 0 (= greedy) when
   *  deep is false. */
  deepPlies?: number;
}

/** Per-move raw counts from a batch. Accumulatable across worker chunks. */
export interface WinOddsTally {
  /** Determinizations simulated (each root move played once each). */
  played: number;
  /** Per-move raw stats, keyed by Expert's moveKey. */
  perMove: Record<string, MoveTally>;
}

/** The human's information-set view: the live single-player game state
 *  (status 'playing', it is `player`'s turn) and the analysed seat. The
 *  opponent's hand / deck order in `game` are NEVER trusted — they are
 *  resampled by the determinizer. */
export interface ScopaWinOddsView {
  game: GameState;
  player: PlayerId;
}

function rngFrom(rand: () => number): Rng {
  return {
    nextInt: (max: number) => (max <= 0 ? 0 : Math.floor(rand() * max)),
  };
}

/** All legal moves for `player` from the live position (independent of
 *  the hidden opponent hand ⇒ stable keys across determinizations). */
function rootMoves(game: GameState, player: PlayerId): Move[] {
  const out: Move[] = [];
  for (const card of game.players[player].hand) {
    out.push(...getValidMoves(card, game.round.table, player));
  }
  return out;
}

type Policy = (state: GameState) => Move | null;

/** Fast deterministic playout policy: Expert's own move-ordering top
 *  pick (captures > scopa > sette bello > coins > primiera > trail). */
const greedy: Policy = (state) => {
  const moves = getAllMoves(state);
  if (moves.length === 0) return null;
  return orderMoves(state, moves)[0];
};

/** Stronger playout policy: for the current mover, evaluate each legal
 *  move with an N-ply alpha-beta lookahead (rollouts disabled, leaf =
 *  Expert's evaluateState). Each side plays for its OWN payoff
 *  (alphaBeta's `player` is the mover). N=1 ⇒ 1-ply (just this move +
 *  leaf eval), N=3 ⇒ this move + 2 more plies + leaf, etc. */
function deepPick(state: GameState, plies: number): Move | null {
  const moves = getAllMoves(state);
  if (moves.length === 0) return null;
  const ordered = orderMoves(state, moves);
  const mover = state.round.currentPlayer;
  const noRng: Rng = { nextInt: () => 0 };
  const opts: ExpertOptions = { rollouts: 0 };
  let best = ordered[0];
  let bestScore = -Infinity;
  for (const m of ordered) {
    const ns = gameReducer(state, { type: 'PLAY_CARD', payload: { move: m } });
    // After applying ONE candidate move, search `plies-1` more plies of
    // alpha-beta with a leaf-eval at the bottom (rollouts:0).
    const sc = alphaBeta(
      ns, plies - 1, -Infinity, Infinity, mover, noRng, Infinity, opts
    );
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  return best;
}

/** Play a determinized world to round end with both seats using
 *  `policy`, award the table residue (END_ROUND), and return the
 *  analysed seat's round total vs the opponent's. */
function rolloutOutcome(
  start: GameState,
  player: PlayerId,
  policy: Policy
): { mine: number; theirs: number } {
  let s = start;
  let guard = 0;
  while (s.status === 'playing' && guard++ < 120) {
    const mv = policy(s);
    if (!mv) break;
    s = gameReducer(s, { type: 'PLAY_CARD', payload: { move: mv } });
  }
  // Awards remaining table cards to the last capturer + scores the round.
  s = gameReducer(s, { type: 'END_ROUND' });
  const rs = s.lastRoundScores;
  if (!rs) return { mine: 0, theirs: 0 };
  const opp = getOpponent(player);
  return { mine: rs[player].total, theirs: rs[opp].total };
}

// ---------------------------------------------------------------------
// Perfect-information endgame solver (always on, regardless of `deep`).
//
// When the deck is empty AND the unseen pool exactly equals the
// opponent's hand size, every card is known to the analysing seat — the
// world is forced, no sampling needed. We then compute the EXACT
// game-theoretic round margin under optimal play from both sides via
// alpha-beta to terminal, dispatching END_ROUND at the leaf so the
// table-residue rule is honoured (Expert's own `evaluateState` skips
// the residue, so we don't reuse it here).
// ---------------------------------------------------------------------

function finalMargin(state: GameState, analyser: PlayerId): number {
  const after = gameReducer(state, { type: 'END_ROUND' });
  const rs = after.lastRoundScores;
  if (!rs) return 0;
  return rs[analyser].total - rs[getOpponent(analyser)].total;
}

/** Exact minimax (with alpha-beta) value of `state` for `analyser`
 *  through round end. Endgame trees are tiny (≤ ~6 plies, ≤ ~5
 *  branching) so a full search is well under a millisecond. */
function endgameValue(
  state: GameState,
  analyser: PlayerId,
  alpha: number,
  beta: number
): number {
  if (state.status !== 'playing') return finalMargin(state, analyser);
  const moves = getAllMoves(state);
  if (moves.length === 0) return finalMargin(state, analyser);
  const mover = state.round.currentPlayer;
  const ordered = orderMoves(state, moves);
  if (mover === analyser) {
    let best = -Infinity;
    for (const m of ordered) {
      const ns = gameReducer(state, { type: 'PLAY_CARD', payload: { move: m } });
      const v = endgameValue(ns, analyser, alpha, beta);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of ordered) {
    const ns = gameReducer(state, { type: 'PLAY_CARD', payload: { move: m } });
    const v = endgameValue(ns, analyser, alpha, beta);
    if (v < best) best = v;
    if (best < beta) beta = best;
    if (beta <= alpha) break;
  }
  return best;
}

function isPerfectInfoEndgame(game: GameState, player: PlayerId): boolean {
  if (game.round.deck.length !== 0) return false;
  const opp = getOpponent(player);
  const known = new Set<string>([
    ...game.round.table.map((c) => c.id),
    ...game.players[player].hand.map((c) => c.id),
    ...game.players.human.captured.map((c) => c.id),
    ...game.players.cpu.captured.map((c) => c.id),
  ]);
  const unseen = createDeck().filter((c) => !known.has(c.id)).length;
  return unseen === game.players[opp].hand.length;
}

/**
 * Run a batch of `samples` determinizations and return raw per-move
 * counts. Pure and deterministic under `seed`. Exposed so the Web
 * Worker can run the work in chunks (each chunk a separate seed) and
 * accumulate a settling estimate.
 */
/** Add one outcome (margin = mine − theirs) into a MoveTally. */
function recordOutcome(t: MoveTally, mine: number, theirs: number): void {
  bucketOutcome(t, mine, theirs);
  const d = mine - theirs;
  t.sumDiff += d;
  t.sumSqDiff += d * d;
}

export function tallyWinOdds(
  view: ScopaWinOddsView,
  options: WinOddsOptions = {}
): WinOddsTally {
  const { game, player } = view;
  // On the analysed seat's turn we tally one entry PER root move; on
  // the opponent's turn we tally a single OVERALL outcome (the policy
  // plays the opponent's move and continues both sides), which lets
  // the panel surface a glance at the position before the opponent
  // plays — useful right after a deal when the opponent goes first.
  const isPlayerTurn = game.round.currentPlayer === player;
  const roots = isPlayerTurn ? rootMoves(game, player) : [];
  const perMove: Record<string, MoveTally> = {};
  for (const m of roots) perMove[moveKey(m)] = emptyMoveTally();
  if (!isPlayerTurn) perMove[OVERALL_KEY] = emptyMoveTally();

  // ── Perfect-information endgame: the world is forced, no sampling
  // needed. For each root move (or for the overall outcome on the
  // opponent's turn) we compute the EXACT game-theoretic round margin
  // under optimal play. samples = 1 (deterministic), variance = 0,
  // displayed margin is an exact integer with ±0.
  if (isPerfectInfoEndgame(game, player)) {
    const det = determinizeState(
      game,
      player,
      rngFrom(mulberry32(options.seed ?? 0))
    );
    if (isPlayerTurn) {
      for (const m of roots) {
        const after = gameReducer(det, {
          type: 'PLAY_CARD',
          payload: { move: m },
        });
        const margin = endgameValue(after, player, -Infinity, Infinity);
        recordOutcome(perMove[moveKey(m)], margin, 0);
      }
    } else {
      const margin = endgameValue(det, player, -Infinity, Infinity);
      recordOutcome(perMove[OVERALL_KEY], margin, 0);
    }
    return { played: 1, perMove };
  }

  // ── Mid-round (sampling). Greedy by default; `deep` uses an N-ply
  // alpha-beta playout policy (default N=3, materially stronger).
  // Common random numbers across root moves per sample.
  const samples = Math.max(1, options.samples ?? 200);
  const rng = rngFrom(mulberry32(options.seed ?? 0x9e3779b9));
  // deep=true defaults to a 3-ply lookahead: empirically the sweet
  // spot (≈10× greedy, still <1s for 300 samples on a 3-card hand —
  // see winOdds.bench.ts), and materially stronger than 1-ply.
  const plies =
    options.deepPlies ?? (options.deep ? 3 : 0);
  const policy: Policy =
    plies > 0 ? (s: GameState) => deepPick(s, plies) : greedy;

  for (let i = 0; i < samples; i++) {
    const det = determinizeState(game, player, rng);
    if (isPlayerTurn) {
      for (const m of roots) {
        const after = gameReducer(det, {
          type: 'PLAY_CARD',
          payload: { move: m },
        });
        const { mine, theirs } = rolloutOutcome(after, player, policy);
        recordOutcome(perMove[moveKey(m)], mine, theirs);
      }
    } else {
      // Opponent's turn: let the policy play opp's move + continue
      // both seats from the determinized state to round end.
      const { mine, theirs } = rolloutOutcome(det, player, policy);
      recordOutcome(perMove[OVERALL_KEY], mine, theirs);
    }
  }

  return { played: samples, perMove };
}

const ZERO: WinOdds = {
  winPct: 0,
  tiePct: 0,
  lossPct: 0,
  samples: 0,
  ciHalfWidth: 0,
  expectedDiff: 0,
  diffCi: 0,
};

/**
 * Turn raw per-move tallies into displayable WinOdds. The headline is
 * the **best move's** outlook — the move with the highest expected
 * score margin (ties broken by enumeration order for determinism), the
 * same criterion the engine itself would pick by, so the headline never
 * disagrees with the per-move numbers. `perMove` carries every move's
 * outlook (margin + win/tie/loss). Shared by estimateWinOdds and the
 * worker so the math has a single home.
 */
export function formatWinOdds(tally: WinOddsTally): WinOdds {
  const entries = Object.entries(tally.perMove);
  if (entries.length === 0) return ZERO;
  const perMove: Record<string, MoveOdds> = {};
  let best: MoveTally | null = null;
  let bestDiff = -Infinity;
  for (const [key, t] of entries) {
    perMove[key] = formatMove(t);
    const mean = t.played > 0 ? t.sumDiff / t.played : 0;
    if (mean > bestDiff) {
      bestDiff = mean;
      best = t;
    }
  }
  return { ...formatMove(best!), perMove };
}

/**
 * Estimate round win/tie/loss odds for `view.player` (the human) given
 * only that player's information set. Returns a zeroed result (samples
 * 0) when there is nothing to analyse (not the human's turn, no hand,
 * round not in play) — the hook gates on this too.
 */
export function estimateWinOdds(
  view: ScopaWinOddsView,
  options: WinOddsOptions = {}
): WinOdds {
  const { game, player } = view;
  if (
    game.status !== 'playing' ||
    game.players[player].hand.length === 0
  ) {
    return ZERO;
  }
  // Note: opponent-turn is allowed — the engine returns an OVERALL
  // outcome (no per-card breakdown) so the panel can show an
  // intermediate estimate before the opponent plays.
  return formatWinOdds(tallyWinOdds(view, options));
}
