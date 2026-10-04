// Step 10.1: Settings Hook with localStorage persistence

import { useState, useEffect, useCallback } from 'react';
import type { ExtendedAIType } from '../games/scopa/ai';
import { storage } from '../platform/storage';

export type DeckType = 'napoletane' | 'siciliane' | 'sarde' | 'piacentine' | 'bergamasche' | 'romagnole';
export type TableStyle = 'green' | 'tablecloth';
export type AnimationSpeed = 'instant' | 'fast' | 'normal' | 'slow';

/** Multiplier applied to all timer-driven animation durations.
 *  'instant' collapses everything to a tiny delay; 'normal' is baseline. */
export const SPEED_MULTIPLIER: Record<AnimationSpeed, number> = {
  instant: 0.02,
  fast: 0.5,
  normal: 1,
  slow: 1.6,
};

export interface GameSettings {
  /** Default target score for new Scopa games (minimum 1) */
  defaultTargetScore: number;
  /** Default "Best Of" for new Briscola matches */
  defaultBestOf: number;
  /** Animation speed: 'instant' | 'fast' | 'normal' | 'slow' */
  animationSpeed: AnimationSpeed;
  /** Whether to show card values in corners */
  showCardValues: boolean;
  /** CPU AI type (Scopa) */
  cpuAI: ExtendedAIType;
  /** Default Briscola CPU bot */
  briscolaCpuBot: 'random' | 'heuristic' | 'expert';
  /** Card deck style */
  deck: DeckType;
  /** Table background style */
  tableStyle: TableStyle;
  /** Gemini model to use (when cpuAI is 'gemini' or 'gemini-singleturn') */
  geminiModel: string;
  /** OpenAI model to use (when cpuAI is 'openai' or 'openai-singleturn') */
  openaiModel: string;
  /** Claude model to use (when cpuAI is 'claude' or 'claude-singleturn') */
  claudeModel: string;
  /** OpenRouter model id, e.g. "openai/gpt-5-mini" (when cpuAI is 'openrouter' or 'openrouter-singleturn') */
  openrouterModel: string;
  /** Enable extended thinking for LLM AI (Claude, Gemini) */
  useThinking: boolean;
  /** 3-state thinking knob; useThinking stays the derived on/off. */
  thinkingLevel: 'off' | 'medium' | 'high';
  /** Auto-advance rounds in spectator mode (show summary for 2 seconds then continue) */
  autoAdvanceSpectator: boolean;
  /** Enable sound effects */
  soundEnabled: boolean;
  /** User-provided Gemini API key (BYOK) */
  geminiApiKey: string;
  /** User-provided OpenAI API key (BYOK) */
  openaiApiKey: string;
  /** User-provided Claude API key (BYOK) */
  claudeApiKey: string;
  /** User-provided OpenRouter API key (BYOK; one key for many vendors' models) */
  openrouterApiKey: string;
  /** Whether the Gemini API key has been validated as working */
  geminiKeyValid: boolean;
  /** Whether the OpenAI API key has been validated as working */
  openaiKeyValid: boolean;
  /** Whether the Claude API key has been validated as working */
  claudeKeyValid: boolean;
  /** Whether the OpenRouter API key has been validated as working */
  openrouterKeyValid: boolean;
  /** Whether to show pile stats (coins count, sette bello, scopas) */
  showPileStats: boolean;
  /** Accessibility: multiplier applied to the root font size so all
   *  rem-based UI text scales up/down. Slider stops: 1.0 Small /
   *  1.2 Normal (default) / 1.4 Large / 1.6 XLarge. Cards (vw/vh based)
   *  are intentionally unaffected. */
  fontScale: number;
  /** Scopa & Briscola analysis: show live win-odds (Expert/Esperto
   *  self-play estimate). Off by default; single-player Play mode only
   *  (never multiplayer / spectator). */
  showWinOdds: boolean;
  /** Scopa & Briscola analysis: also show per-card odds (Scopa: the
   *  best move's % under each card + every option in the capture
   *  chooser). Only meaningful when showWinOdds is on. */
  showWinOddsPerCard: boolean;
  /** Scopa & Briscola analysis: number of determinizations the
   *  win-odds engine simulates. Higher = tighter confidence interval
   *  but slower to settle. Default 300. */
  winOddsSamples: number;
  /** Scopa-only: use the deeper (1-ply alpha-beta) playout policy
   *  mid-round (~3-5× slower per ply, materially stronger). The
   *  perfect-information endgame is always exact regardless. */
  winOddsDeep: boolean;
  /** The shape these settings were saved with; loadSettings brings older
   *  ones up to date once (migrateStoredSettings). */
  settingsVersion: number;
}

