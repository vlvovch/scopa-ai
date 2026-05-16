// Briscola start screen.
//
// Mirrors Scopa's StartScreen layout: title, Game Mode (Play / Watch),
// First To, cascading opponent selector (Category → CPU type / AI provider
// → Model → Thinking toggle), Start, Quick Rules. Multiplayer isn't
// included yet — no Briscola server.

import { useEffect, useState } from 'react';
import styles from '../../components/UI/StartScreen.module.css';
import { CustomDropdown } from '../../components/UI/CustomDropdown';
import { GeminiIcon } from '../../components/UI/GeminiIcon';
import { OpenAIIcon } from '../../components/UI/OpenAIIcon';
import { ClaudeIcon } from '../../components/UI/ClaudeIcon';
import { isGeminiFreeAvailable, getGeminiFreeRateLimitInfo } from './ai/gemini-free';
import {
  isGeminiAvailable,
  fetchGeminiModels,
  getCachedGeminiModels,
  type GeminiModelInfo,
} from './ai/gemini';
import {
  isOpenAIAvailable,
  fetchOpenAIModels,
  getCachedOpenAIModels,
  type OpenAIModelInfo,
} from './ai/openai';
import {
  isClaudeAvailable,
  fetchClaudeModels,
  getCachedClaudeModels,
  type ClaudeModelInfo,
} from './ai/claude';

/** Sync CPU bots — usable on either seat in Watch mode. */
export type CpuBotName = 'random' | 'heuristic' | 'expert';

/** Anything that can be the *Play-mode* opponent — CPU or an async LLM. */
export type BriscolaOpponentName =
  | CpuBotName
  | 'gemini-free'
  | 'gemini'
  | 'openai'
  | 'claude';

export type BriscolaGameMode = 'play' | 'watch' | 'multiplayer';

type OpponentCategory = 'cpu' | 'free-ai' | 'ai';
type AIProvider = 'gemini' | 'openai' | 'claude';

const PRESET_BEST_OF = [1, 2, 3] as const;

const CPU_INFO: Record<CpuBotName, { icon: string; name: string; description: string }> = {
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
};

const PROVIDER_INFO: Record<AIProvider, { icon: string; label: string }> = {
  gemini: { icon: '✦', label: 'Gemini' },
  openai: { icon: '⬡', label: 'GPT' },
  claude: { icon: '🔮', label: 'Claude' },
};

function getOpponentCategory(name: BriscolaOpponentName): OpponentCategory {
  if (name === 'random' || name === 'heuristic' || name === 'expert') return 'cpu';
  if (name === 'gemini-free') return 'free-ai';
  return 'ai';
}

function getCPUType(name: BriscolaOpponentName): CpuBotName {
  if (name === 'random') return 'random';
  if (name === 'expert') return 'expert';
  return 'heuristic';
}

function getAIProvider(name: BriscolaOpponentName): AIProvider {
  if (name === 'openai') return 'openai';
  if (name === 'claude') return 'claude';
  return 'gemini';
}

function getOpponentDescription(name: BriscolaOpponentName): string {
  if (name === 'random' || name === 'heuristic' || name === 'expert') {
    return CPU_INFO[name].description;
  }
  if (name === 'gemini-free') {
    return 'Google Gemini via free proxy with thinking. Limited daily quota.';
  }
  return `${PROVIDER_INFO[getAIProvider(name)].label} using your own API key.`;
}

interface StartScreenProps {
  opponentName: BriscolaOpponentName;
  onSetOpponentName: (name: BriscolaOpponentName) => void;
  geminiModel: string;
  onSetGeminiModel: (modelId: string) => void;
  openaiModel: string;
  onSetOpenAIModel: (modelId: string) => void;
  claudeModel: string;
  onSetClaudeModel: (modelId: string) => void;
  useThinking: boolean;
  onToggleThinking: (enabled: boolean) => void;
  /** Multi-turn = SDK manages chat history. Single-turn = full round
   *  history embedded in each request. Same toggle UX as Scopa. */
  conversationMode: 'multiturn' | 'singleturn';
  onToggleConversationMode: (mode: 'multiturn' | 'singleturn') => void;
  /** Watch-mode seats — both accept any opponent (CPU or LLM). */
  watchOpponents: { player1: BriscolaOpponentName; player2: BriscolaOpponentName };
  onSetWatchOpponent: (player: 'player1' | 'player2', name: BriscolaOpponentName) => void;
  defaultBestOf: number;
  onStartGame: (bestOf: number, gameMode: BriscolaGameMode) => void;
  onStartMultiplayer: () => void;
}

