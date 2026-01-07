// Step 8.6: StartScreen Component

import { useState, useEffect } from 'react';
import { AI_INFO, fetchGeminiModels, fetchOpenAIModels, fetchClaudeModels, isGeminiAIType, isOpenAIAIType, isClaudeAIType, type ExtendedAIType, type GeminiModelInfo, type OpenAIModelInfo, type ClaudeModelInfo } from '../../ai';
import type { GameMode } from '../../game/types';
import { CustomDropdown } from './CustomDropdown';
import { GeminiIcon } from './GeminiIcon';
import { OpenAIIcon } from './OpenAIIcon';
import { ClaudeIcon } from './ClaudeIcon';
import styles from './StartScreen.module.css';

type GameModeOption = 'play' | 'watch';
type OpponentCategory = 'cpu' | 'ai';
type CPUType = 'random' | 'heuristic' | 'expert';
// AI provider (base type without mode suffix)
type AIProvider = 'gemini' | 'openai' | 'claude';
// Conversation mode for LLM AIs
type ConversationMode = 'conversation' | 'singleturn';

interface StartScreenProps {
  onStartGame: (targetScore: number, gameMode: GameMode) => void;
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
  spectatorModels: { player1: string; player2: string };
  onSelectSpectatorModel: (player: 'player1' | 'player2', model: string) => void;
  defaultTargetScore: number;
  useThinking: boolean;
  onToggleThinking: (enabled: boolean) => void;
  onOpenSettings?: () => void;
  onOpenRules?: () => void;
  /** AI provider availability (computed from React state, not localStorage) */
  aiAvailability: {
    gemini: boolean;
    openai: boolean;
    claude: boolean;
  };
}

const PRESET_SCORES = [11, 16, 21] as const;

// Helper to determine opponent category from AI type
function getOpponentCategory(aiType: ExtendedAIType): OpponentCategory {
  return (aiType === 'random' || aiType === 'heuristic' || aiType === 'expert') ? 'cpu' : 'ai';
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
  return 'gemini';
}

// Helper to get conversation mode from AI type
function getConversationMode(aiType: ExtendedAIType): ConversationMode {
  if (aiType === 'gemini-singleturn' || aiType === 'openai-singleturn' || aiType === 'claude-singleturn') return 'singleturn';
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
  return mode === 'singleturn' ? 'gemini-singleturn' : 'gemini';
}

