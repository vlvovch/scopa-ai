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

import { useReducer, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { Card } from '../../components/Card/Card';
import { CardBack, CardImage } from '../../components/Card/CardImage';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { CpuCardAnimation } from '../../components/UI/CpuCardAnimation';
import { DealingAnimation, DEALING_HANDS_DURATION } from '../../components/UI/DealingAnimation';
import dealStyles from '../../components/UI/DealingAnimation.module.css';
import { GameLayout } from '../../components/Layout/GameLayout';
import { ScoreBoard } from '../../components/UI/ScoreBoard';
import { DeckProvider } from '../../contexts/DeckContext';
import pileStyles from '../../components/Table/CapturedPile.module.css';
import modalStyles from '../../components/UI/CapturedCardsModal.module.css';
import { applyMove, trickWinner } from './rules';
import { calculateRoundScore, sumPoints } from './scoring';
import { createDeck, shuffleDeck, dealInitialHands } from './deck';
import { POINT_VALUES } from './constants';
import {
  StartScreen,
  type CpuBotName,
  type BriscolaOpponentName,
  type BriscolaGameMode,
} from './StartScreen';
import { SettingsModal } from '../../components/UI/SettingsModal';
import {
  StatsModal,
  type StatsModalOpponent,
  type StatsModalGame,
} from '../../components/UI/StatsModal';
import { RulesModal } from '../../components/UI/RulesModal';
import { ConfirmDialog } from '../../components/UI/ConfirmDialog';
import { ReasoningModal, type LastMoveData } from '../../components/UI/ReasoningModal';
import { ThinkingBubble } from '../../components/UI/ThinkingBubble';
import { useSettings, SPEED_MULTIPLIER } from '../../hooks/useSettings';
import { useBriscolaStats } from './hooks/useStats';
import { GameControls } from '../../components/UI/GameControls';
import { heuristicAI } from './ai/heuristic';
import { randomAI } from './ai/random';
import { expertAI } from './ai/expert';
import {
  getGeminiFreeBriscolaAI,
  startGeminiFreeRound,
  endGeminiFreeRound,
  newGeminiFreeGame,
  getGeminiFreeTokenStats,
  getGeminiFreeTokenDelta,
  RateLimitError,
} from './ai/gemini-free';
import {
  getGeminiBriscolaAI,
  startGeminiRound,
  endGeminiRound,
  getGeminiBriscolaTokenStats,
  getGeminiBriscolaTokenDelta,
  DEFAULT_GEMINI_MODEL,
} from './ai/gemini';
import {
  getOpenAIBriscolaAI,
  startOpenAIRound,
  endOpenAIRound,
  getOpenAIBriscolaTokenStats,
  getOpenAIBriscolaTokenDelta,
  DEFAULT_OPENAI_MODEL,
} from './ai/openai';
import {
  getClaudeBriscolaAI,
  startClaudeRound,
  endClaudeRound,
  getClaudeBriscolaTokenStats,
  getClaudeBriscolaTokenDelta,
  DEFAULT_CLAUDE_MODEL,
} from './ai/claude';
import { TokenStatsDisplay } from '../../components/UI/TokenStatsDisplay';
import type { GeminiTokenStats, GeminiTokenDelta, ExtendedAIType } from '../scopa/ai';
import {
  getAIDisplayNameText,
  AIPlayerLabel,
} from '../../components/UI/AIPlayerLabel';
import { isAsyncAI, type AnyAIPlayer, type LLMAIContext } from './ai/types';
import type { AIPlayer } from './ai/types';
import { useSound } from '../../hooks/useSound';
import type { Card as BriscolaCard, GameState, Move, PlayerId } from './types';

// ---------------------------------------------------------------------------
// Timing — matches Scopa's CpuCardAnimation phases
// ---------------------------------------------------------------------------

const CPU_REVEAL_MS = 600;
const CPU_MOVE_MS = 500;
const CPU_DECISION_DELAY_MS = 600;
const TRICK_VISIBLE_MS = 900;     // was 1200 — tightened pause before capture
const CAPTURE_DURATION_MS = 550;  // was 900 — quicker fly to pile
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
  | {
      // A round has finished. game.scores has been updated to reflect the
      // round result. matchOver is true if either side has reached the
      // wins-needed threshold for the match.
      status: 'roundEnd';
      game: GameState;
      finalPoints: { human: number; cpu: number };
      roundWinner: PlayerId | 'tie';
      matchOver: boolean;
    };

type Action =
  | { type: 'START'; bestOf: number }
  | { type: 'RESET' }
  | { type: 'DEAL_COMPLETE' }
  | { type: 'HUMAN_PLAY'; move: Move }
  | { type: 'CPU_START'; move: Move }
  | { type: 'CPU_PHASE_MOVING' }
  | { type: 'CPU_APPLY' }
  | { type: 'RESOLVE_TRICK' }
  | { type: 'DRAW_COMPLETE' }
  | { type: 'NEXT_ROUND' };

function newRound(
  bestOf: number,
  prevScores: Record<PlayerId, number> = { human: 0, cpu: 0 },
  roundNumber: number = 1,
  dealer: PlayerId = 'cpu',
  prevHistory: GameState['roundHistory'] = []
): GameState {
  const deck = shuffleDeck(createDeck());
  const init = dealInitialHands(deck, dealer);
  // Non-dealer leads the first trick in Briscola
  const leader: PlayerId = dealer === 'human' ? 'cpu' : 'human';
  return {
    status: 'playing',
    round: {
      deck: init.deck,
      trump: init.trump,
      trumpSuit: init.trump.suit,
      trick: { leadCard: null, leader },
      currentPlayer: leader,
      dealer,
    },
    players: {
      human: { hand: init.hands.human, captured: [] },
      cpu: { hand: init.hands.cpu, captured: [] },
    },
    scores: prevScores,
    roundNumber,
    // targetScore = number of round wins needed to take the match
    targetScore: winsNeeded(bestOf),
    roundHistory: prevHistory,
  };
}

/**
 * Build the roundEnd state from a finished game: figure out who won this
 * round, increment that player's round-win tally on the GameState's scores,
 * and decide whether the match is over.
 */
function buildRoundEnd(finishedGame: GameState): Extract<AppState, { status: 'roundEnd' }> {
  const humanScore = calculateRoundScore(
    finishedGame.players.human.captured,
    finishedGame.players.cpu.captured
  );
  const cpuScore = calculateRoundScore(
    finishedGame.players.cpu.captured,
    finishedGame.players.human.captured
  );
  let roundWinner: PlayerId | 'tie';
  if (humanScore.points > cpuScore.points) roundWinner = 'human';
  else if (cpuScore.points > humanScore.points) roundWinner = 'cpu';
  else roundWinner = 'tie';

  const nextScores: Record<PlayerId, number> = { ...finishedGame.scores };
  if (roundWinner !== 'tie') nextScores[roundWinner] += 1;

  const matchOver =
    nextScores.human >= finishedGame.targetScore ||
    nextScores.cpu >= finishedGame.targetScore;

  const roundHistory = [
    ...finishedGame.roundHistory,
    { playerPoints: humanScore.points, cpuPoints: cpuScore.points },
  ];

  return {
    status: 'roundEnd',
    game: { ...finishedGame, scores: nextScores, roundHistory },
    finalPoints: { human: humanScore.points, cpu: cpuScore.points },
    roundWinner,
    matchOver,
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
      return { status: 'dealing', game: newRound(action.bestOf) };

    case 'RESET':
      return { status: 'idle' };

    case 'NEXT_ROUND': {
      if (state.status !== 'roundEnd' || state.matchOver) return state;
      const prev = state.game;
      // Alternate dealer each round
      const nextDealer: PlayerId = prev.round.dealer === 'human' ? 'cpu' : 'human';
      // bestOf now equals targetScore (both are "wins needed").
      const bestOf = prev.targetScore;
      return {
        status: 'dealing',
        game: newRound(bestOf, prev.scores, prev.roundNumber + 1, nextDealer, prev.roundHistory),
      };
    }

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
          return buildRoundEnd(resolved);
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
        return buildRoundEnd(post);
      }
      return { status: 'playing', game: post };
    }
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const CPU_BOTS: Record<CpuBotName, AIPlayer> = {
  random: randomAI,
  heuristic: heuristicAI,
  expert: expertAI,
};
const BOT_LABELS: Record<BriscolaOpponentName, string> = {
  random: 'Scimmietta',
  heuristic: 'Furbo',
  expert: 'Esperto',
  'gemini-free': 'Gemini Free',
  gemini: 'Gemini',
  openai: 'GPT',
  claude: 'Claude',
};

// The "best of" value now directly represents wins needed to take the
// match — i.e. it's a "first to N" number. This avoids the pre-rename
// confusion where best-of-2 and best-of-3 both meant "first to 2 wins."
function winsNeeded(bestOf: number): number {
  return bestOf;
}

function BriscolaApp() {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' } as AppState);
  const { settings, updateSetting, resetSettings } = useSettings();
  const { play } = useSound({ enabled: settings.soundEnabled });

  // Apply the table-style class to <body> exactly the way Scopa does
  // (the body.table-tablecloth CSS lives in src/index.css). 'green' is
  // the default — no class needed.
  useEffect(() => {
    const body = document.body;
    body.classList.remove('table-green', 'table-tablecloth');
    if (settings.tableStyle !== 'green') {
      body.classList.add(`table-${settings.tableStyle}`);
    }
  }, [settings.tableStyle]);
  // The active Play-mode opponent. May be a sync CPU bot or an async LLM.
  const [opponentName, setOpponentName] = useState<BriscolaOpponentName>(
    settings.briscolaCpuBot
  );
  // Selected model per provider when the matching opponent is chosen.
  // We reuse Scopa's saved settings as the seed so picking models in one
  // game persists into the other.
  const [geminiModel, setGeminiModel] = useState<string>(
    settings.geminiModel || DEFAULT_GEMINI_MODEL
  );
  const [openaiModel, setOpenAIModel] = useState<string>(
    settings.openaiModel || DEFAULT_OPENAI_MODEL
  );
  const [claudeModel, setClaudeModel] = useState<string>(
    settings.claudeModel || DEFAULT_CLAUDE_MODEL
  );
  const [bestOf, setBestOf] = useState<number>(settings.defaultBestOf);
  // Game mode + watch-mode opponents. Both seats accept any opponent
  // (CPU or LLM) — same as Scopa. Burning LLM quota in watch mode is the
  // user's call.
  const [gameMode, setGameMode] = useState<BriscolaGameMode>('play');
  const [watchOpponents, setWatchOpponents] = useState<{
    player1: BriscolaOpponentName;
    player2: BriscolaOpponentName;
  }>({ player1: 'heuristic', player2: 'expert' });

  // Single thinking toggle applied to Gemini + Claude (OpenAI uses its own
  // server-side reasoning). Mirrors Scopa's behavior.
  const [useThinking, setUseThinking] = useState<boolean>(true);

  // Last move each player made (used as `lastSelfMove` / `lastOpponentMove`
  // when building the LLM prompt). Reset at the start of every round.
  const lastMovesRef = useRef<{ human: Move | null; cpu: Move | null }>({
    human: null,
    cpu: null,
  });

  // Per-seat "last move + reasoning" snapshot, used by the shared Scopa
  // ReasoningModal. Only LLM bots populate `reasoning`; CPU bots leave it
  // empty and the ThinkingBubble trigger stays hidden.
  const [lastMoveData, setLastMoveData] = useState<{
    human: LastMoveData | null;
    cpu: LastMoveData | null;
  }>({ human: null, cpu: null });
  const [reasoningModal, setReasoningModal] = useState<{
    isOpen: boolean;
    player: PlayerId | null;
  }>({ isOpen: false, player: null });

  // Token stats per seat, refreshed after each LLM call.
  const [tokenStatsBySeat, setTokenStatsBySeat] = useState<{
    human: { stats: GeminiTokenStats | null; delta: GeminiTokenDelta | null };
    cpu: { stats: GeminiTokenStats | null; delta: GeminiTokenDelta | null };
  }>({
    human: { stats: null, delta: null },
    cpu: { stats: null, delta: null },
  });

  // LLM error per seat — when set, the TokenStatsDisplay shows it as an
  // error badge. Cleared on next successful call or by the user.
  const [apiErrorBySeat, setApiErrorBySeat] = useState<{
    human: string | null;
    cpu: string | null;
  }>({ human: null, cpu: null });

  // Map an opponent name to the actual AI player instance. Falls back to
  // the heuristic CPU if an LLM isn't reachable (proxy unset, no key, etc.)
  // so the game can't deadlock on a config glitch.
  const resolveBot = useCallback(
    (name: BriscolaOpponentName): AnyAIPlayer => {
      if (name === 'gemini-free') {
        return getGeminiFreeBriscolaAI() ?? CPU_BOTS.heuristic;
      }
      if (name === 'gemini') {
        return getGeminiBriscolaAI(geminiModel, useThinking) ?? CPU_BOTS.heuristic;
      }
      if (name === 'openai') {
        return getOpenAIBriscolaAI(openaiModel) ?? CPU_BOTS.heuristic;
      }
      if (name === 'claude') {
        return getClaudeBriscolaAI(claudeModel, useThinking) ?? CPU_BOTS.heuristic;
      }
      return CPU_BOTS[name];
    },
    [geminiModel, openaiModel, claudeModel, useThinking]
  );

  // Look up the current token stats for an opponent name. Returns null
  // for sync CPU bots since they have nothing to report.
  const statsFor = useCallback(
    (
      name: BriscolaOpponentName
    ): { stats: GeminiTokenStats | null; delta: GeminiTokenDelta | null } => {
      if (name === 'gemini-free') {
        return { stats: getGeminiFreeTokenStats(), delta: getGeminiFreeTokenDelta() };
      }
      if (name === 'gemini') {
        return {
          stats: getGeminiBriscolaTokenStats(geminiModel, useThinking),
          delta: getGeminiBriscolaTokenDelta(geminiModel, useThinking),
        };
      }
      if (name === 'openai') {
        return {
          stats: getOpenAIBriscolaTokenStats(openaiModel),
          delta: getOpenAIBriscolaTokenDelta(openaiModel),
        };
      }
      if (name === 'claude') {
        return {
          stats: getClaudeBriscolaTokenStats(claudeModel, useThinking),
          delta: getClaudeBriscolaTokenDelta(claudeModel, useThinking),
        };
      }
      return { stats: null, delta: null };
    },
    [geminiModel, openaiModel, claudeModel, useThinking]
  );

  // Resolve which bot drives a given player. Returns AnyAIPlayer because
  // Play mode may bind 'cpu' to an async LLM; the move-selection effect
  // awaits the result either way.
  const botFor = useCallback(
    (player: PlayerId): AnyAIPlayer => {
      if (gameMode === 'watch') {
        return resolveBot(
          player === 'human' ? watchOpponents.player1 : watchOpponents.player2
        );
      }
      if (player === 'cpu') return resolveBot(opponentName);
      // 'human' seat in Play mode is the user — should never be queried.
      return CPU_BOTS.heuristic;
    },
    [gameMode, watchOpponents, opponentName, resolveBot]
  );

  // Animation speed scales every timer-driven duration by a multiplier.
  // 'instant' collapses to near-zero; 'normal' is the unscaled baseline.
  const speed = SPEED_MULTIPLIER[settings.animationSpeed];
  const dur = (base: number) => Math.max(20, Math.round(base * speed));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);

  // "New Game" sends us back to the StartScreen (idle) so the player can
  // re-pick opponent / best-of before the next match. Only confirm when a
  // match is actually in progress; from idle or after a finished match we
  // can drop back to the lobby without prompting.
  const handleRestartRequest = useCallback(() => {
    const inProgress =
      state.status !== 'idle' &&
      !(state.status === 'roundEnd' && state.matchOver);
    if (inProgress) setConfirmNewGame(true);
    else dispatch({ type: 'RESET' });
  }, [state]);

  const confirmRestart = useCallback(() => {
    setConfirmNewGame(false);
    dispatch({ type: 'RESET' });
  }, []);
  const stats = useBriscolaStats();

  // Resolve the chosen model id for an opponent name (undefined for non-LLMs).
  const modelFor = useCallback(
    (name: BriscolaOpponentName): string | undefined => {
      if (name === 'gemini') return geminiModel;
      if (name === 'openai') return openaiModel;
      if (name === 'claude') return claudeModel;
      if (name === 'gemini-free') return 'gemini-3-flash-preview';
      return undefined;
    },
    [geminiModel, openaiModel, claudeModel]
  );

  // Build the StatsModal opponent list from the stats store: always shows
  // the three CPU bots, plus every distinct (type, model) LLM opponent the
  // player has actually played. Keyed by `${type}::${model ?? ''}` so a
  // click round-trips through getStatsModalGames cleanly.
  const statsModalOpponents: StatsModalOpponent[] = useMemo(() => {
    return stats.getAllDisplayOpponents().map(({ type, model }) => {
      const s = stats.getBotSummary(type, model);
      return {
        key: `${type}::${model ?? ''}`,
        label: (
          <AIPlayerLabel
            aiType={type as ExtendedAIType}
            model={model}
            showModeIndicator={false}
          />
        ),
        summary: {
          gamesPlayed: s.gamesPlayed,
          wins: s.wins,
          losses: s.losses,
          ties: s.ties,
          winRate: s.winRate,
        },
      };
    });
  }, [stats]);

  const getStatsModalGames = useCallback(
    (key: string): StatsModalGame[] => {
      const [type, modelPart] = key.split('::');
      const model = modelPart || undefined;
      const rounds = stats.getRoundsAgainst(type as BriscolaOpponentName, model);
      return rounds.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        playerScore: r.playerPoints,
        opponentScore: r.cpuPoints,
        outcome: r.outcome,
      }));
    },
    [stats]
  );

  // Record the match into stats exactly once, when matchOver first becomes true.
  // Triggered by the state.status === 'roundEnd' transition.
  const matchRecordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.status !== 'roundEnd' || !state.matchOver) return;
    // Don't track watch-mode (CPU vs CPU) matches — they're not the user's
    // games, and conflating them with real play would skew win rates.
    if (gameMode === 'watch') return;
    // De-duplicate per match: build a stable id from the round-end snapshot.
    const matchId = `${state.game.roundNumber}-${state.game.scores.human}-${state.game.scores.cpu}-${state.game.targetScore}`;
    if (matchRecordedRef.current === matchId) return;
    matchRecordedRef.current = matchId;
    stats.recordMatch(
      opponentName,
      modelFor(opponentName),
      state.game.scores.human,
      state.game.scores.cpu,
      bestOf,
      state.game.roundHistory
    );
  }, [state, opponentName, bestOf, stats, gameMode, modelFor]);

  // Clear the dedup id whenever a new match starts.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'dealing') {
      matchRecordedRef.current = null;
    }
  }, [state.status]);

  // Reset the per-round last-move pointers + reset the LLM conversation
  // history at the start of every round (dealing → playing transition).
  // prevRoundRef is keyed so that a brand-new match (back to idle then
  // re-dealing round 1) re-triggers the hook even if roundNumber matches.
  const prevRoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.status === 'idle') {
      prevRoundRef.current = null;
      return;
    }
    if (state.status !== 'dealing') return;
    const roundNumber = state.game.roundNumber;
    const key = `${roundNumber}-${state.game.round.dealer}-${state.game.targetScore}`;
    if (prevRoundRef.current === key) return;
    prevRoundRef.current = key;
    lastMovesRef.current = { human: null, cpu: null };
    setLastMoveData({ human: null, cpu: null });
    setTokenStatsBySeat({
      human: { stats: null, delta: null },
      cpu: { stats: null, delta: null },
    });
    setApiErrorBySeat({ human: null, cpu: null });
    // Build the set of opponents whose LLM lifecycle we need to nudge.
    // Play mode = the single opponent; Watch mode = both seats.
    const activeOpponents: BriscolaOpponentName[] =
      gameMode === 'watch'
        ? [watchOpponents.player1, watchOpponents.player2]
        : [opponentName];
    for (const op of activeOpponents) {
      if (op === 'gemini-free') {
        if (roundNumber === 1) newGeminiFreeGame();
        startGeminiFreeRound();
      } else if (op === 'gemini') startGeminiRound(geminiModel, useThinking);
      else if (op === 'openai') startOpenAIRound(openaiModel);
      else if (op === 'claude') startClaudeRound(claudeModel, useThinking);
    }
  }, [state, opponentName, gameMode, watchOpponents, geminiModel, openaiModel, claudeModel, useThinking]);

  // Close out the LLM round when we hit roundEnd. (No-op for sync bots.)
  useEffect(() => {
    if (state.status !== 'roundEnd') return;
    const activeOpponents: BriscolaOpponentName[] =
      gameMode === 'watch'
        ? [watchOpponents.player1, watchOpponents.player2]
        : [opponentName];
    for (const op of activeOpponents) {
      if (op === 'gemini-free') endGeminiFreeRound();
      else if (op === 'gemini') endGeminiRound(geminiModel, useThinking);
      else if (op === 'openai') endOpenAIRound(openaiModel);
      else if (op === 'claude') endClaudeRound(claudeModel, useThinking);
    }
  }, [state.status, opponentName, gameMode, watchOpponents, geminiModel, openaiModel, claudeModel, useThinking]);

  // CPU decision → CPU_START. Fires whenever the current player is bot-
  // controlled: always 'cpu' in Play mode, both 'human' and 'cpu' in Watch.
  useEffect(() => {
    if (state.status !== 'playing') return;
    const current = state.game.round.currentPlayer;
    const isBot = gameMode === 'watch' || current === 'cpu';
    if (!isBot) return;
    if (state.game.players[current].hand.length === 0) return;

    const g = state.game;
    const opp: PlayerId = current === 'human' ? 'cpu' : 'human';
    const bot = botFor(current);
    // Build the legal-moves list — in Briscola every hand card is a legal
    // move (no follow-suit), so this is just hand.map → Move.
    const validMoves: Move[] = g.players[current].hand.map((c) => ({
      player: current,
      cardPlayed: c,
    }));
    const llmCtx: LLMAIContext = {
      hand: g.players[current].hand,
      player: current,
      trump: g.round.trump,
      trumpSuit: g.round.trumpSuit,
      leadCard: g.round.trick.leadCard,
      deckCount: g.round.deck.length,
      myCaptured: g.players[current].captured,
      oppCaptured: g.players[opp].captured,
      scores: { self: g.scores[current], opponent: g.scores[opp] },
      targetScore: g.targetScore,
      roundNumber: g.roundNumber,
      opponentHandCount: g.players[opp].hand.length,
      lastSelfMove: lastMovesRef.current[current],
      lastOpponentMove: lastMovesRef.current[opp],
      validMoves,
    };

    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        const move = isAsyncAI(bot)
          ? await bot.selectMove(llmCtx)
          : bot.selectMove(llmCtx);
        if (cancelled) return;
        // Validate the move is actually legal — async LLMs can return stale
        // ids if the state mutated mid-request (cancellation race).
        const stillLegal = g.players[current].hand.some(
          (c) => c.id === move.cardPlayed.id
        );
        if (!stillLegal) return;
        lastMovesRef.current[current] = move;
        // Snapshot this seat's move for the ReasoningModal. Briscola has no
        // captures-from-table notion, so tableCards / capturedCards stay
        // empty — the modal will just render the played card + reasoning.
        const seatOpponent =
          gameMode === 'watch'
            ? current === 'human'
              ? watchOpponents.player1
              : watchOpponents.player2
            : opponentName;
        const reasoning = (bot as { lastReasoning?: string }).lastReasoning ?? '';
        const opp: PlayerId = current === 'human' ? 'cpu' : 'human';
        setLastMoveData((prev) => ({
          ...prev,
          [current]: {
            cardPlayed: move.cardPlayed,
            tableCards: [],
            capturedCards: [],
            reasoning,
            player: current,
            aiName: bot.name || (seatOpponent ? BOT_LABELS[seatOpponent] : undefined),
            opponentHandCount: g.players[opp].hand.length,
            otherHandCards: g.players[current].hand.filter(
              (c) => c.id !== move.cardPlayed.id
            ),
          } satisfies LastMoveData,
        }));
        if (seatOpponent) {
          const snapshot = statsFor(seatOpponent);
          setTokenStatsBySeat((prev) => ({ ...prev, [current]: snapshot }));
        }
        setApiErrorBySeat((prev) =>
          prev[current] === null ? prev : { ...prev, [current]: null }
        );
        dispatch({ type: 'CPU_START', move });
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof RateLimitError
            ? `Rate limit (${e.gamesUsed}/${e.gamesLimit})`
            : e instanceof Error
              ? e.message
              : String(e);
        if (e instanceof RateLimitError) {
          // eslint-disable-next-line no-console
          console.warn('[briscola] LLM rate-limit hit, falling back to heuristic.');
        } else {
          console.error('[briscola] LLM move failed:', e);
        }
        setApiErrorBySeat((prev) => ({ ...prev, [current]: msg }));
        // Don't lock up the game — fall back to a sync bot for this move.
        const fallback = CPU_BOTS.heuristic.selectMove(llmCtx);
        lastMovesRef.current[current] = fallback;
        dispatch({ type: 'CPU_START', move: fallback });
      }
    }, dur(CPU_DECISION_DELAY_MS));
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [state, botFor, gameMode, dur]);

  // cpuAnimating: reveal → moving → apply. The 'play' sound fires when
  // the card actually LANDS in the play area (end of the moving phase),
  // not when it starts flying — otherwise it feels disconnected from
  // the visual since the move takes ~500ms.
  useEffect(() => {
    if (state.status !== 'cpuAnimating') return;
    if (state.phase === 'reveal') {
      const t = setTimeout(() => dispatch({ type: 'CPU_PHASE_MOVING' }), dur(CPU_REVEAL_MS));
      return () => clearTimeout(t);
    }
    if (state.phase === 'moving') {
      const t = setTimeout(() => {
        play('play');
        dispatch({ type: 'CPU_APPLY' });
      }, dur(CPU_MOVE_MS));
      return () => clearTimeout(t);
    }
  }, [state, play, dur]);

  // animatingTrick: hold then resolve (capture sound on resolution)
  useEffect(() => {
    if (state.status !== 'animatingTrick') return;
    const t = setTimeout(() => {
      play('capture');
      dispatch({ type: 'RESOLVE_TRICK' });
    }, dur(TRICK_VISIBLE_MS));
    return () => clearTimeout(t);
  }, [state, play, dur]);

  // dealing: play a single 'deal' card-fan sound (matches Scopa, which
  // uses one play('deal') per dealing phase), then transition to playing.
  useEffect(() => {
    if (state.status !== 'dealing') return;
    play('deal');
    // Slight buffer beyond the animation duration so cards fully settle
    const t = setTimeout(() => dispatch({ type: 'DEAL_COMPLETE' }), dur(DEALING_HANDS_DURATION + 100));
    return () => clearTimeout(t);
  }, [state, play, dur]);

  // drawing: hold for the duration of the draw animation, then advance.
  // Deliberately no draw-sound here — the per-trick click train was too
  // busy on top of the capture sound that fires at the same time.
  useEffect(() => {
    if (state.status !== 'drawing') return;
    const t = setTimeout(() => dispatch({ type: 'DRAW_COMPLETE' }), dur(DRAW_DURATION_MS + 50));
    return () => clearTimeout(t);
  }, [state, dur]);

  const onPlayerCardClick = useCallback(
    (card: BriscolaCard) => {
      if (state.status !== 'playing') return;
      if (state.game.round.currentPlayer !== 'human') return;
      // Watch mode: the 'human' seat is bot-controlled — ignore clicks so
      // we don't double-play.
      if (gameMode === 'watch') return;
      const move: Move = { player: 'human', cardPlayed: card };
      lastMovesRef.current.human = move;
      play('play');
      dispatch({ type: 'HUMAN_PLAY', move });
    },
    [state, play, gameMode]
  );

  // Which player's captured pile is currently open as a modal (null = closed)
  const [openPile, setOpenPile] = useState<PlayerId | null>(null);

  // Build a display label that includes the model when available — so every
  // UI surface (scoreboard, pile, modal title) agrees on "Claude Opus 4.7"
  // instead of some saying just "Claude" and others "Sonnet 4.5". Delegates
  // to Scopa's getAIDisplayNameText so both games format identically.
  const labelWithModel = useCallback(
    (name: BriscolaOpponentName): string =>
      getAIDisplayNameText(name as ExtendedAIType, modelFor(name), false),
    [modelFor]
  );

  if (state.status === 'idle') {
    return (
      <>
        <StartScreen
          opponentName={opponentName}
          onSetOpponentName={setOpponentName}
          geminiModel={geminiModel}
          onSetGeminiModel={(m) => {
            setGeminiModel(m);
            // Keep the setting in sync so it's the default next session.
            updateSetting('geminiModel', m);
          }}
          openaiModel={openaiModel}
          onSetOpenAIModel={(m) => {
            setOpenAIModel(m);
            updateSetting('openaiModel', m);
          }}
          claudeModel={claudeModel}
          onSetClaudeModel={(m) => {
            setClaudeModel(m);
            updateSetting('claudeModel', m);
          }}
          useThinking={useThinking}
          onToggleThinking={setUseThinking}
          watchOpponents={watchOpponents}
          onSetWatchOpponent={(p, name) =>
            setWatchOpponents((prev) => ({ ...prev, [p]: name }))
          }
          // Pull the default directly from settings so changes in the
          // Settings modal flow through to the start screen live.
          defaultBestOf={settings.defaultBestOf}
          onStartGame={(n, mode) => {
            setBestOf(n);
            setGameMode(mode);
            dispatch({ type: 'START', bestOf: n });
          }}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onUpdateSetting={updateSetting}
          onResetSettings={resetSettings}
          game="briscola"
        />
        <StatsModal
          isOpen={isStatsOpen}
          onClose={() => setIsStatsOpen(false)}
          opponents={statsModalOpponents}
          getGames={getStatsModalGames}
          onClearStats={stats.clearStats}
        />
        <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} game="briscola" />
        <ConfirmDialog
          isOpen={confirmNewGame}
          title="Start New Game?"
          message="Current game progress will be lost."
          confirmLabel="New Game"
          onConfirm={confirmRestart}
          onCancel={() => setConfirmNewGame(false)}
        />
      </>
    );
  }

  return (
    <DeckProvider deck={settings.deck}>
      <BriscolaBoard
        state={state}
        cpuBotLabel={
          gameMode === 'watch'
            ? labelWithModel(watchOpponents.player2)
            : labelWithModel(opponentName)
        }
        opponentName={gameMode === 'watch' ? watchOpponents.player2 : opponentName}
        cpuModel={modelFor(gameMode === 'watch' ? watchOpponents.player2 : opponentName)}
        humanLabel={
          gameMode === 'watch' ? labelWithModel(watchOpponents.player1) : 'You'
        }
        humanBotName={gameMode === 'watch' ? watchOpponents.player1 : null}
        humanModel={
          gameMode === 'watch' ? modelFor(watchOpponents.player1) : undefined
        }
        isWatchMode={gameMode === 'watch'}
        autoAdvanceSpectator={settings.autoAdvanceSpectator}
        showPileStats={settings.showPileStats}
        onCardClick={onPlayerCardClick}
        onOpenReasoning={(p) => setReasoningModal({ isOpen: true, player: p })}
        lastMoveData={lastMoveData}
        tokenStatsBySeat={tokenStatsBySeat}
        apiErrorBySeat={apiErrorBySeat}
        onDismissApiError={(p) =>
          setApiErrorBySeat((prev) => ({ ...prev, [p]: null }))
        }
        cpuIsLLM={
          opponentName === 'gemini' ||
          opponentName === 'gemini-free' ||
          opponentName === 'openai' ||
          opponentName === 'claude'
        }
        humanIsLLM={
          gameMode === 'watch' &&
          (watchOpponents.player1 === 'gemini' ||
            watchOpponents.player1 === 'gemini-free' ||
            watchOpponents.player1 === 'openai' ||
            watchOpponents.player1 === 'claude')
        }
        onNextRound={() => dispatch({ type: 'NEXT_ROUND' })}
        onRestart={handleRestartRequest}
        onOpenPile={setOpenPile}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        onOpenRules={() => setIsRulesOpen(true)}
      />
      {openPile && (
        <BriscolaCapturedModal
          cards={
            state.status === 'drawing'
              ? state.preDrawGame.players[openPile].captured
              : state.game.players[openPile].captured
          }
          playerName={
            openPile === 'human'
              ? gameMode === 'watch'
                ? BOT_LABELS[watchOpponents.player1]
                : 'You'
              : gameMode === 'watch'
                ? BOT_LABELS[watchOpponents.player2]
                : BOT_LABELS[opponentName]
          }
          onClose={() => setOpenPile(null)}
        />
      )}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSetting={updateSetting}
        onResetSettings={resetSettings}
        game="briscola"
      />
      <StatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        opponents={statsModalOpponents}
        getGames={getStatsModalGames}
        onClearStats={stats.clearStats}
      />
      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} game="briscola" />
      <ConfirmDialog
        isOpen={confirmNewGame}
        title="Start New Game?"
        message="Current game progress will be lost."
        confirmLabel="New Game"
        onConfirm={confirmRestart}
        onCancel={() => setConfirmNewGame(false)}
      />
      <ReasoningModal
        isOpen={reasoningModal.isOpen}
        lastMove={
          reasoningModal.player ? lastMoveData[reasoningModal.player] : null
        }
        position={
          reasoningModal.player === 'cpu'
            ? 'top'
            : reasoningModal.player === 'human'
              ? 'bottom'
              : 'center'
        }
        onClose={() => setReasoningModal({ isOpen: false, player: null })}
      />
    </DeckProvider>
  );
}

