// Briscola start screen.
//
// Mirrors Scopa's StartScreen layout: title, Game Mode (Play / Watch),
// First To (wins needed), opponent selector(s), Start, Quick Rules.
// Multiplayer isn't included yet — no Briscola server exists. Watch mode
// pits two CPU bots against each other.

import { useEffect, useState } from 'react';
import styles from '../../components/UI/StartScreen.module.css';
import { isGeminiFreeAvailable } from './ai/gemini-free';

/** Sync CPU bots — usable on either seat in Watch mode. */
export type CpuBotName = 'random' | 'heuristic' | 'expert';

/** Anything that can be the *Play-mode* opponent — CPU or an async LLM. */
export type BriscolaOpponentName = CpuBotName | 'gemini-free';

export type BriscolaGameMode = 'play' | 'watch';

const BOT_INFO: Record<BriscolaOpponentName, { icon: string; name: string; description: string }> = {
  random: {
    icon: '🐒',
    name: 'Scimmietta',
    description: 'Picks any card from hand at random — useful for warm-ups.',
  },
  heuristic: {
    icon: '🦊',
    name: 'Furbo',
    description: 'Greedy single-ply strategy: leads low scartine, captures valuable leads with cheap trumps.',
  },
  expert: {
    icon: '🐍',
    name: 'Esperto',
    description: 'Determinization + minimax — samples opponent hands and looks ahead a couple of tricks.',
  },
  'gemini-free': {
    icon: '✦',
    name: 'Gemini 3 Flash (Free)',
    description: 'Google Gemini via free proxy with thinking. Limited to 3 games/day per user.',
  },
};

const PRESET_BEST_OF = [1, 2, 3] as const;

interface StartScreenProps {
  opponentName: BriscolaOpponentName;
  onSetOpponentName: (name: BriscolaOpponentName) => void;
  watchBots: { player1: CpuBotName; player2: CpuBotName };
  onSetWatchBot: (player: 'player1' | 'player2', name: CpuBotName) => void;
  defaultBestOf: number;
  onStartGame: (bestOf: number, gameMode: BriscolaGameMode) => void;
}

const CPU_BOT_NAMES: CpuBotName[] = ['random', 'heuristic', 'expert'];

export function StartScreen({
  opponentName,
  onSetOpponentName,
  watchBots,
  onSetWatchBot,
  defaultBestOf,
  onStartGame,
}: StartScreenProps) {
  const [bestOf, setBestOf] = useState<number>(defaultBestOf);
  const [gameMode, setGameMode] = useState<BriscolaGameMode>('play');
  const isPreset = (PRESET_BEST_OF as readonly number[]).includes(bestOf);

  // Keep the local pick in sync when the Settings default changes (e.g. the
  // user adjusts "Default First To" while the start screen is mounted).
  useEffect(() => {
    setBestOf(defaultBestOf);
  }, [defaultBestOf]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Briscola</h1>
        <p className={styles.subtitle}>The Classic Italian Trick-Taking Card Game</p>

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
            {gameMode === 'play'
              ? 'Play against the CPU.'
              : 'Watch two CPUs play against each other.'}
          </p>
        </div>

        <div className={styles.scoreSelection}>
          <label className={styles.label}>First To</label>
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
              title="Enter a custom number of round wins to take the match"
            />
          </div>
          <p className={styles.aiDescription}>
            {bestOf === 1
              ? 'Single round — whoever has more points (out of 120) wins.'
              : `First to ${bestOf} round wins takes the match.`}
          </p>
        </div>

        {gameMode === 'play' ? (
          <div className={styles.opponentSelector}>
            <label className={styles.label}>Opponent</label>
            <div className={styles.dropdownRow}>
              <select
                className={styles.dropdown}
                value={opponentName}
                onChange={(e) => onSetOpponentName(e.target.value as BriscolaOpponentName)}
              >
                {CPU_BOT_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {BOT_INFO[name].icon} {BOT_INFO[name].name}
                  </option>
                ))}
                {isGeminiFreeAvailable() && (
                  <option value="gemini-free">
                    {BOT_INFO['gemini-free'].icon} {BOT_INFO['gemini-free'].name}
                  </option>
                )}
              </select>
            </div>
            <p className={styles.aiDescription}>{BOT_INFO[opponentName].description}</p>
          </div>
        ) : (
          <div className={styles.opponentSelector}>
            <label className={styles.label}>Player 1</label>
            <div className={styles.dropdownRow}>
              <select
                className={styles.dropdown}
                value={watchBots.player1}
                onChange={(e) => onSetWatchBot('player1', e.target.value as CpuBotName)}
              >
                {CPU_BOT_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {BOT_INFO[name].icon} {BOT_INFO[name].name}
                  </option>
                ))}
              </select>
            </div>
            <label className={styles.label} style={{ marginTop: '0.75rem' }}>Player 2</label>
            <div className={styles.dropdownRow}>
              <select
                className={styles.dropdown}
                value={watchBots.player2}
                onChange={(e) => onSetWatchBot('player2', e.target.value as CpuBotName)}
              >
                {CPU_BOT_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {BOT_INFO[name].icon} {BOT_INFO[name].name}
                  </option>
                ))}
              </select>
            </div>
            <p className={styles.aiDescription}>
              {BOT_INFO[watchBots.player1].name} vs {BOT_INFO[watchBots.player2].name}.
              Watch mode games aren't tracked in stats.
            </p>
          </div>
        )}

        <button
          className={styles.startButton}
          onClick={() => onStartGame(bestOf, gameMode)}
        >
          {gameMode === 'watch' ? 'Start Watching' : 'Start Game'}
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