export function StartScreen({
  opponentName,
  onSetOpponentName,
  geminiModel,
  onSetGeminiModel,
  openaiModel,
  onSetOpenAIModel,
  claudeModel,
  onSetClaudeModel,
  useThinking,
  onToggleThinking,
  conversationMode,
  onToggleConversationMode,
  watchOpponents,
  onSetWatchOpponent,
  defaultBestOf,
  onStartGame,
  onStartMultiplayer,
}: StartScreenProps) {
  const [bestOf, setBestOf] = useState<number>(defaultBestOf);
  const [gameMode, setGameMode] = useState<BriscolaGameMode>('play');
  const isPreset = (PRESET_BEST_OF as readonly number[]).includes(bestOf);

  useEffect(() => {
    setBestOf(defaultBestOf);
  }, [defaultBestOf]);

  // Provider availability (computed once per render; cheap).
  const geminiFreeOk = isGeminiFreeAvailable();
  const geminiOk = isGeminiAvailable();
  const openaiOk = isOpenAIAvailable();
  const claudeOk = isClaudeAvailable();
  const anyAIOk = geminiOk || openaiOk || claudeOk;

  // Default provider for the AI category (first one with a valid key).
  const defaultProvider: AIProvider = geminiOk
    ? 'gemini'
    : openaiOk
      ? 'openai'
      : claudeOk
        ? 'claude'
        : 'gemini';

  // Lazily fetched model lists per provider.
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>(() =>
    getCachedGeminiModels()
  );
  const [openaiModels, setOpenAIModels] = useState<OpenAIModelInfo[]>(() =>
    getCachedOpenAIModels()
  );
  const [claudeModels, setClaudeModels] = useState<ClaudeModelInfo[]>(() =>
    getCachedClaudeModels()
  );

  // Trigger fetches when an AI option is anywhere on the screen.
  const needGemini =
    opponentName === 'gemini' ||
    watchOpponents.player1 === 'gemini' ||
    watchOpponents.player2 === 'gemini';
  const needOpenAI =
    opponentName === 'openai' ||
    watchOpponents.player1 === 'openai' ||
    watchOpponents.player2 === 'openai';
  const needClaude =
    opponentName === 'claude' ||
    watchOpponents.player1 === 'claude' ||
    watchOpponents.player2 === 'claude';

  useEffect(() => {
    let cancelled = false;
    if (needGemini && geminiOk && geminiModels.length === 0) {
      fetchGeminiModels().then((m) => !cancelled && setGeminiModels(m));
    }
    if (needOpenAI && openaiOk && openaiModels.length === 0) {
      fetchOpenAIModels().then((m) => !cancelled && setOpenAIModels(m));
    }
    if (needClaude && claudeOk && claudeModels.length === 0) {
      fetchClaudeModels().then((m) => !cancelled && setClaudeModels(m));
    }
    return () => {
      cancelled = true;
    };
  }, [needGemini, needOpenAI, needClaude, geminiOk, openaiOk, claudeOk, geminiModels.length, openaiModels.length, claudeModels.length]);

  // -------- selector helpers ---------------------------------------------

  /** Convert a category choice into a concrete opponent name. */
  const opponentForCategory = (cat: OpponentCategory): BriscolaOpponentName => {
    if (cat === 'cpu') return 'heuristic';
    if (cat === 'free-ai') return 'gemini-free';
    return defaultProvider;
  };

  /** Render the cascading opponent selector (category → sub-pickers). */
  const renderOpponentSelector = (
    current: BriscolaOpponentName,
    onChange: (next: BriscolaOpponentName) => void,
    onModelChange: ((modelId: string) => void) | null,
    label: string
  ) => {
    const cat = getOpponentCategory(current);
    const provider = getAIProvider(current);

    const handleCategoryChange = (c: OpponentCategory) => {
      onChange(opponentForCategory(c));
    };

    const modelDropdownFor = (p: AIProvider) => {
      const onChangeModel = onModelChange ?? (() => undefined);
      if (p === 'gemini') {
        return (
          <select
            className={styles.dropdown}
            value={geminiModel}
            onChange={(e) => onChangeModel(e.target.value)}
            disabled={!onModelChange}
          >
            {(geminiModels.length > 0
              ? geminiModels
              : [{ id: geminiModel, displayName: geminiModel }]
            ).map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        );
      }
      if (p === 'openai') {
        return (
          <select
            className={styles.dropdown}
            value={openaiModel}
            onChange={(e) => onChangeModel(e.target.value)}
            disabled={!onModelChange}
          >
            {(openaiModels.length > 0
              ? openaiModels
              : [{ id: openaiModel, displayName: openaiModel }]
            ).map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        );
      }
      return (
        <select
          className={styles.dropdown}
          value={claudeModel}
          onChange={(e) => onChangeModel(e.target.value)}
          disabled={!onModelChange}
        >
          {(claudeModels.length > 0
            ? claudeModels
            : [{ id: claudeModel, displayName: claudeModel }]
          ).map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      );
    };

    return (
      <div className={styles.opponentSelector}>
        <label className={styles.label}>{label}</label>
        <div className={styles.dropdownRow}>
          {/* Category */}
          <select
            className={styles.dropdown}
            value={cat}
            onChange={(e) => handleCategoryChange(e.target.value as OpponentCategory)}
          >
            <option value="cpu">CPU</option>
            {geminiFreeOk && <option value="free-ai">Free AI</option>}
            {anyAIOk && <option value="ai">AI (BYOK)</option>}
          </select>

          {cat === 'cpu' ? (
            <select
              className={styles.dropdown}
              value={getCPUType(current)}
              onChange={(e) => onChange(e.target.value as CpuBotName)}
            >
              {(Object.keys(CPU_INFO) as CpuBotName[]).map((k) => (
                <option key={k} value={k}>
                  {CPU_INFO[k].icon} {CPU_INFO[k].name}
                </option>
              ))}
            </select>
          ) : cat === 'free-ai' ? (
            <span className={styles.freeAILabel}>✦ Gemini 3 Flash Preview</span>
          ) : (
            <>
              {/* AI provider — uses Scopa's CustomDropdown so the SVG brand
                  icons render inside the open list (native <select> can't
                  show ReactNode options). */}
              <CustomDropdown<AIProvider>
                options={[
                  ...(geminiOk
                    ? [{ value: 'gemini' as const, label: 'Gemini', icon: <GeminiIcon size="1.1em" /> }]
                    : []),
                  ...(openaiOk
                    ? [{ value: 'openai' as const, label: 'OpenAI', icon: <OpenAIIcon size="1.1em" /> }]
                    : []),
                  ...(claudeOk
                    ? [{ value: 'claude' as const, label: 'Claude', icon: <ClaudeIcon size="1.1em" /> }]
                    : []),
                ]}
                value={provider}
                onChange={(p) => onChange(p)}
              />

              {/* Model picker for the chosen provider */}
              {modelDropdownFor(provider)}

              {/* Conversation-mode toggle: multi-turn chat (💬) vs single-
                  turn requests (1️⃣ — full round history in every prompt). */}
              <button
                className={styles.modeToggle}
                onClick={() =>
                  onToggleConversationMode(
                    conversationMode === 'multiturn' ? 'singleturn' : 'multiturn'
                  )
                }
                title={
                  conversationMode === 'multiturn'
                    ? 'Multi-turn chat (click for single-turn)'
                    : 'Single-turn requests (click for multi-turn)'
                }
              >
                {conversationMode === 'multiturn' ? '💬' : '1️⃣'}
              </button>

              {/* Thinking toggle (Gemini + Claude only). Single global flag —
                  matches Scopa. OpenAI uses its own server-side reasoning, no
                  client-side toggle. */}
              {(provider === 'gemini' || provider === 'claude') && (
                <button
                  className={`${styles.thinkingToggle} ${useThinking ? styles.thinkingEnabled : ''}`}
                  onClick={() => onToggleThinking(!useThinking)}
                  title={
                    useThinking
                      ? 'Extended thinking enabled (click to disable)'
                      : 'Extended thinking disabled (click to enable)'
                  }
                >
                  {useThinking ? '🧠' : '⚡'}
                </button>
              )}
            </>
          )}
        </div>
        <p className={styles.aiDescription}>
          {getOpponentDescription(current)}
          {cat === 'ai' &&
            (provider === 'gemini' || provider === 'claude') &&
            (useThinking ? ' + extended thinking' : ' (fast mode)')}
        </p>
        {cat === 'free-ai' && (() => {
          const info = getGeminiFreeRateLimitInfo();
          const remaining = info
            ? Math.max(0, info.gamesLimit - info.gamesUsed)
            : null;
          const exhausted = remaining === 0;
          return (
            <>
              <p
                className={styles.aiDescription}
                style={{ opacity: 0.7, fontSize: '0.85em' }}
              >
                No API key needed. Multi-turn + thinking.
                {remaining !== null
                  ? ` ${remaining}/${info!.gamesLimit} games remaining today.`
                  : ' Limited to 3 games/day.'}
              </p>
              {exhausted && (
                <p
                  className={styles.aiDescription}
                  style={{ color: '#e57373', fontSize: '0.85em' }}
                >
                  Daily limit reached. Add your own API key in Settings for
                  unlimited games.
                </p>
              )}
            </>
          );
        })()}
      </div>
    );
  };

  // -------- render -------------------------------------------------------

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
            <button
              className={`${styles.scoreOption} ${styles.modeOption} ${gameMode === 'multiplayer' ? styles.selected : ''}`}
              onClick={() => setGameMode('multiplayer')}
            >
              Multiplayer
            </button>
          </div>
          <p className={styles.aiDescription}>
            {gameMode === 'play'
              ? 'Play against the CPU or an AI.'
              : gameMode === 'watch'
                ? 'Watch two opponents play against each other.'
                : 'Play against a friend online.'}
          </p>
        </div>

        {gameMode !== 'multiplayer' && (
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
        )}

        {gameMode === 'multiplayer' ? null : gameMode === 'play'
          ? renderOpponentSelector(
              opponentName,
              onSetOpponentName,
              opponentName === 'gemini'
                ? onSetGeminiModel
                : opponentName === 'openai'
                  ? onSetOpenAIModel
                  : opponentName === 'claude'
                    ? onSetClaudeModel
                    : null,
              'Opponent'
            )
          : (
              <div className={styles.spectatorSetup}>
                <div className={styles.spectatorPlayer}>
                  {renderOpponentSelector(
                    watchOpponents.player1,
                    (n) => onSetWatchOpponent('player1', n),
                    watchOpponents.player1 === 'gemini'
                      ? onSetGeminiModel
                      : watchOpponents.player1 === 'openai'
                        ? onSetOpenAIModel
                        : watchOpponents.player1 === 'claude'
                          ? onSetClaudeModel
                          : null,
                    'Player 1'
                  )}
                </div>
                <div className={styles.vsLabel}>vs</div>
                <div className={styles.spectatorPlayer}>
                  {renderOpponentSelector(
                    watchOpponents.player2,
                    (n) => onSetWatchOpponent('player2', n),
                    watchOpponents.player2 === 'gemini'
                      ? onSetGeminiModel
                      : watchOpponents.player2 === 'openai'
                        ? onSetOpenAIModel
                        : watchOpponents.player2 === 'claude'
                          ? onSetClaudeModel
                          : null,
                    'Player 2'
                  )}
                </div>
              </div>
            )
        }

        <button
          className={styles.startButton}
          onClick={() => {
            if (gameMode === 'multiplayer') {
              onStartMultiplayer();
            } else {
              onStartGame(bestOf, gameMode);
            }
          }}
        >
          {gameMode === 'multiplayer'
            ? 'Open Multiplayer Lobby'
            : gameMode === 'watch'
              ? 'Start Watching'
              : 'Start Game'}
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
