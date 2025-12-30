// AI Module - Export all AI implementations

import { randomAI, createRandomAI } from './random';
import { heuristicAI, createHeuristicAI } from './heuristic';

// Re-export types
export type { AIPlayer, AIContext, AIPlayerFactory } from './types';

// Re-export AI implementations
export { randomAI, createRandomAI };
export { heuristicAI, createHeuristicAI };

// Available AI players for selection
export const AI_PLAYERS = {
  random: randomAI,
  heuristic: heuristicAI,
} as const;

export type AIType = keyof typeof AI_PLAYERS;
