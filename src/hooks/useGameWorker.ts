// Hook for managing game simulation in a Web Worker
// Allows CPU vs CPU games to run in background tabs without throttling

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState } from '../game/types';
import type { CPUType, SimulationConfig, WorkerMessage, WorkerResponse } from '../workers/gameSimulation.worker';

export type { CPUType };

interface UseGameWorkerOptions {
  onStateUpdate?: (state: GameState) => void;
  onGameEnd?: (state: GameState) => void;
  onError?: (message: string) => void;
}

export function useGameWorker(options: UseGameWorkerOptions = {}) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const optionsRef = useRef(options);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Initialize worker
  useEffect(() => {
    // Create worker using Vite's worker import syntax
    workerRef.current = new Worker(
      new URL('../workers/gameSimulation.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;

      switch (response.type) {
        case 'STATE_UPDATE':
          setGameState(response.state);
          optionsRef.current.onStateUpdate?.(response.state);
          break;

        case 'GAME_END':
          setGameState(response.state);
          setIsRunning(false);
          optionsRef.current.onGameEnd?.(response.state);
          break;

        case 'ERROR':
          setIsRunning(false);
          optionsRef.current.onError?.(response.message);
          break;
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('Worker error:', error);
      setIsRunning(false);
      optionsRef.current.onError?.(error.message);
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const startSimulation = useCallback((config: SimulationConfig) => {
    if (!workerRef.current) return;

    setIsRunning(true);
    setIsPaused(false);
    workerRef.current.postMessage({ type: 'START', config } as WorkerMessage);
  }, []);

  const stopSimulation = useCallback(() => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({ type: 'STOP' } as WorkerMessage);
    setIsRunning(false);
    setIsPaused(false);
    setGameState(null);
  }, []);

  const pauseSimulation = useCallback(() => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({ type: 'PAUSE' } as WorkerMessage);
    setIsPaused(true);
  }, []);

  const resumeSimulation = useCallback(() => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({ type: 'RESUME' } as WorkerMessage);
    setIsPaused(false);
  }, []);

  return {
    isRunning,
    isPaused,
    gameState,
    startSimulation,
    stopSimulation,
    pauseSimulation,
    resumeSimulation,
  };
}
