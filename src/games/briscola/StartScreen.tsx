// Briscola start screen.
//
// Mirrors Scopa's StartScreen layout: title, Game Mode (Play / Watch),
// First To, cascading opponent selector (Category → CPU type / AI provider
// → Model → Thinking toggle), Start, Quick Rules. Multiplayer isn't
// included yet — no Briscola server.

import { useEffect, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';
import type { Translation } from '../../i18n/en';
import { LanguageToggle } from '../../components/UI/LanguageToggle';
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

const ITCH_MODE = import.meta.env.VITE_ITCH_MODE === 'true';
const MAIN_SITE_URL = import.meta.env.VITE_SITE_URL || 'https://playbriscola.com';

export type BriscolaGameMode = 'play' | 'watch' | 'multiplayer';

type OpponentCategory = 'cpu' | 'free-ai' | 'ai';
type AIProvider = 'gemini' | 'openai' | 'claude';

const PRESET_BEST_OF = [1, 2, 3] as const;

const CPU_INFO: Record<CpuBotName, { icon: string; name: string }> = {
  random: { icon: '🐒', name: 'Scimmietta' },
  heuristic: { icon: '🦊', name: 'Furbo' },
  expert: { icon: '🐍', name: 'Esperto' },
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

function getOpponentDescription(name: BriscolaOpponentName, t: Translation): string {
  if (name === 'random') return t.start.briscolaRandomDesc;
  if (name === 'heuristic') return t.start.briscolaHeuristicDesc;
  if (name === 'expert') return t.start.briscolaExpertDesc;
  if (name === 'gemini-free') return t.start.briscolaFreeDesc;
  return t.start.briscolaByokDesc(PROVIDER_INFO[getAIProvider(name)].label);
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
  thinkingLevel: 'off' | 'medium' | 'high';
  onCycleThinking: () => void;
  onOpenSettings?: () => void;
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
  thinkingLevel,
  onCycleThinking,
  onOpenSettings,
  conversationMode,
  onToggleConversationMode,
  watchOpponents,
  onSetWatchOpponent,
  defaultBestOf,
  onStartGame,
  onStartMultiplayer,
}: StartScreenProps) {
  const t = useT();
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
            <option value="cpu">{t.start.categoryCpu}</option>
            {geminiFreeOk && <option value="free-ai">{t.start.categoryFreeAI}</option>}
            {anyAIOk && <option value="ai">{t.start.categoryAI}</option>}
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
                    ? t.start.multiTurnTitle
                    : t.start.singleTurnTitle
                }
              >
                {conversationMode === 'multiturn' ? '💬' : '1️⃣'}
              </button>

              {/* 3-state thinking knob (off → balanced → deep) — matches
                  Scopa. OpenAI reasoning models get reasoning.effort too. */}
              {(provider === 'gemini' || provider === 'claude' || provider === 'openai') && (
                <button
                  className={`${styles.thinkingToggle} ${thinkingLevel !== 'off' ? styles.thinkingEnabled : ''}`}
                  onClick={onCycleThinking}
                  title={thinkingLevel === 'off'
                    ? t.start.thinkingOffTitle
                    : thinkingLevel === 'medium'
                      ? t.start.thinkingMediumTitle
                      : t.start.thinkingOnTitle}
                >
                  {thinkingLevel === 'off' ? '⚡' : thinkingLevel === 'medium' ? '🧠' : '🧠+'}
                </button>
              )}
            </>
          )}
        </div>
        <p className={styles.aiDescription}>
          {getOpponentDescription(current, t)}
          {cat === 'ai' &&
            (provider === 'gemini' || provider === 'claude' || provider === 'openai') &&
            (thinkingLevel === 'off'
              ? t.start.fastMode
              : thinkingLevel === 'medium'
                ? t.start.plusThinkingBalanced
                : t.start.plusThinking)}
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
                {t.start.freeAINoKey}
                {remaining !== null
                  ? t.start.gamesRemaining(remaining, info!.gamesLimit)
                  : t.start.limitedPerDay}
              </p>
              {exhausted && (
                <p
                  className={styles.aiDescription}
                  style={{ color: '#e57373', fontSize: '0.85em' }}
                >
                  {t.start.dailyLimitReached}
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
      <LanguageToggle />
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          title={t.settings.title}
          aria-label={t.settings.title}
          style={{
            position: 'fixed',
            top: '0.75rem',
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
        <h1 className={styles.title}>Briscola</h1>
        <p className={styles.subtitle}>{t.start.briscolaSubtitle}</p>

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
              ? t.start.playDescBriscola
              : gameMode === 'watch'
                ? t.start.watchDescBriscola
                : t.start.multiplayerDescBriscola}
          </p>
        </div>

        {gameMode !== 'multiplayer' && (
          <div className={styles.scoreSelection}>
            <label className={styles.label}>{t.start.firstToLabel}</label>
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
                title={t.start.customBestOfTitle}
              />
            </div>
            <p className={styles.aiDescription}>
              {bestOf === 1
                ? t.start.bestOfSingle
                : t.start.bestOfN(bestOf)}
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
              t.common.opponent
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
                    t.start.player1
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
                    t.start.player2
                  )}
                </div>
              </div>
            )
        }

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
            onClick={() => {
              if (gameMode === 'multiplayer') {
                onStartMultiplayer();
              } else {
                onStartGame(bestOf, gameMode);
              }
            }}
          >
            {gameMode === 'multiplayer'
              ? t.start.openLobby
              : gameMode === 'watch'
                ? t.start.startWatching
                : t.start.startGame}
          </button>
        )}

        <div className={`${styles.rulesHint} ${styles.rulesHintLong}`}>
          <h3>{t.start.quickRules}</h3>
          <ul>
            <li>{t.start.briscolaRule1}</li>
            <li>{t.start.briscolaRule2}</li>
            <li>{t.start.briscolaRule3}</li>
            <li>{t.start.briscolaRule4}</li>
          </ul>
        </div>

        <footer className={styles.footer}>
          © 2026 <a href="https://github.com/vlvovch" target="_blank" rel="noopener noreferrer">Volodymyr Vovchenko</a> | <a href="https://github.com/vlvovch/scopa-ai" target="_blank" rel="noopener noreferrer">GitHub</a>. {t.start.builtWithPrefix}<a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer">Claude Code</a>. <span title={__APP_BUILD_INFO__} style={{ opacity: 0.55, fontSize: '0.75em', whiteSpace: 'nowrap' }}>· v{__APP_VERSION__}</span>
        </footer>
      </div>
    </div>
  );
}
