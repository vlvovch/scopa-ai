// Briscola AI — slice 7c
//
// Single-player Briscola: human vs heuristicAI, one round.
// - Card flies from hand to play area via shared layoutId animation
// - Trick visible for ~1.2s after the follow card lands
// - Both trick cards then fly toward the winning player's side
// - Deck stack on the right with horizontal trump beneath it
// - No verbose labels

import { useReducer, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../../components/Card/Card';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { DeckProvider } from '../../contexts/DeckContext';
import { applyMove, trickWinner } from './rules';
import { calculateRoundScore } from './scoring';
import { createDeck, shuffleDeck, dealInitialHands } from './deck';
import { heuristicAI } from './ai/heuristic';
import type { Card as BriscolaCard, GameState, Move, PlayerId } from './types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AnimatingTrick {
  /** The card that was led (still in game.round.trick.leadCard until resolve) */
  leadCard: BriscolaCard;
  leader: PlayerId;
  /** The follow card that was just played (removed from hand in `game`) */
  followCard: BriscolaCard;
  follower: PlayerId;
  winner: PlayerId;
  /** The post-resolution game state to apply once the animation finishes */
  resolved: GameState;
}

type AppState =
  | { status: 'idle' }
  | { status: 'playing'; game: GameState }
  | { status: 'animatingTrick'; game: GameState; trick: AnimatingTrick }
  | { status: 'roundEnd'; game: GameState; finalPoints: { human: number; cpu: number } };

type Action =
  | { type: 'START' }
  | { type: 'PLAY'; move: Move }
  | { type: 'RESOLVE_TRICK' };

