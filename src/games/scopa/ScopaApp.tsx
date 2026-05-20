import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useGame } from './hooks/useGame';
import { useSettings } from '../../hooks/useSettings';
import { useSound } from '../../hooks/useSound';
import { useStats } from '../../hooks/useStats';
import { useMultiplayer } from '../../hooks/useMultiplayer';
import { GameLayout } from '../../components/Layout/GameLayout';
import { PlayerHand } from '../../components/Table/PlayerHand';
import { TableCards } from '../../components/Table/TableCards';
import { CapturedPile } from '../../components/Table/CapturedPile';
import { ScoreBoard } from '../../components/UI/ScoreBoard';
import { StartScreen } from '../../components/UI/StartScreen';
import { RoundEndScreen } from '../../components/UI/RoundEndScreen';
import { GameEndScreen } from '../../components/UI/GameEndScreen';
import { ScopaCelebration } from '../../components/UI/ScopaCelebration';
import { SetteBelloCelebration } from '../../components/UI/SetteBelloCelebration';
import { SettingsModal } from '../../components/UI/SettingsModal';
import { StatsModal, type StatsModalOpponent, type StatsModalGame } from '../../components/UI/StatsModal';
import { AIPlayerLabel } from '../../components/UI/AIPlayerLabel';
import { ConfirmDialog } from '../../components/UI/ConfirmDialog';
import { RulesModal } from '../../components/UI/RulesModal';
import { GameControls } from '../../components/UI/GameControls';
import { CpuCardAnimation } from '../../components/UI/CpuCardAnimation';
import { DealingAnimation, type DealMode } from '../../components/UI/DealingAnimation';
import { CaptureChoiceModal } from '../../components/UI/CaptureChoiceModal';
import { CapturedCardsModal } from '../../components/UI/CapturedCardsModal';
import { MultiplayerLobby } from '../../components/UI/MultiplayerLobby';
import { WaitingForOpponent } from '../../components/UI/WaitingForOpponent';
import { OpponentDisconnected } from '../../components/UI/OpponentDisconnected';
import { RestartOverlay } from '../../components/UI/RestartOverlay';
import { TurnTimer } from '../../components/UI/TurnTimer';
import { DeckProvider } from '../../contexts/DeckContext';
import { getValidMoves } from './rules';
import { AI_PLAYERS, AI_INFO, getGeminiAI, getGeminiSingleTurnAI, isAsyncAI, isGeminiAIType, isGeminiFreeAIType, isOpenAIAIType, isClaudeAIType, getGeminiTokenStats, getGeminiTokenDelta, resetGeminiTokenStats, startGeminiRound, endGeminiRound, getGeminiSingleTurnTokenStats, getGeminiSingleTurnTokenDelta, resetGeminiSingleTurnTokenStats, startGeminiSingleTurnRound, endGeminiSingleTurnRound, getOpenAI, getOpenAITokenStats, getOpenAITokenDelta, resetOpenAITokenStats, startOpenAIRound, endOpenAIRound, getOpenAISingleTurnAI, getOpenAISingleTurnTokenStats, getOpenAISingleTurnTokenDelta, resetOpenAISingleTurnTokenStats, startOpenAISingleTurnRound, endOpenAISingleTurnRound, getClaudeAI, getClaudeTokenStats, getClaudeTokenDelta, resetClaudeTokenStats, startClaudeRound, endClaudeRound, getClaudeSingleTurnAI, getClaudeSingleTurnTokenStats, getClaudeSingleTurnTokenDelta, resetClaudeSingleTurnTokenStats, startClaudeSingleTurnRound, endClaudeSingleTurnRound, getGeminiFreeAI, getGeminiFreeTokenStats, getGeminiFreeTokenDelta, resetGeminiFreeTokenStats, startGeminiFreeRound, endGeminiFreeRound, newGeminiFreeGame, RateLimitError } from './ai';
import type { ExtendedAIType, LLMAIContext, AnyAIPlayer, GeminiTokenStats, GeminiTokenDelta, OpenAITokenStats, OpenAITokenDelta, ClaudeTokenStats, ClaudeTokenDelta } from './ai';
import { TokenStatsDisplay } from '../../components/UI/TokenStatsDisplay';
import { ThinkingBubble } from '../../components/UI/ThinkingBubble';
import { ReasoningModal, type LastMoveData } from '../../components/UI/ReasoningModal';
import type { PanInfo } from 'framer-motion';
import type { Card, Move, PlayerId, GameState, RoundHistoryEntry } from './types';
import { useGameWorker, type CPUType } from './hooks/useGameWorker';
import { useWinOdds } from './hooks/useWinOdds';
import { moveKey } from './ai/winOdds';
import type { ScopaWinOddsView, WinOdds } from './ai/winOdds';
import { WinOddsPanel } from '../../components/Analysis/WinOddsPanel';
import type { ReactNode } from 'react';

// Storage keys for persistence
const SPECTATOR_AIS_KEY = 'scopa-spectator-ais';
const SPECTATOR_MODELS_KEY = 'scopa-spectator-models';

/**
 * Load spectator AI settings from localStorage
 */
