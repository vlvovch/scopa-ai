// AI Module - Export all AI implementations

import { randomAI, createRandomAI } from './random';
import { heuristicAI, createHeuristicAI } from './heuristic';
import { getGeminiAI, isGeminiAvailable, createGeminiAI, fetchGeminiModels, getCachedGeminiModels, getDefaultGeminiModel, getGeminiTokenStats, getGeminiTokenDelta, resetGeminiTokenStats, startGeminiRound, endGeminiRound, type GeminiModelInfo, type GeminiTokenStats, type GeminiTokenDelta } from './gemini';
import { getGeminiSingleTurnAI, createGeminiSingleTurnAI, getGeminiSingleTurnTokenStats, getGeminiSingleTurnTokenDelta, resetGeminiSingleTurnTokenStats, startGeminiSingleTurnRound, endGeminiSingleTurnRound } from './gemini-singleturn';

// Re-export types
export type { AIPlayer, AIContext, AIPlayerFactory, AsyncAIPlayer, LLMAIContext, AnyAIPlayer } from './types';
export { isAsyncAI } from './types';

// Re-export AI implementations
export { randomAI, createRandomAI };
export { heuristicAI, createHeuristicAI };
export { getGeminiAI, isGeminiAvailable, createGeminiAI, fetchGeminiModels, getCachedGeminiModels, getDefaultGeminiModel, getGeminiTokenStats, getGeminiTokenDelta, resetGeminiTokenStats, startGeminiRound, endGeminiRound };
export { getGeminiSingleTurnAI, createGeminiSingleTurnAI, getGeminiSingleTurnTokenStats, getGeminiSingleTurnTokenDelta, resetGeminiSingleTurnTokenStats, startGeminiSingleTurnRound, endGeminiSingleTurnRound };
export type { GeminiModelInfo, GeminiTokenStats, GeminiTokenDelta };

// Available sync AI players for selection
export const AI_PLAYERS = {
  random: randomAI,
  heuristic: heuristicAI,
} as const;

// All AI types (sync only - async AIs handled separately)
export type AIType = keyof typeof AI_PLAYERS;

// Extended AI type including async AIs
export type ExtendedAIType = AIType | 'gemini' | 'gemini-singleturn';

// Display info for each AI (including async)
export const AI_INFO: Record<ExtendedAIType, { name: string; description: string; isAsync?: boolean }> = {
  random: { name: 'Scimmietta', description: 'Plays randomly like a little monkey' },
  heuristic: { name: 'Furbo', description: 'Greedy strategy, prioritizes valuable captures' },
  gemini: { name: 'Gemini', description: 'Google AI with multi-turn chat (remembers context)', isAsync: true },
  'gemini-singleturn': { name: 'Gemini (1-turn)', description: 'Google AI with single requests (full history each turn)', isAsync: true },
};

/**
 * Get list of available AI types based on API key availability
 */
export function getAvailableAITypes(): ExtendedAIType[] {
  const types: ExtendedAIType[] = ['random', 'heuristic'];
  if (isGeminiAvailable()) {
    types.push('gemini');
    types.push('gemini-singleturn');
  }
  return types;
}
