// Step 6.8: useGame Hook

import { useReducer, useCallback } from 'react';
import type { Move, GameMode } from '../game/types';
import { gameReducer, createInitialState } from '../game/reducer';
import { DEFAULT_TARGET_SCORE } from '../game/constants';

/**
 * React hook for managing Scopa game state.
 * Provides state and stable action dispatchers.
 */
export function useGame(initialTargetScore: number = DEFAULT_TARGET_SCORE) {
  const [state, dispatch] = useReducer(
    gameReducer,
    initialTargetScore,
    createInitialState
  );

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