function loadSpectatorAIs(): { player1: ExtendedAIType; player2: ExtendedAIType } {
  try {
    const saved = localStorage.getItem(SPECTATOR_AIS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.player1 === 'string' && typeof parsed.player2 === 'string') {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load spectator AI settings:', e);
  }
  return { player1: 'heuristic', player2: 'random' };
}

/**
 * Load spectator model settings from localStorage
 */
function loadSpectatorModels(): { player1: string; player2: string } {
  try {
    const saved = localStorage.getItem(SPECTATOR_MODELS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.player1 === 'string' && typeof parsed.player2 === 'string') {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load spectator model settings:', e);
  }
  return { player1: 'gemini-2.5-flash', player2: 'gemini-2.5-flash' };
}

// Session storage key (must match useMultiplayer.ts)
const MP_SESSION_KEY = 'scopa-mp-session';

// Check for join code from URL on initial load
// Only clear session if joining a DIFFERENT room than the stored session
// Note: URL cleanup is done via useEffect to avoid side effects in useState initializer
function getInitialJoinCode(): string | undefined {
  let joinCode: string | undefined;

  const params = new URLSearchParams(window.location.search);
  const joinFromParam = params.get('join');
  if (joinFromParam) {
    joinCode = joinFromParam.toUpperCase();
  } else {
    const pathMatch = window.location.pathname.match(/^\/join\/([A-Z0-9-]+)$/i);
    if (pathMatch) {
      joinCode = pathMatch[1].toUpperCase();
    }
  }

  if (joinCode) {
    // Check if we have a stored session for this room - if so, let auto-reconnect work
    try {
      const stored = localStorage.getItem(MP_SESSION_KEY);
      if (stored) {
        const session = JSON.parse(stored);
        // Only clear if it's a DIFFERENT room
        if (session.roomCode !== joinCode) {
          localStorage.removeItem(MP_SESSION_KEY);
        }
        // If same room, keep session for reconnect
      }
    } catch {
      // localStorage error - clear to be safe
      try { localStorage.removeItem(MP_SESSION_KEY); } catch { /* ignore */ }
    }
    return joinCode;
  }

  return undefined;
}

function ScopaApp() {
  const { state, startGame, playCard, endRound, nextRound, showGameEnd, resetGame } = useGame();
  const { settings, updateSetting, resetSettings } = useSettings();

  // Apply table style class to body element
  useEffect(() => {
    const body = document.body;
    // Remove any existing table style classes
    body.classList.remove('table-green', 'table-tablecloth');
    // Add the current table style class
    if (settings.tableStyle !== 'green') {
      body.classList.add(`table-${settings.tableStyle}`);
    }
  }, [settings.tableStyle]);

  const { play: playSound, resume: resumeAudio } = useSound({
    enabled: settings.soundEnabled,
  });
  const {
    recordGame,
    getOpponentStats,
    getGamesAgainst,
    getAllDisplayOpponents,
    clearStats,
  } = useStats();

  // Adapt Scopa's per-opponent stats to the generic StatsModal shape.
  const statsModalOpponents: StatsModalOpponent[] = useMemo(() => {
    return getAllDisplayOpponents().map((o) => {
      const s = getOpponentStats(o.type, o.model);
      return {
        key: `${o.type}:${o.model ?? ''}`,
        label: (
          <AIPlayerLabel
            aiType={o.type}
            model={o.model}
            showModeIndicator={false}
          />
        ),
        summary: {
          gamesPlayed: s.gamesPlayed,
          wins: s.wins,
          losses: s.losses,
          winRate: s.winRate,
        },
      };
    });
  }, [getAllDisplayOpponents, getOpponentStats]);

  const getStatsModalGames = useCallback(
    (key: string): StatsModalGame[] => {
      const [type, model] = key.split(':');
      const games = getGamesAgainst(
        type as ExtendedAIType,
        model ? model : undefined
      );
      return games.map((g) => {
        const indicator =
          g.isMultiTurn !== undefined
            ? {
                text: `${g.isMultiTurn ? '💬' : '1️⃣'}${g.useThinking ? '🧠' : ''}`,
                title: `${g.isMultiTurn ? 'Multi-turn' : 'Single-turn'}${g.useThinking ? ' + Thinking' : ''}`,
              }
            : undefined;
        return {
          id: g.id,
          timestamp: g.timestamp,
          playerScore: g.playerScore,
          opponentScore: g.opponentScore,
          outcome: g.playerWon ? 'win' : 'loss',
          modeIndicator: indicator,
        };
      });
    },
    [getGamesAgainst]
  );

  // Multiplayer state
  const multiplayer = useMultiplayer();
  const [isMultiplayerMode, setIsMultiplayerMode] = useState(false);
  const [initialJoinCode, setInitialJoinCode] = useState(getInitialJoinCode);
  const [multiplayerRoundHistory, setMultiplayerRoundHistory] = useState<RoundHistoryEntry[]>([]);

  // Keep URL in sync with multiplayer room state
  // Show /join/CODE when in a room, clear when leaving
  useEffect(() => {
    if (multiplayer.roomCode) {
      // In a room - show the join URL so it can be shared
      const joinPath = `/join/${multiplayer.roomCode}`;
      if (window.location.pathname !== joinPath) {
        window.history.replaceState({}, '', joinPath);
      }
    } else {
      // Not in a room - clear the join URL if present
      if (window.location.pathname.startsWith('/join/') || window.location.search.includes('join=')) {
        window.history.replaceState({}, '', '/');
      }
    }
  }, [multiplayer.roomCode]);

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedTableCards, setSelectedTableCards] = useState<Card[]>([]);
  const [scopaCelebration, setScopaCelebration] = useState<{ show: boolean; player: PlayerId; playerName?: string }>({
    show: false,
    player: 'human',
  });
  const [setteBelloCelebration, setSetteBelloCelebration] = useState<{ show: boolean; player: PlayerId; playerName?: string }>({
    show: false,
    player: 'human',
  });
  // Track if any celebration animation is active (including exit animation)
  // This prevents user input during the full celebration cycle
  const [celebrationActive, setCelebrationActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showCapturedCards, setShowCapturedCards] = useState(false);
  // Multiplayer captured-pile review: which seat's pile is open (host opt-in).
  const [mpOpenPile, setMpOpenPile] = useState<'self' | 'opponent' | null>(null);
  const [confirmNewGame, setConfirmNewGame] = useState(false);

  // Spectator mode: track which hands are shown face-up (toggled by clicking)
  const [spectatorHandsVisible, setSpectatorHandsVisible] = useState<{ cpu: boolean; human: boolean }>({
    cpu: false,
    human: false,
  });

  // AI last move data (for reasoning modal)
  const [lastMoveData, setLastMoveData] = useState<{ cpu: LastMoveData | null; human: LastMoveData | null }>({
    cpu: null,
    human: null,
  });

  // Reasoning modal state (locked = clicked/paused, preview = hover)
  const [reasoningModal, setReasoningModal] = useState<{ isOpen: boolean; player: PlayerId | null; locked: boolean }>({
    isOpen: false,
    player: null,
    locked: false,
  });

  // Capture choice modal state (shown when multiple capture options exist)
  const [captureChoiceModal, setCaptureChoiceModal] = useState<{
    isOpen: boolean;
    playedCard: Card | null;
    captureOptions: Move[];
  }>({ isOpen: false, playedCard: null, captureOptions: [] });

  // Spectator mode state (persisted to localStorage)
  const [spectatorAIs, setSpectatorAIs] = useState<{ player1: ExtendedAIType; player2: ExtendedAIType }>(loadSpectatorAIs);
  // Separate model selection for spectator mode (each player can have different model)
  const [spectatorModels, setSpectatorModels] = useState<{ player1: string; player2: string }>(loadSpectatorModels);
  const [isSpectatorPaused, setIsSpectatorPaused] = useState(false);
  // Track pause state before settings opened (to restore on close)
  const pausedBeforeSettings = useRef(false);

  // Web Worker for background simulation (runs when tab is hidden)
  // Only used when both spectator AIs are sync (random, heuristic, expert)
  const isSyncAI = useCallback((aiType: ExtendedAIType): aiType is CPUType => {
    return aiType === 'random' || aiType === 'heuristic' || aiType === 'expert';
  }, []);

  const canUseWorker = isSyncAI(spectatorAIs.player1) && isSyncAI(spectatorAIs.player2);

  // Track if we're using worker mode for background simulation
  const [useWorkerMode, setUseWorkerMode] = useState(false);
  // Store final game state from worker (persists after worker stops)
  const [workerFinalState, setWorkerFinalState] = useState<GameState | null>(null);

  const {
    gameState: workerGameState,
    isRunning: workerIsRunning,
    isPaused: workerIsPaused,
    startSimulation,
    stopSimulation,
    pauseSimulation,
    resumeSimulation,
  } = useGameWorker({
    onGameEnd: (finalState) => {
      // Store the final state so it persists for the game end screen
      setWorkerFinalState(finalState);
    },
    onError: (message) => {
      console.error('Worker error:', message);
      setUseWorkerMode(false);
      setWorkerFinalState(null);
    },
  });

  // Use worker state when in worker mode, otherwise use local state
  // Prioritize workerFinalState (for game end screen) over workerGameState (live updates)
  const activeState: GameState = useWorkerMode
    ? (workerFinalState || workerGameState || state)
    : state;

  // Gemini token stats (refreshed after each AI move)
  // For single player mode: use tokenStats (direct from AI instance)
  // For spectator mode: accumulate per-player stats from deltas
  const [tokenStats, setTokenStats] = useState<GeminiTokenStats | null>(null);
  const [tokenDelta, setTokenDelta] = useState<GeminiTokenDelta | null>(null);
  // Accumulated stats for spectator mode (built from deltas)
  const [player1TokenStats, setPlayer1TokenStats] = useState<GeminiTokenStats | null>(null);
  const [player2TokenStats, setPlayer2TokenStats] = useState<GeminiTokenStats | null>(null);
  const [player1TokenDelta, setPlayer1TokenDelta] = useState<GeminiTokenDelta | null>(null);
  const [player2TokenDelta, setPlayer2TokenDelta] = useState<GeminiTokenDelta | null>(null);

  // API error state for LLM players
  const [player1ApiError, setPlayer1ApiError] = useState<string | null>(null);
  const [player2ApiError, setPlayer2ApiError] = useState<string | null>(null);

  // Check if in spectator mode (use activeState for worker-aware check)
  const isSpectatorMode = activeState.gameMode === 'cpuVsCPU';

  // Helper to check if an AI type is a Gemini variant (use exported function)
  const isGeminiAI = isGeminiAIType;
  // Helper to check if an AI type is an OpenAI variant (use exported function)
  const isOpenAIAI = isOpenAIAIType;
  // Helper to check if an AI type is a Claude variant (use exported function)
  const isClaudeAI = isClaudeAIType;
  // Helper to check if an AI type is any LLM (Gemini, OpenAI, or Claude)
  const isGeminiFree = isGeminiFreeAIType;
  const isLLMAI = useCallback((aiType: ExtendedAIType) => isGeminiAI(aiType) || isOpenAIAI(aiType) || isClaudeAI(aiType) || isGeminiFree(aiType), []);

  // Helper to get the model for a given AI type from settings
  const getModelForAI = useCallback((aiType: ExtendedAIType): string => {
    if (isGeminiFree(aiType)) return 'gemini-3-flash-preview';
    if (isOpenAIAI(aiType)) return settings.openaiModel;
    if (isClaudeAI(aiType)) return settings.claudeModel;
    return settings.geminiModel;
  }, [settings.openaiModel, settings.claudeModel, settings.geminiModel]);

  // Helper to get delta for a specific AI type and model
  // Returns a unified delta type (Gemini, OpenAI, and Claude deltas are structurally compatible)
  const getDeltaForAIType = useCallback((aiType: ExtendedAIType, model?: string, seat: 'cpu' | 'p1' | 'p2' = 'cpu'): GeminiTokenDelta | OpenAITokenDelta | ClaudeTokenDelta | null => {
    const useThinking = settings.useThinking;
    if (aiType === 'gemini-free') {
      return getGeminiFreeTokenDelta(seat);
    } else if (aiType === 'gemini-singleturn') {
      return getGeminiSingleTurnTokenDelta(model, useThinking, seat);
    } else if (aiType === 'gemini') {
      return getGeminiTokenDelta(model, useThinking, seat);
    } else if (aiType === 'openai') {
      return getOpenAITokenDelta(model, seat);
    } else if (aiType === 'openai-singleturn') {
      return getOpenAISingleTurnTokenDelta(model, seat);
    } else if (aiType === 'claude') {
      return getClaudeTokenDelta(model, useThinking, seat);
    } else if (aiType === 'claude-singleturn') {
      return getClaudeSingleTurnTokenDelta(model, useThinking, seat);
    }
    return null;
  }, [settings.useThinking]);

  // Helper to get full stats for a specific AI type and model. seat is
  // 'p1' / 'p2' in spectator mode so we read the right instance's tracker;
  // play mode defaults to 'cpu'.
  const getStatsForAIType = useCallback((aiType: ExtendedAIType, model?: string, seat: 'cpu' | 'p1' | 'p2' = 'cpu'): GeminiTokenStats | OpenAITokenStats | ClaudeTokenStats | null => {
    const useThinking = settings.useThinking;
    if (aiType === 'gemini-free') {
      return getGeminiFreeTokenStats(seat);
    } else if (aiType === 'gemini-singleturn') {
      return getGeminiSingleTurnTokenStats(model, useThinking, seat);
    } else if (aiType === 'gemini') {
      return getGeminiTokenStats(model, useThinking, seat);
    } else if (aiType === 'openai') {
      return getOpenAITokenStats(model, seat);
    } else if (aiType === 'openai-singleturn') {
      return getOpenAISingleTurnTokenStats(model, seat);
    } else if (aiType === 'claude') {
      return getClaudeTokenStats(model, useThinking, seat);
    } else if (aiType === 'claude-singleturn') {
      return getClaudeSingleTurnTokenStats(model, useThinking, seat);
    }
    return null;
  }, [settings.useThinking]);

  // Helper to update token stats for single player mode
  const updateTokenStats = useCallback(() => {
    if (!isSpectatorMode && isLLMAI(settings.cpuAI)) {
      const model = isOpenAIAI(settings.cpuAI)
        ? settings.openaiModel
        : isClaudeAI(settings.cpuAI)
          ? settings.claudeModel
          : settings.geminiModel;
      const stats = getStatsForAIType(settings.cpuAI, model);
      const delta = getDeltaForAIType(settings.cpuAI, model);
      setTokenStats(stats as GeminiTokenStats);
      setTokenDelta(delta as GeminiTokenDelta);
    }
  }, [isSpectatorMode, settings.cpuAI, settings.openaiModel, settings.claudeModel, settings.geminiModel, getStatsForAIType, getDeltaForAIType, isLLMAI, isOpenAIAI, isClaudeAI]);

  // Helper to accumulate delta into existing stats
  const accumulateStats = useCallback((
    prevStats: GeminiTokenStats | null,
    delta: GeminiTokenDelta | OpenAITokenDelta | ClaudeTokenDelta | null,
    model: string,
    aiType: ExtendedAIType
  ): GeminiTokenStats | null => {
    if (!delta) return prevStats;

    // Create display name from model
    let modelDisplayName: string;
    if (isOpenAIAI(aiType)) {
      const shortName = model.replace(/^gpt-/i, '').replace(/^o(\d)/, 'O$1');
      modelDisplayName = `GPT ${shortName}`;
    } else if (isClaudeAI(aiType)) {
      const withoutDate = model.replace(/-\d{8}$/, '');
      const shortName = withoutDate.replace('claude-', '').split('-').map(
        part => part.charAt(0).toUpperCase() + part.slice(1)
      ).join(' ').replace(/(\d) (\d)/g, '$1.$2');
      modelDisplayName = `Claude ${shortName}`;
    } else {
      const shortName = model.replace('gemini-', '').split('-').map(
        (part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
      ).join(' ');
      modelDisplayName = `Gemini ${shortName}`;
    }

    // Get thought/reasoning tokens (Gemini uses thoughtTokens, OpenAI uses reasoningTokens)
    const thoughtDelta = 'thoughtTokens' in delta ? delta.thoughtTokens : ('reasoningTokens' in delta ? delta.reasoningTokens : 0);

    if (!prevStats) {
      // Initialize new stats from first delta
      return {
        promptTokens: delta.promptTokens,
        responseTokens: delta.responseTokens,
        thoughtTokens: thoughtDelta,
        totalTokens: delta.totalTokens,
        cachedTokens: 0,
        requestCount: delta.totalTokens > 0 ? 1 : 0, // Only count if actual API call
        roundPromptTokens: delta.promptTokens,
        roundResponseTokens: delta.responseTokens,
        roundThoughtTokens: thoughtDelta,
        roundTotalTokens: delta.totalTokens,
        roundRequestCount: delta.totalTokens > 0 ? 1 : 0,
        modelId: model,
        modelDisplayName,
        totalTimeMs: delta.turnTimeMs,
        lastTurnTimeMs: delta.turnTimeMs,
        minTurnTimeMs: delta.turnTimeMs > 0 ? delta.turnTimeMs : 0,
        maxTurnTimeMs: delta.turnTimeMs,
        roundTotalTimeMs: delta.turnTimeMs,
      };
    }

    // Calculate new min/max timing
    let newMinTime = prevStats.minTurnTimeMs;
    let newMaxTime = prevStats.maxTurnTimeMs;
    if (delta.turnTimeMs > 0) {
      if (newMinTime === 0 || delta.turnTimeMs < newMinTime) {
        newMinTime = delta.turnTimeMs;
      }
      if (delta.turnTimeMs > newMaxTime) {
        newMaxTime = delta.turnTimeMs;
      }
    }

    // Accumulate into existing stats
    return {
      ...prevStats,
      promptTokens: prevStats.promptTokens + delta.promptTokens,
      responseTokens: prevStats.responseTokens + delta.responseTokens,
      thoughtTokens: prevStats.thoughtTokens + thoughtDelta,
      totalTokens: prevStats.totalTokens + delta.totalTokens,
      requestCount: prevStats.requestCount + (delta.totalTokens > 0 ? 1 : 0),
      roundPromptTokens: prevStats.roundPromptTokens + delta.promptTokens,
      roundResponseTokens: prevStats.roundResponseTokens + delta.responseTokens,
      roundThoughtTokens: prevStats.roundThoughtTokens + thoughtDelta,
      roundTotalTokens: prevStats.roundTotalTokens + delta.totalTokens,
      roundRequestCount: prevStats.roundRequestCount + (delta.totalTokens > 0 ? 1 : 0),
      totalTimeMs: prevStats.totalTimeMs + delta.turnTimeMs,
      lastTurnTimeMs: delta.turnTimeMs,
      minTurnTimeMs: newMinTime,
      maxTurnTimeMs: newMaxTime,
      roundTotalTimeMs: prevStats.roundTotalTimeMs + delta.turnTimeMs,
    };
  }, [isOpenAIAI, isClaudeAI]);

  // Helper to update token stats for a specific player in spectator mode
  const updatePlayerTokenStats = useCallback((player: 'player1' | 'player2') => {
    const aiType = player === 'player1' ? spectatorAIs.player1 : spectatorAIs.player2;
    const model = player === 'player1' ? spectatorModels.player1 : spectatorModels.player2;
    if (!isLLMAI(aiType)) return;

    // Pass the matching seat key so we read the right per-seat instance.
    const seat = player === 'player1' ? 'p1' : 'p2';
    const delta = getDeltaForAIType(aiType, model, seat);

    if (player === 'player1') {
      setPlayer1TokenDelta(delta as GeminiTokenDelta);
      setPlayer1TokenStats(prev => accumulateStats(prev, delta, model, aiType));
    } else {
      setPlayer2TokenDelta(delta as GeminiTokenDelta);
      setPlayer2TokenStats(prev => accumulateStats(prev, delta, model, aiType));
    }
  }, [spectatorAIs, spectatorModels, getDeltaForAIType, accumulateStats, isLLMAI]);

  // Animation speed multipliers based on settings
  const getAnimationDelay = useCallback((baseMs: number) => {
    if (settings.animationSpeed === 'instant') return 10; // Minimal delay for instant mode
    const multipliers = { fast: 0.5, normal: 1, slow: 2 };
    return baseMs * multipliers[settings.animationSpeed];
  }, [settings.animationSpeed]);

  // Check if animations should be skipped (instant mode)
  const isInstantMode = settings.animationSpeed === 'instant';

  // Get AI player instance for a given AI type and model. The `seat`
  // parameter ('cpu' | 'p1' | 'p2') ensures spectator-mode same-model
  // self-play gets distinct instances per seat — without it, both
  // players would share one chat session / conversation id / message
  // array / token tracker and "you" would alternate inside one
  // conversation.
  const getAIPlayer = useCallback((aiType: ExtendedAIType, model?: string, seat: 'cpu' | 'p1' | 'p2' = 'cpu'): AnyAIPlayer => {
    const useThinking = settings.useThinking;
    if (aiType === 'gemini-free') {
      const geminiFree = getGeminiFreeAI(seat);
      if (geminiFree) return geminiFree;
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'gemini') {
      const geminiModel = model || settings.geminiModel;
      const gemini = getGeminiAI(geminiModel, useThinking, seat);
      if (gemini) return gemini;
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'gemini-singleturn') {
      const geminiModel = model || settings.geminiModel;
      const gemini = getGeminiSingleTurnAI(geminiModel, useThinking, seat);
      if (gemini) return gemini;
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'openai') {
      const openaiModel = model || settings.openaiModel;
      const openai = getOpenAI(openaiModel, seat);
      if (openai) return openai;
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'openai-singleturn') {
      const openaiModel = model || settings.openaiModel;
      const openai = getOpenAISingleTurnAI(openaiModel, seat);
      if (openai) return openai;
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'claude') {
      const claudeModel = model || settings.claudeModel;
      const claude = getClaudeAI(claudeModel, useThinking, seat);
      if (claude) return claude;
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'claude-singleturn') {
      const claudeModel = model || settings.claudeModel;
      const claude = getClaudeSingleTurnAI(claudeModel, useThinking, seat);
      if (claude) return claude;
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'multiplayer') {
      return AI_PLAYERS.heuristic;
    }
    return AI_PLAYERS[aiType];
  }, [settings.geminiModel, settings.openaiModel, settings.claudeModel, settings.useThinking]);

  // Build extended context for LLM AI
  const buildLLMContext = useCallback((
    hand: Card[],
    table: Card[],
    player: PlayerId
  ): LLMAIContext => {
    const selfPlayer = player;
    const oppPlayer = player === 'human' ? 'cpu' : 'human';

    // Compute all valid moves for this player
    const validMoves: Move[] = [];
    for (const card of hand) {
      const moves = getValidMoves(card, table, player);
      validMoves.push(...moves);
    }

    return {
      hand,
      table,
      player,
      scores: {
        self: state.scores[selfPlayer],
        opponent: state.scores[oppPlayer],
      },
      targetScore: state.targetScore,
      roundNumber: state.roundNumber,
      opponentHandCount: state.players[oppPlayer].hand.length,
      selfCapturedCount: state.players[selfPlayer].captured.length,
      opponentCapturedCount: state.players[oppPlayer].captured.length,
      deckCount: state.round.deck.length,
      lastOpponentMove: lastMoves.current[oppPlayer],
      lastSelfMove: lastMoves.current[selfPlayer],
      validMoves,
    };
  }, [state.scores, state.targetScore, state.roundNumber, state.players, state.round.deck.length]);

  // Track previous scopa counts to detect new scopas
  // Initialize from current state to prevent replay on page refresh
  const prevScopaCounts = useRef({ human: state.players.human.scopaCount, cpu: state.players.cpu.scopaCount });
  // Track who has sette bello (null = neither, 'human' or 'cpu' = that player has it)
  // Initialize from current state to prevent replay on page refresh
  const prevSetteBelloOwner = useRef<PlayerId | null>(
    state.players.human.captured.some(c => c.suit === 'coins' && c.value === 7) ? 'human' :
    state.players.cpu.captured.some(c => c.suit === 'coins' && c.value === 7) ? 'cpu' : null
  );
  // Track last move made by each player (for LLM context)
  const lastMoves = useRef<{ human: Move | null; cpu: Move | null }>({ human: null, cpu: null });

  // Ref for table area (for drag-and-drop detection)
  const tableRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Card animation state (used for CPU and human in spectator mode)
  const [animatingCard, setAnimatingCard] = useState<{
    card: Card;
    phase: 'reveal' | 'moving' | 'capturing' | 'done';
    capturedCards: Card[];
    player: PlayerId;
  } | null>(null);

  // Dealing animation state
  const [isDealing, setIsDealing] = useState(false);
  const [dealMode, setDealMode] = useState<DealMode>('hands');
  // Track if this is a round-start deal (needs table phase before hands phase)
  const [isRoundStartDeal, setIsRoundStartDeal] = useState(false);
  // Track if CPU animation is being scheduled to prevent double-firing
  const cpuAnimationScheduled = useRef(false);
  // Track if an async AI API request is in flight (prevents re-triggering on pause/unpause)
  const aiRequestInFlight = useRef(false);

  // Track deck count to detect deals (more reliable than hand count)
  // Deck decreases by 10 on round start (4 table + 6 hands), by 6 mid-round
  const prevDeckCount = useRef<number | null>(null);
  const prevRoundNumber = useRef(0);

  // Unified animation blocking - blocks ALL user input during any animation
  // Uses celebrationActive instead of .show to block during exit animations too
  const isAnimationBlocking = isDealing || celebrationActive || !!animatingCard;

  // Clear selection when turn changes or game state changes
  useEffect(() => {
    setSelectedCard(null);
    setSelectedTableCards([]);
  }, [state.round.currentPlayer, state.status]);

  // Control body scroll: allow on start screen, hide during game to prevent flickering
  useEffect(() => {
    if (state.status === 'idle') {
      document.body.style.overflowY = 'auto';
    } else {
      document.body.style.overflowY = 'hidden';
    }
  }, [state.status]);

  // Persist spectator AI settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SPECTATOR_AIS_KEY, JSON.stringify(spectatorAIs));
    } catch (e) {
      console.warn('Failed to persist spectator AI settings:', e);
    }
  }, [spectatorAIs]);

  // Persist spectator model settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SPECTATOR_MODELS_KEY, JSON.stringify(spectatorModels));
    } catch (e) {
      console.warn('Failed to persist spectator model settings:', e);
    }
  }, [spectatorModels]);

  // Track previous round number to detect actual round changes (not initial mount)
  const prevRoundNumberForCelebrations = useRef(state.roundNumber);

  // Reset sette bello and last moves tracking when a new round starts
  // Skip on initial mount (when loading from localStorage) to prevent replaying celebrations
  useEffect(() => {
    if (prevRoundNumberForCelebrations.current !== state.roundNumber) {
      prevSetteBelloOwner.current = null;
      lastMoves.current = { human: null, cpu: null };
      prevRoundNumberForCelebrations.current = state.roundNumber;
    }
  }, [state.roundNumber]);

  // Detect dealing by tracking deck count changes
  // This is more robust than tracking hand count because deck only changes during deals
  // IMPORTANT: Using useLayoutEffect to run BEFORE paint, preventing flash of cards before animation
  useLayoutEffect(() => {
    if (state.status !== 'playing') {
      // Reset tracking when not playing - use -1 for round to ensure first round triggers
      prevDeckCount.current = null;
      prevRoundNumber.current = -1;
      return;
    }

    const currentDeckCount = state.round.deck.length;

    // On first render in playing state (prevDeckCount is null), trigger round start animation
    if (prevDeckCount.current === null) {
      prevDeckCount.current = currentDeckCount;
      prevRoundNumber.current = state.roundNumber;

      // If deck is 30 (fresh deal: 40 - 4 table - 6 hands), trigger round start animation
      // Phase 1: deal table cards first
      if (currentDeckCount === 30) {
        setIsDealing(true);
        setDealMode('table');
        setIsRoundStartDeal(true);
      }
      return;
    }

    // Check for new round (round number increased)
    if (state.roundNumber !== prevRoundNumber.current) {
      prevRoundNumber.current = state.roundNumber;
      prevDeckCount.current = currentDeckCount;
      if (currentDeckCount === 30 && !isDealing) {
        // Phase 1: deal table cards first
        setIsDealing(true);
        setDealMode('table');
        setIsRoundStartDeal(true);
      }
      return;
    }

    // Detect mid-round deals: deck decreased by 6 (dealt 3 cards to each player)
    const deckDecrease = prevDeckCount.current - currentDeckCount;
    if (deckDecrease === 6 && !isDealing) {
      setIsDealing(true);
      setDealMode('hands');
      setIsRoundStartDeal(false);
    }

    // Update tracking
    prevDeckCount.current = currentDeckCount;
  }, [state.round.deck.length, state.status, state.roundNumber, isDealing]);

  // Calculate valid moves for selected card
  const validMoves = useMemo(() => {
    if (!selectedCard || state.round.currentPlayer !== 'human') {
      return [];
    }
    return getValidMoves(selectedCard, state.round.table, 'human');
  }, [selectedCard, state.round.table, state.round.currentPlayer]);

  // Check if selected card can only place (no capture possible)
  const canOnlyPlace = useMemo(() => {
    return validMoves.length === 1 && validMoves[0].capturedCards.length === 0;
  }, [validMoves]);

  // Get all valid capture target card IDs
  const validCaptureTargetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const move of validMoves) {
      for (const card of move.capturedCards) {
        ids.add(card.id);
      }
    }
    return Array.from(ids);
  }, [validMoves]);

  // Calculate the sum of selected table cards
  const selectedSum = useMemo(() => {
    return selectedTableCards.reduce((sum, card) => sum + card.value, 0);
  }, [selectedTableCards]);

  // Check if current selection forms a valid capture
  const isValidCapture = useMemo(() => {
    if (!selectedCard || selectedTableCards.length === 0) {
      return false;
    }
    // Check if this exact combination exists in valid moves
    const selectedIds = new Set(selectedTableCards.map(c => c.id));
    return validMoves.some(move => {
      if (move.capturedCards.length !== selectedTableCards.length) {
        return false;
      }
      return move.capturedCards.every(c => selectedIds.has(c.id));
    });
  }, [selectedCard, selectedTableCards, validMoves]);

  // Handle clicking a card in hand
  const handleHandCardClick = useCallback((card: Card) => {
    if (isAnimationBlocking) return; // Block input during animations
    if (selectedCard?.id === card.id) {
      // Deselect
      setSelectedCard(null);
      setSelectedTableCards([]);
    } else {
      // Select new card
      setSelectedCard(card);
      setSelectedTableCards([]);
    }
  }, [selectedCard, isAnimationBlocking]);

  // Handle double-clicking a card in hand (place card)
  const handleHandCardDoubleClick = useCallback((card: Card) => {
    if (isAnimationBlocking) return; // Block input during animations
    if (state.round.currentPlayer !== 'human') return;

    const moves = getValidMoves(card, state.round.table, 'human');
    const placeMove = moves.find(m => m.capturedCards.length === 0);

    if (placeMove) {
      playCard(placeMove);
      // Record last move for LLM context
      lastMoves.current.human = placeMove;
      setSelectedCard(null);
      setSelectedTableCards([]);
    }
  }, [state.round.currentPlayer, state.round.table, playCard, isAnimationBlocking]);

  // Handle card drag start
  const handleCardDragStart = useCallback((card: Card) => {
    if (isAnimationBlocking) return; // Block input during animations
    setIsDragging(true);
    setSelectedCard(card);
    setSelectedTableCards([]);
  }, [isAnimationBlocking]);

  // Execute a move with capture animation
  const executeMoveWithAnimation = useCallback((move: Move) => {
    if (move.capturedCards.length > 0) {
      // Start capture animation - show levitate then fly to pile
      setAnimatingCard({
        card: move.cardPlayed,
        phase: 'moving',
        capturedCards: move.capturedCards,
        player: 'human',
      });

      // Brief delay for levitate animation, then execute and show fly-to-pile
      setTimeout(() => {
        playCard(move);
        playSound('capture'); // Play capture sound
        // Play coin sound if any denari added to pile (played card or captured cards)
        if (move.cardPlayed.suit === 'coins' || move.capturedCards.some(c => c.suit === 'coins')) {
          playSound('coin');
        }
        // Record last move for LLM context
        lastMoves.current.human = move;
        setAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
        setSelectedCard(null);
        setSelectedTableCards([]);
        // Clear animation after exit animation completes
        setTimeout(() => {
          setAnimatingCard(null);
        }, 900);
      }, 400);
    } else {
      // No capture, just place
      playCard(move);
      playSound('play'); // Play card place sound
      // Record last move for LLM context
      lastMoves.current.human = move;
      setSelectedCard(null);
      setSelectedTableCards([]);
    }
  }, [playCard, playSound]);

  // Handle card drag end - check if dropped on table
  const handleCardDragEnd = useCallback((card: Card, info: PanInfo) => {
    setIsDragging(false);

    if (isAnimationBlocking) return; // Block input during animations
    if (state.round.currentPlayer !== 'human') return;

    // Check if dropped on table area
    if (tableRef.current) {
      const tableRect = tableRef.current.getBoundingClientRect();
      const { x, y } = info.point;

      const isOverTable =
        x >= tableRect.left &&
        x <= tableRect.right &&
        y >= tableRect.top &&
        y <= tableRect.bottom;

      if (isOverTable) {
        const moves = getValidMoves(card, state.round.table, 'human');

        // If only one move option (place or single capture), execute it
        if (moves.length === 1) {
          executeMoveWithAnimation(moves[0]);
        } else if (moves.length > 1) {
          // Multiple options - filter to capture moves only
          const captureOptions = moves.filter(m => m.capturedCards.length > 0);

          if (captureOptions.length === 1) {
            // Only one capture option, execute it
            executeMoveWithAnimation(captureOptions[0]);
          } else if (captureOptions.length > 1) {
            // Multiple capture options - show choice modal
            setCaptureChoiceModal({
              isOpen: true,
              playedCard: card,
              captureOptions,
            });
          }
        }
      }
    }
  }, [state.round.currentPlayer, state.round.table, executeMoveWithAnimation, isAnimationBlocking]);

  // Handle clicking a table card
  const handleTableCardClick = useCallback((card: Card) => {
    if (isAnimationBlocking) return; // Block input during animations
    if (!selectedCard) return;

    // Check if this card is a valid target
    if (!validCaptureTargetIds.includes(card.id)) return;

    // Toggle selection
    setSelectedTableCards(prev => {
      const isSelected = prev.some(c => c.id === card.id);
      if (isSelected) {
        return prev.filter(c => c.id !== card.id);
      } else {
        return [...prev, card];
      }
    });
  }, [selectedCard, validCaptureTargetIds, isAnimationBlocking]);

  // Execute capture with animation
  const executeCapture = useCallback(() => {
    if (!selectedCard || !isValidCapture) return;

    // Find the matching move
    const selectedIds = new Set(selectedTableCards.map(c => c.id));
    const move = validMoves.find(m => {
      if (m.capturedCards.length !== selectedTableCards.length) return false;
      return m.capturedCards.every(c => selectedIds.has(c.id));
    });

    if (move) {
      executeMoveWithAnimation(move);
    }
  }, [selectedCard, selectedTableCards, validMoves, isValidCapture, executeMoveWithAnimation]);

  // Execute place
  const executePlace = useCallback(() => {
    if (!selectedCard || !canOnlyPlace) return;

    const placeMove = validMoves[0];
    playCard(placeMove);
    playSound('play'); // Play card place sound
    // Record last move for LLM context
    lastMoves.current.human = placeMove;
    setSelectedCard(null);
  }, [selectedCard, canOnlyPlace, validMoves, playCard, playSound]);

  // Handle capture selection from modal
  const handleCaptureChoice = useCallback((move: Move) => {
    setCaptureChoiceModal({ isOpen: false, playedCard: null, captureOptions: [] });
    executeMoveWithAnimation(move);
  }, [executeMoveWithAnimation]);

  // Handle cancel capture choice modal
  const handleCancelCaptureChoice = useCallback(() => {
    setCaptureChoiceModal({ isOpen: false, playedCard: null, captureOptions: [] });
  }, []);

  // ---------------------------------------------------------------------
  // Win odds (analysis mode). Single-player Play OR watch (spectator)
  // mode. Never multiplayer, and never the instant no-animation worker
  // blitz (positions change far too fast to read and would thrash the
  // worker). Mirrors Briscola; tallied per MOVE (a Scopa card can have
  // several capture options).
  // ---------------------------------------------------------------------
  const winOddsActive =
    settings.showWinOdds && !isMultiplayerMode && !useWorkerMode;

  // Hold the worker recompute until the opponent's play animation has
  // visually landed — otherwise the new odds would flash before the
  // user sees the card move. The state changes immediately, the
  // animation runs separately; we wait for animatingCard to clear.
  const cpuMoveAnimating =
    animatingCard?.player === 'cpu' &&
    (animatingCard.phase === 'moving' || animatingCard.phase === 'capturing');

  // Skip the recompute right after the human plays: displayedWinOdds
  // is set to the cached per-move outcome (which equals the post-play
  // OVERALL by construction), so no fresh worker run is needed until
  // the OPPONENT plays or new cards are dealt. Detected from the
  // actual game event (the human's hand shrank by 1 with the played
  // card removed) rather than from a currentPlayer transition — that
  // earlier approach (92070de) also fired at round/game starts where
  // the CPU leads, which was the regression that vanished the
  // intermediate-odds glance.
  const [freezeUntilCpuPlay, setFreezeUntilCpuPlay] = useState(false);

  const winOddsView = useMemo<ScopaWinOddsView | null>(() => {
    if (!winOddsActive) return null;
    if (activeState.status !== 'playing') return null;
    // Wait for the start-of-round dealing animation to finish before
    // kicking off the worker — otherwise the panel would appear with
    // numbers while the cards are still being shuffled in.
    if (isDealing) return null;
    if (cpuMoveAnimating) return null; // wait for the played card to land
    if (freezeUntilCpuPlay) return null; // human just played: reuse cache
    // Always the bottom seat ('human' / spectator player 1). NOTE we
    // intentionally do NOT gate on currentPlayer === 'human' here:
    // when it's the opponent's turn (e.g. fresh deal where the CPU
    // leads), the engine returns an OVERALL estimate so the panel can
    // surface an intermediate "what's my outlook before they play"
    // glance. It re-computes after their card lands (cpuMoveAnimating
    // gate above pauses computation through the animation).
    if (activeState.players.human.hand.length === 0) return null;
    return { game: activeState, player: 'human' };
  }, [
    activeState,
    winOddsActive,
    cpuMoveAnimating,
    isDealing,
    freezeUntilCpuPlay,
  ]);

  const { odds: winOdds, computing: winOddsComputing } = useWinOdds({
    enabled: winOddsActive,
    view: winOddsView,
    totalSamples: settings.winOddsSamples,
    deep: settings.winOddsDeep,
  });

  // Cache the most recently computed odds so the panel stays visible
  // (with the previous estimate) while the opponent is thinking /
  // animating. Cleared when the round changes or the feature toggles
  // off, so the panel doesn't carry numbers across deals.
  const [displayedWinOdds, setDisplayedWinOdds] = useState<WinOdds | null>(null);
  useEffect(() => {
    if (winOdds) setDisplayedWinOdds(winOdds);
  }, [winOdds]);
  useEffect(() => {
    setDisplayedWinOdds(null);
    setFreezeUntilCpuPlay(false);
  }, [state.roundNumber]);
  useEffect(() => {
    // Clear on round end so the panel doesn't keep showing stale odds
    // behind the round-end overlay.
    if (state.status !== 'playing') {
      setDisplayedWinOdds(null);
      setFreezeUntilCpuPlay(false);
    }
  }, [state.status]);
  useEffect(() => {
    if (!winOddsActive) {
      setDisplayedWinOdds(null);
      setFreezeUntilCpuPlay(false);
    }
  }, [winOddsActive]);

  // ── Cache-reuse on human play ────────────────────────────────────
  // Detect "the human just played one card" the direct way: the human's
  // hand reference changed AND its length dropped by exactly 1 AND the
  // missing card matches lastMoves.current.human. That excludes every
  // other hand-mutation path (new deal, mid-round redeal, round start),
  // which is what tripped the previous currentPlayer-transition
  // detector at round/game boundaries. When detected, promote the
  // cached per-move odds to the headline (post-play OVERALL ==
  // perMove[playedKey] by construction) and freeze the worker. The
  // freeze is released the moment the turn comes back to 'human'
  // (CPU has played) — the cpuMoveAnimating gate still holds the
  // actual run until the played card lands.
  const prevHumanHandRef = useRef(activeState.players.human.hand);
  useEffect(() => {
    const prev = prevHumanHandRef.current;
    const curr = activeState.players.human.hand;
    prevHumanHandRef.current = curr;

    if (
      !winOddsActive ||
      isSpectatorMode ||
      activeState.status !== 'playing'
    ) {
      return;
    }
    if (curr === prev || curr.length !== prev.length - 1) return;

    const playedCardId = prev.find(
      (p) => !curr.some((c) => c.id === p.id)
    )?.id;
    const m = lastMoves.current.human;
    if (!m || !playedCardId || m.cardPlayed.id !== playedCardId) return;

    const cached = displayedWinOdds?.perMove?.[moveKey(m)];
    if (cached) {
      setDisplayedWinOdds({
        winPct: cached.winPct,
        tiePct: cached.tiePct,
        lossPct: cached.lossPct,
        samples: cached.samples,
        ciHalfWidth: cached.ciHalfWidth,
        expectedDiff: cached.expectedDiff,
        diffCi: cached.diffCi,
        // No perMove — the post-play OVERALL has no per-card breakdown
        // (and per-card / capture-modal lookups key off real card ids,
        // so they correctly show nothing).
      });
      setFreezeUntilCpuPlay(true);
    }
  }, [
    activeState.players.human.hand,
    activeState.status,
    winOddsActive,
    isSpectatorMode,
    displayedWinOdds,
  ]);

  // Release the freeze the moment the turn comes back to the human
  // (the opponent has played). winOddsView still gates on
  // cpuMoveAnimating, so the actual worker run waits for the played
  // card to land — no premature recompute.
  useEffect(() => {
    if (activeState.round.currentPlayer === 'human') {
      setFreezeUntilCpuPlay(false);
    }
  }, [activeState.round.currentPlayer]);

  // Per-move odds for the capture-choice modal — gated by both the
  // master Win-odds toggle AND the Per-card sub-toggle (per-card and
  // per-move are two facets of the same "show per-option detail"
  // preference, so they switch together). Keyed by Expert's moveKey.
  const winOddsPerMove =
    settings.showWinOdds && settings.showWinOddsPerCard && winOdds?.perMove
      ? winOdds.perMove
      : undefined;

  // Best-move expected score margin under each hand card (the strongest
  // play that card can make). The overall-best card is accented. Out of
  // flow in PlayerHand so it never reflows the hand.
  const winOddsHandAnnotations = useMemo<
    Record<string, ReactNode> | undefined
  >(() => {
    const pm = winOdds?.perMove;
    if (!settings.showWinOddsPerCard || !pm || !winOddsView) return undefined;
    // Captions render under the bottom hand (always the 'human' seat,
    // which is exactly what winOddsView analyses). In watch mode don't
    // reveal face-down hand strengths.
    if (isSpectatorMode && !spectatorHandsVisible.human) return undefined;
    const hand = winOddsView.game.players.human.hand;
    const table = winOddsView.game.round.table;
    const perCardBest: Record<string, number> = {};
    for (const card of hand) {
      let best = -Infinity;
      for (const mv of getValidMoves(card, table, 'human')) {
        const o = pm[moveKey(mv)];
        if (o && o.expectedDiff > best) best = o.expectedDiff;
      }
      if (best > -Infinity) perCardBest[card.id] = best;
    }
    const cardIds = Object.keys(perCardBest);
    if (cardIds.length === 0) return undefined;
    const overallBest = Math.max(...cardIds.map((id) => perCardBest[id]));
    const out: Record<string, ReactNode> = {};
    for (const id of cardIds) {
      const d = perCardBest[id];
      const isBest = d === overallBest;
      out[id] = (
        <span
          style={{
            color: isBest
              ? 'var(--color-accent)'
              : d >= 0
                ? 'var(--color-text-primary)'
                : '#e57373',
            fontWeight: isBest ? 700 : 500,
            opacity: isBest ? 1 : 0.75,
          }}
        >
          {d >= 0 ? '+' : ''}
          {d.toFixed(1)}
        </span>
      );
    }
    return out;
  }, [
    winOdds,
    winOddsView,
    settings.showWinOddsPerCard,
    isSpectatorMode,
    spectatorHandsVisible.human,
  ]);

  // Auto-execute single card capture when table card is clicked (with brief delay for visual feedback)
  useEffect(() => {
    if (selectedTableCards.length === 1 && isValidCapture) {
      // Single card capture - auto-execute after a brief delay to show selection
      const timeoutId = setTimeout(() => {
        executeCapture();
      }, 250);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedTableCards, isValidCapture, executeCapture]);

  // CPU turn execution with animation phases
  useEffect(() => {
    if (state.round.currentPlayer !== 'cpu' || state.status !== 'playing') {
      cpuAnimationScheduled.current = false;
      return;
    }

    // Pause in spectator mode
    if (isSpectatorMode && isSpectatorPaused) {
      return;
    }

    // Wait for celebration animations to complete
    if (scopaCelebration.show || setteBelloCelebration.show) {
      return;
    }

    // Wait for dealing animation to complete
    if (isDealing) {
      return;
    }

    // Don't start new animation if one is in progress, already scheduled, or API request in flight
    if (animatingCard || cpuAnimationScheduled.current || aiRequestInFlight.current) {
      return;
    }

    const cpuHand = state.players.cpu.hand;
    if (cpuHand.length === 0) {
      return;
    }

    // Mark as scheduled to prevent double-firing
    cpuAnimationScheduled.current = true;

    // Add delay for UX before starting animation (scaled by animation speed)
    const baseDelay = 500 + Math.random() * 500;
    const delay = getAnimationDelay(baseDelay);
    const timeoutId = setTimeout(async () => {
      // Use selected AI to select move (use spectator AI in spectator mode)
      const aiType = isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI;
      const model = isSpectatorMode
        ? spectatorModels.player2
        : (isOpenAIAI(settings.cpuAI) ? settings.openaiModel : (isClaudeAI(settings.cpuAI) ? settings.claudeModel : settings.geminiModel));
      // In spectator mode, the cpu seat is player2. Otherwise just 'cpu'.
      const ai = getAIPlayer(aiType, model, isSpectatorMode ? 'p2' : 'cpu');

      let moveToExecute: Move;
      let reasoning: string | null = null;
      if (isAsyncAI(ai)) {
        // Mark API request in flight to prevent re-triggering on pause/unpause
        aiRequestInFlight.current = true;
        try {
          // Async AI (e.g., Gemini) - build extended context and await
          const context = buildLLMContext(cpuHand, state.round.table, 'cpu');
          moveToExecute = await ai.selectMove(context);
          // Capture reasoning from LLM AI (they all have lastReasoning property)
          reasoning = (ai as { lastReasoning?: string }).lastReasoning || null;
          // Clear any previous error on success
          setPlayer2ApiError(null);
          // Update token stats after async AI move
          if (isSpectatorMode) {
            updatePlayerTokenStats('player2');
          } else {
            updateTokenStats();
          }
        } catch (err) {
          if (err instanceof RateLimitError) {
            // Rate limit hit — stop the game and return to start screen
            console.warn('Free AI rate limit reached:', err.message);
            setPlayer2ApiError(err.message);
            aiRequestInFlight.current = false;
            resetGame();
            return;
          }
          // Set error state for display
          const errorMessage = err instanceof Error ? err.message : 'API call failed';
          setPlayer2ApiError(errorMessage);
          console.error('AI API error:', err);
          // Fall back to heuristic AI for this move
          const fallbackAI = AI_PLAYERS.heuristic;
          moveToExecute = fallbackAI.selectMove({
            hand: cpuHand,
            table: state.round.table,
            player: 'cpu',
          });
          reasoning = null;
        } finally {
          aiRequestInFlight.current = false;
        }
      } else {
        // Sync AI - use simple context
        moveToExecute = ai.selectMove({
          hand: cpuHand,
          table: state.round.table,
          player: 'cpu',
        });
        reasoning = null; // Non-LLM AIs don't provide reasoning
      }

      // Update last move data for reasoning modal (capture table state BEFORE move)
      if (reasoning) {
        setLastMoveData(prev => ({
          ...prev,
          cpu: {
            cardPlayed: moveToExecute.cardPlayed,
            tableCards: [...state.round.table], // Snapshot of table before move
            capturedCards: moveToExecute.capturedCards,
            reasoning,
            player: 'cpu',
            aiName: isSpectatorMode ? AI_INFO[spectatorAIs.player2].name : AI_INFO[settings.cpuAI].name,
            opponentHandCount: state.players.human.hand.length,
            otherHandCards: cpuHand.filter(c => c.id !== moveToExecute.cardPlayed.id),
          },
        }));
      }

      // Start animation: reveal phase (flip card in place)
      setAnimatingCard({
        card: moveToExecute.cardPlayed,
        phase: 'reveal',
        capturedCards: moveToExecute.capturedCards,
        player: 'cpu',
      });

      // Phase 2: moving to table (after flip completes)
      setTimeout(() => {
        setAnimatingCard(prev => prev ? { ...prev, phase: 'moving' } : null);

        // Phase 3: execute move and show capture (after card reaches table)
        setTimeout(() => {
          playCard(moveToExecute);
          // Play appropriate sound
          playSound(moveToExecute.capturedCards.length > 0 ? 'capture' : 'play');
          // Play coin sound if any denari captured (including the played card)
          if (moveToExecute.capturedCards.length > 0 &&
            (moveToExecute.cardPlayed.suit === 'coins' || moveToExecute.capturedCards.some(c => c.suit === 'coins'))) {
            playSound('coin');
          }
          // Record last move for LLM context
          lastMoves.current.cpu = moveToExecute;
          if (moveToExecute.capturedCards.length > 0) {
            setAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
            // Phase 4: done (wait for cards to fly to pile)
            setTimeout(() => {
              setAnimatingCard(null);
              cpuAnimationScheduled.current = false;
            }, getAnimationDelay(900));
          } else {
            setAnimatingCard(null);
            cpuAnimationScheduled.current = false;
          }
        }, getAnimationDelay(500));
      }, getAnimationDelay(600));  // Give more time for flip animation
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      // Only reset scheduled flag if we're cleaning up before animation started and no API request in flight
      if (!animatingCard && !aiRequestInFlight.current) {
        cpuAnimationScheduled.current = false;
      }
    };
  }, [state.round.currentPlayer, state.status, state.players.cpu.hand, state.round.table, playCard, animatingCard, settings.cpuAI, isSpectatorMode, isSpectatorPaused, spectatorAIs.player2, scopaCelebration.show, setteBelloCelebration.show, isDealing, getAnimationDelay, getAIPlayer, buildLLMContext, playSound]);

  // Calculate and store round scores when entering roundEnd status
  // Handles final animations and Sette Bello detection for cards awarded at round end
  useEffect(() => {
    if (state.status !== 'roundEnd' || state.lastRoundScores) {
      return;
    }

    // Wait for any card animation to complete (skip in instant mode)
    if (animatingCard && !isInstantMode) {
      return;
    }

    // Wait for any celebration to complete (skip in instant mode)
    if ((scopaCelebration.show || setteBelloCelebration.show) && !isInstantMode) {
      return;
    }

    // Check if 7 of coins is on the table and will be awarded to lastCapture player
    const setteBelloOnTable = state.round.table.some(c => c.suit === 'coins' && c.value === 7);
    const lastCapturePlayer = state.round.lastCapture;

    // Skip celebration in instant mode, or if already showing
    if (setteBelloOnTable && lastCapturePlayer && prevSetteBelloOwner.current === null && !isInstantMode && !setteBelloCelebration.show) {
      // Sette Bello will be awarded in final hand - trigger celebration
      const playerName = lastCapturePlayer === 'human'
        ? (isSpectatorMode ? AI_INFO[spectatorAIs.player1].name : undefined)
        : (isSpectatorMode ? AI_INFO[spectatorAIs.player2].name : AI_INFO[settings.cpuAI].name);

      // Mark as captured to prevent re-triggering
      prevSetteBelloOwner.current = lastCapturePlayer;

      setCelebrationActive(true); // Block input until exit animation completes
      setSetteBelloCelebration({ show: true, player: lastCapturePlayer, playerName });
      playSound('setteBello'); // Play sette bello celebration sound
      // Auto-hide after display duration to trigger exit animation
      setTimeout(() => setSetteBelloCelebration(prev => ({ ...prev, show: false })), 1500);
      // Fallback: ensure celebrationActive is reset even if onExitComplete doesn't fire
      setTimeout(() => setCelebrationActive(false), 2000);
      // The effect will re-run after celebration ends and then call endRound()
      return;
    }

    // In instant mode, mark sette bello owner without celebration
    if (setteBelloOnTable && lastCapturePlayer && prevSetteBelloOwner.current === null) {
      prevSetteBelloOwner.current = lastCapturePlayer;
    }

    // Delay before showing round summary (minimal in instant mode)
    const delay = isInstantMode ? 10 : 1500;
    const timeoutId = setTimeout(() => {
      // Clear sessions for all LLM types (no-op if not active)
      endGeminiRound();
      endGeminiSingleTurnRound();
      endGeminiFreeRound();
      endOpenAIRound();
      endOpenAISingleTurnRound();
      endClaudeRound();
      endClaudeSingleTurnRound();
      endRound();
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [state.status, state.lastRoundScores, state.round.table, state.round.lastCapture, animatingCard, scopaCelebration.show, setteBelloCelebration.show, endRound, isSpectatorMode, spectatorAIs, settings.cpuAI, isInstantMode, playSound]);

  // Detect scopa and show celebration
  useEffect(() => {
    const currentHumanScopas = state.players.human.scopaCount;
    const currentCpuScopas = state.players.cpu.scopaCount;

    // In instant mode, skip celebrations entirely
    if (isInstantMode) {
      prevScopaCounts.current = { human: currentHumanScopas, cpu: currentCpuScopas };
      return;
    }

    if (currentHumanScopas > prevScopaCounts.current.human) {
      const playerName = isSpectatorMode ? AI_INFO[spectatorAIs.player1].name : undefined;
      setCelebrationActive(true); // Block input until exit animation completes
      setScopaCelebration({ show: true, player: 'human', playerName });
      playSound('scopa'); // Play scopa celebration sound
      // Auto-hide after display duration to trigger exit animation
      setTimeout(() => setScopaCelebration(prev => ({ ...prev, show: false })), 1500);
      // Fallback: ensure celebrationActive is reset even if onExitComplete doesn't fire
      setTimeout(() => setCelebrationActive(false), 2000);
    } else if (currentCpuScopas > prevScopaCounts.current.cpu) {
      const playerName = isSpectatorMode ? AI_INFO[spectatorAIs.player2].name : AI_INFO[settings.cpuAI].name;
      setCelebrationActive(true); // Block input until exit animation completes
      setScopaCelebration({ show: true, player: 'cpu', playerName });
      playSound('scopa'); // Play scopa celebration sound
      setTimeout(() => setScopaCelebration(prev => ({ ...prev, show: false })), 1500);
      // Fallback: ensure celebrationActive is reset even if onExitComplete doesn't fire
      setTimeout(() => setCelebrationActive(false), 2000);
    }

    prevScopaCounts.current = { human: currentHumanScopas, cpu: currentCpuScopas };
  }, [state.players.human.scopaCount, state.players.cpu.scopaCount, isSpectatorMode, spectatorAIs, settings.cpuAI, isInstantMode, playSound]);

  // Detect sette bello capture and show celebration
  useEffect(() => {
    // Check who currently has the 7 of coins
    const humanHasSetteBello = state.players.human.captured.some(
      c => c.suit === 'coins' && c.value === 7
    );
    const cpuHasSetteBello = state.players.cpu.captured.some(
      c => c.suit === 'coins' && c.value === 7
    );

    const currentOwner: PlayerId | null = humanHasSetteBello ? 'human' : cpuHasSetteBello ? 'cpu' : null;

    // In instant mode, skip celebration but still track owner
    if (isInstantMode) {
      prevSetteBelloOwner.current = currentOwner;
      return;
    }

    // If someone just captured it (previous was null, now someone has it)
    // Also check celebration isn't already showing to prevent double-trigger
    if (prevSetteBelloOwner.current === null && currentOwner !== null && !setteBelloCelebration.show) {
      const playerName = currentOwner === 'human'
        ? (isSpectatorMode ? AI_INFO[spectatorAIs.player1].name : undefined)
        : (isSpectatorMode ? AI_INFO[spectatorAIs.player2].name : AI_INFO[settings.cpuAI].name);

      // Mark as captured immediately to prevent re-triggering from other effect
      prevSetteBelloOwner.current = currentOwner;

      // Small delay to let capture animation start first
      setTimeout(() => {
        setCelebrationActive(true); // Block input until exit animation completes
        setSetteBelloCelebration({ show: true, player: currentOwner, playerName });
        playSound('setteBello'); // Play sette bello celebration sound
        // Auto-hide after display duration to trigger exit animation
        setTimeout(() => setSetteBelloCelebration(prev => ({ ...prev, show: false })), 1500);
        // Fallback: ensure celebrationActive is reset even if onExitComplete doesn't fire
        setTimeout(() => setCelebrationActive(false), 2000);
      }, 300);
    }

    // If we are in roundEnd status and the card is still on the table (currentOwner is null),
    // do NOT reset the ref. The roundEnd effect (above) handles the "virtual" ownership
    // for the celebration, and resetting it here causes an infinite loop.
    if (state.status === 'roundEnd' && currentOwner === null) {
      return;
    }

    prevSetteBelloOwner.current = currentOwner;
  }, [state.players.human.captured, state.players.cpu.captured, isSpectatorMode, spectatorAIs, settings.cpuAI, isInstantMode, playSound, setteBelloCelebration.show, state.status]);

  // Helper to reset all token stats and errors
  const resetAllTokenStats = useCallback(() => {
    resetGeminiTokenStats();
    resetGeminiSingleTurnTokenStats();
    resetGeminiFreeTokenStats();
    resetOpenAITokenStats();
    resetOpenAISingleTurnTokenStats();
    resetClaudeTokenStats();
    resetClaudeSingleTurnTokenStats();
    setTokenStats(null);
    setTokenDelta(null);
    setPlayer1TokenStats(null);
    setPlayer2TokenStats(null);
    setPlayer1TokenDelta(null);
    setPlayer2TokenDelta(null);
    // Reset API error states
    setPlayer1ApiError(null);
    setPlayer2ApiError(null);
  }, []);

  // Handle starting multiplayer mode
  const handleStartMultiplayer = useCallback(() => {
    setIsMultiplayerMode(true);
    // Clear URL join code after entering multiplayer mode
    if (window.location.pathname !== '/' || window.location.search) {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Handle leaving multiplayer mode
  const handleLeaveMultiplayer = useCallback(() => {
    multiplayer.leaveRoom();
    setIsMultiplayerMode(false);
    setInitialJoinCode(undefined);
  }, [multiplayer]);

  // ============================================================================
  // MULTIPLAYER COMPUTED VALUES
  // ============================================================================

  // Calculate valid moves for selected card in multiplayer
  const multiplayerValidMoves = useMemo(() => {
    if (!selectedCard || !multiplayer.gameState) {
      return [];
    }
    if (multiplayer.gameState.round.currentPlayer !== multiplayer.playerId) {
      return [];
    }
    return getValidMoves(selectedCard, multiplayer.gameState.round.table, 'human');
  }, [selectedCard, multiplayer.gameState, multiplayer.playerId]);

  // Check if selected card can only place in multiplayer (no capture possible)
  const multiplayerCanOnlyPlace = useMemo(() => {
    return multiplayerValidMoves.length === 1 && multiplayerValidMoves[0].capturedCards.length === 0;
  }, [multiplayerValidMoves]);

  // Get all valid capture target card IDs for multiplayer
  const multiplayerValidCaptureTargetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const move of multiplayerValidMoves) {
      for (const card of move.capturedCards) {
        ids.add(card.id);
      }
    }
    return Array.from(ids);
  }, [multiplayerValidMoves]);

  // Check if current selection forms a valid capture in multiplayer
  const multiplayerIsValidCapture = useMemo(() => {
    if (!selectedCard || selectedTableCards.length === 0) {
      return false;
    }
    const selectedIds = new Set(selectedTableCards.map(c => c.id));
    return multiplayerValidMoves.some(move => {
      if (move.capturedCards.length !== selectedTableCards.length) {
        return false;
      }
      return move.capturedCards.every(c => selectedIds.has(c.id));
    });
  }, [selectedCard, selectedTableCards, multiplayerValidMoves]);

  // ============================================================================
  // MULTIPLAYER CARD HANDLERS
  // ============================================================================

  // Handle card click in multiplayer mode
  const handleMultiplayerCardClick = useCallback((card: Card) => {
    if (!multiplayer.gameState || multiplayer.gameState.round.currentPlayer !== multiplayer.playerId) {
      return;
    }

    const tableCards = multiplayer.gameState.round.table;
    // Use 'human' as player since getValidMoves needs a PlayerId but we just need the move options
    const validMoves = getValidMoves(card, tableCards, 'human');

    // If this card is already selected, deselect it
    if (selectedCard?.id === card.id) {
      setSelectedCard(null);
      setSelectedTableCards([]);
      return;
    }

    // Select the card
    setSelectedCard(card);
    setSelectedTableCards([]);

    // If there's exactly one single-card capture, auto-select it
    const singleCaptures = validMoves.filter(m => m.capturedCards.length === 1);
    if (singleCaptures.length === 1) {
      setSelectedTableCards(singleCaptures[0].capturedCards);
    }
  }, [multiplayer.gameState, multiplayer.playerId, selectedCard]);

  // Handle card double-click in multiplayer mode (quick play)
  const handleMultiplayerCardDoubleClick = useCallback((card: Card) => {
    if (!multiplayer.gameState || multiplayer.gameState.round.currentPlayer !== multiplayer.playerId) {
      return;
    }

    const tableCards = multiplayer.gameState.round.table;
    const validMoves = getValidMoves(card, tableCards, 'human');

    // If no captures possible (all moves have empty capturedCards), place the card
    if (validMoves.every(m => m.capturedCards.length === 0)) {
      setMultiplayerPlayedCardId(card.id);
      multiplayer.playMove({
        player: multiplayer.playerId!,
        cardPlayed: card,
        capturedCards: [],
        isScopa: false,
      });
      setSelectedCard(null);
      setSelectedTableCards([]);
      return;
    }

    // Get capture options (moves with non-empty capturedCards)
    const captureOptions = validMoves.filter(m => m.capturedCards.length > 0);

    // If there's exactly one capture option, execute it
    if (captureOptions.length === 1) {
      const move = captureOptions[0];
      const isScopa = tableCards.length === move.capturedCards.length && multiplayer.gameState.round.deckCount > 0;
      setMultiplayerPlayedCardId(card.id);
      multiplayer.playMove({
        player: multiplayer.playerId!,
        cardPlayed: card,
        capturedCards: move.capturedCards,
        isScopa,
      });
      setSelectedCard(null);
      setSelectedTableCards([]);
      return;
    }

    // Multiple capture options - show choice modal
    if (captureOptions.length > 1) {
      setCaptureChoiceModal({
        isOpen: true,
        playedCard: card,
        captureOptions: captureOptions,
      });
    }
  }, [multiplayer]);

  // Handle drag end in multiplayer mode
  const handleMultiplayerDragEnd = useCallback((card: Card, info: { point: { x: number; y: number } }) => {
    setIsDragging(false);

    if (!multiplayer.gameState || multiplayer.gameState.round.currentPlayer !== multiplayer.playerId) {
      setSelectedCard(null);
      setSelectedTableCards([]);
      return;
    }

    // Check if dropped on table area (simplified check)
    const tableElement = tableRef.current;
    if (tableElement) {
      const rect = tableElement.getBoundingClientRect();
      const droppedOnTable = info.point.x >= rect.left && info.point.x <= rect.right &&
                             info.point.y >= rect.top && info.point.y <= rect.bottom;

      if (droppedOnTable) {
        handleMultiplayerCardDoubleClick(card);
        return; // handleMultiplayerCardDoubleClick clears selection after move
      }
    }

    // Drag cancelled (not dropped on table) - keep card selected, don't clear!
  }, [multiplayer, handleMultiplayerCardDoubleClick]);

  // Execute a place move in multiplayer
  const executeMultiplayerPlace = useCallback(() => {
    if (!selectedCard || !multiplayer.playerId) return;

    setMultiplayerPlayedCardId(selectedCard.id);
    multiplayer.playMove({
      player: multiplayer.playerId,
      cardPlayed: selectedCard,
      capturedCards: [],
      isScopa: false,
    });
    setSelectedCard(null);
    setSelectedTableCards([]);
  }, [selectedCard, multiplayer]);

  // Execute a capture move in multiplayer
  const executeMultiplayerCapture = useCallback(() => {
    if (!selectedCard || !multiplayer.playerId || !multiplayer.gameState) return;

    const tableCards = multiplayer.gameState.round.table;
    const isScopa = tableCards.length === selectedTableCards.length && multiplayer.gameState.round.deckCount > 0;

    setMultiplayerPlayedCardId(selectedCard.id);
    multiplayer.playMove({
      player: multiplayer.playerId,
      cardPlayed: selectedCard,
      capturedCards: selectedTableCards,
      isScopa,
    });
    setSelectedCard(null);
    setSelectedTableCards([]);
  }, [selectedCard, selectedTableCards, multiplayer]);

  // Handle capture choice in multiplayer
  const handleMultiplayerCaptureChoice = useCallback((move: Move) => {
    if (!captureChoiceModal.playedCard || !multiplayer.playerId || !multiplayer.gameState) return;

    const tableCards = multiplayer.gameState.round.table;
    const isScopa = tableCards.length === move.capturedCards.length && multiplayer.gameState.round.deckCount > 0;

    setMultiplayerPlayedCardId(captureChoiceModal.playedCard.id);
    multiplayer.playMove({
      player: multiplayer.playerId,
      cardPlayed: captureChoiceModal.playedCard,
      capturedCards: move.capturedCards,
      isScopa,
    });

    setCaptureChoiceModal({ isOpen: false, playedCard: null, captureOptions: [] });
    setSelectedCard(null);
    setSelectedTableCards([]);
  }, [captureChoiceModal.playedCard, multiplayer]);

  // ============================================================================
  // END MULTIPLAYER CARD HANDLERS
  // ============================================================================

  // ============================================================================
  // MULTIPLAYER SOUNDS & ANIMATIONS EFFECT
  // ============================================================================

  // Track which move we've already processed (by card ID) to prevent re-processing
  const lastProcessedMoveRef = useRef<string | null>(null);

  // Track card ID played optimistically (hide from hand before server confirms)
  const [multiplayerPlayedCardId, setMultiplayerPlayedCardId] = useState<string | null>(null);

  // Multiplayer card animation state
  const [multiplayerAnimatingCard, setMultiplayerAnimatingCard] = useState<{
    card: Card;
    phase: 'reveal' | 'moving' | 'capturing' | 'done';
    capturedCards: Card[];
    player: PlayerId;
  } | null>(null);

  // Multiplayer dealing animation state
  const [multiplayerIsDealing, setMultiplayerIsDealing] = useState(false);
  const [multiplayerDealMode, setMultiplayerDealMode] = useState<DealMode>('hands');
  const [multiplayerIsRoundStartDeal, setMultiplayerIsRoundStartDeal] = useState(false);
  // Track deck count and round number to detect deals (similar to single-player)
  const prevMultiplayerDeckCount = useRef<number | null>(null);
  const prevMpDealRoundNumber = useRef<number | null>(null);

  // Track table state for "last capture takes remaining cards" animation
  // Phase: 'highlight' shows cards with golden glow, 'exit' removes them to trigger fly animation
  const [multiplayerRoundEndAnimation, setMultiplayerRoundEndAnimation] = useState<{
    tableCards: Card[];
    lastCapture: PlayerId;
    phase: 'highlight' | 'exit';
  } | null>(null);
  // Delay showing round summary to allow animation to complete and add a pause
  const [multiplayerRoundSummaryDelay, setMultiplayerRoundSummaryDelay] = useState(false);

  // Resume AudioContext when multiplayer game starts (Chrome autoplay policy workaround)
  // The game may start after a period of inactivity while waiting for opponent
  useEffect(() => {
    if (multiplayer.gameState?.status === 'playing') {
      resumeAudio();
    }
  }, [multiplayer.gameState?.status, resumeAudio]);

  // Trigger multiplayer dealing animation by tracking deck count changes (like single-player)
  useLayoutEffect(() => {
    if (!multiplayer.gameState || multiplayer.gameState.status !== 'playing') {
      prevMultiplayerDeckCount.current = null;
      prevMpDealRoundNumber.current = null;
      return;
    }

    const currentDeckCount = multiplayer.gameState.round.deckCount;
    const currentRoundNumber = multiplayer.gameState.roundNumber;

    // On first render with game state (fresh game or after reconnect with deckCount 30)
    if (prevMultiplayerDeckCount.current === null) {
      prevMultiplayerDeckCount.current = currentDeckCount;
      prevMpDealRoundNumber.current = currentRoundNumber;

      // If deck is 30 (fresh deal: 40 - 4 table - 6 hands), trigger round start animation
      if (currentDeckCount === 30) {
        setMultiplayerIsDealing(true);
        setMultiplayerDealMode('table');
        setMultiplayerIsRoundStartDeal(true);
      }
      return;
    }

    // Check for game restart: roundNumber decreased (went from e.g. round 2 to round 1)
    // This happens when both players accept a restart mid-game
    const isGameRestart = currentRoundNumber < (prevMpDealRoundNumber.current ?? 0);
    if (isGameRestart && currentDeckCount === 30) {
      prevMpDealRoundNumber.current = currentRoundNumber;
      prevMultiplayerDeckCount.current = currentDeckCount;
      setMultiplayerIsDealing(true);
      setMultiplayerDealMode('table');
      setMultiplayerIsRoundStartDeal(true);
      return;
    }

    // Check for new round (round number increased)
    if (currentRoundNumber !== prevMpDealRoundNumber.current) {
      prevMpDealRoundNumber.current = currentRoundNumber;
      prevMultiplayerDeckCount.current = currentDeckCount;
      if (currentDeckCount === 30 && !multiplayerIsDealing) {
        setMultiplayerIsDealing(true);
        setMultiplayerDealMode('table');
        setMultiplayerIsRoundStartDeal(true);
      }
      return;
    }

    // Detect mid-round deals: deck decreased by 6 (dealt 3 cards to each player)
    const deckDecrease = prevMultiplayerDeckCount.current - currentDeckCount;
    if (deckDecrease === 6 && !multiplayerIsDealing) {
      setMultiplayerIsDealing(true);
      setMultiplayerDealMode('hands');
      setMultiplayerIsRoundStartDeal(false);
    }

    // Update tracking
    prevMultiplayerDeckCount.current = currentDeckCount;
  }, [multiplayer.gameState, multiplayerIsDealing]);

  // Handle sounds, animations, and sette bello celebration when multiplayer moves are played
  useEffect(() => {
    if (!multiplayer.lastMove) return;

    // Skip if we've already processed this exact move (by card ID)
    if (lastProcessedMoveRef.current === multiplayer.lastMove.move.cardPlayed.id) {
      return;
    }
    lastProcessedMoveRef.current = multiplayer.lastMove.move.cardPlayed.id;

    const { move, byPlayer } = multiplayer.lastMove;
    const isMyMove = byPlayer === multiplayer.playerId;
    const player: PlayerId = isMyMove ? 'human' : 'cpu';

    // Clear optimistic card hiding - animation system takes over from here
    if (isMyMove) {
      setMultiplayerPlayedCardId(null);
    }

    // For your own place moves: instant, no animation (matches single-player)
    if (isMyMove && move.capturedCards.length === 0) {
      playSound('play');
      setMultiplayerAnimatingCard(null);
      multiplayer.applyPendingState();
      return;
    }

    // For your own capture moves: brief animation (matches single-player)
    if (isMyMove) {
      setMultiplayerAnimatingCard({
        card: move.cardPlayed,
        phase: 'moving',
        capturedCards: move.capturedCards,
        player,
      });

      // Brief delay, then apply state and start capture exit animation
      setTimeout(() => {
        playSound('capture');
        // Check for coins in captured cards OR if the played card is a coin (it goes to capture pile too)
        const hasCoins = move.capturedCards.some(c => c.suit === 'coins') || move.cardPlayed.suit === 'coins';
        if (hasCoins) {
          playSound('coin');
        }
        // Check for sette bello in captured cards OR if the played card is sette bello
        const hasSetteBello = move.capturedCards.some(c => c.suit === 'coins' && c.value === 7) ||
          (move.cardPlayed.suit === 'coins' && move.cardPlayed.value === 7);
        if (hasSetteBello) {
          playSound('setteBello');
          setSetteBelloCelebration({ show: true, player, playerName: multiplayer.nickname });
          setTimeout(() => setSetteBelloCelebration(prev => ({ ...prev, show: false })), 1500);
        }
        // Check for scopa (based on move.isScopa flag from server)
        if (move.isScopa) {
          playSound('scopa');
          setScopaCelebration({ show: true, player, playerName: multiplayer.nickname });
          setTimeout(() => setScopaCelebration(prev => ({ ...prev, show: false })), 1500);
        }
        // Set capturing phase AND apply state together - this triggers the table card exit animation
        setMultiplayerAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
        multiplayer.applyPendingState();
        // Wait for exit animation to complete, then clear
        setTimeout(() => {
          setMultiplayerAnimatingCard(null);
        }, 900);
      }, 400);
      return;
    }

    // For opponent moves: full animation with reveal (flip) first
    setMultiplayerAnimatingCard({
      card: move.cardPlayed,
      phase: 'reveal',
      capturedCards: move.capturedCards,
      player,
    });

    // Phase 2: moving to table (after flip completes)
    setTimeout(() => {
      setMultiplayerAnimatingCard(prev => prev ? { ...prev, phase: 'moving' } : null);

      // Phase 3: apply state and start capture/place exit animation
      setTimeout(() => {
        if (move.capturedCards.length > 0) {
          playSound('capture');
          // Check for coins in captured cards OR if the played card is a coin (it goes to capture pile too)
          const hasCoins = move.capturedCards.some(c => c.suit === 'coins') || move.cardPlayed.suit === 'coins';
          if (hasCoins) {
            playSound('coin');
          }
          // Check for sette bello in captured cards OR if the played card is sette bello
          const hasSetteBello = move.capturedCards.some(c => c.suit === 'coins' && c.value === 7) ||
            (move.cardPlayed.suit === 'coins' && move.cardPlayed.value === 7);
          if (hasSetteBello) {
            playSound('setteBello');
            const playerName = multiplayer.opponentNickname || 'Opponent';
            setSetteBelloCelebration({ show: true, player, playerName });
            setTimeout(() => setSetteBelloCelebration(prev => ({ ...prev, show: false })), 1500);
          }
          // Check for scopa (based on move.isScopa flag from server)
          if (move.isScopa) {
            playSound('scopa');
            const playerName = multiplayer.opponentNickname || 'Opponent';
            setScopaCelebration({ show: true, player, playerName });
            setTimeout(() => setScopaCelebration(prev => ({ ...prev, show: false })), 1500);
          }
          // Set capturing phase AND apply state together - triggers table card exit animation
          setMultiplayerAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
          multiplayer.applyPendingState();
          // Wait for exit animation to complete
          setTimeout(() => {
            setMultiplayerAnimatingCard(null);
          }, 900);
        } else {
          playSound('play');
          // For place moves, apply state and clear animation simultaneously
          // (matches single-player behavior - card appears on table as animation disappears)
          setMultiplayerAnimatingCard(null);
          multiplayer.applyPendingState();
        }
      }, 500);
    }, 600);

    // No cleanup - timeouts will run to completion
    // The ref prevents re-processing the same move
  }, [multiplayer.lastMove, multiplayer.playerId, multiplayer.nickname, multiplayer.opponentNickname, playSound, multiplayer.applyPendingState]);

  // Safety: clear animation state when lastMove is cleared (e.g., after applyPendingState)
  // This ensures the game doesn't get stuck if timeouts fail to clear the animation
  useEffect(() => {
    if (!multiplayer.lastMove && multiplayerAnimatingCard) {
      // Give a brief grace period for the animation to complete naturally (1 second)
      // Then force clear to prevent getting stuck
      const safetyTimeout = setTimeout(() => {
        setMultiplayerAnimatingCard(null);
      }, 1000);
      return () => clearTimeout(safetyTimeout);
    }
  }, [multiplayer.lastMove, multiplayerAnimatingCard]);

  // Safety: clear optimistic card hiding if server doesn't respond in time
  useEffect(() => {
    if (multiplayerPlayedCardId) {
      const timeout = setTimeout(() => {
        setMultiplayerPlayedCardId(null);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [multiplayerPlayedCardId]);

  // Note: Scopa celebrations are now triggered in the move animation effect above
  // based on the move.isScopa flag, not by comparing scopa counts

  // Handle "last capture takes remaining cards" animation at round end
  // Uses remainingTableCards from server (not local tracking) to ensure both clients see the same cards
  // IMPORTANT: Must use useLayoutEffect to set delay BEFORE render, preventing round summary flash
  const roundEndAnimationTriggeredForRound = useRef<number>(0);
  useLayoutEffect(() => {
    if (!multiplayer.gameState) {
      roundEndAnimationTriggeredForRound.current = 0;
      return;
    }

    const currentRound = multiplayer.gameState.roundNumber;

    // When roundEndData appears, trigger delay and animation (once per round)
    if (
      multiplayer.roundEndData &&
      roundEndAnimationTriggeredForRound.current !== currentRound
    ) {
      roundEndAnimationTriggeredForRound.current = currentRound;
      const remainingCards = multiplayer.roundEndData.remainingTableCards;

      // Start delay immediately to prevent showing round summary too soon
      // This runs synchronously before paint (useLayoutEffect) to avoid flash
      setMultiplayerRoundSummaryDelay(true);

      if (remainingCards.length > 0) {
        // There are cards to animate
        const lastCapture = multiplayer.roundEndData.lastCapture;
        const capturePlayer: PlayerId = lastCapture === multiplayer.playerId ? 'human' : 'cpu';

        // Play capture sound for the remaining cards being collected
        playSound('capture');
        if (remainingCards.some(c => c.suit === 'coins')) {
          playSound('coin');
        }

        // Check if 7 of coins (sette bello) is being captured with the remaining cards
        if (remainingCards.some(c => c.suit === 'coins' && c.value === 7)) {
          playSound('setteBello');
          const playerName = capturePlayer === 'human' ? multiplayer.nickname : (multiplayer.opponentNickname || 'Opponent');
          setSetteBelloCelebration({ show: true, player: capturePlayer, playerName });
          setTimeout(() => setSetteBelloCelebration(prev => ({ ...prev, show: false })), 1500);
        }

        // Phase 1: highlight cards briefly
        setMultiplayerRoundEndAnimation({
          tableCards: remainingCards,
          lastCapture: capturePlayer,
          phase: 'highlight',
        });

        // Phase 2: after brief highlight, trigger exit animation by switching phase
        setTimeout(() => {
          setMultiplayerRoundEndAnimation(prev => prev ? { ...prev, phase: 'exit' } : null);
        }, 300);

        // Clear animation and delay after exit animation completes + pause
        setTimeout(() => {
          setMultiplayerRoundEndAnimation(null);
          setMultiplayerRoundSummaryDelay(false);
        }, 2000); // Increased from 1200ms to add ~800ms pause before summary
      } else {
        // No remaining cards, just pause briefly before showing round summary
        setTimeout(() => {
          setMultiplayerRoundSummaryDelay(false);
        }, 1200); // ~1 second pause before showing round summary
      }
    }
  }, [multiplayer.gameState, multiplayer.roundEndData, multiplayer.playerId, multiplayer.nickname, multiplayer.opponentNickname, playSound]);

  // Track multiplayer round history for game end screen
  const prevMultiplayerRoundNumber = useRef<number>(0);
  useEffect(() => {
    if (!multiplayer.roundEndData || !multiplayer.gameState || !multiplayer.playerId) return;

    const roundNumber = multiplayer.gameState.roundNumber;
    // Only add if this is a new round (prevents duplicates)
    if (roundNumber <= prevMultiplayerRoundNumber.current) return;
    prevMultiplayerRoundNumber.current = roundNumber;

    const myId = multiplayer.playerId;
    const oppId = myId === 'player1' ? 'player2' : 'player1';

    const entry: RoundHistoryEntry = {
      roundNumber,
      scores: {
        human: multiplayer.roundEndData.scores[myId],
        cpu: multiplayer.roundEndData.scores[oppId],
      },
    };

    setMultiplayerRoundHistory(prev => [...prev, entry]);
  }, [multiplayer.roundEndData, multiplayer.gameState, multiplayer.playerId]);

  // Clear multiplayer round history when leaving multiplayer or starting a new game
  useEffect(() => {
    if (!multiplayer.gameState && multiplayerRoundHistory.length > 0) {
      setMultiplayerRoundHistory([]);
      prevMultiplayerRoundNumber.current = 0;
    }
  }, [multiplayer.gameState, multiplayerRoundHistory.length]);

  // Record multiplayer game to stats when game ends
  const multiplayerGameRecorded = useRef(false);
  useEffect(() => {
    // Record game when gameEndData appears (game is over)
    if (multiplayer.gameEndData && multiplayer.playerId && multiplayer.opponentNickname && multiplayer.targetScore && !multiplayerGameRecorded.current) {
      const myId = multiplayer.playerId;
      const oppId = myId === 'player1' ? 'player2' : 'player1';

      recordGame(
        'multiplayer',
        multiplayer.gameEndData.finalScores[myId],
        multiplayer.gameEndData.finalScores[oppId],
        multiplayer.gameState?.roundNumber ?? 1,
        multiplayer.targetScore,
        multiplayer.opponentNickname // Use opponent nickname as "model" for accumulation
      );
      multiplayerGameRecorded.current = true;

      // Play victory sound (only if we won)
      if (multiplayer.gameEndData.finalScores[myId] > multiplayer.gameEndData.finalScores[oppId]) {
        playSound('victory');
      }
    }

    // Reset flag when gameEndData is cleared (new game started)
    if (!multiplayer.gameEndData) {
      multiplayerGameRecorded.current = false;
    }
  }, [multiplayer.gameEndData, multiplayer.playerId, multiplayer.opponentNickname, multiplayer.targetScore, multiplayer.gameState?.roundNumber, recordGame, playSound]);

  // Handle starting a new game (wraps startGame to reset token stats)
  const handleStartGame = useCallback((targetScore: number, gameMode: 'pvsCPU' | 'cpuVsCPU') => {
    // Enforce 11-point limit for free AI games
    const effectiveScore = isGeminiFree(settings.cpuAI) ? Math.min(targetScore, 11) : targetScore;

    // Reset token stats for all LLM types
    resetAllTokenStats();
    // Start fresh sessions for all LLM types (no-op if not active)
    startGeminiRound();
    startGeminiSingleTurnRound();
    startGeminiFreeRound();
    newGeminiFreeGame(); // New game = new gameId for rate limiting
    startOpenAIRound();
    startOpenAISingleTurnRound();
    startClaudeRound();
    startClaudeSingleTurnRound();
    // Clear any previous reasoning/move data
    setLastMoveData({ cpu: null, human: null });

    // Use worker mode ONLY for instant mode with sync AIs (no animations needed)
    // For other speeds, use main thread to preserve animations and UI
    if (gameMode === 'cpuVsCPU' && canUseWorker && settings.animationSpeed === 'instant') {
      // Use Web Worker for instant background simulation
      setUseWorkerMode(true);
      setWorkerFinalState(null); // Clear any previous final state
      startSimulation({
        player1AI: spectatorAIs.player1 as CPUType,
        player2AI: spectatorAIs.player2 as CPUType,
        targetScore: effectiveScore,
        delayMs: 0,
      });
    } else {
      // Use main thread for animations, LLM AIs, or player vs CPU
      setUseWorkerMode(false);
      startGame(effectiveScore, gameMode);
    }
  }, [startGame, resetAllTokenStats, canUseWorker, startSimulation, spectatorAIs, settings.animationSpeed, settings.cpuAI, isGeminiFree]);

  // Handle new game request
  const handleNewGame = useCallback(() => {
    if (activeState.status === 'playing' || workerIsRunning) {
      setConfirmNewGame(true);
    } else {
      if (useWorkerMode) {
        stopSimulation();
        setUseWorkerMode(false);
      }
      resetAllTokenStats();
      resetGame();
    }
  }, [activeState.status, workerIsRunning, useWorkerMode, stopSimulation, resetGame, resetAllTokenStats]);

  const confirmAndStartNewGame = useCallback(() => {
    setConfirmNewGame(false);
    if (useWorkerMode) {
      stopSimulation();
      setUseWorkerMode(false);
      setWorkerFinalState(null);
    }
    resetAllTokenStats();
    resetGame();
  }, [useWorkerMode, stopSimulation, resetGame, resetAllTokenStats]);

  // Handle play again from game end screen (also resets worker mode)
  const handlePlayAgain = useCallback(() => {
    if (useWorkerMode) {
      stopSimulation();
      setUseWorkerMode(false);
      setWorkerFinalState(null);
    }
    resetAllTokenStats();
    resetGame();
  }, [useWorkerMode, stopSimulation, resetGame, resetAllTokenStats]);

  // Handle AI selection change
  const handleSelectAI = useCallback((ai: ExtendedAIType) => {
    updateSetting('cpuAI', ai);
  }, [updateSetting]);

  // Handle spectator AI selection
  const handleSelectSpectatorAI = useCallback((player: 'player1' | 'player2', ai: ExtendedAIType) => {
    setSpectatorAIs(prev => ({ ...prev, [player]: ai }));
  }, []);

  // Get AI for current player in spectator mode
  const getAIForPlayer = useCallback((player: PlayerId): ExtendedAIType => {
    if (player === 'human') {
      return spectatorAIs.player1;
    }
    return spectatorAIs.player2;
  }, [spectatorAIs]);

  // Handle next round (wraps nextRound to start fresh chat session)
  const handleNextRound = useCallback(() => {
    // Start fresh sessions for all LLM types (no-op if not active)
    startGeminiRound();
    startGeminiSingleTurnRound();
    startGeminiFreeRound();
    startOpenAIRound();
    startOpenAISingleTurnRound();
    startClaudeRound();
    startClaudeSingleTurnRound();
    // Clear reasoning/move data from previous round
    setLastMoveData({ cpu: null, human: null });
    nextRound();
  }, [nextRound]);

  // Handle opening settings - pause spectator mode if active
  const handleOpenSettings = useCallback(() => {
    if (isSpectatorMode) {
      pausedBeforeSettings.current = isSpectatorPaused;
      setIsSpectatorPaused(true);
    }
    setShowSettings(true);
  }, [isSpectatorMode, isSpectatorPaused]);

  // Handle closing settings - restore previous pause state
  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    if (isSpectatorMode) {
      setIsSpectatorPaused(pausedBeforeSettings.current);
    }
  }, [isSpectatorMode]);

  // Handle opening stats modal
  const handleOpenStats = useCallback(() => {
    setShowStats(true);
  }, []);

  // Handle opening rules modal
  const handleOpenRules = useCallback(() => {
    setShowRules(true);
  }, []);

  // Record game stats when game ends (only for player vs CPU mode)
  const gameRecorded = useRef(false);
  useEffect(() => {
    // Only record for player vs CPU games
    if (activeState.gameMode !== 'pvsCPU') {
      gameRecorded.current = false;
      return;
    }

    // Record when game reaches 'gameEnd' status (only once)
    if (activeState.status === 'gameEnd' && !gameRecorded.current) {
      const opponentModel = isOpenAIAI(settings.cpuAI)
        ? settings.openaiModel
        : isClaudeAI(settings.cpuAI)
          ? settings.claudeModel
          : isGeminiAI(settings.cpuAI)
            ? settings.geminiModel
            : isGeminiFree(settings.cpuAI)
              ? 'gemini-3-flash-preview'
              : undefined;

      // Determine AI mode for LLM opponents
      const isLLMOpponent = isLLMAI(settings.cpuAI);
      const isMultiTurn = isLLMOpponent
        ? !settings.cpuAI.includes('singleturn')
        : undefined;
      const useThinking = isLLMOpponent
        ? (isGeminiFree(settings.cpuAI) ? true : settings.useThinking)
        : undefined;

      recordGame(
        settings.cpuAI,
        activeState.scores.human,
        activeState.scores.cpu,
        activeState.roundNumber,
        activeState.targetScore,
        opponentModel,
        isMultiTurn,
        useThinking
      );
      gameRecorded.current = true;

      // Play victory celebration sound
      playSound('victory');
    }

    // Reset flag when game starts fresh
    if (activeState.status === 'idle') {
      gameRecorded.current = false;
    }
  }, [activeState.status, activeState.gameMode, activeState.scores, activeState.roundNumber, activeState.targetScore, settings.cpuAI, settings.openaiModel, settings.claudeModel, settings.geminiModel, settings.useThinking, recordGame, isOpenAIAI, isClaudeAI, isGeminiAI, isLLMAI, playSound]);

  // Human turn auto-play in spectator mode (with animation)
  // Uses same cpuAnimationScheduled ref since only one player moves at a time
  useEffect(() => {
    if (!isSpectatorMode || isSpectatorPaused) return;
    if (state.round.currentPlayer !== 'human' || state.status !== 'playing') {
      cpuAnimationScheduled.current = false;
      return;
    }

    // Wait for celebration animations to complete
    if (scopaCelebration.show || setteBelloCelebration.show) return;

    // Wait for dealing animation to complete
    if (isDealing) return;

    // Don't start new animation if one is in progress, already scheduled, or API request in flight
    if (animatingCard || cpuAnimationScheduled.current || aiRequestInFlight.current) return;

    const humanHand = state.players.human.hand;
    if (humanHand.length === 0) return;

    // Mark as scheduled to prevent double-firing
    cpuAnimationScheduled.current = true;

    // Add delay for UX (scaled by animation speed)
    const baseDelay = 500 + Math.random() * 500;
    const delay = getAnimationDelay(baseDelay);
    const timeoutId = setTimeout(async () => {
      const ai = getAIPlayer(spectatorAIs.player1, spectatorModels.player1, 'p1');

      let moveToExecute: Move;
      let reasoning: string | null = null;
      if (isAsyncAI(ai)) {
        // Mark API request in flight to prevent re-triggering on pause/unpause
        aiRequestInFlight.current = true;
        try {
          // Async AI (e.g., Gemini) - build extended context and await
          const context = buildLLMContext(humanHand, state.round.table, 'human');
          moveToExecute = await ai.selectMove(context);
          // Capture reasoning from LLM AI (they all have lastReasoning property)
          reasoning = (ai as { lastReasoning?: string }).lastReasoning || null;
          // Clear any previous error on success
          setPlayer1ApiError(null);
          // Update token stats after async AI move (player1 in spectator mode)
          updatePlayerTokenStats('player1');
        } catch (err) {
          // Set error state for display
          const errorMessage = err instanceof Error ? err.message : 'API call failed';
          setPlayer1ApiError(errorMessage);
          console.error('AI API error:', err);
          // Fall back to heuristic AI for this move
          const fallbackAI = AI_PLAYERS.heuristic;
          moveToExecute = fallbackAI.selectMove({
            hand: humanHand,
            table: state.round.table,
            player: 'human',
          });
          reasoning = null;
        } finally {
          aiRequestInFlight.current = false;
        }
      } else {
        // Sync AI - use simple context
        moveToExecute = ai.selectMove({
          hand: humanHand,
          table: state.round.table,
          player: 'human',
        });
        reasoning = null; // Non-LLM AIs don't provide reasoning
      }

      // Update last move data for reasoning modal (capture table state BEFORE move)
      if (reasoning) {
        setLastMoveData(prev => ({
          ...prev,
          human: {
            cardPlayed: moveToExecute.cardPlayed,
            tableCards: [...state.round.table], // Snapshot of table before move
            capturedCards: moveToExecute.capturedCards,
            reasoning,
            player: 'human',
            aiName: AI_INFO[spectatorAIs.player1].name,
            opponentHandCount: state.players.cpu.hand.length,
            otherHandCards: humanHand.filter(c => c.id !== moveToExecute.cardPlayed.id),
          },
        }));
      }

      // Start animation: reveal phase (flip card in place)
      setAnimatingCard({
        card: moveToExecute.cardPlayed,
        phase: 'reveal',
        capturedCards: moveToExecute.capturedCards,
        player: 'human',
      });

      // Phase 2: moving to table (after flip completes)
      setTimeout(() => {
        setAnimatingCard(prev => prev ? { ...prev, phase: 'moving' } : null);

        // Phase 3: execute move and show capture (after card reaches table)
        setTimeout(() => {
          playCard(moveToExecute);
          // Play appropriate sound
          playSound(moveToExecute.capturedCards.length > 0 ? 'capture' : 'play');
          // Play coin sound if any denari captured (including the played card)
          if (moveToExecute.capturedCards.length > 0 &&
            (moveToExecute.cardPlayed.suit === 'coins' || moveToExecute.capturedCards.some(c => c.suit === 'coins'))) {
            playSound('coin');
          }
          // Record last move for LLM context
          lastMoves.current.human = moveToExecute;
          if (moveToExecute.capturedCards.length > 0) {
            setAnimatingCard(prev => prev ? { ...prev, phase: 'capturing' } : null);
            // Phase 4: done (wait for cards to fly to pile)
            setTimeout(() => {
              setAnimatingCard(null);
              cpuAnimationScheduled.current = false;
            }, getAnimationDelay(900));
          } else {
            setAnimatingCard(null);
            cpuAnimationScheduled.current = false;
          }
        }, getAnimationDelay(500));
      }, getAnimationDelay(600));  // Give more time for flip animation
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      // Only reset scheduled flag if we're cleaning up before animation started and no API request in flight
      if (!animatingCard && !aiRequestInFlight.current) {
        cpuAnimationScheduled.current = false;
      }
    };
  }, [isSpectatorMode, isSpectatorPaused, state.round.currentPlayer, state.status, state.players.human.hand, state.round.table, spectatorAIs.player1, playCard, animatingCard, scopaCelebration.show, setteBelloCelebration.show, isDealing, getAnimationDelay, getAIPlayer, buildLLMContext, playSound]);

  // ============================================================================
  // MULTIPLAYER GAME RENDERING (must come before idle check)
  // ============================================================================

  // Multiplayer game is active - render multiplayer UI
  // This check must come BEFORE the idle check because activeState.status
  // remains 'idle' during multiplayer (we're not using the local game state)
  if (multiplayer.gameState) {
    const mpState = multiplayer.gameState;
    const isMyTurn = mpState.round.currentPlayer === multiplayer.playerId;

    // Multiplayer round end screen (delay while card animation and last-capture animation play)
    // Also wait for card animation to complete before showing round summary
    if (multiplayer.roundEndData && !multiplayerAnimatingCard && !multiplayerRoundEndAnimation && !multiplayerRoundSummaryDelay) {
      const myId = multiplayer.playerId!;
      const oppId = myId === 'player1' ? 'player2' : 'player1';
      // Check if this is the final round (game is over after this round)
      const isFinalRound = !!multiplayer.gameEndData;

      return (
        <DeckProvider deck={settings.deck}>
          <RoundEndScreen
            roundNumber={mpState.roundNumber}
            humanScore={multiplayer.roundEndData.scores[myId]}
            cpuScore={multiplayer.roundEndData.scores[oppId]}
            cumulativeHuman={multiplayer.roundEndData.cumulativeScores[myId]}
            cumulativeCpu={multiplayer.roundEndData.cumulativeScores[oppId]}
            humanCaptured={multiplayer.roundEndData.capturedCards[myId]}
            cpuCaptured={multiplayer.roundEndData.capturedCards[oppId]}
            humanScopaCaptures={multiplayer.roundEndData.scopaCaptures[myId]}
            cpuScopaCaptures={multiplayer.roundEndData.scopaCaptures[oppId]}
            onNextRound={multiplayer.continueToNextRound}
            player1Name="You"
            player2Name={multiplayer.opponentNickname || 'Opponent'}
            nextRoundRequested={multiplayer.nextRoundRequests.has(myId)}
            opponentRequestedNextRound={multiplayer.nextRoundRequests.has(oppId)}
            opponentName={multiplayer.opponentNickname || 'Opponent'}
            isGameOver={isFinalRound}
            onShowGameEnd={multiplayer.clearRoundEnd}
          />
        </DeckProvider>
      );
    }

    // Multiplayer game end screen (only show if round summary has been dismissed)
    // Wait for all animations and round summary to complete first
    if (multiplayer.gameEndData && !multiplayer.roundEndData && !multiplayerAnimatingCard && !multiplayerRoundEndAnimation && !multiplayerRoundSummaryDelay) {
      const myId = multiplayer.playerId!;
      const oppId = myId === 'player1' ? 'player2' : 'player1';

      return (
        <DeckProvider deck={settings.deck}>
          <GameEndScreen
            humanScore={multiplayer.gameEndData.finalScores[myId]}
            cpuScore={multiplayer.gameEndData.finalScores[oppId]}
            roundsPlayed={mpState.roundNumber}
            onPlayAgain={multiplayer.requestNewGame}
            player1Name="You"
            player2Name={multiplayer.opponentNickname || 'Opponent'}
            roundHistory={multiplayerRoundHistory}
            rematchRequested={multiplayer.newGameRequestedBy === myId}
            opponentRequestedRematch={multiplayer.newGameRequestedBy === oppId}
            opponentName={multiplayer.opponentNickname || 'Opponent'}
            onLeaveGame={handleLeaveMultiplayer}
          />
        </DeckProvider>
      );
    }

    // Multiplayer playing state - render game board
    return (
      <DeckProvider deck={settings.deck}>
        {/* Opponent disconnected overlay */}
        {!multiplayer.isOpponentConnected && (
          <OpponentDisconnected
            opponentNickname={multiplayer.opponentNickname}
            onLeaveRoom={handleLeaveMultiplayer}
          />
        )}

        {/* Restart request overlay */}
        {multiplayer.restartRequestedBy && (
          <RestartOverlay
            requestedBy={multiplayer.restartRequestedBy === multiplayer.playerId ? 'self' : 'opponent'}
            opponentNickname={multiplayer.opponentNickname || 'Opponent'}
            onRequestRestart={multiplayer.requestRestart}
            onCancel={multiplayer.requestRestart}
          />
        )}

        <GameLayout
          scoreBoard={
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <ScoreBoard
                humanScore={mpState.scores[multiplayer.playerId!]}
                cpuScore={mpState.scores[multiplayer.playerId === 'player1' ? 'player2' : 'player1']}
                roundNumber={mpState.roundNumber}
                targetScore={mpState.targetScore}
                currentPlayer={isMyTurn ? 'human' : 'cpu'}
                isMultiplayer
                playerNickname={multiplayer.nickname}
                opponentNickname={multiplayer.opponentNickname || 'Opponent'}
              />
              <GameControls
                onNewGame={handleLeaveMultiplayer}
                onOpenSettings={handleOpenSettings}
                onOpenStats={handleOpenStats}
                onOpenRules={handleOpenRules}
                onRequestRestart={multiplayer.requestRestart}
                onQuitGame={handleLeaveMultiplayer}
                isMultiplayer
              />
            </div>
          }
          cpuHand={
            <PlayerHand
              cards={
                // Hide cards during dealing animation
                multiplayerIsDealing
                  ? []
                  : Array(
                      // Decrease hand count by 1 during opponent's reveal/moving animation (before state is applied)
                      // Once we're in 'capturing' phase, applyPendingState has been called so state is already updated
                      multiplayerAnimatingCard?.player === 'cpu' &&
                      (multiplayerAnimatingCard.phase === 'reveal' || multiplayerAnimatingCard.phase === 'moving')
                        ? Math.max(0, mpState.opponent.handCount - 1)
                        : mpState.opponent.handCount
                    ).fill(null).map((_, i) => ({
                      id: `opponent-${i}`,
                      suit: 'coins' as const,
                      value: 1 as const,
                    }))
              }
              isHuman={false}
              showFaceUp={false}
            />
          }
          cpuPile={
            <CapturedPile
              cards={mpState.opponent.captured ?? []}
              scopaCount={mpState.opponent.scopaCount}
              player="cpu"
              capturedCount={mpState.opponent.capturedCount}
              coinsCount={mpState.opponent.coinsCount}
              hasSetteBello={mpState.opponent.hasSetteBello}
              showStats={settings.showPileStats && multiplayer.pileStatsEnabled}
              // Host option: pile review only when enabled ("play from
              // memory" default keeps piles non-clickable).
              onClick={
                multiplayer.pileViewEnabled
                  ? () => setMpOpenPile('opponent')
                  : undefined
              }
            />
          }
          tableCards={
            <TableCards
              ref={tableRef}
              cards={
                // Hide cards during 'table' phase of dealing animation
                multiplayerIsDealing && multiplayerDealMode === 'table'
                  ? []
                  // Round-end animation: show cards during 'highlight', remove during 'exit' to trigger fly animation
                  : multiplayerRoundEndAnimation
                    ? (multiplayerRoundEndAnimation.phase === 'highlight' ? multiplayerRoundEndAnimation.tableCards : [])
                    : mpState.round.table
              }
              highlightedCardIds={isMyTurn && !multiplayerRoundEndAnimation ? multiplayerValidCaptureTargetIds : []}
              selectedCardIds={multiplayerRoundEndAnimation ? [] : selectedTableCards.map(c => c.id)}
              capturingCardIds={
                multiplayerRoundEndAnimation
                  ? multiplayerRoundEndAnimation.tableCards.map(c => c.id)
                  : (multiplayerAnimatingCard?.phase === 'moving' || multiplayerAnimatingCard?.phase === 'capturing') && multiplayerAnimatingCard?.capturedCards.length
                    ? multiplayerAnimatingCard.capturedCards.map(c => c.id)
                    : undefined
              }
              captureDirection={
                multiplayerRoundEndAnimation
                  ? multiplayerRoundEndAnimation.lastCapture
                  : multiplayerAnimatingCard?.capturedCards.length ? multiplayerAnimatingCard.player : undefined
              }
              onCardClick={isMyTurn && !multiplayerRoundEndAnimation ? handleTableCardClick : undefined}
              selectable={isMyTurn && selectedCard !== null && !multiplayerRoundEndAnimation}
              isDragOver={isDragging}
              deckCount={mpState.round.deckCount}
              dealer={mpState.round.dealer === multiplayer.playerId ? 'human' : 'cpu'}
            />
          }
          humanPile={
            <CapturedPile
              cards={mpState.self.captured ?? []}
              scopaCount={mpState.self.scopaCount}
              player="human"
              capturedCount={mpState.self.capturedCount}
              coinsCount={mpState.self.coinsCount}
              hasSetteBello={mpState.self.hasSetteBello}
              showStats={settings.showPileStats && multiplayer.pileStatsEnabled}
              // Host option: pile review only when enabled ("play from
              // memory" default keeps piles non-clickable).
              onClick={
                multiplayer.pileViewEnabled
                  ? () => setMpOpenPile('self')
                  : undefined
              }
            />
          }
          humanHand={
            <PlayerHand
              cards={
                // Hide cards during dealing animation
                multiplayerIsDealing
                  ? []
                  : multiplayerAnimatingCard?.player === 'human' || multiplayerPlayedCardId
                    ? mpState.self.hand.filter(c =>
                        c.id !== (multiplayerAnimatingCard?.player === 'human' ? multiplayerAnimatingCard.card.id : null) &&
                        c.id !== multiplayerPlayedCardId
                      )
                    : mpState.self.hand
              }
              isHuman={true}
              onCardClick={handleMultiplayerCardClick}
              onCardDoubleClick={handleMultiplayerCardDoubleClick}
              onCardDragStart={handleCardDragStart}
              onCardDragEnd={handleMultiplayerDragEnd}
              selectedCardId={selectedCard?.id}
              disabled={!isMyTurn || !!multiplayerAnimatingCard || multiplayerIsDealing}
            />
          }
          controls={
            <div className="control-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px', marginLeft: '16px' }}>
              {/* Turn timer */}
              {multiplayer.turnTimerEnabled && multiplayer.turnTimerSeconds !== null && (
                <TurnTimer
                  secondsRemaining={multiplayer.turnTimerSeconds}
                  isMyTurn={isMyTurn}
                  canForceMove={multiplayer.canForceMove}
                  onForceMove={multiplayer.forceMove}
                />
              )}

              <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                {isMyTurn ? 'Your turn' : `${multiplayer.opponentNickname}'s turn`}
              </span>

              {/* Action buttons */}
              <div style={{ minHeight: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isMyTurn && selectedCard && multiplayerCanOnlyPlace && (
                  <button
                    onClick={executeMultiplayerPlace}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      background: 'var(--color-accent)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    Place Card
                  </button>
                )}

                {isMyTurn && selectedTableCards.length > 1 && (
                  <>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      Sum: {selectedSum}/{selectedCard?.value}
                    </span>
                    {multiplayerIsValidCapture && (
                      <button
                        onClick={executeMultiplayerCapture}
                        style={{
                          padding: '8px 16px',
                          fontSize: '14px',
                          background: 'var(--color-accent)',
                          color: '#000',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        Capture
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          }
        />
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onUpdateSetting={updateSetting}
          onResetSettings={resetSettings}
        />
        <RulesModal
          isOpen={showRules}
          onClose={() => setShowRules(false)}
        />
        <CaptureChoiceModal
          isOpen={captureChoiceModal.isOpen}
          playedCard={captureChoiceModal.playedCard}
          captureOptions={captureChoiceModal.captureOptions}
          onSelectCapture={handleMultiplayerCaptureChoice}
          onCancel={handleCancelCaptureChoice}
        />
        {/* Scopa celebration overlay */}
        <ScopaCelebration
          show={scopaCelebration.show}
          player={scopaCelebration.player}
          playerName={scopaCelebration.playerName}
          onComplete={() => {
            setScopaCelebration(prev => ({ ...prev, show: false }));
          }}
        />
        {/* Sette Bello celebration overlay */}
        <SetteBelloCelebration
          show={setteBelloCelebration.show}
          player={setteBelloCelebration.player}
          playerName={setteBelloCelebration.playerName}
          onComplete={() => {
            setSetteBelloCelebration(prev => ({ ...prev, show: false }));
          }}
        />
        {/* Card animation overlay for multiplayer */}
        <CpuCardAnimation
          card={multiplayerAnimatingCard?.card ?? null}
          phase={multiplayerAnimatingCard?.phase ?? null}
          capturedCardIds={multiplayerAnimatingCard?.capturedCards.map(c => c.id) ?? []}
          player={multiplayerAnimatingCard?.player}
          skipFlip={multiplayerAnimatingCard?.player === 'human'}
        />
        {/* Dealing animation for multiplayer */}
        <DealingAnimation
          isDealing={multiplayerIsDealing}
          startPlayer={mpState.round.dealer === multiplayer.playerId ? 'cpu' : 'human'}
          deckPosition={mpState.round.dealer === multiplayer.playerId ? 'right' : 'left'}
          dealMode={multiplayerDealMode}
          onComplete={() => {
            if (multiplayerDealMode === 'table' && multiplayerIsRoundStartDeal) {
              // Phase 1 complete: enter pause phase (table cards appear, no animation)
              playSound('deal');
              setMultiplayerDealMode('pause');
            } else if (multiplayerDealMode === 'pause' && multiplayerIsRoundStartDeal) {
              // Pause complete: start dealing hands
              setMultiplayerDealMode('hands');
            } else {
              // Hands phase complete (or mid-round deal): finish dealing
              playSound('deal');
              setMultiplayerIsDealing(false);
              setMultiplayerIsRoundStartDeal(false);
            }
          }}
        />
        {/* Modals available in multiplayer */}
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onUpdateSetting={updateSetting}
          onResetSettings={resetSettings}
        />
        <StatsModal
          isOpen={showStats}
          onClose={() => setShowStats(false)}
          opponents={statsModalOpponents}
          getGames={getStatsModalGames}
          onClearStats={clearStats}
        />
        <RulesModal
          isOpen={showRules}
          onClose={() => setShowRules(false)}
        />
        {/* Captured-pile review (host opt-in). Captured cards are public
            info — server always sends them; the modal only opens when the
            host enabled pile review and a pile was clicked. */}
        <CapturedCardsModal
          isOpen={mpOpenPile !== null}
          onClose={() => setMpOpenPile(null)}
          cards={
            mpOpenPile === 'self'
              ? (mpState.self.captured ?? [])
              : (mpState.opponent.captured ?? [])
          }
          playerName={
            mpOpenPile === 'self'
              ? multiplayer.nickname
              : multiplayer.opponentNickname || 'Opponent'
          }
        />
      </DeckProvider>
    );
  }

  // ============================================================================
  // IDLE STATE - START SCREEN / MULTIPLAYER LOBBY
  // ============================================================================

  // If game hasn't started, show start screen or multiplayer UI
  if (activeState.status === 'idle') {
    // Multiplayer mode - show lobby or waiting screen
    if (isMultiplayerMode || initialJoinCode) {
      // Reconnecting after a refresh / transient drop. Gate on the hook's
      // isReconnecting (true from RECONNECT sent until success/terminal
      // failure) — connectionStatus flips to 'connected' the instant the
      // WS handshake completes, before the room is restored, so it can't
      // drive this. On terminal failure the hook clears the session +
      // roomCode, so this falls through to the lobby with a persistent
      // error rather than the misleading "share this code" waiting room.
      if (!multiplayer.gameState && multiplayer.isReconnecting) {
        return (
          <DeckProvider deck={settings.deck}>
            <div style={{
              minHeight: '100vh', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexDirection: 'column', gap: '1.25rem',
              color: 'var(--color-text-primary)', textAlign: 'center', padding: '1rem',
            }}>
              <h2 style={{ margin: 0 }}>Reconnecting…</h2>
              <p style={{ opacity: 0.75, margin: 0 }}>
                Restoring your game{multiplayer.roomCode ? ` (${multiplayer.roomCode})` : ''}.
              </p>
              <button
                onClick={handleLeaveMultiplayer}
                style={{
                  padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none',
                  background: 'var(--color-accent)', color: 'white',
                  fontSize: '1rem', cursor: 'pointer',
                }}
              >
                Leave Game
              </button>
            </div>
          </DeckProvider>
        );
      }

      // If we have a room and are waiting for opponent (gameState not yet set)
      if (multiplayer.roomCode && !multiplayer.gameState) {
        return (
          <DeckProvider deck={settings.deck}>
            <WaitingForOpponent
              roomCode={multiplayer.roomCode}
              nickname={multiplayer.nickname}
              targetScore={multiplayer.targetScore}
              turnTimerEnabled={multiplayer.turnTimerEnabled}
              onUpdateNickname={multiplayer.updateNickname}
              onLeaveRoom={handleLeaveMultiplayer}
            />
          </DeckProvider>
        );
      }

      // Show multiplayer lobby (create/join)
      return (
        <DeckProvider deck={settings.deck}>
          <MultiplayerLobby
            connectionStatus={multiplayer.connectionStatus}
            connectionError={multiplayer.connectionError}
            initialJoinCode={initialJoinCode}
            config={{
              gameName: 'Scopa',
              gameCodePrefix: 'SCOPA',
              presetScores: [11, 16, 21],
              defaultScore: 11,
              scoreLabel: 'Target Score',
              extraToggles: [
                {
                  key: 'pileView',
                  label: 'Captured-pile review',
                  hintOn: 'Players can open a pile to review captured cards',
                  hintOff: 'Play from memory — piles can’t be opened',
                  defaultValue: false,
                },
                {
                  key: 'pileStats',
                  label: 'Pile stats during play',
                  hintOn: 'Show captured count / points / categories mid-game',
                  hintOff: 'Hidden during play — revealed at round end',
                  defaultValue: false,
                },
              ],
            }}
            onCreateRoom={multiplayer.createRoom}
            onJoinRoom={multiplayer.joinRoom}
            onBack={() => {
              // Clean up any pending connection/room state
              multiplayer.leaveRoom();
              setIsMultiplayerMode(false);
              // Clear initial join code so we can return to main menu
              setInitialJoinCode(undefined);
              // Clear URL if we came from a join link
              if (window.location.pathname !== '/' || window.location.search) {
                window.history.replaceState({}, '', '/');
              }
            }}
          />
        </DeckProvider>
      );
    }

    // Normal start screen
    return (
      <DeckProvider deck={settings.deck}>
        <StartScreen
          onStartGame={handleStartGame}
          onStartMultiplayer={handleStartMultiplayer}
          selectedAI={settings.cpuAI}
          onSelectAI={handleSelectAI}
          spectatorAIs={spectatorAIs}
          onSelectSpectatorAI={handleSelectSpectatorAI}
          geminiModel={settings.geminiModel}
          onSelectGeminiModel={(model) => updateSetting('geminiModel', model)}
          openaiModel={settings.openaiModel}
          onSelectOpenAIModel={(model) => updateSetting('openaiModel', model)}
          claudeModel={settings.claudeModel}
          onSelectClaudeModel={(model) => updateSetting('claudeModel', model)}
          spectatorModels={spectatorModels}
          onSelectSpectatorModel={(player, model) => setSpectatorModels(prev => ({ ...prev, [player]: model }))}
          defaultTargetScore={settings.defaultTargetScore}
          useThinking={settings.useThinking}
          onToggleThinking={(enabled) => updateSetting('useThinking', enabled)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenRules={() => setShowRules(true)}
          aiAvailability={{
            geminiFree: !!import.meta.env.VITE_PROXY_URL,
            gemini: (!!settings.geminiApiKey && settings.geminiKeyValid) || !!import.meta.env.VITE_GEMINI_API_KEY,
            openai: (!!settings.openaiApiKey && settings.openaiKeyValid) || !!import.meta.env.VITE_OPENAI_API_KEY,
            claude: (!!settings.claudeApiKey && settings.claudeKeyValid) || !!import.meta.env.VITE_CLAUDE_API_KEY,
          }}
        />
        <SettingsModal
          isOpen={showSettings}
          onClose={handleCloseSettings}
          settings={settings}
          onUpdateSetting={updateSetting}
          onResetSettings={resetSettings}
        />
        <RulesModal
          isOpen={showRules}
          onClose={() => setShowRules(false)}
        />
      </DeckProvider>
    );
  }

  // ============================================================================
  // SINGLE PLAYER / SPECTATOR GAME RENDERING
  // ============================================================================

  // Round end screen (wait for scores to be calculated)
  if (activeState.status === 'roundEnd' && activeState.lastRoundScores) {
    return (
      <DeckProvider deck={settings.deck}>
        <RoundEndScreen
          roundNumber={activeState.roundNumber}
          humanScore={activeState.lastRoundScores.human}
          cpuScore={activeState.lastRoundScores.cpu}
          cumulativeHuman={activeState.scores.human}
          cumulativeCpu={activeState.scores.cpu}
          humanCaptured={activeState.players.human.captured}
          cpuCaptured={activeState.players.cpu.captured}
          humanScopaCaptures={activeState.players.human.scopaCaptures}
          cpuScopaCaptures={activeState.players.cpu.scopaCaptures}
          isGameOver={activeState.isGameOver}
          onNextRound={handleNextRound}
          onShowGameEnd={showGameEnd}
          player1AIType={isSpectatorMode ? spectatorAIs.player1 : undefined}
          player1Model={isSpectatorMode ? spectatorModels.player1 : undefined}
          player2AIType={isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI}
          player2Model={isSpectatorMode ? spectatorModels.player2 : getModelForAI(settings.cpuAI)}
          player1TokenStats={isSpectatorMode && isLLMAI(spectatorAIs.player1) ? player1TokenStats : null}
          player2TokenStats={
            isSpectatorMode
              ? isLLMAI(spectatorAIs.player2) ? player2TokenStats : null
              : isLLMAI(settings.cpuAI) ? tokenStats : null
          }
          autoAdvance={isSpectatorMode && settings.autoAdvanceSpectator}
        />
      </DeckProvider>
    );
  }

  // Game end screen
  if (activeState.status === 'gameEnd') {
    return (
      <DeckProvider deck={settings.deck}>
        <GameEndScreen
          humanScore={activeState.scores.human}
          cpuScore={activeState.scores.cpu}
          roundsPlayed={activeState.roundNumber}
          onPlayAgain={handlePlayAgain}
          player1AIType={isSpectatorMode ? spectatorAIs.player1 : undefined}
          player1Model={isSpectatorMode ? spectatorModels.player1 : undefined}
          player2AIType={isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI}
          player2Model={isSpectatorMode ? spectatorModels.player2 : getModelForAI(settings.cpuAI)}
          player1TokenStats={isSpectatorMode && isLLMAI(spectatorAIs.player1) ? player1TokenStats : null}
          player2TokenStats={
            isSpectatorMode
              ? isLLMAI(spectatorAIs.player2) ? player2TokenStats : null
              : isLLMAI(settings.cpuAI) ? tokenStats : null
          }
          roundHistory={activeState.roundHistory}
          categoryTotals={activeState.categoryTotals}
        />
      </DeckProvider>
    );
  }

  const isHumanTurn = activeState.round.currentPlayer === 'human';

  return (
    <DeckProvider deck={settings.deck}>
      <ScopaCelebration
        show={scopaCelebration.show}
        player={scopaCelebration.player}
        playerName={scopaCelebration.playerName}
        onComplete={() => {
          setScopaCelebration(prev => ({ ...prev, show: false }));
          setCelebrationActive(false); // Unblock input after exit animation completes
        }}
      />
      <SetteBelloCelebration
        show={setteBelloCelebration.show}
        player={setteBelloCelebration.player}
        playerName={setteBelloCelebration.playerName}
        onComplete={() => {
          setSetteBelloCelebration(prev => ({ ...prev, show: false }));
          setCelebrationActive(false); // Unblock input after exit animation completes
        }}
      />
      <CpuCardAnimation
        card={animatingCard?.card ?? null}
        phase={animatingCard?.phase ?? null}
        capturedCardIds={animatingCard?.capturedCards.map(c => c.id) ?? []}
        player={animatingCard?.player}
        skipFlip={isSpectatorMode && animatingCard?.player ? spectatorHandsVisible[animatingCard.player] : false}
      />
      <DealingAnimation
        isDealing={isDealing}
        startPlayer={state.round.dealer === 'cpu' ? 'human' : 'cpu'}
        deckPosition={state.round.dealer === 'cpu' ? 'left' : 'right'}
        dealMode={dealMode}
        instant={isInstantMode}
        onComplete={() => {
          if (dealMode === 'table' && isRoundStartDeal) {
            // Phase 1 complete: enter pause phase (table cards appear, no animation)
            playSound('deal'); // Play deal sound for table cards
            setDealMode('pause');
          } else if (dealMode === 'pause' && isRoundStartDeal) {
            // Pause complete: start dealing hands
            setDealMode('hands');
          } else {
            // Hands phase complete (or mid-round deal): finish dealing
            playSound('deal'); // Play deal sound for hand cards
            setIsDealing(false);
            setIsRoundStartDeal(false);
          }
        }}
      />
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onUpdateSetting={updateSetting}
        onResetSettings={resetSettings}
      />
      <StatsModal
        isOpen={showStats}
        onClose={() => setShowStats(false)}
        opponents={statsModalOpponents}
        getGames={getStatsModalGames}
        onClearStats={clearStats}
      />
      <RulesModal
        isOpen={showRules}
        onClose={() => setShowRules(false)}
      />
      <CaptureChoiceModal
        isOpen={captureChoiceModal.isOpen}
        playedCard={captureChoiceModal.playedCard}
        captureOptions={captureChoiceModal.captureOptions}
        onSelectCapture={handleCaptureChoice}
        onCancel={handleCancelCaptureChoice}
        perMoveOdds={winOddsPerMove}
      />
      <CapturedCardsModal
        isOpen={showCapturedCards}
        onClose={() => setShowCapturedCards(false)}
        cards={activeState.players.human.captured}
        playerName="Your"
      />
      <ReasoningModal
        isOpen={reasoningModal.isOpen}
        lastMove={reasoningModal.player ? lastMoveData[reasoningModal.player] : null}
        locked={reasoningModal.locked}
        position={reasoningModal.player === 'cpu' ? 'top' : reasoningModal.player === 'human' ? 'bottom' : 'center'}
        onClose={() => {
          setReasoningModal({ isOpen: false, player: null, locked: false });
          if (reasoningModal.locked) {
            setIsSpectatorPaused(false); // Only unpause when closing locked modal
          }
        }}
      />
      <ConfirmDialog
        isOpen={confirmNewGame}
        title="Start New Game?"
        message="Current game progress will be lost."
        confirmLabel="New Game"
        onConfirm={confirmAndStartNewGame}
        onCancel={() => setConfirmNewGame(false)}
      />
      <GameLayout
        scoreBoard={
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <ScoreBoard
              humanScore={activeState.scores.human}
              cpuScore={activeState.scores.cpu}
              roundNumber={activeState.roundNumber}
              targetScore={activeState.targetScore}
              currentPlayer={activeState.round.currentPlayer}
              isSpectatorMode={isSpectatorMode}
              player1AIType={isSpectatorMode ? spectatorAIs.player1 : undefined}
              player1Model={isSpectatorMode ? spectatorModels.player1 : undefined}
              player2AIType={isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI}
              player2Model={isSpectatorMode ? spectatorModels.player2 : getModelForAI(settings.cpuAI)}
            />
            <GameControls
              onNewGame={handleNewGame}
              onOpenSettings={handleOpenSettings}
              onOpenStats={handleOpenStats}
              onOpenRules={handleOpenRules}
            />
          </div>
        }
        cpuHand={
          <PlayerHand
            cards={
              // Hide cards during dealing animation (only for non-worker mode), otherwise filter out animating card
              !useWorkerMode && isDealing
                ? []
                : animatingCard?.player === 'cpu'
                  ? activeState.players.cpu.hand.filter(c => c.id !== animatingCard.card.id)
                  : activeState.players.cpu.hand
            }
            isHuman={false}
            showFaceUp={isSpectatorMode && spectatorHandsVisible.cpu}
            onHandClick={isSpectatorMode ? () => setSpectatorHandsVisible(prev => ({ ...prev, cpu: !prev.cpu })) : undefined}
          />
        }
        cpuPile={
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <CapturedPile
              cards={activeState.players.cpu.captured}
              scopaCount={activeState.players.cpu.scopaCount}
              player="cpu"
              aiType={isSpectatorMode ? spectatorAIs.player2 : settings.cpuAI}
              aiModel={isSpectatorMode ? spectatorModels.player2 : getModelForAI(settings.cpuAI)}
              showStats={settings.showPileStats}
            />
            {((isSpectatorMode && isLLMAI(spectatorAIs.player2)) || (!isSpectatorMode && isLLMAI(settings.cpuAI))) && (
              <div style={{ position: 'relative' }}>
                <TokenStatsDisplay
                  stats={isSpectatorMode ? player2TokenStats : tokenStats}
                  delta={isSpectatorMode ? player2TokenDelta : tokenDelta}
                  show
                  mode="game"
                  position="bottom"
                  modelName={isSpectatorMode ? spectatorModels.player2 : getModelForAI(settings.cpuAI)}
                  error={player2ApiError}
                  onDismissError={() => setPlayer2ApiError(null)}
                />
                <ThinkingBubble
                  show
                  hasReasoning={!!lastMoveData.cpu}
                  onClick={() => {
                    if (lastMoveData.cpu) {
                      setReasoningModal({ isOpen: true, player: 'cpu', locked: true });
                      if (isSpectatorMode) {
                        setIsSpectatorPaused(true);
                      }
                    }
                  }}
                  onHoverStart={(isSpectatorMode && spectatorHandsVisible.cpu) ? () => {
                    if (lastMoveData.cpu && !reasoningModal.locked) {
                      setReasoningModal({ isOpen: true, player: 'cpu', locked: false });
                    }
                  } : undefined}
                  onHoverEnd={(isSpectatorMode && spectatorHandsVisible.cpu) ? () => {
                    if (!reasoningModal.locked) {
                      setReasoningModal({ isOpen: false, player: null, locked: false });
                    }
                  } : undefined}
                />
              </div>
            )}
          </div>
        }
        tableCards={
          <TableCards
            ref={tableRef}
            cards={!useWorkerMode && isDealing && dealMode === 'table' ? [] : activeState.round.table}
            highlightedCardIds={validCaptureTargetIds}
            selectedCardIds={selectedTableCards.map(c => c.id)}
            capturingCardIds={(animatingCard?.phase === 'moving' || animatingCard?.phase === 'capturing') && animatingCard?.capturedCards.length
              ? animatingCard.capturedCards.map(c => c.id)
              : undefined}
            captureDirection={animatingCard?.capturedCards.length ? animatingCard.player : undefined}
            onCardClick={handleTableCardClick}
            selectable={isHumanTurn && selectedCard !== null}
            isDragOver={isDragging}
            deckCount={activeState.round.deck.length}
            dealer={activeState.round.dealer}
          />
        }
        humanPile={
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
            {isSpectatorMode && isLLMAI(spectatorAIs.player1) && (
              <div style={{ position: 'relative' }}>
                <TokenStatsDisplay
                  stats={player1TokenStats}
                  delta={player1TokenDelta}
                  show
                  mode="game"
                  position="top"
                  modelName={spectatorModels.player1}
                  error={player1ApiError}
                  onDismissError={() => setPlayer1ApiError(null)}
                />
                <ThinkingBubble
                  show
                  hasReasoning={!!lastMoveData.human}
                  position="bottom"
                  onClick={() => {
                    if (lastMoveData.human) {
                      setReasoningModal({ isOpen: true, player: 'human', locked: true });
                      setIsSpectatorPaused(true);
                    }
                  }}
                  onHoverStart={spectatorHandsVisible.human ? () => {
                    if (lastMoveData.human && !reasoningModal.locked) {
                      setReasoningModal({ isOpen: true, player: 'human', locked: false });
                    }
                  } : undefined}
                  onHoverEnd={spectatorHandsVisible.human ? () => {
                    if (!reasoningModal.locked) {
                      setReasoningModal({ isOpen: false, player: null, locked: false });
                    }
                  } : undefined}
                />
              </div>
            )}
            <CapturedPile
              cards={activeState.players.human.captured}
              scopaCount={activeState.players.human.scopaCount}
              player="human"
              aiType={isSpectatorMode ? spectatorAIs.player1 : undefined}
              aiModel={isSpectatorMode ? spectatorModels.player1 : undefined}
              onClick={!isSpectatorMode ? () => setShowCapturedCards(true) : undefined}
              showStats={settings.showPileStats}
            />
          </div>
        }
        humanHand={
          <PlayerHand
            cards={
              // Hide cards during dealing animation (only for non-worker mode), otherwise filter out animating card
              !useWorkerMode && isDealing
                ? []
                : animatingCard?.player === 'human'
                  ? activeState.players.human.hand.filter(c => c.id !== animatingCard.card.id)
                  : activeState.players.human.hand
            }
            isHuman={!isSpectatorMode}
            onCardClick={isSpectatorMode ? undefined : handleHandCardClick}
            onCardDoubleClick={isSpectatorMode ? undefined : handleHandCardDoubleClick}
            onCardDragStart={isSpectatorMode ? undefined : handleCardDragStart}
            onCardDragEnd={isSpectatorMode ? undefined : handleCardDragEnd}
            selectedCardId={isSpectatorMode ? undefined : selectedCard?.id}
            disabled={isSpectatorMode || !isHumanTurn || isAnimationBlocking}
            showFaceUp={isSpectatorMode && spectatorHandsVisible.human}
            onHandClick={isSpectatorMode ? () => setSpectatorHandsVisible(prev => ({ ...prev, human: !prev.human })) : undefined}
            cardAnnotations={winOddsHandAnnotations}
          />
        }
        controls={
          <div className="control-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px', marginLeft: '16px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
              {isSpectatorMode
                ? `${AI_INFO[getAIForPlayer(activeState.round.currentPlayer)].name}'s turn${(useWorkerMode ? workerIsPaused : isSpectatorPaused) ? ' (Paused)' : ''}`
                : isHumanTurn ? 'Your turn' : `${AI_INFO[settings.cpuAI].name} is thinking...`}
            </span>

            {/* Action buttons container */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Spectator mode pause/play controls */}
              {isSpectatorMode && (
                <button
                  onClick={() => {
                    if (useWorkerMode) {
                      // Toggle worker pause state
                      if (workerIsPaused) {
                        resumeSimulation();
                      } else {
                        pauseSimulation();
                      }
                    } else {
                      setIsSpectatorPaused(prev => !prev);
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    background: (useWorkerMode ? workerIsPaused : isSpectatorPaused) ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)',
                    color: (useWorkerMode ? workerIsPaused : isSpectatorPaused) ? '#000' : 'var(--color-text-primary)',
                    border: (useWorkerMode ? workerIsPaused : isSpectatorPaused) ? 'none' : '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  {(useWorkerMode ? workerIsPaused : isSpectatorPaused) ? '▶ Resume' : '⏸ Pause'}
                </button>
              )}

              {/* Show place button when card can only be placed (only in player mode) */}
              {!isSpectatorMode && isHumanTurn && selectedCard && canOnlyPlace && (
                <button
                  onClick={executePlace}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    background: 'var(--color-accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Place Card
                </button>
              )}

              {/* Show confirm button for multi-card capture (only in player mode) */}
              {!isSpectatorMode && isHumanTurn && selectedTableCards.length > 1 && (
                <>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    Sum: {selectedSum}/{selectedCard?.value}
                  </span>
                  {isValidCapture && (
                    <button
                      onClick={executeCapture}
                      style={{
                        padding: '8px 16px',
                        fontSize: '14px',
                        background: 'var(--color-accent)',
                        color: '#000',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      Capture
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        }
      />
      {winOddsActive && (
        <WinOddsPanel
          // Last computed odds, retained while the opponent is thinking
          // or their card is animating — so the panel doesn't blink off
          // between turns.
          odds={displayedWinOdds}
          // Surface a 'simulating…' state when we have nothing to show
          // yet (very first deal, before the first estimate arrives) so
          // the panel is visible from the start.
          computing={winOddsComputing || (!displayedWinOdds && !!winOddsView)}
          metric="diff"
          caption="Expert self-play estimate"
        />
      )}
    </DeckProvider>
  );
}

export default ScopaApp;
