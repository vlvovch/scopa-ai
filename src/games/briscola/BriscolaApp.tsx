// Briscola AI — single-player against heuristicAI.
//
// Uses the same GameLayout shell as Scopa (top row: scoreboard left,
// CPU pile right · center: cpu hand / table / human hand · bottom row:
// human pile left, controls right). The only Briscola-specific UI
// differences are:
//
//   - The "table cards" slot shows the current trick (0–2 cards) in the
//     center and the deck stack on one side, with the trump card
//     rotated 90° beneath the deck (half hidden behind the stack, half
//     visible below) — the classic Briscola table setup.
//   - The captured piles reuse Scopa's CSS module verbatim so they look
//     identical, but their stat row is replaced with a card-count +
//     point-total pill (Briscola has no denari / scopa / sette bello).
//
// Animation flow:
//   - CPU plays via CpuCardAnimation: reveal (600ms flip in place) →
//     moving (500ms slide to play area)
//   - Human plays: card flies from hand via shared layoutId
//   - Trick resolves: both cards exit toward the winner's corner pile
//     after a 1200ms hold (matches Scopa's CAPTURE_DURATION_MS)

import { useReducer, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../../components/Card/Card';
import { CardBack } from '../../components/Card/CardImage';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { CpuCardAnimation } from '../../components/UI/CpuCardAnimation';
import { DealingAnimation, DEALING_HANDS_DURATION } from '../../components/UI/DealingAnimation';
import dealStyles from '../../components/UI/DealingAnimation.module.css';
import { GameLayout } from '../../components/Layout/GameLayout';
import { ScoreBoard } from '../../components/UI/ScoreBoard';
import { DeckProvider } from '../../contexts/DeckContext';
import pileStyles from '../../components/Table/CapturedPile.module.css';
import { applyMove, trickWinner } from './rules';
import { calculateRoundScore, sumPoints } from './scoring';
import { createDeck, shuffleDeck, dealInitialHands } from './deck';
import { heuristicAI } from './ai/heuristic';
import type { Card as BriscolaCard, GameState, Move, PlayerId } from './types';

// ---------------------------------------------------------------------------
// Timing — matches Scopa's CpuCardAnimation phases
// ---------------------------------------------------------------------------

const CPU_REVEAL_MS = 600;
const CPU_MOVE_MS = 500;
const CPU_DECISION_DELAY_MS = 600;
const TRICK_VISIBLE_MS = 1200;
const CAPTURE_DURATION_MS = 900;
const DRAW_DURATION_MS = 400;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AnimatingTrick {
  leadCard: BriscolaCard;
  leader: PlayerId;
  followCard: BriscolaCard;
  follower: PlayerId;
  winner: PlayerId;
  resolved: GameState;
}

type AppState =
  | { status: 'idle' }
  | { status: 'dealing'; game: GameState }
  | { status: 'playing'; game: GameState }
  | {
      status: 'cpuAnimating';
      game: GameState;
      cpuMove: Move;
      phase: 'reveal' | 'moving';
    }
  | { status: 'animatingTrick'; game: GameState; trick: AnimatingTrick }
  | {
      // Trick resolved, capture cards have flown to winner's pile; now
      // both players (or just winner if deck only had 1) draw a card.
      // preDrawGame is rendered (hands and deck still at pre-draw size);
      // when the timer fires we transition to postDrawGame.
      status: 'drawing';
      preDrawGame: GameState;
      postDrawGame: GameState;
      drawTargets: PlayerId[];
    }
  | { status: 'roundEnd'; game: GameState; finalPoints: { human: number; cpu: number } };

type Action =
  | { type: 'START' }
  | { type: 'DEAL_COMPLETE' }
  | { type: 'HUMAN_PLAY'; move: Move }
  | { type: 'CPU_START'; move: Move }
  | { type: 'CPU_PHASE_MOVING' }
  | { type: 'CPU_APPLY' }
  | { type: 'RESOLVE_TRICK' }
  | { type: 'DRAW_COMPLETE' };

function newRound(): GameState {
  const deck = shuffleDeck(createDeck());
  const init = dealInitialHands(deck, 'cpu');
  return {
    status: 'playing',
    round: {
      deck: init.deck,
      trump: init.trump,
      trumpSuit: init.trump.suit,
      trick: { leadCard: null, leader: 'human' },
      currentPlayer: 'human',
      dealer: 'cpu',
    },
    players: {
      human: { hand: init.hands.human, captured: [] },
      cpu: { hand: init.hands.cpu, captured: [] },
    },
    scores: { human: 0, cpu: 0 },
    roundNumber: 1,
    targetScore: 1,
  };
}

function applyOrDeferTrick(
  game: GameState,
  move: Move
):
  | { kind: 'direct'; next: GameState }
  | { kind: 'trick'; visualGame: GameState; pending: AnimatingTrick } {
  if (game.round.trick.leadCard === null) {
    return { kind: 'direct', next: applyMove(game, move) };
  }
  const leadCard = game.round.trick.leadCard;
  const leader = game.round.trick.leader;
  const follower = move.player;
  const winner = trickWinner(leadCard, leader, move.cardPlayed, follower, game.round.trumpSuit);
  const visualGame: GameState = {
    ...game,
    players: {
      ...game.players,
      [follower]: {
        ...game.players[follower],
        hand: game.players[follower].hand.filter(c => c.id !== move.cardPlayed.id),
      },
    } as GameState['players'],
  };
  const resolved = applyMove(game, move);
  return {
    kind: 'trick',
    visualGame,
    pending: { leadCard, leader, followCard: move.cardPlayed, follower, winner, resolved },
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'START':
      return { status: 'dealing', game: newRound() };

    case 'DEAL_COMPLETE':
      if (state.status !== 'dealing') return state;
      return { status: 'playing', game: state.game };

    case 'HUMAN_PLAY': {
      if (state.status !== 'playing') return state;
      const r = applyOrDeferTrick(state.game, action.move);
      return r.kind === 'direct'
        ? { status: 'playing', game: r.next }
        : { status: 'animatingTrick', game: r.visualGame, trick: r.pending };
    }

    case 'CPU_START': {
      if (state.status !== 'playing') return state;
      return { status: 'cpuAnimating', game: state.game, cpuMove: action.move, phase: 'reveal' };
    }

    case 'CPU_PHASE_MOVING':
      return state.status === 'cpuAnimating' ? { ...state, phase: 'moving' } : state;

    case 'CPU_APPLY': {
      if (state.status !== 'cpuAnimating') return state;
      const r = applyOrDeferTrick(state.game, state.cpuMove);
      return r.kind === 'direct'
        ? { status: 'playing', game: r.next }
        : { status: 'animatingTrick', game: r.visualGame, trick: r.pending };
    }

    case 'RESOLVE_TRICK': {
      if (state.status !== 'animatingTrick') return state;
      const { resolved, winner } = state.trick;
      const visualGame = state.game;
      const otherP: PlayerId = winner === 'human' ? 'cpu' : 'human';

      // Figure out who actually drew a card. Compare visualGame's hand
      // sizes (pre-draw) to resolved's hand sizes (post-draw).
      const drawTargets: PlayerId[] = [];
      if (resolved.players[winner].hand.length > visualGame.players[winner].hand.length) {
        drawTargets.push(winner);
      }
      if (resolved.players[otherP].hand.length > visualGame.players[otherP].hand.length) {
        drawTargets.push(otherP);
      }

      // If nobody drew (deck was already empty), skip the drawing
      // animation entirely — go straight to the next state.
      if (drawTargets.length === 0) {
        if (resolved.status === 'roundEnd') {
          const human = calculateRoundScore(resolved.players.human.captured, resolved.players.cpu.captured);
          const cpu = calculateRoundScore(resolved.players.cpu.captured, resolved.players.human.captured);
          return {
            status: 'roundEnd',
            game: resolved,
            finalPoints: { human: human.points, cpu: cpu.points },
          };
        }
        return { status: 'playing', game: resolved };
      }

      // Construct the pre-draw view: post-capture (so captured piles
      // and trick-clear are visible) but hands and deck at pre-draw
      // sizes (so the draw animation has somewhere to fly TO).
      const preDrawGame: GameState = {
        ...resolved,
        round: { ...resolved.round, deck: visualGame.round.deck },
        players: {
          human: { ...resolved.players.human, hand: visualGame.players.human.hand },
          cpu: { ...resolved.players.cpu, hand: visualGame.players.cpu.hand },
        },
      };
      return { status: 'drawing', preDrawGame, postDrawGame: resolved, drawTargets };
    }

    case 'DRAW_COMPLETE': {
      if (state.status !== 'drawing') return state;
      const post = state.postDrawGame;
      if (post.status === 'roundEnd') {
        const human = calculateRoundScore(post.players.human.captured, post.players.cpu.captured);
        const cpu = calculateRoundScore(post.players.cpu.captured, post.players.human.captured);
        return {
          status: 'roundEnd',
          game: post,
          finalPoints: { human: human.points, cpu: cpu.points },
        };
      }
      return { status: 'playing', game: post };
    }
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function BriscolaApp() {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' } as AppState);

  // CPU decision → CPU_START
  useEffect(() => {
    if (state.status !== 'playing') return;
    if (state.game.round.currentPlayer !== 'cpu') return;
    if (state.game.players.cpu.hand.length === 0) return;

    const g = state.game;
    const t = setTimeout(() => {
      const move = heuristicAI.selectMove({
        hand: g.players.cpu.hand,
        player: 'cpu',
        trump: g.round.trump,
        trumpSuit: g.round.trumpSuit,
        leadCard: g.round.trick.leadCard,
        deckCount: g.round.deck.length,
      });
      dispatch({ type: 'CPU_START', move });
    }, CPU_DECISION_DELAY_MS);
    return () => clearTimeout(t);
  }, [state]);

  // cpuAnimating: reveal → moving → apply
  useEffect(() => {
    if (state.status !== 'cpuAnimating') return;
    if (state.phase === 'reveal') {
      const t = setTimeout(() => dispatch({ type: 'CPU_PHASE_MOVING' }), CPU_REVEAL_MS);
      return () => clearTimeout(t);
    }
    if (state.phase === 'moving') {
      const t = setTimeout(() => dispatch({ type: 'CPU_APPLY' }), CPU_MOVE_MS);
      return () => clearTimeout(t);
    }
  }, [state]);

  // animatingTrick: hold then resolve
  useEffect(() => {
    if (state.status !== 'animatingTrick') return;
    const t = setTimeout(() => dispatch({ type: 'RESOLVE_TRICK' }), TRICK_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [state]);

  // dealing: hold for the duration of the deal animation, then start playing
  useEffect(() => {
    if (state.status !== 'dealing') return;
    // Slight buffer beyond the animation duration so cards fully settle
    const t = setTimeout(() => dispatch({ type: 'DEAL_COMPLETE' }), DEALING_HANDS_DURATION + 100);
    return () => clearTimeout(t);
  }, [state]);

  // drawing: hold for the duration of the draw animation, then advance
  useEffect(() => {
    if (state.status !== 'drawing') return;
    const t = setTimeout(() => dispatch({ type: 'DRAW_COMPLETE' }), DRAW_DURATION_MS + 50);
    return () => clearTimeout(t);
  }, [state]);

  const onPlayerCardClick = useCallback(
    (card: BriscolaCard) => {
      if (state.status !== 'playing') return;
      if (state.game.round.currentPlayer !== 'human') return;
      dispatch({ type: 'HUMAN_PLAY', move: { player: 'human', cardPlayed: card } });
    },
    [state]
  );

  if (state.status === 'idle') {
    return <StartScreen onStart={() => dispatch({ type: 'START' })} />;
  }

  return (
    <DeckProvider deck="napoletane">
      <BriscolaBoard
        state={state}
        onCardClick={onPlayerCardClick}
        onRestart={() => dispatch({ type: 'START' })}
      />
    </DeckProvider>
  );
}

export default BriscolaApp;

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div style={fullScreenCenter}>
      <h1 style={{ fontSize: '3rem', margin: 0 }}>Briscola AI</h1>
      <p style={{ opacity: 0.8, margin: '0.5rem 0 2rem 0' }}>
        Play against a heuristic CPU
      </p>
      <button style={primaryButton} onClick={onStart}>Start Game</button>
    </div>
  );
}

function BriscolaBoard({
  state,
  onCardClick,
  onRestart,
}: {
  state: Exclude<AppState, { status: 'idle' }>;
  onCardClick: (card: BriscolaCard) => void;
  onRestart: () => void;
}) {
  // While drawing, render the pre-draw view (hands/deck haven't grown yet).
  // For every other state, state.game is the right view.
  const g: GameState = state.status === 'drawing' ? state.preDrawGame : state.game;
  const isHumanTurn = state.status === 'playing' && g.round.currentPlayer === 'human';
  const animTrick = state.status === 'animatingTrick' ? state.trick : null;
  const cpuAnim = state.status === 'cpuAnimating' ? state : null;
  const isDealing = state.status === 'dealing';
  const drawTargets = state.status === 'drawing' ? state.drawTargets : null;

  // During the deal animation, hands are visually empty — the flying cards
  // in the DealingAnimation overlay represent them landing in the hands.
  // After deal completes, the real hand cards appear (PlayerHand's
  // AnimatePresence handles the entry).
  const cpuHand = isDealing
    ? []
    : cpuAnim
      ? g.players.cpu.hand.filter(c => c.id !== cpuAnim.cpuMove.cardPlayed.id)
      : g.players.cpu.hand;
  const humanHand = isDealing ? [] : g.players.human.hand;

  const leadCard = g.round.trick.leadCard;
  const followCard = animTrick ? animTrick.followCard : null;
  const winner = animTrick ? animTrick.winner : null;

  return (
    <>
      <GameLayout
        scoreBoard={
          <ScoreBoard
            humanScore={g.scores.human}
            cpuScore={g.scores.cpu}
            roundNumber={g.roundNumber}
            targetScore={g.targetScore}
            currentPlayer={g.round.currentPlayer}
            cpuName="Heuristic"
            humanName="You"
          />
        }
        cpuPile={
          <BriscolaPile
            captured={g.players.cpu.captured}
            label="Heuristic"
          />
        }
        cpuHand={<PlayerHand cards={cpuHand} isHuman={false} />}
        tableCards={
          <BriscolaTable
            deckCount={g.round.deck.length}
            trump={g.round.trump}
            leadCard={leadCard}
            followCard={followCard}
            winner={winner}
          />
        }
        humanHand={
          <PlayerHand
            cards={humanHand}
            isHuman={true}
            onCardClick={onCardClick}
            disabled={!isHumanTurn}
          />
        }
        humanPile={
          <BriscolaPile
            captured={g.players.human.captured}
            label="You"
          />
        }
        controls={
          <div style={turnLabelStyle}>
            {state.status === 'playing' && (isHumanTurn ? 'Your turn' : 'CPU thinking…')}
            {state.status === 'cpuAnimating' && 'CPU plays…'}
            {state.status === 'animatingTrick' &&
              (winner === 'human' ? 'You take it' : 'CPU takes it')}
            {state.status === 'roundEnd' && 'Round over'}
          </div>
        }
      />

      {/* CPU reveal/move overlay (same component Scopa uses) */}
      <CpuCardAnimation
        card={cpuAnim?.cpuMove.cardPlayed ?? null}
        phase={cpuAnim?.phase ?? null}
        capturedCardIds={[]}
        player={cpuAnim ? 'cpu' : undefined}
      />

      {/* Deal animation: 3 cards to each player, alternating, from the
          deck (on the right) to the players' hands. Only shown while
          state.status === 'dealing'. */}
      <DealingAnimation
        isDealing={isDealing}
        startPlayer={g.round.currentPlayer}
        deckPosition="right"
        dealMode="hands"
      />

      {/* Draw animation: one card per player who drew after the trick,
          flying from the deck to their hand. Briscola-specific (smaller
          and faster than Scopa's full deal). */}
      {drawTargets && <DrawAnimation targets={drawTargets} />}

      {state.status === 'roundEnd' && (
        <RoundEndOverlay
          humanPts={state.finalPoints.human}
          cpuPts={state.finalPoints.cpu}
          onRestart={onRestart}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Briscola table center: trick area + deck (with trump rotated beneath)
// ---------------------------------------------------------------------------

function BriscolaTable({
  deckCount,
  trump,
  leadCard,
  followCard,
  winner,
}: {
  deckCount: number;
  trump: BriscolaCard;
  leadCard: BriscolaCard | null;
  followCard: BriscolaCard | null;
  winner: PlayerId | null;
}) {
  return (
    <div style={tableGrid}>
      {/* Left spacer keeps the play area visually centered */}
      <div />
      <div style={trickArea}>
        <AnimatePresence>
          {leadCard && <TrickCard key={leadCard.id} card={leadCard} exitToward={winner} />}
          {followCard && <TrickCard key={followCard.id} card={followCard} exitToward={winner} />}
        </AnimatePresence>
      </div>
      {/* Deck sits in the right column, anchored to the left of that column
          so it's adjacent to the centered play area */}
      <div style={deckSlot}>
        <BriscolaDeck deckCount={deckCount} trump={trump} />
      </div>
    </div>
  );
}

// Short post-trick draw animation: one card-back per drawing player flies
// from the deck position (right side of viewport) to that player's hand
// position (top for cpu, bottom for human). Mirrors the visual language
// of DealingAnimation but with only 1-2 cards and a quicker pace.
function DrawAnimation({ targets }: { targets: PlayerId[] }) {
  if (targets.length === 0) return null;
  return (
    <AnimatePresence>
      <div className={dealStyles.overlay}>
        {targets.map((target, i) => (
          <motion.div
            key={`draw-${target}-${i}`}
            className={dealStyles.flyingCard}
            initial={{
              x: 280,    // start from the deck (right of viewport center)
              y: 0,
              scale: 0.85,
              opacity: 1,
              rotate: 5,
            }}
            animate={{
              x: 0,
              y: target === 'human' ? 280 : -280,
              scale: 1,
              opacity: [1, 1, 1, 0],   // crossfade out near the end
              rotate: 0,
            }}
            transition={{
              duration: DRAW_DURATION_MS / 1000,
              delay: i * 0.06,           // tiny stagger if both draw
              ease: [0.25, 0.1, 0.25, 1],
              opacity: {
                times: [0, 0.4, 0.6, 1],
                duration: DRAW_DURATION_MS / 1000,
              },
            }}
          >
            <CardBack />
          </motion.div>
        ))}
      </div>
    </AnimatePresence>
  );
}

function TrickCard({
  card,
  exitToward,
}: {
  card: BriscolaCard;
  exitToward: PlayerId | null;
}) {
  // Fly toward the winning corner pile.
  // CPU pile: top-right.   Human pile: bottom-left.
  const exitY = exitToward === 'human' ? 300 : exitToward === 'cpu' ? -300 : 0;
  const exitX = exitToward === 'human' ? -260 : exitToward === 'cpu' ? 260 : 0;

  return (
    <motion.div
      layoutId={`hand-${card.id}`}
      exit={{
        x: exitX,
        y: exitY,
        opacity: 0,
        scale: 0.7,
        rotate: exitToward === 'cpu' ? 30 : exitToward === 'human' ? -30 : 0,
        transition: { duration: CAPTURE_DURATION_MS / 1000, ease: [0.25, 0.1, 0.25, 1] },
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      <Card card={card} />
    </motion.div>
  );
}

// Deck stack with the trump card rotated 90° sticking out to its right.
// The trump's left end is tucked under the deck stack's right edge by
// ~15% of its rotated width, so most of the trump is clearly visible
// extending to the right and the deck stack appears to be sitting on top
// of one corner of the trump.
function BriscolaDeck({ deckCount, trump }: { deckCount: number; trump: BriscolaCard }) {
  if (deckCount === 0) {
    return (
      <div style={deckContainer}>
        <div style={emptyDeck}>
          <span style={emptyDeckLabel}>Empty</span>
        </div>
      </div>
    );
  }

  const stackLayers = Math.min(5, Math.max(1, Math.ceil((deckCount - 1) / 8)));
  const showStack = deckCount > 1;

  return (
    <div style={deckContainer}>
      <div style={deckTrumpArrangement}>
        {/* Trump card rotated -90°, sticking out to the LEFT of the deck.
            Rendered first (below in z-order) so the deck overlaps its right edge. */}
        <div style={trumpStickOut}>
          <Card card={trump} />
        </div>

        {/* Deck stack on top of the trump's right edge */}
        {showStack && (
          <div style={deckStack}>
            {Array.from({ length: stackLayers }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `translate(${i * -1}px, ${i * -1}px)`,
                  zIndex: stackLayers - i,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  borderRadius: '6px',
                }}
              >
                <CardBack />
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Count, centered under the deck stack (deck is anchored to the
          right of the arrangement, so the count wrapper sits there too). */}
      <div style={countWrapper}>
        <span style={deckCountPill}>{deckCount}</span>
      </div>
    </div>
  );
}

// Captured pile — uses Scopa's CapturedPile CSS module verbatim so it looks
// identical, but its stats row is replaced with a count + point-total pill
// (Briscola has no denari/scopa/sette bello to display).
function BriscolaPile({ captured, label }: { captured: BriscolaCard[]; label: string }) {
  const count = captured.length;
  const points = sumPoints(captured);
  const stackLayers = Math.min(6, Math.max(1, Math.ceil(count / 4)));

  return (
    <div className={pileStyles.pile}>
      <span className={pileStyles.playerLabel}>{label}</span>
      <div className={pileStyles.pileStack}>
        {count === 0 ? (
          <div className={pileStyles.emptyPile}>
            <span>Empty</span>
          </div>
        ) : (
          Array.from({ length: stackLayers }).map((_, i) => (
            <div
              key={i}
              className={pileStyles.stackedCard}
              style={{
                transform: `translate(${i * 1}px, ${i * 1}px)`,
                zIndex: stackLayers - i,
              }}
            >
              <CardBack />
            </div>
          ))
        )}
      </div>
      <div className={pileStyles.pileInfo}>
        <span className={pileStyles.cardCount}>
          {count} · {points} pts
        </span>
      </div>
    </div>
  );
}

function RoundEndOverlay({
  humanPts,
  cpuPts,
  onRestart,
}: {
  humanPts: number;
  cpuPts: number;
  onRestart: () => void;
}) {
  const outcome =
    humanPts > cpuPts ? 'You win!' :
    humanPts < cpuPts ? 'CPU wins!' :
    'Tied at 60.';

  return (
    <div style={overlay}>
      <div style={overlayCard}>
        <h2 style={{ marginTop: 0 }}>{outcome}</h2>
        <p style={{ fontSize: '1.5rem', margin: '0.5rem 0' }}>
          <strong>{humanPts}</strong> — <strong>{cpuPts}</strong>
        </p>
        <p style={{ opacity: 0.7, margin: '0 0 1.5rem 0' }}>
          You vs CPU (out of 120)
        </p>
        <button style={primaryButton} onClick={onRestart}>
          Play Again
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles (kept minimal — most layout comes from GameLayout/CapturedPile CSS modules)
// ---------------------------------------------------------------------------

const fullScreenCenter: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-background, #1A237E)',
  color: 'white',
  fontFamily: 'system-ui, sans-serif',
  padding: '2rem',
  textAlign: 'center',
};

const turnLabelStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'var(--color-text-primary)',
  background: 'rgba(0,0,0,0.2)',
  padding: '0.5rem 1rem',
  borderRadius: '8px',
  fontStyle: 'italic',
};

// 3-column grid: spacer | play area (centered) | deck slot.
// The 1fr columns on either side are equal, so the auto-sized middle column
// (the play area) ends up centered in the available width. The deck sits
// inside the right column, justified to the left of that column so it
// remains visually adjacent to the play area.
const tableGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  width: '100%',
  gap: 'var(--space-4)',
};

const deckSlot: React.CSSProperties = {
  justifySelf: 'start',
  // Push the deck well clear of the play area
  marginLeft: 'calc(var(--card-width) * 0.6)',
};

// Briscola only ever has 0, 1, or 2 cards in the trick area. Custom
// flex container (instead of Scopa's tableArea CSS class which is sized
// for up to 8 cards and uses flex-wrap: wrap) — sized to fit exactly
// 2 cards side-by-side, never wraps to a second row.
//
// IMPORTANT: width is pinned to a fixed value (not min/max) so the
// container never resizes when the trick goes 0 → 1 → 2 → 0 cards.
// With box-sizing: border-box, the width includes the 24px of padding
// and 4px of border, so the content area is exactly enough for two
// card-widths + the gap between them.
const TRICK_AREA_WIDTH = 'calc(2 * var(--card-width) + var(--space-3) + 28px)';
const TRICK_AREA_HEIGHT = 'calc(var(--card-height) + 28px)';

const trickArea: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'nowrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-3)',
  padding: '12px',
  width: TRICK_AREA_WIDTH,
  height: TRICK_AREA_HEIGHT,
  background: 'rgba(0, 0, 0, 0.1)',
  borderRadius: '12px',
  border: '2px dashed rgba(255, 255, 255, 0.15)',
  boxSizing: 'border-box',
  flexShrink: 0,
};

// ---- Briscola deck + trump (─| form: trump sticks out to the LEFT of deck) ----
const deckContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  // The arrangement and count wrapper are aligned to the RIGHT of the column
  // so they sit directly above each other under the deck stack.
  alignItems: 'flex-end',
  gap: '6px',
};

// Outer wrapper for the trump+deck arrangement (trump on left, deck on right).
// Width: deck-width + 50% of trump's rotated width (the visible-to-left portion).
// Height: card-height (same as deck).
const deckTrumpArrangement: React.CSSProperties = {
  position: 'relative',
  width: 'calc(var(--card-width) + var(--card-height) * 0.5)',
  height: 'var(--card-height)',
};

// Deck stack: anchored to the RIGHT of the arrangement, on top.
const deckStack: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 0,
  width: 'var(--card-width)',
  height: 'var(--card-height)',
  zIndex: 2,
};

// Trump card rotated -90° (counterclockwise) so the original card's TOP
// edge ends up on the LEFT — meaning the top of the card faces out to the
// viewer's left as it sticks out from beneath the deck. Positioned so its
// right ~50% is hidden behind the deck and its left ~50% extends visibly.
//   - Pre-rotation wrapper is card-width × card-height
//   - After rotate(-90deg) around center, visual extends ±card-height/2
//     horizontally and ±card-width/2 vertically from the center
//   - The deck's left edge is at x = container.width − card-width = 0.5 × card-height
//   - We want trump's visual center at x = 0.5 × card-height − 0 (centered on
//     deck's left edge), so ~50% hides behind deck and ~50% extends to the left.
//   - Wrapper top-left x = trump_center_x − card-width/2 = 0.5 × card-height − card-width/2
// pointerEvents: 'none' so the trump card never registers mouse hover —
// it's a static visual reference, not an interactive card.
const trumpStickOut: React.CSSProperties = {
  position: 'absolute',
  left: 'calc(var(--card-height) * 0.5 - var(--card-width) / 2)',
  top: 0,
  width: 'var(--card-width)',
  height: 'var(--card-height)',
  transform: 'rotate(-90deg)',
  transformOrigin: 'center',
  zIndex: 1,
  pointerEvents: 'none',
};

// Wrapper around the count pill so it sits centered under the deck stack
// (the deck stack itself is positioned at the right of deckTrumpArrangement).
const countWrapper: React.CSSProperties = {
  width: 'var(--card-width)',
  display: 'flex',
  justifyContent: 'center',
};

const deckCountPill: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  background: 'var(--control-bg, rgba(0, 0, 0, 0.4))',
  padding: '2px 10px',
  borderRadius: '10px',
};

const emptyDeck: React.CSSProperties = {
  width: 'var(--card-width)',
  height: 'var(--card-height)',
  border: '2px dashed var(--dashed-border-color, rgba(255, 255, 255, 0.2))',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--empty-area-bg, transparent)',
};

const emptyDeckLabel: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--empty-label-color, var(--color-text-secondary))',
  opacity: 0.5,
};

// ---- Modals + buttons ----
const primaryButton: React.CSSProperties = {
  background: 'var(--color-accent, #FFD600)',
  color: 'var(--color-background, #1A237E)',
  border: 'none',
  padding: '0.75rem 2rem',
  borderRadius: '6px',
  fontSize: '1.1rem',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const overlayCard: React.CSSProperties = {
  background: '#283593',
  color: 'white',
  padding: '2.5rem',
  borderRadius: '12px',
  textAlign: 'center',
  minWidth: '320px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
};
