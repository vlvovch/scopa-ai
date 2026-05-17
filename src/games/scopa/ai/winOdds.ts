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
  type Rng,
} from './expert';
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

export interface WinOdds extends OutcomeOdds {
  /**
   * Per-move odds keyed by Expert's `moveKey` — the round odds *if you
   * make that move now* then both seats continue greedily, measured in
   * the **same** sampled worlds as every other move (common random
   * numbers ⇒ a fair, low-variance ranking). Always present; the UI
   * decides whether to surface it (under-card best move + capture
   * modal). The headline above equals the best move's odds.
   */
  perMove?: Record<string, OutcomeOdds>;
}

export interface WinOddsOptions {
  /** Number of determinizations to simulate. Default 200. */
  samples?: number;
  /** RNG seed (any integer). Same seed + same view ⇒ identical result. */
  seed?: number;
}

/** Per-move raw counts from a batch. Accumulatable across worker chunks. */
export interface WinOddsTally {
  /** Determinizations simulated (each root move played once each). */
  played: number;
  /** Per-move outcome counts, keyed by Expert's moveKey. */
  perMove: Record<string, OutcomeTally>;
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

/** Fast deterministic playout policy: Expert's own move-ordering top
 *  pick (captures > scopa > sette bello > coins > primiera > trail). */
function greedy(state: GameState): Move | null {
  const moves = getAllMoves(state);
  if (moves.length === 0) return null;
  return orderMoves(state, moves)[0];
}

/** Play a determinized world to round end with both seats greedy, award
 *  the table residue (END_ROUND), and return the analysed seat's round
 *  total vs the opponent's. */
function rolloutOutcome(
  start: GameState,
  player: PlayerId
): { mine: number; theirs: number } {
  let s = start;
  let guard = 0;
  while (s.status === 'playing' && guard++ < 120) {
    const mv = greedy(s);
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

/**
 * Run a batch of `samples` determinizations and return raw per-move
 * counts. Pure and deterministic under `seed`. Exposed so the Web
 * Worker can run the work in chunks (each chunk a separate seed) and
 * accumulate a settling estimate.
 */
export function tallyWinOdds(
  view: ScopaWinOddsView,
  options: WinOddsOptions = {}
): WinOddsTally {
  const samples = Math.max(1, options.samples ?? 200);
  const rng = rngFrom(mulberry32(options.seed ?? 0x9e3779b9));
  const { game, player } = view;

  const roots = rootMoves(game, player);
  const perMove: Record<string, OutcomeTally> = {};
  for (const m of roots) perMove[moveKey(m)] = emptyTally();

  for (let i = 0; i < samples; i++) {
    // One determinization per sample; every root move is evaluated in
    // the SAME sampled world (common random numbers). The reducer/
    // executeMove never mutate their input, so reusing `det` as the
    // base for each root move is safe.
    const det = determinizeState(game, player, rng);
    for (const m of roots) {
      const after = gameReducer(det, {
        type: 'PLAY_CARD',
        payload: { move: m },
      });
      const { mine, theirs } = rolloutOutcome(after, player);
      bucketOutcome(perMove[moveKey(m)], mine, theirs);
    }
  }

  return { played: samples, perMove };
}

/**
 * Turn raw per-move tallies into displayable WinOdds. The headline
 * (winPct/tiePct/lossPct/CI) is the **best move's** outcome — the move
 * with the highest win rate, ties broken by enumeration order for
 * determinism. `perMove` carries every move's odds. Shared by
 * estimateWinOdds and the worker so the math has a single home.
 */
export function formatWinOdds(tally: WinOddsTally): WinOdds {
  const entries = Object.entries(tally.perMove);
  if (entries.length === 0) {
    return { winPct: 0, tiePct: 0, lossPct: 0, samples: 0, ciHalfWidth: 0 };
  }
  const perMove: Record<string, OutcomeOdds> = {};
  let best: OutcomeTally | null = null;
  let bestRate = -1;
  for (const [key, t] of entries) {
    perMove[key] = formatOutcome(t);
    const rate = t.played > 0 ? t.wins / t.played : 0;
    if (rate > bestRate) {
      bestRate = rate;
      best = t;
    }
  }
  return { ...formatOutcome(best!), perMove };
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
    game.round.currentPlayer !== player ||
    game.players[player].hand.length === 0
  ) {
    return { winPct: 0, tiePct: 0, lossPct: 0, samples: 0, ciHalfWidth: 0 };
  }
  return formatWinOdds(tallyWinOdds(view, options));
}
