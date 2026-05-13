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
import { GameLayout } from '../../components/Layout/GameLayout';
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
      game: GameState;
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
  const g = state.game;
  const isHumanTurn = state.status === 'playing' && g.round.currentPlayer === 'human';
  const animTrick = state.status === 'animatingTrick' ? state.trick : null;
  const cpuAnim = state.status === 'cpuAnimating' ? state : null;

  // Hide the CPU's animating card from the visible hand (it's on the overlay)
  const cpuHand = cpuAnim
    ? g.players.cpu.hand.filter(c => c.id !== cpuAnim.cpuMove.cardPlayed.id)
    : g.players.cpu.hand;
  const humanHand = g.players.human.hand;

  const leadCard = g.round.trick.leadCard;
  const followCard = animTrick ? animTrick.followCard : null;
  const winner = animTrick ? animTrick.winner : null;

  return (
    <>
      <GameLayout
        scoreBoard={
          <div style={turnLabelStyle}>
            {state.status === 'playing' && (isHumanTurn ? 'Your turn' : 'CPU thinking…')}
            {state.status === 'cpuAnimating' && 'CPU plays…'}
            {state.status === 'animatingTrick' &&
              (winner === 'human' ? 'You take it' : 'CPU takes it')}
            {state.status === 'roundEnd' && 'Round over'}
          </div>
        }
        cpuPile={
          <BriscolaPile
            captured={g.players.cpu.captured}
            label="CPU"
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
      />

      {/* CPU reveal/move overlay (same component Scopa uses) */}
      <CpuCardAnimation
        card={cpuAnim?.cpuMove.cardPlayed ?? null}
        phase={cpuAnim?.phase ?? null}
        capturedCardIds={[]}
        player={cpuAnim ? 'cpu' : undefined}
      />

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
    <div style={tableContainer}>
      <BriscolaDeck deckCount={deckCount} trump={trump} />
      <div style={trickArea}>
        <AnimatePresence>
          {leadCard && <TrickCard key={leadCard.id} card={leadCard} exitToward={winner} />}
          {followCard && <TrickCard key={followCard.id} card={followCard} exitToward={winner} />}
        </AnimatePresence>
      </div>
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

// Deck stack with the trump card rotated 90° beneath it.
// The trump's pre-rotation vertical center sits at the deck's bottom edge,
// so after rotate(90deg) its visual extends ±card-width/2 vertically: the
// upper half is hidden behind the deck stack (z-index), the lower half
// sticks out below.
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
  // Only render the face-down deck stack when there's more than just the trump
  const showStack = deckCount > 1;

  return (
    <div style={deckContainer}>
      <div style={deckStackWrap}>
        {/* Trump rotated 90°, half tucked behind the deck */}
        <div style={trumpRotated}>
          <Card card={trump} />
        </div>

        {/* Deck stack on top */}
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
      <span style={deckCountPill}>{deckCount}</span>
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

// ---- Briscola table (center area) ----
const tableContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-4)',
};

const trickArea: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'center',
  alignItems: 'center',
  minWidth: 'var(--card-width, 120px)',
  minHeight: 'var(--card-height, 180px)',
  padding: '8px',
  background: 'var(--table-area-bg, rgba(0, 0, 0, 0.1))',
  borderRadius: '12px',
  border: '2px dashed var(--dashed-border-color, rgba(255, 255, 255, 0.1))',
};

// ---- Briscola deck + trump ----
const deckContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
};

const deckStackWrap: React.CSSProperties = {
  position: 'relative',
  width: 'var(--card-width)',
  // Reserve extra space below for the trump's visible half
  marginBottom: 'calc(var(--card-width) / 2)',
};

const deckStack: React.CSSProperties = {
  position: 'relative',
  width: 'var(--card-width)',
  height: 'var(--card-height)',
  zIndex: 2,
};

const trumpRotated: React.CSSProperties = {
  // Trump's pre-rotation center sits at the deck's bottom edge.
  // After rotate(90deg) around center, the trump's visual extends
  // ±card-width/2 vertically — half hidden behind the deck, half visible.
  position: 'absolute',
  top: 'calc(var(--card-height) / 2)',
  left: 0,
  width: 'var(--card-width)',
  height: 'var(--card-height)',
  transform: 'rotate(90deg)',
  transformOrigin: 'center',
  zIndex: 1,
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
