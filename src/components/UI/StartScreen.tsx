// Step 8.6: StartScreen Component

import { useState, useEffect } from 'react';
import { AI_INFO, fetchGeminiModels, fetchOpenAIModels, fetchClaudeModels, fetchOpenRouterModels, isGeminiAIType, isGeminiFreeAIType, isOpenAIAIType, isClaudeAIType, isOpenRouterAIType, getGeminiFreeRateLimitInfo, type ExtendedAIType, type GeminiModelInfo, type OpenAIModelInfo, type ClaudeModelInfo, type OpenRouterModelInfo } from '../../games/scopa/ai';
import type { GameMode } from '../../games/scopa/types';
import { CustomDropdown } from './CustomDropdown';
import { GeminiIcon } from './GeminiIcon';
import { AppleIntelligenceIcon } from './AppleIntelligenceIcon';
import { OpenAIIcon } from './OpenAIIcon';
import { ClaudeIcon } from './ClaudeIcon';
import { OpenRouterIcon } from './OpenRouterIcon';
import { OpenRouterModelOptions } from './OpenRouterModelOptions';
import { DEFAULT_OPENROUTER_MODEL, OPENROUTER_FREE_ROUTER, isFreeOpenRouterModel, freeOpenRouterModels, normalizeOpenRouterSelection, getCachedOpenRouterModel, isMandatoryReasoningModel, isOpenRouterCatalogueLoaded, openRouterModelDisplayName } from '../../ai/openrouterProvider';
import { LanguageToggle } from './LanguageToggle';
import { useT } from '../../i18n/LanguageContext';
import { GameSwitcher } from './GameSwitcher';
import { OtherGameAnnouncement } from './OtherGameAnnouncement';
import { AIConsentModal } from './AIConsentModal';
import { AppStoreBadge, AppStoreCredit } from './AppStoreBadge';
import { aiDataDestinations, hasAIDataConsent, grantAIDataConsent, type AIDataDestination } from '../../ai/consent';
import switcherStyles from './GameSwitcher.module.css';
import type { GameId } from '../../games/gameSelection';
import { MAIN_SITE_URL } from '../../platform/links';
import styles from './StartScreen.module.css';

// Check if running in itch.io mode (API keys disabled)
const ITCH_MODE = import.meta.env.VITE_ITCH_MODE === 'true';

type GameModeOption = 'play' | 'watch' | 'multiplayer';
type OpponentCategory = 'cpu' | 'free-ai' | 'device-ai' | 'ai';
type CPUType = 'random' | 'heuristic' | 'expert';
// AI provider (base type without mode suffix)
type AIProvider = 'gemini' | 'openai' | 'claude' | 'openrouter';
// Conversation mode for LLM AIs
type ConversationMode = 'conversation' | 'singleturn';

interface StartScreenProps {
  onStartGame: (targetScore: number, gameMode: GameMode) => void;
  onStartMultiplayer: () => void;
  selectedAI: ExtendedAIType;
  onSelectAI: (ai: ExtendedAIType) => void;
  spectatorAIs: { player1: ExtendedAIType; player2: ExtendedAIType };
  onSelectSpectatorAI: (player: 'player1' | 'player2', ai: ExtendedAIType) => void;
  geminiModel: string;
  onSelectGeminiModel: (model: string) => void;
  openaiModel: string;
  onSelectOpenAIModel: (model: string) => void;
  claudeModel: string;
  onSelectClaudeModel: (model: string) => void;
  openrouterModel: string;
  onSelectOpenRouterModel: (model: string) => void;
  spectatorModels: { player1: string; player2: string };
  onSelectSpectatorModel: (player: 'player1' | 'player2', model: string) => void;
  defaultTargetScore: number;
  thinkingLevel: 'off' | 'medium' | 'high';
  onCycleThinking: () => void;
  onOpenSettings?: () => void;
  onOpenRules?: () => void;
  /** Runtime Scopa ⇄ Briscola switch; undefined when unavailable (itch builds). */
  onSwitchGame?: (game: GameId) => void;
  /** AI provider availability (computed from React state, not localStorage) */
  aiAvailability: {
    geminiFree: boolean;
    gemini: boolean;
    openai: boolean;
    claude: boolean;
    openrouter: boolean;
    /** The on-device model (Apple Intelligence); only the iOS app can say yes */
    apple: boolean;
  };
}

const PRESET_SCORES = [11, 16, 21] as const;

// Helper to determine opponent category from AI type (+ model). The
// categories are about cost: "AI (free)" holds what costs the player
// nothing — the proxy Gemini and OpenRouter's free models (those still
// need an OpenRouter key) — and "AI (your key)" the models billed to the
// player's own key.
function getOpponentCategory(aiType: ExtendedAIType, model?: string): OpponentCategory {
  if (aiType === 'random' || aiType === 'heuristic' || aiType === 'expert') return 'cpu';
  if (aiType === 'gemini-free') return 'free-ai';
  if (aiType === 'apple') return 'device-ai';
  if (isOpenRouterAIType(aiType) && model && isFreeOpenRouterModel(model)) return 'free-ai';
  return 'ai';
}

