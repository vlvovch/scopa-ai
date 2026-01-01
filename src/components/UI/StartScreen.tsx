// Step 8.6: StartScreen Component

import { useState, useMemo, useEffect } from 'react';
import { AI_INFO, isGeminiAvailable, isOpenAIAvailable, fetchGeminiModels, fetchOpenAIModels, isGeminiAIType, isOpenAIAIType, type ExtendedAIType, type GeminiModelInfo, type OpenAIModelInfo } from '../../ai';
import type { GameMode } from '../../game/types';
import styles from './StartScreen.module.css';

type GameModeOption = 'play' | 'watch';
type OpponentCategory = 'cpu' | 'ai';
type CPUType = 'random' | 'heuristic';
// AI provider now includes gemini-singleturn as a separate option
type AIProvider = 'gemini' | 'gemini-singleturn' | 'openai';

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
  spectatorModels: { player1: string; player2: string };
  onSelectSpectatorModel: (player: 'player1' | 'player2', model: string) => void;
  defaultTargetScore: number;
}

const PRESET_SCORES = [11, 16, 21] as const;

// Helper to determine opponent category from AI type
function getOpponentCategory(aiType: ExtendedAIType): OpponentCategory {
  return (aiType === 'random' || aiType === 'heuristic') ? 'cpu' : 'ai';
}

// Helper to get CPU type from AI type
function getCPUType(aiType: ExtendedAIType): CPUType {
  return aiType === 'random' ? 'random' : 'heuristic';
}

// Helper to get AI provider from AI type
function getAIProvider(aiType: ExtendedAIType): AIProvider {
  if (isOpenAIAIType(aiType)) return 'openai';
  if (aiType === 'gemini-singleturn') return 'gemini-singleturn';
  return 'gemini';
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
  spectatorModels,
  onSelectSpectatorModel,
  defaultTargetScore,
}: StartScreenProps) {
  const [selectedScore, setSelectedScore] = useState<number>(defaultTargetScore);
  const [gameMode, setGameMode] = useState<GameModeOption>('play');
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>([]);
  const [openaiModels, setOpenAIModels] = useState<OpenAIModelInfo[]>([]);
  const [loadingGeminiModels, setLoadingGeminiModels] = useState(false);
  const [loadingOpenAIModels, setLoadingOpenAIModels] = useState(false);

  // Check API availability
  const geminiAvailable = useMemo(() => isGeminiAvailable(), []);
  const openaiAvailable = useMemo(() => isOpenAIAvailable(), []);
  const aiAvailable = geminiAvailable || openaiAvailable;

  // Default AI provider based on availability
  const defaultAIProvider: AIProvider = geminiAvailable ? 'gemini' : 'openai';

  // Check if any selected AI needs model fetching
  const needsGeminiModels = isGeminiAIType(selectedAI) ||
    isGeminiAIType(spectatorAIs.player1) ||
    isGeminiAIType(spectatorAIs.player2);

  const needsOpenAIModels = isOpenAIAIType(selectedAI) ||
    isOpenAIAIType(spectatorAIs.player1) ||
    isOpenAIAIType(spectatorAIs.player2);

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
    // Provider maps directly to ExtendedAIType for AI providers
    onSelectAI(provider as ExtendedAIType);
  };

  // Spectator mode handlers
  const handleSpectatorCategoryChange = (player: 'player1' | 'player2', category: OpponentCategory) => {
    if (category === 'cpu') {
      onSelectSpectatorAI(player, 'heuristic');
    } else {
      onSelectSpectatorAI(player, defaultAIProvider);
    }
  };

  const handleSpectatorCPUTypeChange = (player: 'player1' | 'player2', type: CPUType) => {
    onSelectSpectatorAI(player, type);
  };

  const handleSpectatorAIProviderChange = (player: 'player1' | 'player2', provider: AIProvider) => {
    onSelectSpectatorAI(player, provider as ExtendedAIType);
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
    onModelChange: (model: string) => void,
    currentModel: string,
    label: string
  ) => {
    const cat = getOpponentCategory(currentAI);
    const cpu = getCPUType(currentAI);
    const provider = getAIProvider(currentAI);
    const isGemini = isGeminiAIType(currentAI);
    const isOpenAI = isOpenAIAIType(currentAI);

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
            </select>
          ) : (
            <select
              className={styles.dropdown}
              value={provider}
              onChange={(e) => onAIProviderChange(e.target.value as AIProvider)}
            >
              {geminiAvailable && <option value="gemini">{AI_INFO.gemini.icon} Gemini 💬</option>}
              {geminiAvailable && <option value="gemini-singleturn">{AI_INFO['gemini-singleturn'].icon} Gemini 1️⃣</option>}
              {openaiAvailable && <option value="openai">{AI_INFO.openai.icon} OpenAI 💬</option>}
            </select>
          )}

          {/* Model dropdown (only for AI) */}
          {cat === 'ai' && (
            isGemini ? (
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
            ) : null
          )}
        </div>
        <p className={styles.aiDescription}>{AI_INFO[currentAI].description}</p>
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
              value={selectedScore}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) {
                  setSelectedScore(val);
                }
              }}
              title="Custom target score"
            />
          </div>
        </div>

        {gameMode === 'play' ? (
          renderOpponentSelector(
            selectedAI,
            handleCategoryChange,
            handleCPUTypeChange,
            handleAIProviderChange,
            isGeminiAIType(selectedAI) ? onSelectGeminiModel : onSelectOpenAIModel,
            isGeminiAIType(selectedAI) ? geminiModel : openaiModel,
            'Opponent'
          )
        ) : (
          <div className={styles.spectatorSetup}>
            <div className={styles.spectatorPlayer}>
              {renderOpponentSelector(
                spectatorAIs.player1,
                (cat) => handleSpectatorCategoryChange('player1', cat),
                (type) => handleSpectatorCPUTypeChange('player1', type),
                (provider) => handleSpectatorAIProviderChange('player1', provider),
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
                (model) => onSelectSpectatorModel('player2', model),
                spectatorModels.player2,
                'Player 2'
              )}
            </div>
          </div>
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
        </div>
      </div>
    </div>
  );
}
