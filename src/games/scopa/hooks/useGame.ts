// Step 6.8: useGame Hook

import { useReducer, useCallback, useEffect } from 'react';
import type { Move, GameMode, GameState } from '../types';
import { gameReducer, createInitialState } from '../reducer';
import { DEFAULT_TARGET_SCORE } from '../constants';

const STORAGE_KEY = 'scopa-game-state';

/**
 * Load game state from localStorage
 */
function loadPersistedState(): GameState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Basic validation - ensure it has required fields
      if (parsed && typeof parsed.status === 'string' && parsed.round && parsed.players) {
        return parsed as GameState;
      }
    }
  } catch (e) {
    console.warn('Failed to load persisted game state:', e);
  }
  return null;
}

/**
 * Save game state to localStorage
 */
function persistState(state: GameState): void {
  try {
    // Only persist if game is in progress (not idle)
    if (state.status !== 'idle') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      // Clear persisted state when game is reset
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Failed to persist game state:', e);
  }
}

/**
 * Clear persisted game state
 */
export function clearPersistedGame(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * React hook for managing Scopa game state.
 * Provides state and stable action dispatchers.
 * Automatically persists state to localStorage.
 */
export function useGame(initialTargetScore: number = DEFAULT_TARGET_SCORE) {
  // Try to restore from localStorage, otherwise create initial state
  const [state, dispatch] = useReducer(
    gameReducer,
    initialTargetScore,
    (targetScore) => {
      const persisted = loadPersistedState();
      return persisted || createInitialState(targetScore);
    }
  );

  // Persist state changes to localStorage
  useEffect(() => {
    persistState(state);
  }, [state]);

  const startGame = useCallback((targetScore: number = DEFAULT_TARGET_SCORE, gameMode: GameMode = 'pvsCPU') => {
    dispatch({ type: 'START_GAME', payload: { targetScore, gameMode } });
  }, []);

  const playCard = useCallback((move: Move) => {
    dispatch({ type: 'PLAY_CARD', payload: { move } });
  }, []);

  const endRound = useCallback(() => {
    dispatch({ type: 'END_ROUND' });
  }, []);

  const nextRound = useCallback(() => {
    dispatch({ type: 'NEXT_ROUND' });
  }, []);

  const showGameEnd = useCallback(() => {
    dispatch({ type: 'SHOW_GAME_END' });
  }, []);

  const resetGame = useCallback(() => {
    dispatch({ type: 'RESET_GAME' });
  }, []);

  return {
    state,
    startGame,
    playCard,
    endRound,
    nextRound,
    showGameEnd,
    resetGame,
  };
}
