// Expert Briscola AI — determinization + minimax search.
//
// The hidden state is the opponent's hand and the order of the deck. For
// each candidate card we might play, we:
//   1. Sample N "determinizations": guess a possible opponent hand and a
//      possible deck order from the cards we haven't seen.
//   2. Treat each sample as a perfect-info game, run a depth-limited
//      minimax over the next few plies, and score the leaf by
//      (our points − opponent points) plus a small heuristic for the
//      remaining hand.
//   3. Average the scores across determinizations and pick the best card,
//      breaking ties with the heuristic-AI score so play feels coherent
//      when minimax is indifferent.
//
// The trump card is special: as long as the deck has at least one card
// left, the trump is still in the deck pile (face-up at the bottom) and
// will be the *last* card drawn — we preserve that constraint so the
// sampler doesn't pretend the opponent might already hold it.

import type { Card, PlayerId, Suit } from '../types';
import type { AIContext, AIPlayer } from './types';
import { CARD_RANK, POINT_VALUES } from '../constants';
import { trickWinner } from '../rules';
import { createDeck } from './../deck';
import { scoreCandidate } from './heuristic';

const DETERMINIZATIONS = 14;
// Mid-game depth. With alpha-beta the work per ply drops a lot, so we can
// go deeper than the original depth-4 search. Endgame uses an exact, deeper
// search instead (see ENDGAME_PLIES).
const SEARCH_PLIES = 6;
// Generous cap that always reaches a terminal node when the deck is empty
// and hands are short (max 3 cards each → at most 6 plies left).
const ENDGAME_PLIES = 12;
const TIME_BUDGET_MS = 250;

