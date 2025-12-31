// Step 8.6: StartScreen Component

import { useState } from 'react';
import { AI_INFO, type AIType } from '../../ai';
import type { GameMode } from '../../game/types';
import type { DeckType } from '../../hooks/useSettings';
import styles from './StartScreen.module.css';

type GameModeOption = 'play' | 'watch';

interface StartScreenProps {
  onStartGame: (targetScore: number, gameMode: GameMode) => void;
  selectedAI: AIType;
  onSelectAI: (ai: AIType) => void;
  spectatorAIs: { player1: AIType; player2: AIType };
  onSelectSpectatorAI: (player: 'player1' | 'player2', ai: AIType) => void;
  selectedDeck: DeckType;
  onSelectDeck: (deck: DeckType) => void;
}

const SCORE_OPTIONS = [11, 16, 21] as const;
const AI_OPTIONS: AIType[] = ['random', 'heuristic'];
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
}: StartScreenProps) {
  const [selectedScore, setSelectedScore] = useState<number>(11);
  const [gameMode, setGameMode] = useState<GameModeOption>('play');

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
          <div className={styles.scoreSelection}>
            <label className={styles.label}>Opponent</label>
            <div className={styles.scoreOptions}>
              {AI_OPTIONS.map((ai) => (
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
        ) : (
          <div className={styles.spectatorSetup}>
            <div className={styles.spectatorPlayer}>
              <label className={styles.label}>Player 1</label>
              <div className={styles.scoreOptions}>
                {AI_OPTIONS.map((ai) => (
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
                {AI_OPTIONS.map((ai) => (
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
