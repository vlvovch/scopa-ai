// Briscola settings hook — small subset of Scopa's useSettings, with its
// own localStorage key so the two games don't collide.

import { useState, useEffect, useCallback } from 'react';
import type { DeckType } from '../../../hooks/useSettings';
import type { CpuBotName } from '../StartScreen';

export type { DeckType };

export type AnimationSpeed = 'instant' | 'fast' | 'normal' | 'slow';

/** Multiplier applied to all timer-driven durations (CPU reveal/move,
 *  trick-visible hold, capture exit, draw, dealing). Instant collapses
 *  everything to a tiny duration so a game runs as fast as state can
 *  propagate. */
export const SPEED_MULTIPLIER: Record<AnimationSpeed, number> = {
  instant: 0.02,
  fast: 0.5,
  normal: 1,
  slow: 1.6,
};

export interface BriscolaSettings {
  /** Whether sound effects are enabled */
  soundEnabled: boolean;
  /** Card deck art */
  deck: DeckType;
  /** Default "best of N" for new matches */
  defaultBestOf: number;
  /** Default CPU bot for new matches */
  defaultCpuBot: CpuBotName;
  /** Animation speed multiplier preset */
  animationSpeed: AnimationSpeed;
}

const STORAGE_KEY = 'briscola-settings';

const DEFAULT_SETTINGS: BriscolaSettings = {
  soundEnabled: true,
  deck: 'napoletane',
  defaultBestOf: 1,
  defaultCpuBot: 'heuristic',
  animationSpeed: 'normal',
};

function loadSettings(): BriscolaSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load Briscola settings:', e);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: BriscolaSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save Briscola settings:', e);
  }
}

export function useBriscolaSettings() {
  const [settings, setSettings] = useState<BriscolaSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSetting = useCallback(
    <K extends keyof BriscolaSettings>(key: K, value: BriscolaSettings[K]) => {
      setSettings(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSetting, resetSettings };
}