function otherPlayer(p: PlayerId): PlayerId {
  return p === 'human' ? 'cpu' : 'human';
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

interface SimState {
  me: PlayerId;
  trumpSuit: Suit;
  myHand: Card[];
  oppHand: Card[];
  /** Future draws, ordered top-of-deck first. Trump (if still in deck) is last. */
  deckQueue: Card[];
  leadCard: Card | null;
  leader: PlayerId;
  toMove: PlayerId;
  myPoints: number;
  oppPoints: number;
}

/** Apply one play. If a card was already led, the trick resolves and both draw. */
function playCard(s: SimState, card: Card): SimState {
  const meIsMover = s.toMove === s.me;
  const myHand = meIsMover ? s.myHand.filter((c) => c.id !== card.id) : s.myHand;
  const oppHand = meIsMover ? s.oppHand : s.oppHand.filter((c) => c.id !== card.id);

  // Leading the trick — no resolution yet.
  if (s.leadCard === null) {
    return {
      me: s.me,
      trumpSuit: s.trumpSuit,
      myHand,
      oppHand,
      deckQueue: s.deckQueue,
      leadCard: card,
      leader: s.toMove,
      toMove: otherPlayer(s.toMove),
      myPoints: s.myPoints,
      oppPoints: s.oppPoints,
    };
  }

  // Trick complete — figure out who won and how many points it carried.
  const winner = trickWinner(s.leadCard, s.leader, card, s.toMove, s.trumpSuit);
  const trickPts = POINT_VALUES[s.leadCard.value] + POINT_VALUES[card.value];
  const winnerIsMe = winner === s.me;

  // Both players draw, winner first.
  const deckQueue = [...s.deckQueue];
  const myH = [...myHand];
  const oppH = [...oppHand];
  if (deckQueue.length > 0) {
    const drawn = deckQueue.shift()!;
    if (winnerIsMe) myH.push(drawn);
    else oppH.push(drawn);
  }
  if (deckQueue.length > 0) {
    const drawn = deckQueue.shift()!;
    if (winnerIsMe) oppH.push(drawn);
    else myH.push(drawn);
  }

  return {
    me: s.me,
    trumpSuit: s.trumpSuit,
    myHand: myH,
    oppHand: oppH,
    deckQueue,
    leadCard: null,
    leader: winner,
    toMove: winner,
    myPoints: s.myPoints + (winnerIsMe ? trickPts : 0),
    oppPoints: s.oppPoints + (winnerIsMe ? 0 : trickPts),
  };
}

/**
 * Cheap leaf evaluator: weights remaining points in each hand by how
 * collectable they look (trumps and high-point cards are more likely to
 * end up captured). Tried a fancier trump-dominance model (paired-trump
 * exchanges, surplus-trump non-trump capture estimates, top-trump
 * dominance bonuses) — within 10k-round noise of this version, sometimes
 * slightly worse. With depth-6 alpha-beta + endgame exact, leaf
 * evaluations are rare enough that the cheap version is fine.
 */
function leafBonus(s: SimState): number {
  let me = 0;
  let opp = 0;
  for (const c of s.myHand) {
    const pts = POINT_VALUES[c.value];
    const w = c.suit === s.trumpSuit ? 0.7 : 0.45;
    me += pts * w;
  }
  for (const c of s.oppHand) {
    const pts = POINT_VALUES[c.value];
    const w = c.suit === s.trumpSuit ? 0.7 : 0.45;
    opp += pts * w;
  }
  return me - opp;
}

/**
 * Alpha-beta minimax. We maximize (myPoints − oppPoints); the opponent
 * minimizes. Pruning lets us push the search 1-2 plies deeper for the same
 * cost — meaningful in mid-game and free in late-game (where branching
 * factor is already small).
 *
 * `alpha` is the best-so-far for the maximizer; `beta` for the minimizer.
 * Cut off the moment our window collapses.
 */
function search(
  s: SimState,
  plies: number,
  alpha: number,
  beta: number
): number {
  if (s.myHand.length === 0 && s.oppHand.length === 0 && s.leadCard === null) {
    return s.myPoints - s.oppPoints;
  }
  const moverHand = s.toMove === s.me ? s.myHand : s.oppHand;
  if (moverHand.length === 0) {
    return s.myPoints - s.oppPoints + leafBonus(s);
  }
  if (plies <= 0) {
    return s.myPoints - s.oppPoints + leafBonus(s);
  }

  const isMe = s.toMove === s.me;
  if (isMe) {
    let best = -Infinity;
    for (const c of moverHand) {
      const v = search(playCard(s, c), plies - 1, alpha, beta);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // beta cutoff — opponent won't allow this
    }
    return best;
  } else {
    let best = Infinity;
    for (const c of moverHand) {
      const v = search(playCard(s, c), plies - 1, alpha, beta);
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (alpha >= beta) break; // alpha cutoff — we won't allow this
    }
    return best;
  }
}

/**
 * Build the pool of cards we haven't seen yet (i.e. cards that are either in
 * the opponent's hand or still in the deck).
 */
function buildUnseen(ctx: AIContext): Card[] {
  const seen = new Set<string>();
  for (const c of ctx.hand) seen.add(c.id);
  for (const c of ctx.myCaptured ?? []) seen.add(c.id);
  for (const c of ctx.oppCaptured ?? []) seen.add(c.id);
  if (ctx.leadCard) seen.add(ctx.leadCard.id);
  // ctx.trump is treated below: if it's not in any captured pile (which we
  // already accounted for), it's still in the deck OR in opp's hand — both
  // count as "unseen" for sampling purposes.
  return createDeck().filter((c) => !seen.has(c.id));
}

interface Determinization {
  oppHand: Card[];
  deckQueue: Card[];
}

function sampleDeterminization(
  unseen: Card[],
  oppHandSize: number,
  trumpCard: Card,
  deckCount: number
): Determinization {
  // While the deck has cards, the trump is at the bottom — it must be the
  // last card drawn, not in the opp's hand. Pull it aside and append after
  // shuffling the rest.
  const trumpKnownInDeck =
    deckCount >= 1 && unseen.some((c) => c.id === trumpCard.id);

  if (trumpKnownInDeck) {
    const rest = unseen.filter((c) => c.id !== trumpCard.id);
    shuffleInPlace(rest);
    const oppHand = rest.slice(0, oppHandSize);
    const deckQueue = rest.slice(oppHandSize);
    return { oppHand, deckQueue: [...deckQueue, trumpCard] };
  }

  const copy = [...unseen];
  shuffleInPlace(copy);
  return {
    oppHand: copy.slice(0, oppHandSize),
    deckQueue: copy.slice(oppHandSize),
  };
}

export const expertAI: AIPlayer = {
  name: 'Esperto',

  selectMove(ctx: AIContext) {
    if (ctx.hand.length === 0) {
      throw new Error('expertAI: cannot select move with empty hand');
    }
    // Forced move — no search needed.
    if (ctx.hand.length === 1) {
      return { player: ctx.player, cardPlayed: ctx.hand[0] };
    }

    const me = ctx.player;
    const opp = otherPlayer(me);
    const unseen = buildUnseen(ctx);

    // Opponent hand size: when we're leading, both have played the same
    // number of cards so far; when we're following, opp has played one more
    // (the lead) than us.
    const oppHandSize =
      ctx.leadCard !== null ? Math.max(0, ctx.hand.length - 1) : ctx.hand.length;

    // Safety: never try to sample more cards than the unseen pool holds.
    const drawableOppHandSize = Math.min(oppHandSize, unseen.length);

    const scores = new Map<string, { sum: number; n: number }>();
    for (const c of ctx.hand) scores.set(c.id, { sum: 0, n: 0 });

    // ENDGAME FAST-PATH: if the deck is empty AND the unseen pool exactly
    // equals the opponent's hand size, then the opponent's hand is fully
    // determined (no hidden information). Skip determinization entirely
    // and run one exact alpha-beta search to terminal — fast and optimal.
    const isPerfectInfoEndgame =
      ctx.deckCount === 0 && unseen.length === drawableOppHandSize;

    if (isPerfectInfoEndgame) {
      const baseState: SimState = {
        me,
        trumpSuit: ctx.trumpSuit,
        myHand: ctx.hand,
        oppHand: unseen,
        deckQueue: [],
        leadCard: ctx.leadCard,
        leader: ctx.leadCard !== null ? opp : me,
        toMove: me,
        myPoints: 0,
        oppPoints: 0,
      };
      for (const candidate of ctx.hand) {
        const next = playCard(baseState, candidate);
        const v = search(next, ENDGAME_PLIES, -Infinity, Infinity);
        scores.set(candidate.id, { sum: v, n: 1 });
      }
    } else {
      // Mid-game: sample determinizations and average alpha-beta values.
      // When the deck is empty (but unseen > oppHand, e.g. still uncertain
      // about which specific cards are in opp's hand vs already drawn-and-
      // captured) we can still search to terminal cheaply, so widen depth.
      const plies = ctx.deckCount === 0 ? ENDGAME_PLIES : SEARCH_PLIES;
      const start = now();
      for (let d = 0; d < DETERMINIZATIONS; d++) {
        if (now() - start > TIME_BUDGET_MS) break;

        const { oppHand, deckQueue } = sampleDeterminization(
          unseen,
          drawableOppHandSize,
          ctx.trump,
          ctx.deckCount
        );

        const baseState: SimState = {
          me,
          trumpSuit: ctx.trumpSuit,
          myHand: ctx.hand,
          oppHand,
          deckQueue,
          leadCard: ctx.leadCard,
          leader: ctx.leadCard !== null ? opp : me,
          toMove: me,
          myPoints: 0,
          oppPoints: 0,
        };

        for (const candidate of ctx.hand) {
          const next = playCard(baseState, candidate);
          const v = search(next, plies - 1, -Infinity, Infinity);
          const acc = scores.get(candidate.id)!;
          acc.sum += v;
          acc.n += 1;
        }
      }
    }

    // Pick the highest-average candidate; tie-break by heuristic preference
    // (and finally by CARD_RANK to keep tests deterministic-ish).
    let best = ctx.hand[0];
    let bestAvg = scores.get(best.id)!.n > 0
      ? scores.get(best.id)!.sum / scores.get(best.id)!.n
      : -Infinity;
    let bestTie = scoreCandidate(best, ctx.leadCard, ctx.trumpSuit, me);

    for (let i = 1; i < ctx.hand.length; i++) {
      const cand = ctx.hand[i];
      const acc = scores.get(cand.id)!;
      const avg = acc.n > 0 ? acc.sum / acc.n : -Infinity;
      const tie = scoreCandidate(cand, ctx.leadCard, ctx.trumpSuit, me);
      const epsilon = 1e-6;
      if (
        avg > bestAvg + epsilon ||
        (Math.abs(avg - bestAvg) < epsilon && tie > bestTie) ||
        (Math.abs(avg - bestAvg) < epsilon &&
          tie === bestTie &&
          CARD_RANK[cand.value] < CARD_RANK[best.value])
      ) {
        best = cand;
        bestAvg = avg;
        bestTie = tie;
      }
    }

    return { player: me, cardPlayed: best };
  },
};

export function createExpertAI(): AIPlayer {
  return expertAI;
}
