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

// Display info for each AI
export const AI_INFO: Record<AIType, { name: string; description: string }> = {
  random: { name: 'Scimmia', description: 'Plays randomly like a monkey' },
  heuristic: { name: 'Furbo', description: 'Greedy strategy, prioritizes valuable captures' },
};