export function StartScreen({
  onStartGame,
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
  spectatorModels,
  onSelectSpectatorModel,
  defaultTargetScore,
  useThinking,
  onToggleThinking,
  onOpenSettings,
  onOpenRules,
  aiAvailability,
}: StartScreenProps) {
  const [selectedScore, setSelectedScore] = useState<number>(defaultTargetScore);
  const [gameMode, setGameMode] = useState<GameModeOption>('play');
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>([]);
  const [openaiModels, setOpenAIModels] = useState<OpenAIModelInfo[]>([]);
  const [claudeModels, setClaudeModels] = useState<ClaudeModelInfo[]>([]);
  const [loadingGeminiModels, setLoadingGeminiModels] = useState(false);
  const [loadingOpenAIModels, setLoadingOpenAIModels] = useState(false);
  const [loadingClaudeModels, setLoadingClaudeModels] = useState(false);

  // Use availability from props (computed from React state in App.tsx)
  const geminiAvailable = aiAvailability.gemini;
  const openaiAvailable = aiAvailability.openai;
  const claudeAvailable = aiAvailability.claude;
  const aiAvailable = geminiAvailable || openaiAvailable || claudeAvailable;

  // Default AI provider based on availability
  const defaultAIProvider: AIProvider = geminiAvailable ? 'gemini' : (openaiAvailable ? 'openai' : 'claude');

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

  // Handlers for cascading dropdowns
  const handleCategoryChange = (category: OpponentCategory) => {
    if (category === 'cpu') {
      onSelectAI('heuristic'); // Default to Furbo
    } else {
      // Default to first available AI provider
      onSelectAI(defaultAIProvider);
    }
  };

  const handleCPUTypeChange = (type: CPUType) => {
    onSelectAI(type);
  };

  const handleAIProviderChange = (provider: AIProvider) => {
    // Preserve current mode when changing provider
    const currentMode = getConversationMode(selectedAI);
    onSelectAI(getExtendedAIType(provider, currentMode));
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
    } else {
      // Use default provider with conversation mode
      const newAI = getExtendedAIType(defaultAIProvider, 'conversation');
      onSelectSpectatorAI(player, newAI);
      // Also update the model to a default for the new provider
      if (defaultAIProvider === 'openai') {
        onSelectSpectatorModel(player, openaiModel);
      } else if (defaultAIProvider === 'claude') {
        onSelectSpectatorModel(player, claudeModel);
      } else {
        onSelectSpectatorModel(player, geminiModel);
      }
    }
  };

  const handleSpectatorCPUTypeChange = (player: 'player1' | 'player2', type: CPUType) => {
    onSelectSpectatorAI(player, type);
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

  const handleStartGame = () => {
    const mode: GameMode = gameMode === 'play' ? 'pvsCPU' : 'cpuVsCPU';
    onStartGame(selectedScore, mode);
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
    label: string
  ) => {
    const cat = getOpponentCategory(currentAI);
    const cpu = getCPUType(currentAI);
    const provider = getAIProvider(currentAI);
    const convMode = getConversationMode(currentAI);
    const isGemini = isGeminiAIType(currentAI);
    const isOpenAI = isOpenAIAIType(currentAI);
    const isClaude = isClaudeAIType(currentAI);

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
            <option value="cpu">CPU</option>
            {aiAvailable && <option value="ai">AI</option>}
          </select>

          {/* CPU type or AI provider dropdown */}
          {cat === 'cpu' ? (
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
                ]}
                value={provider}
                onChange={onAIProviderChange}
                className={styles.providerDropdown}
              />

              {/* Model dropdown */}
              {isGemini ? (
                loadingGeminiModels ? (
                  <select className={styles.dropdown} disabled>
                    <option>Loading...</option>
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
                    <option>Loading...</option>
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
                    <option>Loading...</option>
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
              ) : null}

              {/* Mode and thinking toggles */}
              <div className={styles.toggleGroup}>
                <button
                  className={styles.modeToggle}
                  onClick={() => onModeChange(convMode === 'conversation' ? 'singleturn' : 'conversation')}
                  title={convMode === 'conversation'
                    ? 'Multi-turn chat (click for single-turn)'
                    : 'Single-turn requests (click for multi-turn)'}
                >
                  {convMode === 'conversation' ? '💬' : '1️⃣'}
                </button>

                {(isGemini || isClaude) && (
                  <button
                    className={`${styles.thinkingToggle} ${useThinking ? styles.thinkingEnabled : ''}`}
                    onClick={() => onToggleThinking(!useThinking)}
                    title={useThinking ? 'Extended thinking enabled (click to disable)' : 'Extended thinking disabled (click to enable)'}
                  >
                    {useThinking ? '🧠' : '⚡'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {/* Description with thinking status */}
        <p className={styles.aiDescription}>
          {AI_INFO[currentAI].description}
          {cat === 'ai' && (isGemini || isClaude) && (
            useThinking ? ' + extended thinking' : ' (fast mode)'
          )}
        </p>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Scopa</h1>
        <p className={styles.subtitle}>The Classic Italian Card Game</p>

        <div className={styles.scoreSelection}>
          <label className={styles.label}>Game Mode</label>
          <div className={styles.scoreOptions}>
            <button
              className={`${styles.scoreOption} ${styles.modeOption} ${gameMode === 'play' ? styles.selected : ''}`}
              onClick={() => setGameMode('play')}
            >
              Play
            </button>
            <button
              className={`${styles.scoreOption} ${styles.modeOption} ${gameMode === 'watch' ? styles.selected : ''}`}
              onClick={() => setGameMode('watch')}
            >
              Watch
            </button>
          </div>
          <p className={styles.aiDescription}>
            {gameMode === 'play' ? 'Play against the CPU' : 'Watch two CPUs play against each other'}
          </p>
        </div>

        <div className={styles.scoreSelection}>
          <label className={styles.label}>Target Score</label>
          <div className={styles.scoreOptions}>
            {PRESET_SCORES.map((score) => (
              <button
                key={score}
                className={`${styles.scoreOption} ${selectedScore === score ? styles.selected : ''}`}
                onClick={() => setSelectedScore(score)}
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
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) {
                  setSelectedScore(val);
                }
              }}
              title="Enter custom target score"
            />
          </div>
        </div>

        {gameMode === 'play' ? (
          <>
            {renderOpponentSelector(
              selectedAI,
              handleCategoryChange,
              handleCPUTypeChange,
              handleAIProviderChange,
              handleConversationModeChange,
              isGeminiAIType(selectedAI) ? onSelectGeminiModel : (isOpenAIAIType(selectedAI) ? onSelectOpenAIModel : onSelectClaudeModel),
              isGeminiAIType(selectedAI) ? geminiModel : (isOpenAIAIType(selectedAI) ? openaiModel : claudeModel),
              'Opponent'
            )}
            {!aiAvailable && onOpenSettings && (
              <div className={styles.aiHint}>
                <span>Want to play against AI?</span>
                <a onClick={onOpenSettings}>Add API keys in Settings</a>
              </div>
            )}
          </>
        ) : (
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
                  'Player 1'
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
                  'Player 2'
                )}
              </div>
            </div>
            {!aiAvailable && onOpenSettings && (
              <div className={styles.aiHint}>
                <span>Want to watch AI play?</span>
                <a onClick={onOpenSettings}>Add API keys in Settings</a>
              </div>
            )}
          </>
        )}

        <button
          className={styles.startButton}
          onClick={handleStartGame}
        >
          {gameMode === 'play' ? 'Start Game' : 'Start Watching'}
        </button>

        <div className={styles.rulesHint}>
          <h3>Quick Rules</h3>
          <ul>
            <li>Capture cards that match your card's value</li>
            <li>Or capture multiple cards that sum to your value</li>
            <li>Clearing the table scores a Scopa</li>
            <li>First to {selectedScore} points wins!</li>
          </ul>
          {onOpenRules && (
            <a className={styles.fullRulesLink} onClick={onOpenRules}>
              View Full Rules
            </a>
          )}
        </div>

        <footer className={styles.footer}>
          © 2026 <a href="https://github.com/vlvovch" target="_blank" rel="noopener noreferrer">Volodymyr Vovchenko</a>. Built with help from <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer">Claude Code</a>
        </footer>
      </div>
    </div>
  );
}