const TRICK_VISIBLE_MS = 1200;

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

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'START':
      return { status: 'playing', game: newRound() };

    case 'PLAY': {
      if (state.status !== 'playing') return state;
      const { game } = state;
      const { move } = action;

      // Leading the trick (no card on table yet) — apply directly.
      if (game.round.trick.leadCard === null) {
        const next = applyMove(game, move);
        return { status: 'playing', game: next };
      }

      // Following — defer the trick resolution behind an animation.
      // Compute the "visualization" game (follow card removed from follower's
      // hand but trick not yet captured/drawn) and the resolved game.
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
        status: 'animatingTrick',
        game: visualGame,
        trick: {
          leadCard,
          leader,
          followCard: move.cardPlayed,
          follower,
          winner,
          resolved,
        },
      };
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

  // CPU auto-play
  useEffect(() => {
    if (state.status !== 'playing') return;
    const g = state.game;
    if (g.round.currentPlayer !== 'cpu') return;
    if (g.players.cpu.hand.length === 0) return;

    const timer = setTimeout(() => {
      const move = heuristicAI.selectMove({
        hand: g.players.cpu.hand,
        player: 'cpu',
        trump: g.round.trump,
        trumpSuit: g.round.trumpSuit,
        leadCard: g.round.trick.leadCard,
        deckCount: g.round.deck.length,
      });
      dispatch({ type: 'PLAY', move });
    }, 800);

    return () => clearTimeout(timer);
  }, [state]);

  // Trick visualization timer
  useEffect(() => {
    if (state.status !== 'animatingTrick') return;
    const timer = setTimeout(() => dispatch({ type: 'RESOLVE_TRICK' }), TRICK_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const onPlayerCardClick = useCallback(
    (card: BriscolaCard) => {
      if (state.status !== 'playing') return;
      if (state.game.round.currentPlayer !== 'human') return;
      dispatch({ type: 'PLAY', move: { player: 'human', cardPlayed: card } });
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

  // Determine what's in the play area
  const leadCard = animTrick ? animTrick.leadCard : g.round.trick.leadCard;
  const followCard = animTrick ? animTrick.followCard : null;
  const winner = animTrick ? animTrick.winner : null;

  return (
    <div style={styles.board}>
      {/* Top: score + captured counts */}
      <div style={styles.scoreRow}>
        <div style={styles.scoreCell}>
          CPU · {g.players.cpu.captured.length} cards
          {state.status === 'roundEnd' && (
            <> · <strong>{state.finalPoints.cpu} pts</strong></>
          )}
        </div>
        <div style={styles.turnIndicator}>
          {state.status === 'playing' && (isHumanTurn ? 'Your turn' : 'CPU thinking…')}
          {state.status === 'animatingTrick' && (
            animTrick!.winner === 'human' ? 'You take it' : 'CPU takes it'
          )}
        </div>
        <div style={styles.scoreCell}>
          You · {g.players.human.captured.length} cards
          {state.status === 'roundEnd' && (
            <> · <strong>{state.finalPoints.human} pts</strong></>
          )}
        </div>
      </div>

      {/* CPU hand */}
      <div style={styles.handRow}>
        <PlayerHand cards={g.players.cpu.hand} isHuman={false} />
      </div>

      {/* Middle row: play area in the center, deck+trump on the right */}
      <div style={styles.middleRow}>
        <div style={styles.middleSpacer} />
        <div style={styles.playArea}>
          <AnimatePresence>
            {leadCard && (
              <TrickCard
                key={leadCard.id}
                card={leadCard}
                exitToward={winner}
              />
            )}
            {followCard && (
              <TrickCard
                key={followCard.id}
                card={followCard}
                exitToward={winner}
              />
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
          cards={g.players.human.hand}
          isHuman={true}
          onCardClick={onCardClick}
          disabled={!isHumanTurn}
        />
      </div>

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

// A card in the play area. Uses `layoutId={hand-${card.id}}` so framer-motion
// animates its arrival from the player's hand automatically. On exit, slides
// toward the winning player's side and fades.
function TrickCard({
  card,
  exitToward,
}: {
  card: BriscolaCard;
  exitToward: PlayerId | null;
}) {
  // Vertical direction: up for cpu, down for human, no movement if no winner yet
  const exitY = exitToward === 'human' ? 220 : exitToward === 'cpu' ? -220 : 0;

  return (
    <motion.div
      style={styles.trickCardWrap}
      layoutId={`hand-${card.id}`}
      exit={{
        y: exitY,
        opacity: 0,
        scale: 0.7,
        transition: { duration: 0.5, ease: 'easeIn' },
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      <Card card={card} />
    </motion.div>
  );
}

function DeckAndTrump({ deckCount, trump }: { deckCount: number; trump: BriscolaCard }) {
  // The trump is only visible while there's still at least one card to draw
  // (when deckCount === 0 it's been drawn into someone's hand).
  const showTrump = deckCount > 0;
  // The deck stack visually pretends to have multiple cards if deckCount > 1
  const showDeck = deckCount > 1;

  return (
    <div style={styles.deckArea}>
      <div style={styles.deckTrumpStack}>
        {showTrump && (
          <div style={styles.trumpHorizontal}>
            <Card card={trump} />
          </div>
        )}
        {showDeck && (
          <div style={styles.deckStack}>
            <Card card={null} faceDown />
            <div style={styles.deckCountBadge}>{deckCount - (showTrump ? 1 : 0)}</div>
          </div>
        )}
        {!showDeck && showTrump && (
          // Only the trump remains — about to be drawn
          <div style={styles.deckCountBadgeAlone}>1 left</div>
        )}
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
// Inline styles (proper CSS modules in a future slice)
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
  scoreRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 1rem',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '8px',
    marginBottom: '0.5rem',
  },
  scoreCell: { fontSize: '1rem' },
  turnIndicator: { fontSize: '0.95rem', opacity: 0.8, fontStyle: 'italic' },
  handRow: {
    display: 'flex',
    justifyContent: 'center',
    minHeight: 'var(--card-height, 180px)',
    margin: '0.25rem 0',
  },
  middleRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    flex: 1,
    gap: '1rem',
    padding: '0 1rem',
  },
  middleSpacer: {},
  playArea: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 'var(--card-width, 120px)',
    minHeight: 'var(--card-height, 180px)',
  },
  trickCardWrap: {
    // Inherit card size via the Card component's own CSS
  },
  deckArea: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  deckTrumpStack: {
    position: 'relative' as const,
    display: 'inline-block',
    paddingLeft: '60px', // leave room for the horizontal trump on the left side of the deck
  },
  deckStack: {
    position: 'relative' as const,
  },
  trumpHorizontal: {
    position: 'absolute' as const,
    left: '-30px',
    top: '50%',
    transform: 'translateY(-50%) rotate(90deg)',
    transformOrigin: 'center',
    zIndex: 1,
  },
  deckCountBadge: {
    position: 'absolute' as const,
    top: '-8px',
    right: '-8px',
    background: '#FFD600',
    color: '#1A237E',
    borderRadius: '999px',
    minWidth: '28px',
    height: '28px',
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold' as const,
    fontSize: '0.9rem',
    zIndex: 2,
  },
  deckCountBadgeAlone: {
    background: 'rgba(255,255,255,0.15)',
    padding: '0.25rem 0.75rem',
    borderRadius: '4px',
    fontSize: '0.85rem',
  },
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
