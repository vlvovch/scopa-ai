// Step 8.6: StartScreen Component

import { useState } from 'react';
import { AI_INFO, type AIType } from '../../ai';
import styles from './StartScreen.module.css';

interface StartScreenProps {
  onStartGame: (targetScore: number) => void;
  selectedAI: AIType;
  onSelectAI: (ai: AIType) => void;
}

const SCORE_OPTIONS = [11, 16, 21] as const;
const AI_OPTIONS: AIType[] = ['random', 'heuristic'];

export function StartScreen({ onStartGame, selectedAI, onSelectAI }: StartScreenProps) {
  const [selectedScore, setSelectedScore] = useState<number>(11);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Scopa</h1>
        <p className={styles.subtitle}>The Classic Italian Card Game</p>

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

        <button
          className={styles.startButton}
          onClick={() => onStartGame(selectedScore)}
        >
          Start Game
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
