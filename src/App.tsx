import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useGame } from './hooks/useGame';
import { useSettings } from './hooks/useSettings';
import { useSound } from './hooks/useSound';
import { useStats } from './hooks/useStats';
import { GameLayout } from './components/Layout/GameLayout';
import { PlayerHand } from './components/Table/PlayerHand';
import { TableCards } from './components/Table/TableCards';
import { CapturedPile } from './components/Table/CapturedPile';
import { ScoreBoard } from './components/UI/ScoreBoard';
import { StartScreen } from './components/UI/StartScreen';
import { RoundEndScreen } from './components/UI/RoundEndScreen';
import { GameEndScreen } from './components/UI/GameEndScreen';
import { ScopaCelebration } from './components/UI/ScopaCelebration';
import { SetteBelloCelebration } from './components/UI/SetteBelloCelebration';
import { SettingsModal } from './components/UI/SettingsModal';
import { StatsModal } from './components/UI/StatsModal';
import { RulesModal } from './components/UI/RulesModal';
import { GameControls } from './components/UI/GameControls';
import { CpuCardAnimation } from './components/UI/CpuCardAnimation';
import { DealingAnimation, type DealMode } from './components/UI/DealingAnimation';
import { CaptureChoiceModal } from './components/UI/CaptureChoiceModal';
import { DeckProvider } from './contexts/DeckContext';
import { getValidMoves } from './game/rules';
import { AI_PLAYERS, AI_INFO, getGeminiAI, getGeminiSingleTurnAI, isAsyncAI, isGeminiAIType, isOpenAIAIType, isClaudeAIType, getGeminiTokenStats, getGeminiTokenDelta, resetGeminiTokenStats, startGeminiRound, endGeminiRound, getGeminiSingleTurnTokenStats, getGeminiSingleTurnTokenDelta, resetGeminiSingleTurnTokenStats, startGeminiSingleTurnRound, endGeminiSingleTurnRound, getOpenAI, getOpenAITokenStats, getOpenAITokenDelta, resetOpenAITokenStats, startOpenAIRound, endOpenAIRound, getOpenAISingleTurnAI, getOpenAISingleTurnTokenStats, getOpenAISingleTurnTokenDelta, resetOpenAISingleTurnTokenStats, startOpenAISingleTurnRound, endOpenAISingleTurnRound, getClaudeAI, getClaudeTokenStats, getClaudeTokenDelta, resetClaudeTokenStats, startClaudeRound, endClaudeRound, getClaudeSingleTurnAI, getClaudeSingleTurnTokenStats, getClaudeSingleTurnTokenDelta, resetClaudeSingleTurnTokenStats, startClaudeSingleTurnRound, endClaudeSingleTurnRound } from './ai';
import type { ExtendedAIType, LLMAIContext, AnyAIPlayer, GeminiTokenStats, GeminiTokenDelta, OpenAITokenStats, OpenAITokenDelta, ClaudeTokenStats, ClaudeTokenDelta } from './ai';
import { TokenStatsDisplay } from './components/UI/TokenStatsDisplay';
import type { PanInfo } from 'framer-motion';
import type { Card, Move, PlayerId, GameState } from './game/types';
import { useGameWorker, type CPUType } from './hooks/useGameWorker';

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

