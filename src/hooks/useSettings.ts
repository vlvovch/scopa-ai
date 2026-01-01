// Step 10.1: Settings Hook with localStorage persistence

import { useState, useEffect, useCallback } from 'react';
import type { ExtendedAIType } from '../ai';

export type DeckType = 'napoletane' | 'siciliane';

export interface GameSettings {
  /** Default target score for new games (minimum 1) */
  defaultTargetScore: number;
  /** Animation speed: 'fast' | 'normal' | 'slow' */
  animationSpeed: 'fast' | 'normal' | 'slow';
  /** Whether to show card values in corners */
  showCardValues: boolean;
  /** CPU AI type */
  cpuAI: ExtendedAIType;
  /** Card deck style */
  deck: DeckType;
  /** Gemini model to use (when cpuAI is 'gemini' or 'gemini-singleturn') */
  geminiModel: string;
  /** OpenAI model to use (when cpuAI is 'openai') */
  openaiModel: string;
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