const STORAGE_KEY = 'scopa-settings';

/** Bumped when stored settings need a one-off migration on load:
 *  1 (implicit) up to 2026-09-19, 2 moves the former default models. */
const SETTINGS_VERSION = 2;

const DEFAULT_SETTINGS: GameSettings = {
  defaultTargetScore: 11,
  defaultBestOf: 1,
  animationSpeed: 'normal',
  showCardValues: true,
  cpuAI: 'heuristic',
  briscolaCpuBot: 'heuristic',
  deck: 'napoletane',
  tableStyle: 'green',
  // Balanced defaults (2026-09): the newest Flash, OpenAI's small 5.6 model,
  // Sonnet 5, and the same OpenAI model through OpenRouter. Cheap and quick
  // enough for a whole game; the pickers offer the stronger ones.
  geminiModel: 'gemini-3.8-flash',
  openaiModel: 'gpt-5.6-luna',
  claudeModel: 'claude-sonnet-5',
  openrouterModel: 'openai/gpt-5.6-luna',
  useThinking: true,
  // Balanced by default (2026-09): deep thinking doubled the wait per move
  // and the cost without changing the moves in the benchmark positions.
  thinkingLevel: 'medium',
  autoAdvanceSpectator: true,
  soundEnabled: true,
  geminiApiKey: '',
  openaiApiKey: '',
  claudeApiKey: '',
  openrouterApiKey: '',
  geminiKeyValid: false,
  openaiKeyValid: false,
  claudeKeyValid: false,
  openrouterKeyValid: false,
  showPileStats: true,
  fontScale: 1.2,
  showWinOdds: false,
  showWinOddsPerCard: true,
  winOddsSamples: 300,
  winOddsDeep: false,
  settingsVersion: SETTINGS_VERSION,
};

/** Former default models, mapped to the current default of the same
 *  provider: an install still on one of them was never a deliberate
 *  choice for most players, so it follows the default; any other saved
 *  model is left alone. Applied once (settings version 2), so one of
 *  these picked deliberately afterwards stays. */
const FORMER_DEFAULT_MODELS: Record<'geminiModel' | 'openaiModel' | 'openrouterModel', Record<string, string>> = {
  geminiModel: { 'gemini-3.5-flash': DEFAULT_SETTINGS.geminiModel },
  openaiModel: { 'gpt-5-mini': DEFAULT_SETTINGS.openaiModel },
  openrouterModel: { 'openai/gpt-5-mini': DEFAULT_SETTINGS.openrouterModel },
};

/** Stored settings (any age) brought up to the current shape. Exported for tests. */
export function migrateStoredSettings(parsed: Record<string, unknown>): GameSettings {
  const merged: GameSettings = { ...DEFAULT_SETTINGS, ...(parsed as Partial<GameSettings>) };
  const savedVersion = typeof parsed.settingsVersion === 'number' ? parsed.settingsVersion : 1;
  // Migrate pre-knob installs: the boolean was the only control.
  if (!('thinkingLevel' in parsed)) {
    merged.thinkingLevel = merged.useThinking ? 'high' : 'off';
  }
  if (savedVersion < 2) {
    for (const key of Object.keys(FORMER_DEFAULT_MODELS) as Array<keyof typeof FORMER_DEFAULT_MODELS>) {
      const saved = parsed[key];
      if (typeof saved === 'string' && FORMER_DEFAULT_MODELS[key][saved]) merged[key] = FORMER_DEFAULT_MODELS[key][saved];
    }
  }
  merged.settingsVersion = SETTINGS_VERSION;
  return merged;
}

