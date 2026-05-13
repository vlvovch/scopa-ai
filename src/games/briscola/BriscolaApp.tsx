// Briscola AI — slice 7c (revised)
//
// Single-player Briscola: human vs heuristicAI, one round.
// Animation flow mirrors Scopa's:
//   - CPU plays via CpuCardAnimation: reveal (600ms flip in place) →
//     moving (500ms slide to play area)
//   - Human plays: card flies from hand to play area via shared layoutId
//   - Trick resolves: both cards exit toward the winner's side (900ms),
//     after a 1200ms hold so the player can see what happened
//
// Layout: deck stack centered-right, trump card rotated 90° beneath the
// deck with the lower half visible (classic Briscola table setup).

import { useReducer, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../../components/Card/Card';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { CpuCardAnimation } from '../../components/UI/CpuCardAnimation';
import { DeckProvider } from '../../contexts/DeckContext';
import { applyMove, trickWinner } from './rules';
import { calculateRoundScore, sumPoints } from './scoring';
import { createDeck, shuffleDeck, dealInitialHands } from './deck';
import { heuristicAI } from './ai/heuristic';
import type { Card as BriscolaCard, GameState, Move, PlayerId } from './types';

// ---------------------------------------------------------------------------
// Timing constants — matched to Scopa's CpuCardAnimation phases
// ---------------------------------------------------------------------------

const CPU_REVEAL_MS = 600;
const CPU_MOVE_MS = 500;
const CPU_DECISION_DELAY_MS = 600;
const TRICK_VISIBLE_MS = 1200;
const CAPTURE_DURATION_MS = 900;

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
  | { status: 'playing'; game: GameState }
  | {
      status: 'cpuAnimating';
      game: GameState; // unchanged from before the move
      cpuMove: Move;
      phase: 'reveal' | 'moving';
    }
  | { status: 'animatingTrick'; game: GameState; trick: AnimatingTrick }
  | { status: 'roundEnd'; game: GameState; finalPoints: { human: number; cpu: number } };

type Action =
  | { type: 'START' }
  | { type: 'HUMAN_PLAY'; move: Move }
  | { type: 'CPU_START'; move: Move }
  | { type: 'CPU_PHASE_MOVING' }
  | { type: 'CPU_APPLY' }
  | { type: 'RESOLVE_TRICK' };

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

/**
 * Apply the move logically. If it completes a trick, return a synthetic
 * "midway" game (follow card removed from hand, but trick not yet captured)
 * along with the fully-resolved game to apply after the animation.
 */
function applyOrDeferTrick(game: GameState, move: Move):
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
    pending: {
      leadCard,
      leader,
      followCard: move.cardPlayed,
      follower,
      winner,
      resolved,
    },
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'START':
      return { status: 'playing', game: newRound() };

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

    case 'CPU_PHASE_MOVING': {
      if (state.status !== 'cpuAnimating') return state;
      return { ...state, phase: 'moving' };
    }

    case 'CPU_APPLY': {
      if (state.status !== 'cpuAnimating') return state;
      const r = applyOrDeferTrick(state.game, state.cpuMove);
      return r.kind === 'direct'
        ? { status: 'playing', game: r.next }
        : { status: 'animatingTrick', game: r.visualGame, trick: r.pending };
    }

    case 'RESOLVE_TRICK': {
      if (state.status !== 'animatingTrick') return state;
      const resolved = state.trick.resolved;
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
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function BriscolaApp() {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' } as AppState);

  // CPU decision + animation orchestration
  useEffect(() => {
    if (state.status !== 'playing') return;
    if (state.game.round.currentPlayer !== 'cpu') return;
    if (state.game.players.cpu.hand.length === 0) return;

    const g = state.game;
    const timer = setTimeout(() => {
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
    return () => clearTimeout(timer);
  }, [state]);

  // cpuAnimating: reveal (600ms) → moving (500ms) → apply
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

  // animatingTrick: hold for 1200ms, then resolve (exit animations run during
  // the resolve transition over CAPTURE_DURATION_MS)
  useEffect(() => {
    if (state.status !== 'animatingTrick') return;
    const t = setTimeout(() => dispatch({ type: 'RESOLVE_TRICK' }), TRICK_VISIBLE_MS);
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
    <div style={styles.fullScreenCenter}>
      <h1 style={{ fontSize: '3rem', margin: 0 }}>Briscola AI</h1>
      <p style={{ opacity: 0.8, margin: '0.5rem 0 2rem 0' }}>
        Play against a heuristic CPU
      </p>
      <button style={styles.primaryButton} onClick={onStart}>
        Start Game
      </button>
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
  const g = state.game;
  const isHumanTurn = state.status === 'playing' && g.round.currentPlayer === 'human';
  const animTrick = state.status === 'animatingTrick' ? state.trick : null;
  const cpuAnim = state.status === 'cpuAnimating' ? state : null;

  // Hide the CPU's animating card from the visible hand
  const cpuHand =
    cpuAnim
      ? g.players.cpu.hand.filter(c => c.id !== cpuAnim.cpuMove.cardPlayed.id)
      : g.players.cpu.hand;
  // Same for human if they're following (already removed by applyOrDeferTrick
  // into visualGame.hand, so this is a no-op there).
  const humanHand = g.players.human.hand;

  // Determine what's in the play area
  // - playing: just the lead card (if any) of the in-progress trick
  // - cpuAnimating: lead card if CPU is following (their card is on the overlay)
  // - animatingTrick: both lead and follow visible
  const leadCard = g.round.trick.leadCard;
  const followCard = animTrick ? animTrick.followCard : null;
  const winner = animTrick ? animTrick.winner : null;

  return (
    <div style={styles.board}>
      {/* Top row: turn indicator on the left, CPU pile in the top-right */}
      <div style={styles.topRow}>
        <div style={styles.turnIndicator}>
          {state.status === 'playing' && (isHumanTurn ? 'Your turn' : 'CPU thinking…')}
          {state.status === 'cpuAnimating' && 'CPU plays…'}
          {state.status === 'animatingTrick' && (
            winner === 'human' ? 'You take it' : 'CPU takes it'
          )}
        </div>
        <CapturedPile
          captured={g.players.cpu.captured}
          label="CPU"
        />
      </div>

      {/* CPU hand */}
      <div style={styles.handRow}>
        <PlayerHand cards={cpuHand} isHuman={false} />
      </div>

      {/* Middle row: play area centered with deck just to its right */}
      <div style={styles.middleRow}>
        <div style={styles.playArea}>
          <AnimatePresence>
            {leadCard && (
              <TrickCard key={leadCard.id} card={leadCard} exitToward={winner} />
            )}
            {followCard && (
              <TrickCard key={followCard.id} card={followCard} exitToward={winner} />
            )}
          </AnimatePresence>
        </div>
        <DeckAndTrump
          deckCount={g.round.deck.length}
          trump={g.round.trump}
        />
      </div>

      {/* Human hand */}
      <div style={styles.handRow}>
        <PlayerHand
          cards={humanHand}
          isHuman={true}
          onCardClick={onCardClick}
          disabled={!isHumanTurn}
        />
      </div>

      {/* Bottom row: human pile on the left */}
      <div style={styles.bottomRow}>
        <CapturedPile
          captured={g.players.human.captured}
          label="You"
        />
        <div />
      </div>

      {/* CPU reveal/move overlay (same component Scopa uses) */}
      <CpuCardAnimation
        card={cpuAnim?.cpuMove.cardPlayed ?? null}
        phase={cpuAnim?.phase ?? null}
        capturedCardIds={[]}
        player={cpuAnim ? 'cpu' : undefined}
      />

      {/* Round-end overlay */}
      {state.status === 'roundEnd' && (
        <RoundEndOverlay
          humanPts={state.finalPoints.human}
          cpuPts={state.finalPoints.cpu}
          onRestart={onRestart}
        />
      )}
    </div>
  );
}

function CapturedPile({
  captured,
  label,
}: {
  captured: BriscolaCard[];
  label: string;
}) {
  const count = captured.length;
  const points = sumPoints(captured);
  // Visual stack depth grows with pile size (max 5 layers, like Scopa)
  const stackLayers = Math.min(5, Math.max(1, Math.ceil(count / 6)));

  return (
    <div style={styles.pile}>
      <span style={styles.pileLabel}>{label}</span>
      <div style={styles.pileStack}>
        {count === 0 ? (
          <div style={styles.emptyDeck}><span style={styles.emptyLabel}>Empty</span></div>
        ) : (
          Array.from({ length: stackLayers }).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute' as const,
                top: 0,
                left: 0,
                transform: `translate(${i}px, ${i}px)`,
                zIndex: stackLayers - i,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                borderRadius: '6px',
              }}
            >
              <Card card={null} faceDown />
            </div>
          ))
        )}
      </div>
      <span style={styles.pileCount}>{count} · {points} pts</span>
    </div>
  );
}

function TrickCard({
  card,
  exitToward,
}: {
  card: BriscolaCard;
  exitToward: PlayerId | null;
}) {
  // Cards fly toward the corner pile of the winning player.
  // CPU pile: top-right.    Human pile: bottom-left.
  const exitY = exitToward === 'human' ? 220 : exitToward === 'cpu' ? -220 : 0;
  const exitX = exitToward === 'human' ? -240 : exitToward === 'cpu' ? 240 : 0;

  return (
    <motion.div
      layoutId={`hand-${card.id}`}
      exit={{
        x: exitX,
        y: exitY,
        opacity: 0,
        scale: 0.7,
        transition: { duration: CAPTURE_DURATION_MS / 1000, ease: 'easeIn' },
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      <Card card={card} />
    </motion.div>
  );
}

function DeckAndTrump({ deckCount, trump }: { deckCount: number; trump: BriscolaCard }) {
  // deckCount includes the trump at the bottom. When deckCount > 0 there's a
  // physical trump card on the table (face-up beneath the stack). When the
  // stack is exhausted to 1 card it IS the trump — show it on its own.
  const showTrump = deckCount > 0;
  const showStack = deckCount > 1;
  const stackLayers = Math.max(1, Math.min(5, Math.ceil((deckCount - 1) / 8)));

  if (!showTrump) {
    return (
      <div style={styles.deckContainer}>
        <div style={styles.emptyDeck}>
          <span style={styles.emptyLabel}>Empty</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.deckContainer}>
      <div style={styles.deckStackWrap}>
        {/* Trump card, rotated 90°, behind and below the deck stack */}
        <div style={styles.trumpRotated}>
          <Card card={trump} />
        </div>

        {/* Deck stack on top of the trump */}
        {showStack ? (
          <div style={styles.deckStack}>
            {Array.from({ length: stackLayers }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute' as const,
                  top: 0,
                  left: 0,
                  transform: `translate(${i * -1}px, ${i * -1}px)`,
                  zIndex: stackLayers - i,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  borderRadius: '6px',
                }}
              >
                <Card card={null} faceDown />
              </div>
            ))}
          </div>
        ) : (
          // Only the trump remains — render a transparent spacer so the count
          // pill sits in the right place below where the deck normally is.
          <div style={styles.deckStack} />
        )}
      </div>
      <span style={styles.cardCount}>{deckCount}</span>
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
    <div style={styles.overlay}>
      <div style={styles.overlayCard}>
        <h2 style={{ marginTop: 0 }}>{outcome}</h2>
        <p style={{ fontSize: '1.5rem', margin: '0.5rem 0' }}>
          <strong>{humanPts}</strong> — <strong>{cpuPts}</strong>
        </p>
        <p style={{ opacity: 0.7, margin: '0 0 1.5rem 0' }}>
          You vs CPU (out of 120)
        </p>
        <button style={styles.primaryButton} onClick={onRestart}>
          Play Again
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const styles = {
  fullScreenCenter: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1A237E',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    padding: '2rem',
    textAlign: 'center',
  },
  board: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#1A237E',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    padding: '1rem',
    position: 'relative',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '0.25rem 0.5rem',
    marginBottom: '0.25rem',
    minHeight: 'calc(var(--card-height, 180px) * 0.7)',
  },
  bottomRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: '0.25rem 0.5rem',
    marginTop: '0.25rem',
    minHeight: 'calc(var(--card-height, 180px) * 0.7)',
  },
  turnIndicator: {
    fontSize: '0.95rem',
    opacity: 0.8,
    fontStyle: 'italic',
    alignSelf: 'center',
    padding: '0.5rem 1rem',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '8px',
  },
  // ---- Captured pile ----
  pile: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '4px',
  },
  pileLabel: {
    fontSize: '10px',
    opacity: 0.7,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  pileStack: {
    position: 'relative' as const,
    width: 'var(--card-width, 120px)',
    height: 'calc(var(--card-height, 180px) * 1.08)',
  },
  pileCount: {
    fontSize: '12px',
    fontWeight: 'bold' as const,
    background: 'rgba(0, 0, 0, 0.3)',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  handRow: {
    display: 'flex',
    justifyContent: 'center',
    minHeight: 'var(--card-height, 180px)',
    margin: '0.25rem 0',
  },
  middleRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    gap: '3rem',
    padding: '0 1rem',
  },
  playArea: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 'var(--card-width, 120px)',
    minHeight: 'var(--card-height, 180px)',
  },
  // ---- Deck + trump ----
  deckContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '6px',
  },
  deckStackWrap: {
    position: 'relative' as const,
    width: 'var(--card-width, 120px)',
    height: 'var(--card-height, 180px)',
    // Reserve room below the stack for the trump's exposed half.
    // The trump (rotated 90°) has a visual half-height of card-width / 2.
    marginBottom: 'calc(var(--card-width, 120px) / 2)',
  },
  deckStack: {
    position: 'relative' as const,
    width: 'var(--card-width, 120px)',
    height: 'var(--card-height, 180px)',
    zIndex: 2,
  },
  trumpRotated: {
    // Position the trump card so its CENTER sits at the BOTTOM edge of the
    // deck stack. After rotate(90deg), its visual extends ±(card-width / 2)
    // vertically from that center, so the upper half is hidden behind the
    // deck stack (z-index 1 < 2) and the lower half is visible below.
    position: 'absolute' as const,
    left: '50%',
    top: '100%',
    width: 'var(--card-width, 120px)',
    height: 'var(--card-height, 180px)',
    transform: 'translate(-50%, -50%) rotate(90deg)',
    zIndex: 1,
  },
  emptyDeck: {
    width: 'var(--card-width, 120px)',
    height: 'var(--card-height, 180px)',
    border: '2px dashed rgba(255,255,255,0.2)',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLabel: { fontSize: '10px', opacity: 0.5 },
  cardCount: {
    fontSize: '14px',
    fontWeight: 600,
    background: 'rgba(0, 0, 0, 0.4)',
    padding: '2px 10px',
    borderRadius: '10px',
  },
  // ---- Modals + buttons ----
  primaryButton: {
    background: '#FFD600',
    color: '#1A237E',
    border: 'none',
    padding: '0.75rem 2rem',
    borderRadius: '6px',
    fontSize: '1.1rem',
    fontWeight: 'bold' as const,
    cursor: 'pointer' as const,
  },
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  overlayCard: {
    background: '#283593',
    padding: '2.5rem',
    borderRadius: '12px',
    textAlign: 'center' as const,
    minWidth: '320px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
} as const;