export default BriscolaApp;

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function BriscolaBoard({
  state,
  cpuBotLabel,
  opponentName,
  cpuModel,
  humanLabel,
  humanBotName,
  humanModel,
  isWatchMode,
  autoAdvanceSpectator,
  showPileStats,
  onCardClick,
  onOpenReasoning,
  lastMoveData,
  tokenStatsBySeat,
  apiErrorBySeat,
  onDismissApiError,
  cpuIsLLM,
  humanIsLLM,
  onNextRound,
  onRestart,
  onOpenPile,
  onOpenSettings,
  onOpenStats,
  onOpenRules,
}: {
  state: Exclude<AppState, { status: 'idle' }>;
  /** Plain-text fallback (used by ReasoningModal title etc.). */
  cpuBotLabel: string;
  opponentName: BriscolaOpponentName;
  /** Provider model id for the CPU seat (undefined for non-LLM opponents). */
  cpuModel?: string;
  /** Plain-text fallback for the user-side label. */
  humanLabel: string;
  /** When in watch mode, the opponent name driving the bottom seat (else null). */
  humanBotName: BriscolaOpponentName | null;
  humanModel?: string;
  isWatchMode: boolean;
  autoAdvanceSpectator: boolean;
  showPileStats: boolean;
  onCardClick: (card: BriscolaCard) => void;
  /** Open the reasoning modal for a given seat (called from ThinkingBubble). */
  onOpenReasoning: (player: PlayerId) => void;
  /** Last-move snapshot per seat — populated only for LLM moves. */
  lastMoveData: { human: LastMoveData | null; cpu: LastMoveData | null };
  /** Latest token stats per seat (null for sync CPU bots). */
  tokenStatsBySeat: {
    human: { stats: GeminiTokenStats | null; delta: GeminiTokenDelta | null };
    cpu: { stats: GeminiTokenStats | null; delta: GeminiTokenDelta | null };
  };
  /** API error per seat (null if no error). */
  apiErrorBySeat: { human: string | null; cpu: string | null };
  onDismissApiError: (player: PlayerId) => void;
  /** Whether the CPU seat is currently an LLM (controls whether the stats /
   *  bubble container renders at all). */
  cpuIsLLM: boolean;
  humanIsLLM: boolean;
  onNextRound: () => void;
  onRestart: () => void;
  onOpenPile: (player: PlayerId) => void;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  onOpenRules: () => void;
}) {
  // While drawing, render the pre-draw view (hands/deck haven't grown yet).
  // For every other state, state.game is the right view.
  const g: GameState = state.status === 'drawing' ? state.preDrawGame : state.game;
  const isHumanTurn = state.status === 'playing' && g.round.currentPlayer === 'human';
  const animTrick = state.status === 'animatingTrick' ? state.trick : null;
  const cpuAnim = state.status === 'cpuAnimating' ? state : null;
  const isDealing = state.status === 'dealing';

  // JSX label for a seat — AIPlayerLabel for bots so brand-icon SVGs show
  // up, plain text for the local user. Used where the parent accepts a
  // ReactNode (pile labels, turn banner). String contexts (modal titles
  // etc.) still use cpuBotLabel / humanLabel.
  const seatLabelNode = (seat: PlayerId): React.ReactNode => {
    const aiType = (seat === 'human' ? humanBotName : opponentName) as
      | ExtendedAIType
      | null;
    const model = seat === 'human' ? humanModel : cpuModel;
    if (seat === 'human' && !humanBotName) return humanLabel;
    if (!aiType) return seat === 'human' ? humanLabel : cpuBotLabel;
    return <AIPlayerLabel aiType={aiType} model={model} showModeIndicator={false} />;
  };
  const drawTargets = state.status === 'drawing' ? state.drawTargets : null;

  // Drag-to-play (mirrors Scopa's pattern). The card is draggable; if released
  // with the cursor inside the trickArea's bounding rect, we treat it as a
  // play (same code path as click). Otherwise framer-motion's
  // dragSnapToOrigin returns it to the hand — nothing happens.
  //
  // We track the cursor with our own pointermove listener while a drag is in
  // progress so the drop-zone highlight (isDragOver) reflects actual cursor
  // position, and the hit-test on release uses a definitive viewport coord.
  //
  // wasDraggingRef gates the click handler so any synthetic onClick that
  // framer-motion may fire AFTER a drag is dropped on the floor — otherwise
  // every drag would also fire the click-to-play path regardless of where
  // the card was released.
  const tableRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      const target = tableRef.current;
      if (!target) {
        setIsDragOver(false);
        return;
      }
      const rect = target.getBoundingClientRect();
      const over =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      setIsDragOver(over);
    };
    // Capture pointerup before framer-motion sees it so lastPointerPos
    // has a definitive release coord by the time dragEnd runs.
    const onUp = (e: PointerEvent) => {
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp, true);
    };
  }, [isDragging]);

  const handleCardClick = useCallback(
    (card: BriscolaCard) => {
      // Suppress the click that follows a drag — drag releases are handled
      // exclusively through handleCardDragEnd's hit-test.
      if (wasDraggingRef.current) return;
      onCardClick(card);
    },
    [onCardClick]
  );

  const handleCardDragStart = useCallback(() => {
    wasDraggingRef.current = true;
    setIsDragging(true);
  }, []);

  const handleCardDragEnd = useCallback(
    (card: BriscolaCard, _info: PanInfo) => {
      setIsDragging(false);
      setIsDragOver(false);
      let dropped = false;
      if (isHumanTurn) {
        const target = tableRef.current;
        if (target) {
          const rect = target.getBoundingClientRect();
          const { x, y } = lastPointerPos.current;
          dropped =
            x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        }
      }
      if (dropped) onCardClick(card);
      // Clear wasDraggingRef after any tail-end synthetic click has had a
      // chance to fire (queued microtask runs before the next paint).
      Promise.resolve().then(() => {
        wasDraggingRef.current = false;
      });
    },
    [isHumanTurn, onCardClick]
  );

  // During the deal animation, hands are visually empty — the flying cards
  // in the DealingAnimation overlay represent them landing in the hands.
  // After deal completes, the real hand cards appear (PlayerHand's
  // AnimatePresence handles the entry).
  // While a bot's play is animating, filter the played card out of *that
  // player's* visible hand — in watch mode the animation may be coming from
  // the bottom (human) seat, not always 'cpu'.
  const animPlayer = cpuAnim?.cpuMove.player;
  const cpuHand = isDealing
    ? []
    : cpuAnim && animPlayer === 'cpu'
      ? g.players.cpu.hand.filter((c) => c.id !== cpuAnim.cpuMove.cardPlayed.id)
      : g.players.cpu.hand;
  const humanHand = isDealing
    ? []
    : cpuAnim && animPlayer === 'human'
      ? g.players.human.hand.filter((c) => c.id !== cpuAnim.cpuMove.cardPlayed.id)
      : g.players.human.hand;

  const leadCard = g.round.trick.leadCard;
  const followCard = animTrick ? animTrick.followCard : null;
  const winner = animTrick ? animTrick.winner : null;

  return (
    <>
      <GameLayout
        scoreBoard={
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <ScoreBoard
              humanScore={g.scores.human}
              cpuScore={g.scores.cpu}
              roundNumber={g.roundNumber}
              targetScore={g.targetScore}
              currentPlayer={g.round.currentPlayer}
              cpuName={cpuBotLabel}
              player2AIType={opponentName}
              player2Model={cpuModel}
              humanName={humanLabel}
              player1AIType={humanBotName ?? undefined}
              player1Model={humanModel}
            />
            <GameControls
              onNewGame={onRestart}
              onOpenSettings={onOpenSettings}
              onOpenStats={onOpenStats}
              onOpenRules={onOpenRules}
            />
          </div>
        }
        cpuPile={
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <BriscolaPile
              captured={g.players.cpu.captured}
              label={seatLabelNode('cpu')}
              onClick={() => onOpenPile('cpu')}
              showStats={showPileStats}
            />
            {cpuIsLLM && (
              <div style={{ position: 'relative' }}>
                <TokenStatsDisplay
                  stats={tokenStatsBySeat.cpu.stats}
                  delta={tokenStatsBySeat.cpu.delta}
                  show
                  mode="game"
                  position="bottom"
                  error={apiErrorBySeat.cpu}
                  onDismissError={() => onDismissApiError('cpu')}
                />
                <ThinkingBubble
                  show
                  hasReasoning={!!lastMoveData.cpu?.reasoning}
                  onClick={() => onOpenReasoning('cpu')}
                />
              </div>
            )}
          </div>
        }
        cpuHand={<PlayerHand cards={cpuHand} isHuman={false} />}
        tableCards={
          <BriscolaTable
            deckCount={g.round.deck.length}
            trump={g.round.trump}
            leadCard={leadCard}
            followCard={followCard}
            winner={winner}
            leadIsWinner={animTrick !== null && animTrick.winner === animTrick.leader}
            followIsWinner={animTrick !== null && animTrick.winner === animTrick.follower}
            tableRef={tableRef}
            isDragOver={isDragOver}
          />
        }
        humanHand={
          <PlayerHand
            cards={humanHand}
            isHuman={true}
            onCardClick={handleCardClick}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            disabled={!isHumanTurn}
          />
        }
        humanPile={
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <BriscolaPile
              captured={g.players.human.captured}
              label={seatLabelNode('human')}
              onClick={() => onOpenPile('human')}
              showStats={showPileStats}
            />
            {isWatchMode && humanIsLLM && (
              <div style={{ position: 'relative' }}>
                <TokenStatsDisplay
                  stats={tokenStatsBySeat.human.stats}
                  delta={tokenStatsBySeat.human.delta}
                  show
                  mode="game"
                  position="top"
                  error={apiErrorBySeat.human}
                  onDismissError={() => onDismissApiError('human')}
                />
                <ThinkingBubble
                  show
                  hasReasoning={!!lastMoveData.human?.reasoning}
                  onClick={() => onOpenReasoning('human')}
                  position="top"
                />
              </div>
            )}
          </div>
        }
        controls={
          (() => {
            const currentSeat: PlayerId | null =
              state.status === 'playing'
                ? state.game.round.currentPlayer
                : state.status === 'cpuAnimating'
                  ? state.game.round.currentPlayer
                  : state.status === 'animatingTrick' && winner
                    ? winner
                    : null;
            const seatIsUser = currentSeat === 'human' && !humanBotName;
            // turnLabelStyle gives padding/colors etc.; the inner flex row
            // is what gets the AIPlayerLabel and trailing text onto a
            // shared baseline (otherwise inline-flex + inline text drift
            // vertically apart).
            const row = {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35em',
            } as const;
            return (
              <div style={turnLabelStyle}>
                {state.status === 'playing' &&
                  (isHumanTurn && seatIsUser ? (
                    <span>Your turn</span>
                  ) : (
                    <span style={row}>
                      {seatLabelNode(currentSeat ?? 'cpu')}
                      <span>thinking…</span>
                    </span>
                  ))}
                {state.status === 'cpuAnimating' && (
                  <span style={row}>
                    {seatLabelNode(currentSeat ?? 'cpu')}
                    <span>plays…</span>
                  </span>
                )}
                {state.status === 'animatingTrick' && winner && (
                  <span style={row}>
                    {seatLabelNode(winner)}
                    <span>{seatIsUser ? 'take' : 'takes'} it</span>
                  </span>
                )}
                {state.status === 'roundEnd' && <span>Round over</span>}
              </div>
            );
          })()
        }
      />

      {/* Bot reveal/move overlay (same component Scopa uses). In watch
          mode the 'human' seat is also bot-controlled, so we anchor the
          animation to whichever side actually played — not always 'cpu'. */}
      <CpuCardAnimation
        card={cpuAnim?.cpuMove.cardPlayed ?? null}
        phase={cpuAnim?.phase ?? null}
        capturedCardIds={[]}
        player={cpuAnim?.cpuMove.player}
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
          humanCaptured={state.game.players.human.captured}
          cpuCaptured={state.game.players.cpu.captured}
          roundWinner={state.roundWinner}
          matchOver={state.matchOver}
          matchScore={state.game.scores}
          matchTarget={state.game.targetScore}
          roundHistory={state.game.roundHistory}
          cpuLabel={cpuBotLabel}
          humanLabel={humanLabel}
          cpuLabelNode={seatLabelNode('cpu')}
          humanLabelNode={seatLabelNode('human')}
          autoAdvance={isWatchMode && autoAdvanceSpectator}
          onNextRound={onNextRound}
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
  leadIsWinner,
  followIsWinner,
  tableRef,
  isDragOver,
}: {
  deckCount: number;
  trump: BriscolaCard;
  leadCard: BriscolaCard | null;
  followCard: BriscolaCard | null;
  winner: PlayerId | null;
  leadIsWinner: boolean;
  followIsWinner: boolean;
  tableRef: React.RefObject<HTMLDivElement>;
  isDragOver: boolean;
}) {
  // Highlight the drop zone while the user is dragging
  const trickAreaStyle = isDragOver
    ? {
        ...trickArea,
        background: 'rgba(212, 175, 55, 0.15)',
        border: '2px dashed rgba(212, 175, 55, 0.7)',
      }
    : trickArea;
  return (
    <div style={tableGrid}>
      {/* Left spacer keeps the play area visually centered */}
      <div />
      <div ref={tableRef} style={trickAreaStyle}>
        <AnimatePresence>
          {leadCard && (
            <TrickCard
              key={leadCard.id}
              card={leadCard}
              exitToward={winner}
              isWinner={leadIsWinner}
            />
          )}
          {followCard && (
            <TrickCard
              key={followCard.id}
              card={followCard}
              exitToward={winner}
              isWinner={followIsWinner}
            />
          )}
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
// of DealingAnimation but with smaller offsets — game-start dealing
// (±280px) overshoots noticeably when used mid-game.
function DrawAnimation({ targets }: { targets: PlayerId[] }) {
  if (targets.length === 0) return null;
  const startX = 200;
  const endY = 200;
  return (
    <AnimatePresence>
      <div className={dealStyles.overlay}>
        {targets.map((target, i) => (
          <motion.div
            key={`draw-${target}-${i}`}
            className={dealStyles.flyingCard}
            initial={{
              x: startX,
              y: 0,
              scale: 0.85,
              opacity: 1,
              rotate: 5,
            }}
            animate={{
              x: 0,
              y: target === 'human' ? endY : -endY,
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
  isWinner = false,
}: {
  card: BriscolaCard;
  exitToward: PlayerId | null;
  isWinner?: boolean;
}) {
  // Fly toward the winning corner pile.
  // CPU pile: top-right.   Human pile: bottom-left.
  const exitY = exitToward === 'human' ? 300 : exitToward === 'cpu' ? -300 : 0;
  const exitX = exitToward === 'human' ? -260 : exitToward === 'cpu' ? 260 : 0;

  return (
    <motion.div
      layoutId={`hand-${card.id}`}
      animate={
        isWinner
          ? {
              scale: 1.08,
              filter: 'drop-shadow(0 0 14px rgba(255, 215, 0, 0.95))',
            }
          : {
              scale: 1,
              filter: 'drop-shadow(0 0 0 rgba(255, 215, 0, 0))',
            }
      }
      exit={{
        x: exitX,
        y: exitY,
        opacity: 0,
        scale: 0.7,
        rotate: exitToward === 'cpu' ? 30 : exitToward === 'human' ? -30 : 0,
        filter: 'drop-shadow(0 0 0 rgba(255, 215, 0, 0))',
        transition: { duration: CAPTURE_DURATION_MS / 1000, ease: [0.25, 0.1, 0.25, 1] },
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
    >
      {/* Trick cards aren't interactive — disabled drops cursor:pointer
          + hover glow + tap animation. */}
      <Card card={card} disabled />
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

// Star icon for the points pill in the pile stats row — matches the visual
// weight of Scopa's DenariIcon so the two games look consistent.
function StarIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="var(--color-accent)"
      aria-hidden="true"
    >
      <path d="M12 2.5 14.6 9 21.5 9.5 16.2 14 17.8 20.7 12 17 6.2 20.7 7.8 14 2.5 9.5 9.4 9z" />
    </svg>
  );
}

// Captured pile — uses Scopa's CapturedPile CSS module verbatim so it looks
// identical, but its stats row shows a card count and a points total (Briscola
// has no denari/scopa/sette bello to display).
function BriscolaPile({
  captured,
  label,
  onClick,
  showStats,
}: {
  captured: BriscolaCard[];
  /** Accepts JSX so callers can pass AIPlayerLabel (proper brand-icon SVG)
   *  instead of a flat string with the unicode-text fallback icon. */
  label: React.ReactNode;
  onClick?: () => void;
  showStats: boolean;
}) {
  const count = captured.length;
  const points = sumPoints(captured);
  const stackLayers = Math.min(6, Math.max(1, Math.ceil(count / 4)));
  const clickable = !!onClick && count > 0;

  return (
    <div
      className={`${pileStyles.pile} ${clickable ? pileStyles.clickable : ''}`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick!();
            }
          : undefined
      }
    >
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
      {showStats && (
        <div className={pileStyles.pileInfo}>
          <span className={pileStyles.cardCount}>{count} cards</span>
          <div className={pileStyles.statsRow}>
            <div className={pileStyles.stat} title="Points captured">
              <StarIcon />
              <span>{points}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Modal that shows a player's captured pile in full, with the Briscola
// point-value totals. Reuses Scopa's CapturedCardsModal CSS module for
// styling so it visually matches the rest of the app.
function BriscolaCapturedModal({
  cards,
  playerName,
  onClose,
}: {
  cards: BriscolaCard[];
  playerName: string;
  onClose: () => void;
}) {
  const points = sumPoints(cards);
  // Tally point cards by value for a compact stats row
  const tally = {
    aces: cards.filter(c => c.value === 1).length,
    threes: cards.filter(c => c.value === 3).length,
    kings: cards.filter(c => c.value === 10).length,
    knights: cards.filter(c => c.value === 9).length,
    knaves: cards.filter(c => c.value === 8).length,
  };

  return (
    <AnimatePresence>
      <motion.div
        className={modalStyles.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={modalStyles.modal}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className={modalStyles.title}>{playerName} · Captured Cards</h2>

          <div className={modalStyles.stats}>
            <span className={modalStyles.stat}>
              <strong>{cards.length}</strong> cards
            </span>
            <span className={modalStyles.stat}>
              <strong>{points}</strong> pts ({POINT_VALUES[1]}·A + {POINT_VALUES[3]}·3 + {POINT_VALUES[10]}·K + {POINT_VALUES[9]}·Kn + {POINT_VALUES[8]}·J)
            </span>
            <span className={modalStyles.stat}>
              A:<strong>{tally.aces}</strong> 3:<strong>{tally.threes}</strong> K:<strong>{tally.kings}</strong> Kn:<strong>{tally.knights}</strong> J:<strong>{tally.knaves}</strong>
            </span>
          </div>

          <div className={modalStyles.cardsContainer}>
            {cards.length === 0 ? (
              <p className={modalStyles.empty}>No cards captured yet</p>
            ) : (
              <div className={modalStyles.cardsGrid}>
                {cards.map((card) => (
                  <div key={card.id} className={modalStyles.cardWrapper}>
                    <CardImage card={card} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className={modalStyles.closeButton} onClick={onClose}>
            Close
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Per-player captured-cards strip for the round-end summary. Point cards
 * (Ace/3/K/Knight/Knave) get a gold ring and a point-value badge; scartine
 * (0-pt cards) are muted so the eye lands on what actually moved the score.
 */
function CapturedSummaryRow({
  label,
  captured,
  points,
  totalCards,
}: {
  label: string;
  captured: BriscolaCard[];
  points: number;
  totalCards: number;
}) {
  // Show every captured card; scoring cards (Ace/3/K/Knight/Knave) get a
  // gold ring + value badge, scartine render plain. A subtle brightness
  // filter knocks the card paper down a notch so it doesn't fight the dark
  // overlay background.
  const sorted = [...captured].sort((a, b) => {
    const pv = POINT_VALUES[b.value] - POINT_VALUES[a.value];
    if (pv !== 0) return pv;
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return b.value - a.value;
  });

  return (
    <div style={{ margin: '0.5rem 0', textAlign: 'left' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.5rem',
          marginBottom: '0.35rem',
          fontSize: '0.95rem',
        }}
      >
        <strong>{label}</strong>
        <span style={{ opacity: 0.85 }}>
          {points} pts · {totalCards} cards
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: '6px',
          // Sized to fit exactly 3 rows of cards (3 × 76px + 2 × 6px gap + 12px
          // vertical padding ≈ 252) without triggering the scrollbar.
          maxHeight: 260,
          overflowY: 'auto',
          overflowX: 'hidden',
          // Leave room for the gold value badge that sticks out at top/right
          // (it's positioned at top: -6, right: -6 on each card).
          padding: '8px 4px 4px 4px',
          margin: '-8px -4px -4px -4px',
          scrollbarWidth: 'thin',
        }}
      >
        {sorted.length === 0 ? (
          <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>
            No cards captured
          </span>
        ) : (
          sorted.map((c) => {
            const v = POINT_VALUES[c.value];
            const scoring = v > 0;
            return (
              <div
                key={c.id}
                style={{
                  position: 'relative',
                  flex: '0 0 auto',
                  width: 52,
                  height: 76,
                  // Match Scopa's RoundEndScreen treatment: scartine fade
                  // back so the eye lands on the point-contributing cards.
                  opacity: scoring ? 1 : 0.3,
                  filter: scoring ? undefined : 'grayscale(50%)',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 4,
                    // The card WebPs have transparent backgrounds — the rest
                    // of the app gets its white card paper from Card.module.css.
                    // We're using CardImage directly, so we provide it here.
                    background: '#fff',
                    overflow: 'hidden',
                    boxShadow: scoring
                      ? '0 0 0 2px var(--color-accent), 0 2px 6px rgba(0,0,0,0.4)'
                      : '0 2px 4px rgba(0,0,0,0.4)',
                  }}
                >
                  <CardImage
                    card={c}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </div>
                {scoring && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      background: 'var(--color-accent)',
                      color: '#000',
                      fontSize: '10px',
                      fontWeight: 700,
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                    }}
                  >
                    {v}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Match-end table: one row per round with player/cpu points, the round
 * winner highlighted, and a running "rounds won" tally on the right. Only
 * shown for matches with more than one round played (best-of-1 falls back
 * to the per-card summary, which is more informative).
 */
function RoundHistoryTable({
  roundHistory,
  cpuLabel,
  humanLabel,
}: {
  roundHistory: Array<{ playerPoints: number; cpuPoints: number }>;
  cpuLabel: string;
  humanLabel: string;
}) {
  const cellTd: React.CSSProperties = {
    padding: '6px 10px',
    fontVariantNumeric: 'tabular-nums',
  };
  const winCell: React.CSSProperties = {
    color: 'var(--color-accent)',
    fontWeight: 700,
  };

  let runningHuman = 0;
  let runningCpu = 0;

  return (
    <div style={{ margin: '1rem 0', textAlign: 'left' }}>
      <h3
        style={{
          fontSize: '0.85rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-accent)',
          margin: '0 0 0.5rem',
          textAlign: 'center',
        }}
      >
        Round History
      </h3>
      <div
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.9rem',
          }}
        >
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.25)' }}>
              <th style={{ ...cellTd, textAlign: 'left' }}>Round</th>
              <th style={{ ...cellTd, textAlign: 'right' }}>{humanLabel}</th>
              <th style={{ ...cellTd, textAlign: 'right' }}>{cpuLabel}</th>
              <th style={{ ...cellTd, textAlign: 'right' }}>Rounds Won</th>
            </tr>
          </thead>
          <tbody>
            {roundHistory.map((r, i) => {
              const humanWon = r.playerPoints > r.cpuPoints;
              const cpuWon = r.cpuPoints > r.playerPoints;
              if (humanWon) runningHuman += 1;
              else if (cpuWon) runningCpu += 1;
              return (
                <tr
                  key={i}
                  style={{
                    borderTop:
                      i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <td style={cellTd}>#{i + 1}</td>
                  <td
                    style={{
                      ...cellTd,
                      textAlign: 'right',
                      ...(humanWon ? winCell : {}),
                    }}
                  >
                    {r.playerPoints}
                  </td>
                  <td
                    style={{
                      ...cellTd,
                      textAlign: 'right',
                      ...(cpuWon ? winCell : {}),
                    }}
                  >
                    {r.cpuPoints}
                  </td>
                  <td
                    style={{
                      ...cellTd,
                      textAlign: 'right',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {runningHuman} – {runningCpu}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoundEndOverlay({
  humanPts,
  cpuPts,
  humanCaptured,
  cpuCaptured,
  roundWinner,
  matchOver,
  matchScore,
  matchTarget,
  roundHistory,
  cpuLabel,
  humanLabel,
  cpuLabelNode,
  humanLabelNode,
  autoAdvance,
  onNextRound,
  onRestart,
}: {
  humanPts: number;
  cpuPts: number;
  humanCaptured: BriscolaCard[];
  cpuCaptured: BriscolaCard[];
  roundWinner: PlayerId | 'tie';
  matchOver: boolean;
  matchScore: Record<PlayerId, number>;
  matchTarget: number;
  roundHistory: Array<{ playerPoints: number; cpuPoints: number }>;
  cpuLabel: string;
  humanLabel: string;
  /** Same labels rendered as JSX (proper AIPlayerLabel for LLM opponents)
   *  so brand-icon SVGs show inline in headings / summary text. */
  cpuLabelNode: React.ReactNode;
  humanLabelNode: React.ReactNode;
  /** Auto-advance to the next round after a short delay (watch mode). */
  autoAdvance: boolean;
  onNextRound: () => void;
  onRestart: () => void;
}) {
  // Two-step match-end flow: at match-over with >1 rounds, show the last
  // round's card summary first, then a "View Match Summary" button reveals
  // the round-by-round table. Best-of-1 collapses to a single card view.
  const [matchSummaryView, setMatchSummaryView] = useState(false);
  const hasMatchSummary = matchOver && roundHistory.length > 1;

  // Watch-mode auto-advance: between rounds, show a 3-2-1 countdown and
  // then fire onNextRound automatically. Disabled at match-over (the user
  // should see the final result and click Play Again themselves).
  const AUTO_ADVANCE_MS = 3000;
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (!autoAdvance || matchOver) {
      setCountdown(null);
      return;
    }
    setCountdown(Math.ceil(AUTO_ADVANCE_MS / 1000));
    const tick = setInterval(() => {
      setCountdown((prev) => (prev === null || prev <= 1 ? null : prev - 1));
    }, 1000);
    const advance = setTimeout(onNextRound, AUTO_ADVANCE_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(advance);
    };
  }, [autoAdvance, matchOver, onNextRound]);

  // "You take/win" reads naturally for the local user; bot names take third-
  // person verbs ("Furbo takes the round"). Render the labels as JSX nodes
  // (with proper brand-icon SVG via AIPlayerLabel) and stitch the verbs in
  // around them.
  const youAreLocal = humanLabel === 'You';
  const headingRow = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35em',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  };

  const roundLine: React.ReactNode =
    roundWinner === 'human' ? (
      <span style={headingRow}>
        {humanLabelNode} <span>{youAreLocal ? 'take' : 'takes'} the round</span>
      </span>
    ) : roundWinner === 'cpu' ? (
      <span style={headingRow}>
        {cpuLabelNode} <span>takes the round</span>
      </span>
    ) : (
      <span>Tied at 60</span>
    );

  const matchOutcome: React.ReactNode = !matchOver
    ? null
    : matchScore.human > matchScore.cpu ? (
        <span style={headingRow}>
          {humanLabelNode}{' '}
          <span>
            {youAreLocal ? 'win' : 'wins'} the match ({matchScore.human}–
            {matchScore.cpu})
          </span>
        </span>
      ) : matchScore.cpu > matchScore.human ? (
        <span style={headingRow}>
          {cpuLabelNode}{' '}
          <span>
            wins the match ({matchScore.cpu}–{matchScore.human})
          </span>
        </span>
      ) : (
        <span>
          Match drawn ({matchScore.human}–{matchScore.cpu})
        </span>
      );

  // For best-of-1, the match score line is redundant with the round line
  const showMatchScore = matchTarget > 1 && !matchOver;

  return (
    <div style={overlay}>
      <div style={overlayCard}>
        <h2 style={{ marginTop: 0 }}>{matchOver ? matchOutcome : roundLine}</h2>
        {!matchSummaryView && (
          <>
            <p style={{ fontSize: '1.5rem', margin: '0.5rem 0' }}>
              <strong>{humanPts}</strong> — <strong>{cpuPts}</strong>
            </p>
            <p
              style={{
                opacity: 0.7,
                margin: '0 0 1rem 0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35em',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              {humanLabelNode} <span>vs</span> {cpuLabelNode} <span>(out of 120)</span>
            </p>
            {showMatchScore && (
              <p style={{ opacity: 0.85, margin: '0 0 1rem 0', fontSize: '0.95rem' }}>
                Match: <strong>{matchScore.human}</strong> — <strong>{matchScore.cpu}</strong>{' '}
                (first to {matchTarget})
              </p>
            )}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                margin: '0.5rem 0',
              }}
            >
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <CapturedSummaryRow
                  label={humanLabel}
                  captured={humanCaptured}
                  points={humanPts}
                  totalCards={humanCaptured.length}
                />
              </div>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <CapturedSummaryRow
                  label={cpuLabel}
                  captured={cpuCaptured}
                  points={cpuPts}
                  totalCards={cpuCaptured.length}
                />
              </div>
            </div>
          </>
        )}
        {matchSummaryView && (
          <RoundHistoryTable
            roundHistory={roundHistory}
            cpuLabel={cpuLabel}
            humanLabel={humanLabel}
          />
        )}
        {!matchOver && matchTarget === 1 && roundWinner === 'tie' && (
          // Edge case: best-of-1 with a tied round → no winner, replay
          <p style={{ opacity: 0.7, margin: '0 0 1.25rem 0', fontStyle: 'italic' }}>
            Replay the round.
          </p>
        )}
        {matchOver ? (
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {hasMatchSummary && (
              <button
                style={
                  matchSummaryView
                    ? { ...primaryButton, background: 'transparent', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }
                    : { ...primaryButton, background: 'transparent', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }
                }
                onClick={() => setMatchSummaryView((v) => !v)}
              >
                {matchSummaryView ? 'Back to Round' : 'View Match Summary'}
              </button>
            )}
            <button style={primaryButton} onClick={onRestart}>
              Play Again
            </button>
          </div>
        ) : (
          <button style={primaryButton} onClick={onNextRound}>
            {countdown !== null ? `Next Round (${countdown})` : 'Next Round'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles (kept minimal — most layout comes from GameLayout/CapturedPile CSS modules)
// ---------------------------------------------------------------------------

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
  background: 'var(--color-accent)',
  color: '#000',
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
  background: 'linear-gradient(180deg, #1e3a2f 0%, #0d1f17 100%)',
  border: '2px solid var(--color-accent)',
  color: 'var(--color-text-primary)',
  padding: '2rem',
  borderRadius: '12px',
  textAlign: 'center',
  minWidth: '320px',
  maxWidth: 'min(640px, 92vw)',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
};