// Helper to get CPU type from AI type
function getCPUType(aiType: ExtendedAIType): CPUType {
  if (aiType === 'random') return 'random';
  if (aiType === 'expert') return 'expert';
  return 'heuristic';
}

// Helper to get base AI provider from AI type
function getAIProvider(aiType: ExtendedAIType): AIProvider {
  if (isOpenAIAIType(aiType)) return 'openai';
  if (isClaudeAIType(aiType)) return 'claude';
  if (isOpenRouterAIType(aiType)) return 'openrouter';
  return 'gemini';
}

// Helper to get conversation mode from AI type
function getConversationMode(aiType: ExtendedAIType): ConversationMode {
  if (aiType === 'gemini-singleturn' || aiType === 'openai-singleturn' || aiType === 'claude-singleturn' || aiType === 'openrouter-singleturn') return 'singleturn';
  return 'conversation';
}

// Helper to construct ExtendedAIType from provider and mode
function getExtendedAIType(provider: AIProvider, mode: ConversationMode): ExtendedAIType {
  if (provider === 'openai') {
    return mode === 'singleturn' ? 'openai-singleturn' : 'openai';
  }
  if (provider === 'claude') {
    return mode === 'singleturn' ? 'claude-singleturn' : 'claude';
  }
  if (provider === 'openrouter') {
    return mode === 'singleturn' ? 'openrouter-singleturn' : 'openrouter';
  }
  return mode === 'singleturn' ? 'gemini-singleturn' : 'gemini';
}

