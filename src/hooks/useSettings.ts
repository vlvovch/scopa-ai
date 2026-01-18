// Step 10.1: Settings Hook with localStorage persistence

import { useState, useEffect, useCallback } from 'react';
import type { ExtendedAIType } from '../ai';

export type DeckType = 'napoletane' | 'siciliane';

export interface GameSettings {
  /** Default target score for new games (minimum 1) */
  defaultTargetScore: number;
  /** Animation speed: 'instant' | 'fast' | 'normal' | 'slow' */
  animationSpeed: 'instant' | 'fast' | 'normal' | 'slow';
  /** Whether to show card values in corners */
  showCardValues: boolean;
  /** CPU AI type */
  cpuAI: ExtendedAIType;
  /** Card deck style */
  deck: DeckType;
  /** Gemini model to use (when cpuAI is 'gemini' or 'gemini-singleturn') */
  geminiModel: string;
  /** OpenAI model to use (when cpuAI is 'openai' or 'openai-singleturn') */
  openaiModel: string;
  /** Claude model to use (when cpuAI is 'claude' or 'claude-singleturn') */
  claudeModel: string;
  /** Enable extended thinking for LLM AI (Claude, Gemini) */
  useThinking: boolean;
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
  /** Whether the Gemini API key has been validated as working */
  geminiKeyValid: boolean;
  /** Whether the OpenAI API key has been validated as working */
  openaiKeyValid: boolean;
  /** Whether the Claude API key has been validated as working */
  claudeKeyValid: boolean;
  /** Whether to show pile stats (coins count, sette bello, scopas) */
  showPileStats: boolean;
}

const STORAGE_KEY = 'scopa-settings';

const DEFAULT_SETTINGS: GameSettings = {
  defaultTargetScore: 11,
  animationSpeed: 'normal',
  showCardValues: true,
  cpuAI: 'heuristic',
  deck: 'napoletane',
  geminiModel: 'gemini-2.5-flash',
  openaiModel: 'gpt-4o-mini',
  claudeModel: 'claude-sonnet-4-5-20250929',
  useThinking: true,
  autoAdvanceSpectator: true,
  soundEnabled: true,
  geminiApiKey: '',
  openaiApiKey: '',
  claudeApiKey: '',
  geminiKeyValid: false,
  openaiKeyValid: false,
  claudeKeyValid: false,
  showPileStats: true,
};

function loadSettings(): GameSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
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

function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