function App() {
  const { state, startGame, playCard, endRound, nextRound, showGameEnd, resetGame } = useGame();
  const { settings, updateSetting, resetSettings } = useSettings();
  const { play: playSound } = useSound({
    enabled: settings.soundEnabled,
  });
  const {
    recordGame,
    getOpponentStats,
    getGamesAgainst,
    getAllDisplayOpponents,
    clearStats,
  } = useStats();
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
  const [confirmNewGame, setConfirmNewGame] = useState(false);

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
  const isLLMAI = useCallback((aiType: ExtendedAIType) => isGeminiAI(aiType) || isOpenAIAI(aiType) || isClaudeAI(aiType), []);

  // Helper to get the model for a given AI type from settings
  const getModelForAI = useCallback((aiType: ExtendedAIType): string => {
    if (isOpenAIAI(aiType)) return settings.openaiModel;
    if (isClaudeAI(aiType)) return settings.claudeModel;
    return settings.geminiModel;
  }, [settings.openaiModel, settings.claudeModel, settings.geminiModel]);

  // Helper to get delta for a specific AI type and model
  // Returns a unified delta type (Gemini, OpenAI, and Claude deltas are structurally compatible)
  const getDeltaForAIType = useCallback((aiType: ExtendedAIType, model?: string): GeminiTokenDelta | OpenAITokenDelta | ClaudeTokenDelta | null => {
    const useThinking = settings.useThinking;
    if (aiType === 'gemini-singleturn') {
      return getGeminiSingleTurnTokenDelta(model, useThinking);
    } else if (aiType === 'gemini') {
      return getGeminiTokenDelta(model, useThinking);
    } else if (aiType === 'openai') {
      return getOpenAITokenDelta(model);
    } else if (aiType === 'openai-singleturn') {
      return getOpenAISingleTurnTokenDelta(model);
    } else if (aiType === 'claude') {
      return getClaudeTokenDelta(model, useThinking);
    } else if (aiType === 'claude-singleturn') {
      return getClaudeSingleTurnTokenDelta(model, useThinking);
    }
    return null;
  }, [settings.useThinking]);

  // Helper to get full stats for a specific AI type and model
  // Returns a unified stats type (Gemini, OpenAI, and Claude stats are structurally compatible)
  const getStatsForAIType = useCallback((aiType: ExtendedAIType, model?: string): GeminiTokenStats | OpenAITokenStats | ClaudeTokenStats | null => {
    const useThinking = settings.useThinking;
    if (aiType === 'gemini-singleturn') {
      return getGeminiSingleTurnTokenStats(model, useThinking);
    } else if (aiType === 'gemini') {
      return getGeminiTokenStats(model, useThinking);
    } else if (aiType === 'openai') {
      return getOpenAITokenStats(model);
    } else if (aiType === 'openai-singleturn') {
      return getOpenAISingleTurnTokenStats(model);
    } else if (aiType === 'claude') {
      return getClaudeTokenStats(model, useThinking);
    } else if (aiType === 'claude-singleturn') {
      return getClaudeSingleTurnTokenStats(model, useThinking);
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

    const delta = getDeltaForAIType(aiType, model);

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

  // Get AI player instance for a given AI type and model
  const getAIPlayer = useCallback((aiType: ExtendedAIType, model?: string): AnyAIPlayer => {
    const useThinking = settings.useThinking;
    if (aiType === 'gemini') {
      const geminiModel = model || settings.geminiModel;
      const gemini = getGeminiAI(geminiModel, useThinking);
      if (gemini) return gemini;
      // Fallback to heuristic if Gemini not available
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'gemini-singleturn') {
      const geminiModel = model || settings.geminiModel;
      const gemini = getGeminiSingleTurnAI(geminiModel, useThinking);
      if (gemini) return gemini;
      // Fallback to heuristic if Gemini not available
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'openai') {
      const openaiModel = model || settings.openaiModel;
      const openai = getOpenAI(openaiModel);
      if (openai) return openai;
      // Fallback to heuristic if OpenAI not available
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'openai-singleturn') {
      const openaiModel = model || settings.openaiModel;
      const openai = getOpenAISingleTurnAI(openaiModel);
      if (openai) return openai;
      // Fallback to heuristic if OpenAI not available
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'claude') {
      const claudeModel = model || settings.claudeModel;
      const claude = getClaudeAI(claudeModel, useThinking);
      if (claude) return claude;
      // Fallback to heuristic if Claude not available
      return AI_PLAYERS.heuristic;
    }
    if (aiType === 'claude-singleturn') {
      const claudeModel = model || settings.claudeModel;
      const claude = getClaudeSingleTurnAI(claudeModel, useThinking);
      if (claude) return claude;
      // Fallback to heuristic if Claude not available
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
      const ai = getAIPlayer(aiType, model);

      let moveToExecute: Move;
      if (isAsyncAI(ai)) {
        // Mark API request in flight to prevent re-triggering on pause/unpause
        aiRequestInFlight.current = true;
        try {
          // Async AI (e.g., Gemini) - build extended context and await
          const context = buildLLMContext(cpuHand, state.round.table, 'cpu');
          moveToExecute = await ai.selectMove(context);
          // Clear any previous error on success
          setPlayer2ApiError(null);
          // Update token stats after async AI move
          if (isSpectatorMode) {
            updatePlayerTokenStats('player2');
          } else {
            updateTokenStats();
          }
        } catch (err) {
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

  // Handle starting a new game (wraps startGame to reset token stats)
  const handleStartGame = useCallback((targetScore: number, gameMode: 'pvsCPU' | 'cpuVsCPU') => {
    // Reset token stats for all LLM types
    resetAllTokenStats();
    // Start fresh sessions for all LLM types (no-op if not active)
    startGeminiRound();
    startGeminiSingleTurnRound();
    startOpenAIRound();
    startOpenAISingleTurnRound();
    startClaudeRound();
    startClaudeSingleTurnRound();

    // Use worker mode ONLY for instant mode with sync AIs (no animations needed)
    // For other speeds, use main thread to preserve animations and UI
    if (gameMode === 'cpuVsCPU' && canUseWorker && settings.animationSpeed === 'instant') {
      // Use Web Worker for instant background simulation
      setUseWorkerMode(true);
      setWorkerFinalState(null); // Clear any previous final state
      startSimulation({
        player1AI: spectatorAIs.player1 as CPUType,
        player2AI: spectatorAIs.player2 as CPUType,
        targetScore,
        delayMs: 0,
      });
    } else {
      // Use main thread for animations, LLM AIs, or player vs CPU
      setUseWorkerMode(false);
      startGame(targetScore, gameMode);
    }
  }, [startGame, resetAllTokenStats, canUseWorker, startSimulation, spectatorAIs, settings.animationSpeed]);

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
    startOpenAIRound();
    startOpenAISingleTurnRound();
    startClaudeRound();
    startClaudeSingleTurnRound();
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
            : undefined;

      // Determine AI mode for LLM opponents
      const isLLMOpponent = isLLMAI(settings.cpuAI);
      const isMultiTurn = isLLMOpponent
        ? !settings.cpuAI.includes('singleturn')
        : undefined;
      const useThinking = isLLMOpponent ? settings.useThinking : undefined;

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
      const ai = getAIPlayer(spectatorAIs.player1, spectatorModels.player1);

      let moveToExecute: Move;
      if (isAsyncAI(ai)) {
        // Mark API request in flight to prevent re-triggering on pause/unpause
        aiRequestInFlight.current = true;
        try {
          // Async AI (e.g., Gemini) - build extended context and await
          const context = buildLLMContext(humanHand, state.round.table, 'human');
          moveToExecute = await ai.selectMove(context);
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

  // If game hasn't started, show start screen
  if (activeState.status === 'idle') {
    return (
      <DeckProvider deck={settings.deck}>
        <StartScreen
          onStartGame={handleStartGame}
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
        opponents={getAllDisplayOpponents()}
        getOpponentStats={getOpponentStats}
        getGamesAgainst={getGamesAgainst}
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
      />
      {/* New Game Confirmation Dialog */}
      {confirmNewGame && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 160,
          }}
          onClick={() => setConfirmNewGame(false)}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e3a2f 0%, #0d1f17 100%)',
              border: '2px solid var(--color-accent)',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', color: 'var(--color-text-primary)' }}>
              Start New Game?
            </h3>
            <p style={{ margin: '0 0 20px', color: 'var(--color-text-secondary)' }}>
              Current game progress will be lost.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setConfirmNewGame(false)}
                style={{
                  padding: '8px 20px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '6px',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAndStartNewGame}
                style={{
                  padding: '8px 20px',
                  background: 'var(--color-accent)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#000',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                New Game
              </button>
            </div>
          </div>
        </div>
      )}
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
            />
            {((isSpectatorMode && isLLMAI(spectatorAIs.player2)) || (!isSpectatorMode && isLLMAI(settings.cpuAI))) && (
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
            )}
            <CapturedPile
              cards={activeState.players.human.captured}
              scopaCount={activeState.players.human.scopaCount}
              player="human"
              aiType={isSpectatorMode ? spectatorAIs.player1 : undefined}
              aiModel={isSpectatorMode ? spectatorModels.player1 : undefined}
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
          />
        }
        controls={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px', marginLeft: '16px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              {isSpectatorMode
                ? `${AI_INFO[getAIForPlayer(activeState.round.currentPlayer)].name}'s turn${(useWorkerMode ? workerIsPaused : isSpectatorPaused) ? ' (Paused)' : ''}`
                : isHumanTurn ? 'Your turn' : `${AI_INFO[settings.cpuAI].name} is thinking...`}
            </span>

            {/* Action buttons container - always takes up space */}
            <div style={{ minHeight: '36px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
    </DeckProvider>
  );
}

export default App;
