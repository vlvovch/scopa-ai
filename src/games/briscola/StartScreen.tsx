// Briscola start screen.
//
// Mirrors Scopa's StartScreen layout (same CSS module → same visual look)
// but with Briscola-specific content. The "Target Score" selector is
// replaced by "Best Of" with presets 1 / 2 / 3 + a custom field.
//
// Currently supports only Play mode (no Watch / Multiplayer yet) and the
// two CPU bots (Random, Heuristic). Both lists can grow later without
// changing the surrounding markup.

import { useState } from 'react';
import styles from '../../components/UI/StartScreen.module.css';

export type CpuBotName = 'random' | 'heuristic';

const BOT_INFO: Record<CpuBotName, { icon: string; name: string; description: string }> = {
  random: {
    icon: '🎲',
    name: 'Random',
    description: 'Picks any card from hand at random — useful for warm-ups.',
  },
  heuristic: {
    icon: '🦊',
    name: 'Heuristic',
    description: 'Greedy single-ply strategy: leads low scartine, captures valuable leads with cheap trumps.',
  },
};

const PRESET_BEST_OF = [1, 2, 3] as const;

interface StartScreenProps {
  cpuBotName: CpuBotName;
  onSetCpuBotName: (name: CpuBotName) => void;
  defaultBestOf: number;
  onStartGame: (bestOf: number) => void;
}

export function StartScreen({
  cpuBotName,
  onSetCpuBotName,
  defaultBestOf,
  onStartGame,
}: StartScreenProps) {
  const [bestOf, setBestOf] = useState<number>(defaultBestOf);
  const isPreset = (PRESET_BEST_OF as readonly number[]).includes(bestOf);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Briscola</h1>
        <p className={styles.subtitle}>The Classic Italian Trick-Taking Card Game</p>

        <div className={styles.scoreSelection}>
          <label className={styles.label}>Best Of</label>
          <div className={styles.scoreOptions}>
            {PRESET_BEST_OF.map((n) => (
              <button
                key={n}
                className={`${styles.scoreOption} ${bestOf === n ? styles.selected : ''}`}
                onClick={() => setBestOf(n)}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min="1"
              max="99"
              className={`${styles.customScoreInput} ${!isPreset ? styles.selected : ''}`}
              value={!isPreset ? bestOf : ''}
              placeholder="..."
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) setBestOf(val);
              }}
              title="Enter a custom number of games"
            />
          </div>
          <p className={styles.aiDescription}>
            {bestOf === 1
              ? 'Single round — whoever has more points (out of 120) wins.'
              : `First to ${Math.floor(bestOf / 2) + 1} round wins takes the match.`}
          </p>
        </div>

        <div className={styles.opponentSelector}>
          <label className={styles.label}>Opponent</label>
          <div className={styles.dropdownRow}>
            <select
              className={styles.dropdown}
              value={cpuBotName}
              onChange={(e) => onSetCpuBotName(e.target.value as CpuBotName)}
            >
              {(Object.keys(BOT_INFO) as CpuBotName[]).map((name) => (
                <option key={name} value={name}>
                  {BOT_INFO[name].icon} {BOT_INFO[name].name}
                </option>
              ))}
            </select>
          </div>
          <p className={styles.aiDescription}>{BOT_INFO[cpuBotName].description}</p>
        </div>

        <button
          className={styles.startButton}
          onClick={() => onStartGame(bestOf)}
        >
          Start Game
        </button>

        <div className={styles.rulesHint}>
          <h3>Quick Rules</h3>
          <ul>
            <li>One trump (briscola) suit set at the start; trump beats any non-trump.</li>
            <li>Within a suit: Ace, 3, K, Q, J, 7…2 (in order). Different suits & no trump: leader wins.</li>
            <li>Point values per card: Ace 11, 3 → 10, K 4, Q 3, J 2. Others = 0. 120 total.</li>
            <li>Whoever takes more than 60 points wins the round.</li>
          </ul>
        </div>

        <footer className={styles.footer}>
          © 2026 <a href="https://github.com/vlvovch" target="_blank" rel="noopener noreferrer">Volodymyr Vovchenko</a> | <a href="https://github.com/vlvovch/scopa-ai" target="_blank" rel="noopener noreferrer">GitHub</a>. Built with help from <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer">Claude Code</a>.
        </footer>
      </div>
    </div>
  );
}
