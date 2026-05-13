// Web Worker for running game simulations in background
// This worker runs CPU vs CPU games without being throttled when tab is hidden

import type { GameState, Move, PlayerId } from '../types';
import { gameReducer } from '../reducer';
import { getValidMoves } from '../rules';
import { randomAI } from '../ai/random';
import { heuristicAI } from '../ai/heuristic';
import { selectExpertMoveWithState } from '../ai/expert';
import type { AIContext } from '../ai/types';

export type CPUType = 'random' | 'heuristic' | 'expert';

export interface SimulationConfig {
  player1AI: CPUType;
  player2AI: CPUType;
  targetScore: number;
  delayMs: number; // Delay between moves (0 for instant)
}

export type WorkerMessage =
  | { type: 'START'; config: SimulationConfig }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };

export type WorkerResponse =
  | { type: 'STATE_UPDATE'; state: GameState }
  | { type: 'GAME_END'; state: GameState }
  | { type: 'ERROR'; message: string };

let isRunning = false;
let isPaused = false;
let currentState: GameState | null = null;
let config: SimulationConfig | null = null;

function getAIMove(state: GameState, aiType: CPUType, player: PlayerId): Move {
  const hand = state.players[player].hand;
  const table = state.round.table;

  // Get all valid moves
  const allMoves: Move[] = [];
  for (const card of hand) {
    const moves = getValidMoves(card, table, player);
    allMoves.push(...moves);
  }

  if (allMoves.length === 0) {
    throw new Error('No valid moves available');
  }

  if (aiType === 'expert') {
    // Expert AI uses full state for MCTS
    return selectExpertMoveWithState(state, { timeBudgetMs: 30 });
  }

  // Build context for simple AIs
  const context: AIContext = {
    hand,
    table,
    player,
  };

  if (aiType === 'random') {
    return randomAI.selectMove(context);
  }

  return heuristicAI.selectMove(context);
}

async function runSimulation() {
  if (!config || !currentState) return;

  // Store config locally for TypeScript narrowing
  const simulationConfig = config;

  // Track moves for batched updates in instant mode
  let movesSinceLastUpdate = 0;
  const UPDATE_INTERVAL = 20; // Update UI every N moves in instant mode

  while (isRunning && currentState.status !== 'gameEnd') {
    if (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }

    try {
      // Handle different game states
      if (currentState.status === 'roundEnd') {
        if (!currentState.lastRoundScores) {
          // Calculate round scores
          currentState = gameReducer(currentState, { type: 'END_ROUND' });
          self.postMessage({ type: 'STATE_UPDATE', state: currentState } as WorkerResponse);
        }

        if (currentState.isGameOver) {
          // Show game end
          currentState = gameReducer(currentState, { type: 'SHOW_GAME_END' });
          self.postMessage({ type: 'GAME_END', state: currentState } as WorkerResponse);
          isRunning = false;
          return;
        }

        // Brief delay to show round scores (if animation delay configured)
        if (simulationConfig.delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, Math.min(simulationConfig.delayMs * 2, 1000)));
        }

        // Start next round
        currentState = gameReducer(currentState, { type: 'NEXT_ROUND' });
        self.postMessage({ type: 'STATE_UPDATE', state: currentState } as WorkerResponse);
        movesSinceLastUpdate = 0; // Reset counter for new round
        continue;
      }

      if (currentState.status !== 'playing') {
        await new Promise(resolve => setTimeout(resolve, 10));
        continue;
      }

      // Determine which AI should play
      const currentPlayer = currentState.round.currentPlayer;
      const aiType = currentPlayer === 'human' ? simulationConfig.player1AI : simulationConfig.player2AI;

      // Get and execute move
      const move = getAIMove(currentState, aiType, currentPlayer);
      currentState = gameReducer(currentState, { type: 'PLAY_CARD', payload: { move } });
      movesSinceLastUpdate++;

      // Send state update (batched in instant mode for performance)
      if (simulationConfig.delayMs > 0) {
        // With delay: update every move for smooth animation
        self.postMessage({ type: 'STATE_UPDATE', state: currentState } as WorkerResponse);
        await new Promise(resolve => setTimeout(resolve, simulationConfig.delayMs));
      } else if (movesSinceLastUpdate >= UPDATE_INTERVAL) {
        // Instant mode: batch updates to reduce overhead
        self.postMessage({ type: 'STATE_UPDATE', state: currentState } as WorkerResponse);
        movesSinceLastUpdate = 0;
        // Yield to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } catch (error) {
      self.postMessage({
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      } as WorkerResponse);
      isRunning = false;
      return;
    }
  }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'START':
      config = message.config;
      isRunning = true;
      isPaused = false;

      // Initialize game state
      currentState = gameReducer(
        { status: 'idle' } as GameState,
        { type: 'START_GAME', payload: { targetScore: config.targetScore, gameMode: 'cpuVsCPU' } }
      );

      self.postMessage({ type: 'STATE_UPDATE', state: currentState } as WorkerResponse);
      runSimulation();
      break;

    case 'STOP':
      isRunning = false;
      isPaused = false;
      currentState = null;
      config = null;
      break;

    case 'PAUSE':
      isPaused = true;
      break;

    case 'RESUME':
      isPaused = false;
      break;
  }
};
