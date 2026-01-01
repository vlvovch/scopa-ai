// Step 8.6: StartScreen Component

import { useState, useMemo, useEffect } from 'react';
import { AI_INFO, getAvailableAITypes, fetchGeminiModels, isGeminiAIType, type ExtendedAIType, type GeminiModelInfo } from '../../ai';
import type { GameMode } from '../../game/types';
import type { DeckType } from '../../hooks/useSettings';
import styles from './StartScreen.module.css';

type GameModeOption = 'play' | 'watch';

interface StartScreenProps {
  onStartGame: (targetScore: number, gameMode: GameMode) => void;
  selectedAI: ExtendedAIType;
  onSelectAI: (ai: ExtendedAIType) => void;
  spectatorAIs: { player1: ExtendedAIType; player2: ExtendedAIType };
  onSelectSpectatorAI: (player: 'player1' | 'player2', ai: ExtendedAIType) => void;
  selectedDeck: DeckType;
  onSelectDeck: (deck: DeckType) => void;
  geminiModel: string;
  onSelectGeminiModel: (model: string) => void;
  spectatorModels: { player1: string; player2: string };
  onSelectSpectatorModel: (player: 'player1' | 'player2', model: string) => void;
}

const SCORE_OPTIONS = [11, 16, 21] as const;
const DECK_OPTIONS: { value: DeckType; label: string }[] = [
  { value: 'napoletane', label: 'Napoletane' },
  { value: 'siciliane', label: 'Siciliane' },
];

export function StartScreen({
  onStartGame,
  selectedAI,
  onSelectAI,
  spectatorAIs,
  onSelectSpectatorAI,
  selectedDeck,
  onSelectDeck,
  geminiModel,
  onSelectGeminiModel,
  spectatorModels,
  onSelectSpectatorModel,
}: StartScreenProps) {
  const [selectedScore, setSelectedScore] = useState<number>(11);
  const [gameMode, setGameMode] = useState<GameModeOption>('play');
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Get available AI types (includes Gemini only if API key is set)
  const aiOptions = useMemo(() => getAvailableAITypes(), []);

  // Check if any selected AI is Gemini (any variant)
  const needsGeminiModels = isGeminiAIType(selectedAI) ||
    isGeminiAIType(spectatorAIs.player1) ||
    isGeminiAIType(spectatorAIs.player2);

  // Fetch Gemini models when needed
  useEffect(() => {
    if (needsGeminiModels && geminiModels.length === 0 && !loadingModels) {
      setLoadingModels(true);
      fetchGeminiModels()
        .then((models) => {
          setGeminiModels(models);
          // If current model not in list, select first available
          if (models.length > 0 && !models.some(m => m.id === geminiModel)) {
            onSelectGeminiModel(models[0].id);
          }
        })
        .finally(() => setLoadingModels(false));
    }
  }, [needsGeminiModels, geminiModels.length, loadingModels, geminiModel, onSelectGeminiModel]);

  const handleStartGame = () => {
    const mode: GameMode = gameMode === 'play' ? 'pvsCPU' : 'cpuVsCPU';
    onStartGame(selectedScore, mode);
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
            {SCORE_OPTIONS.map((score) => (
              <button
                key={score}
                className={`${styles.scoreOption} ${selectedScore === score ? styles.selected : ''}`}
                onClick={() => setSelectedScore(score)}
              >
                {score}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.scoreSelection}>
          <label className={styles.label}>Card Deck</label>
          <div className={styles.scoreOptions}>
            {DECK_OPTIONS.map((deck) => (
              <button
                key={deck.value}
                className={`${styles.scoreOption} ${styles.deckOption} ${selectedDeck === deck.value ? styles.selected : ''}`}
                onClick={() => onSelectDeck(deck.value)}
              >
                {deck.label}
              </button>
            ))}
          </div>
        </div>

        {gameMode === 'play' ? (
          <>
            <div className={styles.scoreSelection}>
              <label className={styles.label}>Opponent</label>
              <div className={styles.scoreOptions}>
                {aiOptions.map((ai) => (
                  <button
                    key={ai}
                    className={`${styles.scoreOption} ${styles.aiOption} ${selectedAI === ai ? styles.selected : ''}`}
                    onClick={() => onSelectAI(ai)}
                    title={AI_INFO[ai].description}
                  >
                    {AI_INFO[ai].name}
                  </button>
                ))}
              </div>
              <p className={styles.aiDescription}>{AI_INFO[selectedAI].description}</p>
            </div>
            {isGeminiAIType(selectedAI) && (
              <div className={styles.scoreSelection}>
                <label className={styles.label}>Gemini Model</label>
                {loadingModels ? (
                  <p className={styles.aiDescription}>Loading models...</p>
                ) : (
                  <select
                    className={styles.modelSelect}
                    value={geminiModel}
                    onChange={(e) => onSelectGeminiModel(e.target.value)}
                  >
                    {geminiModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.displayName}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.spectatorSetup}>
              <div className={styles.spectatorPlayer}>
                <label className={styles.label}>Player 1</label>
                <div className={styles.scoreOptions}>
                  {aiOptions.map((ai) => (
                    <button
                      key={ai}
                      className={`${styles.scoreOption} ${styles.aiOption} ${spectatorAIs.player1 === ai ? styles.selected : ''}`}
                      onClick={() => onSelectSpectatorAI('player1', ai)}
                      title={AI_INFO[ai].description}
                    >
                      {AI_INFO[ai].name}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.vsLabel}>vs</div>
              <div className={styles.spectatorPlayer}>
                <label className={styles.label}>Player 2</label>
                <div className={styles.scoreOptions}>
                  {aiOptions.map((ai) => (
                    <button
                      key={ai}
                      className={`${styles.scoreOption} ${styles.aiOption} ${spectatorAIs.player2 === ai ? styles.selected : ''}`}
                      onClick={() => onSelectSpectatorAI('player2', ai)}
                      title={AI_INFO[ai].description}
                    >
                      {AI_INFO[ai].name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {isGeminiAIType(spectatorAIs.player1) && (
              <div className={styles.scoreSelection}>
                <label className={styles.label}>Player 1 Model</label>
                {loadingModels ? (
                  <p className={styles.aiDescription}>Loading models...</p>
                ) : (
                  <select
                    className={styles.modelSelect}
                    value={spectatorModels.player1}
                    onChange={(e) => onSelectSpectatorModel('player1', e.target.value)}
                  >
                    {geminiModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.displayName}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {isGeminiAIType(spectatorAIs.player2) && (
              <div className={styles.scoreSelection}>
                <label className={styles.label}>Player 2 Model</label>
                {loadingModels ? (
                  <p className={styles.aiDescription}>Loading models...</p>
                ) : (
                  <select
                    className={styles.modelSelect}
                    value={spectatorModels.player2}
                    onChange={(e) => onSelectSpectatorModel('player2', e.target.value)}
                  >
                    {geminiModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.displayName}</option>
                    ))}
                  </select>
                )}
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
        </div>
      </div>
    </div>
  );
}
