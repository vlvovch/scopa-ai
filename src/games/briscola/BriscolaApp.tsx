// Briscola AI — slice 7a skeleton
//
// Minimal playable single-player Briscola: human vs heuristicAI, one round,
// click to play, simple round-end overlay. No animations, no LLM bots,
// no multiplayer, no settings — those come in 7b/7c.

import { useReducer, useCallback, useEffect } from 'react';
import { Card } from '../../components/Card/Card';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { DeckProvider } from '../../contexts/DeckContext';
import { applyMove } from './rules';
import { calculateRoundScore } from './scoring';
import { createDeck, shuffleDeck, dealInitialHands } from './deck';
import { heuristicAI } from './ai/heuristic';
import type { Card as BriscolaCard, GameState, Move, PlayerId } from './types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AppState {
  status: 'idle' | 'playing' | 'roundEnd';
  game: GameState | null;
  finalPoints: { human: number; cpu: number } | null;
}

type Action =
  | { type: 'START' }
  | { type: 'PLAY'; move: Move };

function initialAppState(): AppState {
  return { status: 'idle', game: null, finalPoints: null };
}

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
      currentPlayer: 'human', // non-dealer leads
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
      return { status: 'playing', game: newRound(), finalPoints: null };

    case 'PLAY': {
      if (state.status !== 'playing' || !state.game) return state;
      const next = applyMove(state.game, action.move);
      if (next.status === 'roundEnd') {
        const human = calculateRoundScore(
          next.players.human.captured,
          next.players.cpu.captured
        );
        const cpu = calculateRoundScore(
          next.players.cpu.captured,
          next.players.human.captured
        );
        return {
          status: 'roundEnd',
          game: next,
          finalPoints: { human: human.points, cpu: cpu.points },
        };
      }
      return { ...state, game: next };
    }
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function BriscolaApp() {
  const [state, dispatch] = useReducer(reducer, undefined, initialAppState);

  // CPU auto-play loop — runs whenever it's the CPU's turn during play
  useEffect(() => {
    if (state.status !== 'playing' || !state.game) return;
    if (state.game.round.currentPlayer !== 'cpu') return;
    if (state.game.players.cpu.hand.length === 0) return;

    const timer = setTimeout(() => {
      const g = state.game!;
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

  const onPlayerCardClick = useCallback(
    (card: BriscolaCard) => {
      if (state.status !== 'playing' || !state.game) return;
      if (state.game.round.currentPlayer !== 'human') return;
      dispatch({ type: 'PLAY', move: { player: 'human', cardPlayed: card } });
    },
    [state]
  );

  if (state.status === 'idle' || !state.game) {
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
// Subcomponents
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
  state: AppState;
  onCardClick: (card: BriscolaCard) => void;
  onRestart: () => void;
}) {
  const g = state.game!;
  const { trump, trick, deck, currentPlayer } = g.round;
  const humanCaptured = g.players.human.captured.length;
  const cpuCaptured = g.players.cpu.captured.length;
  const isHumanTurn = currentPlayer === 'human';
  const isPlaying = state.status === 'playing';

  return (
    <div style={styles.board}>
      {/* Top: scoreboard */}
      <div style={styles.scoreRow}>
        <div style={styles.scoreCell}>
          <strong>CPU</strong> · {cpuCaptured} captured
          {state.finalPoints && <> · <strong>{state.finalPoints.cpu} pts</strong></>}
        </div>
        <div style={styles.turnIndicator}>
          {isPlaying && (isHumanTurn ? 'Your turn' : 'CPU thinking…')}
          {state.status === 'roundEnd' && 'Round over'}
        </div>
        <div style={styles.scoreCell}>
          <strong>You</strong> · {humanCaptured} captured
          {state.finalPoints && <> · <strong>{state.finalPoints.human} pts</strong></>}
        </div>
      </div>

      {/* CPU hand (face down) */}
      <div style={styles.handRow}>
        <PlayerHand cards={g.players.cpu.hand} isHuman={false} />
      </div>

      {/* Middle: trump on the left, trick area center, deck count right */}
      <div style={styles.middleRow}>
        <TrumpDisplay trump={trump} deckEmpty={deck.length === 0} />
        <TrickArea trick={trick} />
        <DeckCount count={deck.length} />
      </div>

      {/* Player hand (clickable) */}
      <div style={styles.handRow}>
        <PlayerHand
          cards={g.players.human.hand}
          isHuman={true}
          onCardClick={onCardClick}
          disabled={!isHumanTurn || !isPlaying}
        />
      </div>

      {/* Round-end overlay */}
      {state.status === 'roundEnd' && state.finalPoints && (
        <RoundEndOverlay
          humanPts={state.finalPoints.human}
          cpuPts={state.finalPoints.cpu}
          onRestart={onRestart}
        />
      )}
    </div>
  );
}

function TrumpDisplay({ trump, deckEmpty }: { trump: BriscolaCard; deckEmpty: boolean }) {
  return (
    <div style={styles.trumpArea}>
      <div style={styles.label}>Briscola</div>
      <Card card={trump} />
      {deckEmpty && <div style={styles.lastCardNote}>(last card drawn)</div>}
    </div>
  );
}

function TrickArea({ trick }: { trick: { leadCard: BriscolaCard | null; leader: PlayerId } }) {
  return (
    <div style={styles.trickArea}>
      <div style={styles.label}>{trick.leadCard ? `${trick.leader === 'human' ? 'You' : 'CPU'} led` : 'Trick'}</div>
      {trick.leadCard ? (
        <Card card={trick.leadCard} />
      ) : (
        <div style={styles.placeholderCard}>empty</div>
      )}
    </div>
  );
}

function DeckCount({ count }: { count: number }) {
  return (
    <div style={styles.deckCountArea}>
      <div style={styles.label}>Deck</div>
      <div style={styles.deckBadge}>{count}</div>
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
// Inline styles (skeleton — proper CSS modules in 7c)
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
    marginBottom: '1rem',
  },
  scoreCell: { fontSize: '1rem' },
  turnIndicator: { fontSize: '0.95rem', opacity: 0.8, fontStyle: 'italic' },
  handRow: {
    display: 'flex',
    justifyContent: 'center',
    minHeight: 'var(--card-height, 180px)',
    margin: '0.5rem 0',
  },
  middleRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '3rem',
    flex: 1,
    minHeight: 'var(--card-height, 180px)',
  },
  trumpArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  },
  trickArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: 'var(--card-width, 120px)',
  },
  deckCountArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  },
  label: { fontSize: '0.85rem', opacity: 0.7, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  lastCardNote: { fontSize: '0.75rem', opacity: 0.6 },
  placeholderCard: {
    width: 'var(--card-width, 120px)',
    height: 'var(--card-height, 180px)',
    border: '2px dashed rgba(255,255,255,0.2)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
    fontSize: '0.9rem',
  },
  deckBadge: {
    width: 'var(--card-width, 120px)',
    height: 'var(--card-height, 180px)',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.5rem',
    fontWeight: 'bold',
    border: '2px solid rgba(255,255,255,0.2)',
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