export function StartScreen({
  onStartGame,
  onStartMultiplayer,
  selectedAI,
  onSelectAI,
  spectatorAIs,
  onSelectSpectatorAI,
  geminiModel,
  onSelectGeminiModel,
  openaiModel,
  onSelectOpenAIModel,
  claudeModel,
  onSelectClaudeModel,
  openrouterModel,
  onSelectOpenRouterModel,
  spectatorModels,
  onSelectSpectatorModel,
  defaultTargetScore,
  thinkingLevel,
  onCycleThinking,
  onOpenSettings,
  onOpenRules,
  aiAvailability,
  onSwitchGame,
}: StartScreenProps) {
  const t = useT();
  const [selectedScore, setSelectedScore] = useState<number>(defaultTargetScore);
  const [gameMode, setGameMode] = useState<GameModeOption>('play');
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>([]);
  const [openaiModels, setOpenAIModels] = useState<OpenAIModelInfo[]>([]);
  const [claudeModels, setClaudeModels] = useState<ClaudeModelInfo[]>([]);
  const [openrouterModels, setOpenRouterModels] = useState<OpenRouterModelInfo[]>([]);
  const [loadingGeminiModels, setLoadingGeminiModels] = useState(false);
  const [loadingOpenAIModels, setLoadingOpenAIModels] = useState(false);
  const [loadingClaudeModels, setLoadingClaudeModels] = useState(false);
  const [loadingOpenRouterModels, setLoadingOpenRouterModels] = useState(false);

  // Use availability from props (computed from React state in App.tsx)
  const geminiFreeAvailable = aiAvailability.geminiFree;
  const geminiAvailable = aiAvailability.gemini;
  const openaiAvailable = aiAvailability.openai;
  const claudeAvailable = aiAvailability.claude;
  const openrouterAvailable = aiAvailability.openrouter;
  const appleAvailable = aiAvailability.apple;
  // The remembered choice can outlive the model (Apple Intelligence turned
  // off, or the same settings on another device): fall back to the CPU
  // rather than showing an empty selector.
  useEffect(() => {
    if (appleAvailable) return;
    if (selectedAI === 'apple') onSelectAI('heuristic');
    if (spectatorAIs.player1 === 'apple') onSelectSpectatorAI('player1', 'heuristic');
    if (spectatorAIs.player2 === 'apple') onSelectSpectatorAI('player2', 'heuristic');
  }, [selectedAI, spectatorAIs.player1, spectatorAIs.player2, appleAvailable, onSelectAI, onSelectSpectatorAI]);
  const aiAvailable = geminiAvailable || openaiAvailable || claudeAvailable || openrouterAvailable;

  // Default AI provider based on availability
  const defaultAIProvider: AIProvider = geminiAvailable
    ? 'gemini'
    : openaiAvailable
      ? 'openai'
      : claudeAvailable
        ? 'claude'
        : 'openrouter';

  // Check if any selected AI needs model fetching
  const needsGeminiModels = isGeminiAIType(selectedAI) ||
    isGeminiAIType(spectatorAIs.player1) ||
    isGeminiAIType(spectatorAIs.player2);

  const needsOpenAIModels = isOpenAIAIType(selectedAI) ||
    isOpenAIAIType(spectatorAIs.player1) ||
    isOpenAIAIType(spectatorAIs.player2);

  const needsClaudeModels = isClaudeAIType(selectedAI) ||
    isClaudeAIType(spectatorAIs.player1) ||
    isClaudeAIType(spectatorAIs.player2);

  // Both the BYOK picker and the free category read the catalogue, so it
  // is fetched (once, public) as soon as an OpenRouter key is in place.
  const needsOpenRouterModels = openrouterAvailable;
  const freeOpenRouter = freeOpenRouterModels(openrouterModels);
  const paidOpenRouter = openrouterModels.filter((m) => !isFreeOpenRouterModel(m.id));
  const defaultFreeOpenRouter = freeOpenRouter[0]?.id ?? OPENROUTER_FREE_ROUTER;

  // Fetch Gemini models when needed
  useEffect(() => {
    if (needsGeminiModels && geminiModels.length === 0 && !loadingGeminiModels) {
      setLoadingGeminiModels(true);
      fetchGeminiModels()
        .then((models) => {
          setGeminiModels(models);
          if (models.length > 0 && !models.some(m => m.id === geminiModel)) {
            onSelectGeminiModel(models[0].id);
          }
        })
        .finally(() => setLoadingGeminiModels(false));
    }
  }, [needsGeminiModels, geminiModels.length, loadingGeminiModels, geminiModel, onSelectGeminiModel]);

  // Fetch OpenAI models when needed
  useEffect(() => {
    if (needsOpenAIModels && openaiModels.length === 0 && !loadingOpenAIModels) {
      setLoadingOpenAIModels(true);
      fetchOpenAIModels()
        .then((models) => {
          setOpenAIModels(models);
          if (models.length > 0 && !models.some(m => m.id === openaiModel)) {
            onSelectOpenAIModel(models[0].id);
          }
        })
        .finally(() => setLoadingOpenAIModels(false));
    }
  }, [needsOpenAIModels, openaiModels.length, loadingOpenAIModels, openaiModel, onSelectOpenAIModel]);

  // Fetch Claude models when needed
  useEffect(() => {
    if (needsClaudeModels && claudeModels.length === 0 && !loadingClaudeModels) {
      setLoadingClaudeModels(true);
      fetchClaudeModels()
        .then((models) => {
          setClaudeModels(models);
          if (models.length > 0 && !models.some(m => m.id === claudeModel)) {
            onSelectClaudeModel(models[0].id);
          }
        })
        .finally(() => setLoadingClaudeModels(false));
    }
  }, [needsClaudeModels, claudeModels.length, loadingClaudeModels, claudeModel, onSelectClaudeModel]);

  // Fetch OpenRouter models when needed (public catalogue, no key involved)
  useEffect(() => {
    if (needsOpenRouterModels && openrouterModels.length === 0 && !loadingOpenRouterModels) {
      setLoadingOpenRouterModels(true);
      fetchOpenRouterModels()
        .then((models) => setOpenRouterModels(models))
        .finally(() => setLoadingOpenRouterModels(false));
    }
  }, [needsOpenRouterModels, openrouterModels.length, loadingOpenRouterModels]);

  // Keep every active OpenRouter selection inside the catalogue — the play
  // opponent and each watch seat. A remembered id that has since retired
  // would otherwise stay in state (and in requests) while the <select>
  // shows something else; it maps to the default (or the first free entry).
  // Only the fetched catalogue counts: after a failed fetch the list is the
  // small built-in fallback and every saved selection is left alone.
  useEffect(() => {
    if (openrouterModels.length === 0 || !isOpenRouterCatalogueLoaded()) return;
    const fixed = normalizeOpenRouterSelection(openrouterModel, openrouterModels);
    if (fixed !== openrouterModel) onSelectOpenRouterModel(fixed);
    for (const player of ['player1', 'player2'] as const) {
      if (!isOpenRouterAIType(spectatorAIs[player])) continue;
      const current = spectatorModels[player];
      const next = normalizeOpenRouterSelection(current, openrouterModels);
      if (next !== current) onSelectSpectatorModel(player, next);
    }
  }, [openrouterModels, openrouterModel, spectatorAIs, spectatorModels, onSelectOpenRouterModel, onSelectSpectatorModel]);

  // Handlers for cascading dropdowns
  const handleCategoryChange = (category: OpponentCategory) => {
    if (category === 'cpu') {
      onSelectAI('heuristic'); // Default to Furbo
    } else if (category === 'free-ai') {
      handleFreeChoice(geminiFreeAvailable ? 'gemini-free' : defaultFreeOpenRouter);
    } else if (category === 'device-ai') {
      onSelectAI('apple');
    } else {
      // Default to first available AI provider
      onSelectAI(defaultAIProvider);
      // A free OpenRouter model belongs to the free category, not here
      if (defaultAIProvider === 'openrouter' && isFreeOpenRouterModel(openrouterModel)) {
        onSelectOpenRouterModel(DEFAULT_OPENROUTER_MODEL);
      }
    }
  };

  // The free category's dropdown: the proxy Gemini (no key) or one of
  // OpenRouter's free models (keeps the current conversation mode).
  const handleFreeChoice = (choice: string) => {
    if (choice === 'gemini-free') {
      onSelectAI('gemini-free');
      setSelectedScore(11); // the proxy opponent plays to 11
      return;
    }
    onSelectAI(getExtendedAIType('openrouter', getConversationMode(selectedAI)));
    onSelectOpenRouterModel(choice);
  };

  const handleCPUTypeChange = (type: CPUType) => {
    onSelectAI(type);
  };

  const handleAIProviderChange = (provider: AIProvider) => {
    // Preserve current mode when changing provider
    const currentMode = getConversationMode(selectedAI);
    onSelectAI(getExtendedAIType(provider, currentMode));
    if (provider === 'openrouter' && isFreeOpenRouterModel(openrouterModel)) {
      onSelectOpenRouterModel(DEFAULT_OPENROUTER_MODEL);
    }
  };

  const handleConversationModeChange = (mode: ConversationMode) => {
    // Preserve current provider when changing mode
    const currentProvider = getAIProvider(selectedAI);
    onSelectAI(getExtendedAIType(currentProvider, mode));
  };

  // Spectator mode handlers
  const handleSpectatorCategoryChange = (player: 'player1' | 'player2', category: OpponentCategory) => {
    if (category === 'cpu') {
      onSelectSpectatorAI(player, 'heuristic');
    } else if (category === 'free-ai') {
      handleSpectatorFreeChoice(player, geminiFreeAvailable ? 'gemini-free' : defaultFreeOpenRouter);
    } else if (category === 'device-ai') {
      onSelectSpectatorAI(player, 'apple');
    } else {
      // Use default provider with conversation mode
      const newAI = getExtendedAIType(defaultAIProvider, 'conversation');
      onSelectSpectatorAI(player, newAI);
      // Also update the model to a default for the new provider
      if (defaultAIProvider === 'openai') {
        onSelectSpectatorModel(player, openaiModel);
      } else if (defaultAIProvider === 'claude') {
        onSelectSpectatorModel(player, claudeModel);
      } else if (defaultAIProvider === 'openrouter') {
        onSelectSpectatorModel(player, isFreeOpenRouterModel(openrouterModel) ? DEFAULT_OPENROUTER_MODEL : openrouterModel);
      } else {
        onSelectSpectatorModel(player, geminiModel);
      }
    }
  };

  const handleSpectatorCPUTypeChange = (player: 'player1' | 'player2', type: CPUType) => {
    onSelectSpectatorAI(player, type);
  };

  const handleSpectatorFreeChoice = (player: 'player1' | 'player2', choice: string) => {
    if (choice === 'gemini-free') {
      onSelectSpectatorAI(player, 'gemini-free');
      return;
    }
    const currentAI = player === 'player1' ? spectatorAIs.player1 : spectatorAIs.player2;
    onSelectSpectatorAI(player, getExtendedAIType('openrouter', getConversationMode(currentAI)));
    onSelectSpectatorModel(player, choice);
  };

  const handleSpectatorAIProviderChange = (player: 'player1' | 'player2', provider: AIProvider) => {
    // Preserve current mode when changing provider
    const currentAI = player === 'player1' ? spectatorAIs.player1 : spectatorAIs.player2;
    const currentMode = getConversationMode(currentAI);
    onSelectSpectatorAI(player, getExtendedAIType(provider, currentMode));
    // Also update the model to a default for the new provider
    if (provider === 'openai') {
      onSelectSpectatorModel(player, openaiModel);
    } else if (provider === 'claude') {
      onSelectSpectatorModel(player, claudeModel);
    } else if (provider === 'openrouter') {
      onSelectSpectatorModel(player, isFreeOpenRouterModel(openrouterModel) ? DEFAULT_OPENROUTER_MODEL : openrouterModel);
    } else {
      onSelectSpectatorModel(player, geminiModel);
    }
  };

  const handleSpectatorModeChange = (player: 'player1' | 'player2', mode: ConversationMode) => {
    // Preserve current provider when changing mode
    const currentAI = player === 'player1' ? spectatorAIs.player1 : spectatorAIs.player2;
    const currentProvider = getAIProvider(currentAI);
    onSelectSpectatorAI(player, getExtendedAIType(currentProvider, mode));
  };

  // The data notice before the first game against an AI service
  // (src/ai/consent.ts): asked once for the seats about to play, remembered
  // through the storage seam; "Not now" seats a CPU opponent instead.
  const [consentRequest, setConsentRequest] = useState<AIDataDestination[] | null>(null);
  const startWithSelection = () => {
    const mode: GameMode = gameMode === 'play' ? 'pvsCPU' : 'cpuVsCPU';
    onStartGame(selectedScore, mode);
  };
  const handleStartGame = () => {
    if (gameMode === 'multiplayer') {
      onStartMultiplayer();
      return;
    }
    const seats = gameMode === 'play' ? [selectedAI] : [spectatorAIs.player1, spectatorAIs.player2];
    const destinations = aiDataDestinations(seats);
    if (destinations.length > 0 && !hasAIDataConsent()) {
      setConsentRequest(destinations);
      return;
    }
    startWithSelection();
  };
  const handleConsentAllow = () => {
    grantAIDataConsent();
    setConsentRequest(null);
    startWithSelection();
  };
  const handleConsentDecline = () => {
    setConsentRequest(null);
    if (gameMode === 'play') {
      if (aiDataDestinations([selectedAI]).length > 0) onSelectAI('heuristic');
      return;
    }
    for (const player of ['player1', 'player2'] as const) {
      if (aiDataDestinations([spectatorAIs[player]]).length > 0) onSelectSpectatorAI(player, 'heuristic');
    }
  };

  // Render opponent selector (reusable for play and spectator modes)
  const renderOpponentSelector = (
    currentAI: ExtendedAIType,
    onCategoryChange: (cat: OpponentCategory) => void,
    onCPUTypeChange: (type: CPUType) => void,
    onAIProviderChange: (provider: AIProvider) => void,
    onModeChange: (mode: ConversationMode) => void,
    onModelChange: (model: string) => void,
    currentModel: string,
    onFreeChoice: (choice: string) => void,
    label: string
  ) => {
    const cat = getOpponentCategory(currentAI, currentModel);
    const cpu = getCPUType(currentAI);
    const provider = getAIProvider(currentAI);
    const convMode = getConversationMode(currentAI);
    const isGemini = isGeminiAIType(currentAI);
    const isFreeAI = isGeminiFreeAIType(currentAI);
    const isOpenAI = isOpenAIAIType(currentAI);
    const isClaude = isClaudeAIType(currentAI);
    const isOpenRouter = isOpenRouterAIType(currentAI);
    const isOpenRouterFree = isOpenRouter && isFreeOpenRouterModel(currentModel);
    // A model that always reasons cannot be switched off: the knob's "off" is its minimum
    const thinkingMinimum = isOpenRouter && isMandatoryReasoningModel(getCachedOpenRouterModel(currentModel));

    // Mode and thinking toggles (BYOK providers and OpenRouter's free models)
    const toggles = (
      <div className={styles.toggleGroup}>
        <button
          className={styles.modeToggle}
          onClick={() => onModeChange(convMode === 'conversation' ? 'singleturn' : 'conversation')}
          title={convMode === 'conversation'
            ? t.start.multiTurnTitle
            : t.start.singleTurnTitle}
        >
          {convMode === 'conversation' ? '💬' : '1️⃣'}
        </button>

        {(isGemini || isClaude || isOpenAI || isOpenRouter) && (
          <button
            className={`${styles.thinkingToggle} ${thinkingLevel !== 'off' ? styles.thinkingEnabled : ''}`}
            onClick={onCycleThinking}
            title={thinkingLevel === 'off'
              ? (thinkingMinimum ? t.start.thinkingMinimumTitle : t.start.thinkingOffTitle)
              : thinkingLevel === 'medium'
                ? t.start.thinkingMediumTitle
                : t.start.thinkingOnTitle}
          >
            {thinkingLevel === 'off' ? '⚡' : thinkingLevel === 'medium' ? '🧠' : '🧠+'}
          </button>
        )}
      </div>
    );

    return (
      <div className={styles.opponentSelector}>
        <label className={styles.label}>{label}</label>
        <div className={styles.dropdownRow}>
          {/* Category dropdown */}
          <select
            className={styles.dropdown}
            value={cat}
            onChange={(e) => onCategoryChange(e.target.value as OpponentCategory)}
          >
            <option value="cpu">{t.start.categoryCpu}</option>
            {(geminiFreeAvailable || openrouterAvailable) && <option value="free-ai">{t.start.categoryFreeAI}</option>}
            {appleAvailable && <option value="device-ai">{t.start.categoryDeviceAI}</option>}
            {aiAvailable && <option value="ai">{t.start.categoryAI}</option>}
          </select>

          {/* CPU type or AI provider dropdown */}
          {cat === 'free-ai' ? (
            <>
              {/* The proxy Gemini (no key) and OpenRouter's free models */}
              <select
                className={styles.dropdown}
                value={isFreeAI ? 'gemini-free' : currentModel}
                onChange={(e) => onFreeChoice(e.target.value)}
              >
                {geminiFreeAvailable && (
                  <optgroup label={t.start.freeGroupNoKey}>
                    <option value="gemini-free">Gemini 3 Flash Preview</option>
                  </optgroup>
                )}
                {openrouterAvailable && (
                  <optgroup label={t.start.freeGroupOpenRouter}>
                    {freeOpenRouter.map((model) => (
                      <option key={model.id} value={model.id}>{model.displayName}</option>
                    ))}
                    {/* The selected model is always an option, so the <select>
                        never shows another entry than the one in state (a
                        saved model missing from a fallback or stale list). */}
                    {isOpenRouterFree && !freeOpenRouter.some((m) => m.id === currentModel) && (
                      <option value={currentModel}>
                        {openRouterModelDisplayName(currentModel)}
                        {isOpenRouterCatalogueLoaded() ? ` (${t.start.modelUnavailable})` : ''}
                      </option>
                    )}
                    {!isOpenRouterFree && freeOpenRouter.length === 0 && (
                      <option value={OPENROUTER_FREE_ROUTER}>
                        {loadingOpenRouterModels ? t.start.loading : openRouterModelDisplayName(OPENROUTER_FREE_ROUTER)}
                      </option>
                    )}
                  </optgroup>
                )}
              </select>
              {isOpenRouterFree && toggles}
            </>
          ) : cat === 'device-ai' ? (
            <span className={styles.freeAILabel}>
              <AppleIntelligenceIcon size="1.1em" /> {AI_INFO.apple.name}
            </span>
          ) : cat === 'cpu' ? (
            <select
              className={styles.dropdown}
              value={cpu}
              onChange={(e) => onCPUTypeChange(e.target.value as CPUType)}
            >
              <option value="random">{AI_INFO.random.icon} {AI_INFO.random.name}</option>
              <option value="heuristic">{AI_INFO.heuristic.icon} {AI_INFO.heuristic.name}</option>
              <option value="expert">{AI_INFO.expert.icon} {AI_INFO.expert.name}</option>
            </select>
          ) : (
            <>
              {/* AI Provider dropdown */}
              <CustomDropdown<AIProvider>
                options={[
                  ...(geminiAvailable ? [{ value: 'gemini' as const, label: 'Gemini', icon: <GeminiIcon size="1.1em" /> }] : []),
                  ...(openaiAvailable ? [{ value: 'openai' as const, label: 'OpenAI', icon: <OpenAIIcon size="1.1em" /> }] : []),
                  ...(claudeAvailable ? [{ value: 'claude' as const, label: 'Claude', icon: <ClaudeIcon size="1.1em" /> }] : []),
                  ...(openrouterAvailable ? [{ value: 'openrouter' as const, label: 'OpenRouter', icon: <OpenRouterIcon size="1.1em" /> }] : []),
                ]}
                value={provider}
                onChange={onAIProviderChange}
                className={styles.providerDropdown}
              />

              {/* Model dropdown */}
              {isGemini ? (
                loadingGeminiModels ? (
                  <select className={styles.dropdown} disabled>
                    <option>{t.start.loading}</option>
                  </select>
                ) : (
                  <select
                    className={styles.dropdown}
                    value={currentModel}
                    onChange={(e) => onModelChange(e.target.value)}
                  >
                    {geminiModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.displayName}</option>
                    ))}
                  </select>
                )
              ) : isOpenAI ? (
                loadingOpenAIModels ? (
                  <select className={styles.dropdown} disabled>
                    <option>{t.start.loading}</option>
                  </select>
                ) : (
                  <select
                    className={styles.dropdown}
                    value={currentModel}
                    onChange={(e) => onModelChange(e.target.value)}
                  >
                    {openaiModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.displayName}</option>
                    ))}
                  </select>
                )
              ) : isClaude ? (
                loadingClaudeModels ? (
                  <select className={styles.dropdown} disabled>
                    <option>{t.start.loading}</option>
                  </select>
                ) : (
                  <select
                    className={styles.dropdown}
                    value={currentModel}
                    onChange={(e) => onModelChange(e.target.value)}
                  >
                    {claudeModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.displayName}</option>
                    ))}
                  </select>
                )
              ) : isOpenRouter ? (
                loadingOpenRouterModels ? (
                  <select className={styles.dropdown} disabled>
                    <option>{t.start.loading}</option>
                  </select>
                ) : (
                  <select
                    className={styles.dropdown}
                    value={currentModel}
                    onChange={(e) => onModelChange(e.target.value)}
                  >
                    <OpenRouterModelOptions models={paidOpenRouter} selectedId={currentModel} />
                  </select>
                )
              ) : null}

              {toggles}
            </>
          )}
        </div>
        {/* Description with thinking status */}
        <p className={styles.aiDescription}>
          {t.aiDescriptions[currentAI] ?? AI_INFO[currentAI].description}
          {(cat === 'ai' || isOpenRouterFree) && (isGemini || isClaude || isOpenAI || isOpenRouter) && (
            thinkingLevel === 'off'
              ? (thinkingMinimum ? t.start.minimumThinking : t.start.fastMode)
              : thinkingLevel === 'medium'
                ? t.start.plusThinkingBalanced
                : t.start.plusThinking
          )}
        </p>
        {isOpenRouterFree && (
          <p className={styles.aiDescription} style={{ opacity: 0.7, fontSize: '0.85em' }}>
            {t.settings.openrouterFreeNote}
          </p>
        )}
        {isFreeAI && (() => {
          const rateLimitInfo = getGeminiFreeRateLimitInfo();
          const gamesRemaining = rateLimitInfo
            ? Math.max(0, rateLimitInfo.gamesLimit - rateLimitInfo.gamesUsed)
            : null;
          const isExhausted = gamesRemaining === 0 || !!rateLimitInfo?.globalExhausted;
          return (
            <>
              <p className={styles.aiDescription} style={{ opacity: 0.7, fontSize: '0.85em' }}>
                {t.start.freeAINoKey}
                {gamesRemaining !== null
                  ? t.start.gamesRemaining(gamesRemaining, rateLimitInfo!.gamesLimit)
                  : t.start.limitedPerDay}
              </p>
              {isExhausted && (
                <p className={styles.aiDescription} style={{ color: '#e57373', fontSize: '0.85em' }}>
                  {rateLimitInfo?.globalExhausted ? t.start.sharedLimitReached : t.start.dailyLimitReached}
                </p>
              )}
            </>
          );
        })()}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <LanguageToggle />
      {onSwitchGame && <OtherGameAnnouncement game="scopa" onSwitchGame={onSwitchGame} />}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          title={t.settings.title}
          aria-label={t.settings.title}
          style={{
            position: 'fixed',
            top: 'calc(0.75rem + var(--safe-top, 0px))',
            left: '0.75rem',
            zIndex: 50,
            padding: '6px 10px',
            fontSize: '1.2rem',
            lineHeight: 1,
            background: 'rgba(0, 0, 0, 0.3)',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            backdropFilter: 'blur(2px)',
          }}
        >
          ⚙️
        </button>
      )}
      <div className={styles.content}>
        {onSwitchGame && (
          <div className={switcherStyles.startScreenRow}>
            <span className={styles.label} style={{ marginBottom: 0 }}>{t.common.chooseGame}</span>
            <GameSwitcher value="scopa" onChange={onSwitchGame} className={switcherStyles.startScreen} />
          </div>
        )}
        <h1 className={styles.title}>Scopa</h1>
        <p className={styles.subtitle}>{t.start.scopaSubtitle}</p>

        <div className={styles.scoreSelection}>
          <label className={styles.label}>{t.start.gameMode}</label>
          <div className={styles.scoreOptions}>
            <button
              className={`${styles.scoreOption} ${styles.modeOption} ${gameMode === 'play' ? styles.selected : ''}`}
              onClick={() => setGameMode('play')}
            >
              {t.start.play}
            </button>
            <button
              className={`${styles.scoreOption} ${styles.modeOption} ${gameMode === 'watch' ? styles.selected : ''}`}
              onClick={() => setGameMode('watch')}
            >
              {t.start.watch}
            </button>
            <button
              className={`${styles.scoreOption} ${styles.modeOption} ${gameMode === 'multiplayer' ? styles.selected : ''}`}
              onClick={() => setGameMode('multiplayer')}
            >
              {t.start.multiplayer}
            </button>
          </div>
          <p className={styles.aiDescription}>
            {gameMode === 'play'
              ? t.start.playDesc
              : gameMode === 'watch'
                ? t.start.watchDesc
                : t.start.multiplayerDesc}
          </p>
        </div>

        {gameMode !== 'multiplayer' && (() => {
          const freeAILocked = gameMode === 'play' && isGeminiFreeAIType(selectedAI);
          return (
            <div className={styles.scoreSelection}>
              <label className={styles.label}>
                {t.start.targetScore}{freeAILocked ? t.start.fixedFreeAI : ''}
              </label>
              <div className={styles.scoreOptions}>
                {PRESET_SCORES.map((score) => (
                  <button
                    key={score}
                    className={`${styles.scoreOption} ${selectedScore === score ? styles.selected : ''}`}
                    onClick={() => !freeAILocked && setSelectedScore(score)}
                    disabled={freeAILocked}
                  >
                    {score}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="999"
                  className={`${styles.customScoreInput} ${!PRESET_SCORES.includes(selectedScore as 11 | 16 | 21) ? styles.selected : ''}`}
                  value={!PRESET_SCORES.includes(selectedScore as 11 | 16 | 21) ? selectedScore : ''}
                  placeholder="..."
                  onChange={(e) => {
                    if (freeAILocked) return;
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) {
                      setSelectedScore(val);
                    }
                  }}
                  disabled={freeAILocked}
                  title={freeAILocked ? t.start.freeAILimit11 : t.lobby.customScore}
                />
              </div>
            </div>
          );
        })()}

        {gameMode === 'play' && (
          <>
            {renderOpponentSelector(
              selectedAI,
              handleCategoryChange,
              handleCPUTypeChange,
              handleAIProviderChange,
              handleConversationModeChange,
              isGeminiAIType(selectedAI) ? onSelectGeminiModel : isOpenAIAIType(selectedAI) ? onSelectOpenAIModel : isOpenRouterAIType(selectedAI) ? onSelectOpenRouterModel : onSelectClaudeModel,
              isGeminiAIType(selectedAI) ? geminiModel : isOpenAIAIType(selectedAI) ? openaiModel : isOpenRouterAIType(selectedAI) ? openrouterModel : claudeModel,
              handleFreeChoice,
              t.common.opponent
            )}
            {!aiAvailable && !geminiFreeAvailable && (
              <div className={styles.aiHint}>
                <span>{t.start.wantPlayAI}</span>
                {ITCH_MODE ? (
                  <a href={MAIN_SITE_URL} target="_blank" rel="noopener noreferrer">
                    {t.start.visitMainSite}
                  </a>
                ) : (
                  onOpenSettings && <a onClick={onOpenSettings}>{t.start.addKeysSettings}</a>
                )}
              </div>
            )}
          </>
        )}

        {gameMode === 'watch' && (
          <>
            <div className={styles.spectatorSetup}>
              <div className={styles.spectatorPlayer}>
                {renderOpponentSelector(
                  spectatorAIs.player1,
                  (cat) => handleSpectatorCategoryChange('player1', cat),
                  (type) => handleSpectatorCPUTypeChange('player1', type),
                  (provider) => handleSpectatorAIProviderChange('player1', provider),
                  (mode) => handleSpectatorModeChange('player1', mode),
                  (model) => onSelectSpectatorModel('player1', model),
                  spectatorModels.player1,
                  (choice) => handleSpectatorFreeChoice('player1', choice),
                  t.start.player1
                )}
              </div>
              <div className={styles.vsLabel}>vs</div>
              <div className={styles.spectatorPlayer}>
                {renderOpponentSelector(
                  spectatorAIs.player2,
                  (cat) => handleSpectatorCategoryChange('player2', cat),
                  (type) => handleSpectatorCPUTypeChange('player2', type),
                  (provider) => handleSpectatorAIProviderChange('player2', provider),
                  (mode) => handleSpectatorModeChange('player2', mode),
                  (model) => onSelectSpectatorModel('player2', model),
                  spectatorModels.player2,
                  (choice) => handleSpectatorFreeChoice('player2', choice),
                  t.start.player2
                )}
              </div>
            </div>
            {!aiAvailable && onOpenSettings && (
              <div className={styles.aiHint}>
                <span>{t.start.wantWatchAI}</span>
                <a onClick={onOpenSettings}>{t.start.addKeysSettings}</a>
              </div>
            )}
          </>
        )}

        {ITCH_MODE && gameMode === 'multiplayer' ? (
          <div className={styles.itchModeNotice}>
            <p>{t.start.itchNoMultiplayer}</p>
            <p>{t.start.itchPlayMain}</p>
            <a
              href={MAIN_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.itchModeLink}
            >
              {MAIN_SITE_URL}
            </a>
          </div>
        ) : (
          <button
            className={styles.startButton}
            onClick={handleStartGame}
            disabled={(() => {
              if (gameMode !== 'play' || !isGeminiFreeAIType(selectedAI)) return false;
              const info = getGeminiFreeRateLimitInfo();
              return info !== null && (info.gamesUsed >= info.gamesLimit || info.globalExhausted);
            })()}
          >
            {gameMode === 'play'
              ? t.start.startGame
              : gameMode === 'watch'
                ? t.start.startWatching
                : t.start.findOpponent}
          </button>
        )}

        <div className={styles.rulesHint}>
          <h3>{t.start.quickRules}</h3>
          <ul>
            <li>{t.start.scopaRule1}</li>
            <li>{t.start.scopaRule2}</li>
            <li>{t.start.scopaRule3}</li>
            <li>{t.start.firstToPoints(selectedScore)}</li>
          </ul>
          {onOpenRules && (
            <a className={styles.fullRulesLink} onClick={onOpenRules}>
              {t.start.viewFullRules}
            </a>
          )}
        </div>

        <AppStoreBadge />

        <footer className={styles.footer}>
          © 2026 VV Labs | <a href="https://github.com/vlvovch/scopa-ai" target="_blank" rel="noopener noreferrer">GitHub</a>. <span title={__APP_BUILD_INFO__} style={{ opacity: 0.55, fontSize: '0.75em', whiteSpace: 'nowrap' }}>· v{__APP_VERSION__}</span>
          <AppStoreCredit />
        </footer>
      </div>
      <AIConsentModal
        isOpen={consentRequest !== null}
        destinations={consentRequest ?? []}
        onAllow={handleConsentAllow}
        onDecline={handleConsentDecline}
      />
    </div>
  );
}
