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
 * Get Claude API key: user-provided (localStorage) > env var
 */
export function getClaudeApiKey(): string | null {
  const settings = loadSettings();
  if (settings.claudeApiKey) {
    return settings.claudeApiKey;
  }
  return import.meta.env.VITE_CLAUDE_API_KEY || null;
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