function loadSettings(): GameSettings {
  try {
    const stored = storage.get(STORAGE_KEY);
    if (stored) {
      return migrateStoredSettings(JSON.parse(stored) as Record<string, unknown>);
    }
  } catch (e) {
    console.warn('Failed to load settings from localStorage:', e);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Get Gemini API key: user-provided (localStorage) > env var
 */
export function getGeminiApiKey(): string | null {
  const settings = loadSettings();
  if (settings.geminiApiKey) {
    return settings.geminiApiKey;
  }
  return import.meta.env.VITE_GEMINI_API_KEY || null;
}

/**
 * Check if Gemini API key is valid (user key must be validated, env key assumed valid)
 */
export function isGeminiKeyValid(): boolean {
  const settings = loadSettings();
  // User-provided key requires validation
  if (settings.geminiApiKey) {
    return settings.geminiKeyValid;
  }
  // Env var key is assumed valid if present
  return !!import.meta.env.VITE_GEMINI_API_KEY;
}

/**
 * Get OpenAI API key: user-provided (localStorage) > env var
 */
export function getOpenAIApiKey(): string | null {
  const settings = loadSettings();
  if (settings.openaiApiKey) {
    return settings.openaiApiKey;
  }
  return import.meta.env.VITE_OPENAI_API_KEY || null;
}

/**
 * Check if OpenAI API key is valid (user key must be validated, env key assumed valid)
 */
export function isOpenAIKeyValid(): boolean {
  const settings = loadSettings();
  // User-provided key requires validation
  if (settings.openaiApiKey) {
    return settings.openaiKeyValid;
  }
  // Env var key is assumed valid if present
  return !!import.meta.env.VITE_OPENAI_API_KEY;
}

/**
 * Get Claude API key: user-provided (localStorage) > env var
 */
export function getClaudeApiKey(): string | null {
  const settings = loadSettings();
  if (settings.claudeApiKey) {
    return settings.claudeApiKey;
  }
  return import.meta.env.VITE_CLAUDE_API_KEY || null;
}

/**
 * Check if Claude API key is valid (user key must be validated, env key assumed valid)
 */
export function isClaudeKeyValid(): boolean {
  const settings = loadSettings();
  // User-provided key requires validation
  if (settings.claudeApiKey) {
    return settings.claudeKeyValid;
  }
  // Env var key is assumed valid if present
  return !!import.meta.env.VITE_CLAUDE_API_KEY;
}

/**
 * Get OpenRouter API key: user-provided (localStorage) > env var
 */
export function getOpenRouterApiKey(): string | null {
  const settings = loadSettings();
  if (settings.openrouterApiKey) {
    return settings.openrouterApiKey;
  }
  return import.meta.env.VITE_OPENROUTER_API_KEY || null;
}

/**
 * Check if OpenRouter API key is valid (user key must be validated, env key assumed valid)
 */
export function isOpenRouterKeyValid(): boolean {
  const settings = loadSettings();
  // User-provided key requires validation
  if (settings.openrouterApiKey) {
    return settings.openrouterKeyValid;
  }
  // Env var key is assumed valid if present
  return !!import.meta.env.VITE_OPENROUTER_API_KEY;
}

function saveSettings(settings: GameSettings): void {
  try {
    storage.set(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings to localStorage:', e);
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

  // Save to localStorage whenever settings change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Apply the accessibility font scale to the document root so all
  // rem-based text resizes. (index.html sets it pre-paint from the same
  // stored value to avoid a flash; this keeps it live on change.)
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--font-scale',
      String(settings.fontScale ?? 1)
    );
  }, [settings.fontScale]);

  const updateSetting = useCallback(<K extends keyof GameSettings>(
    key: K,
    value: GameSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    updateSetting,
    resetSettings,
  };
}
