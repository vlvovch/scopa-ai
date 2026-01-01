// AI Module - Export all AI implementations

import { randomAI, createRandomAI } from './random';
import { heuristicAI, createHeuristicAI } from './heuristic';
import { getGeminiAI, isGeminiAvailable, createGeminiAI, fetchGeminiModels, getCachedGeminiModels, getDefaultGeminiModel, getGeminiTokenStats, getGeminiTokenDelta, resetGeminiTokenStats, startGeminiRound, endGeminiRound, type GeminiModelInfo, type GeminiTokenStats, type GeminiTokenDelta } from './gemini';
import { getGeminiSingleTurnAI, createGeminiSingleTurnAI, getGeminiSingleTurnTokenStats, getGeminiSingleTurnTokenDelta, resetGeminiSingleTurnTokenStats, startGeminiSingleTurnRound, endGeminiSingleTurnRound } from './gemini-singleturn';
import { getOpenAI, isOpenAIAvailable, createOpenAI, fetchOpenAIModels, getCachedOpenAIModels, getDefaultOpenAIModel, getOpenAITokenStats, getOpenAITokenDelta, resetOpenAITokenStats, startOpenAIRound, endOpenAIRound, type OpenAIModelInfo, type OpenAITokenStats, type OpenAITokenDelta } from './openai';

// Re-export types
export type { AIPlayer, AIContext, AIPlayerFactory, AsyncAIPlayer, LLMAIContext, AnyAIPlayer } from './types';
export { isAsyncAI } from './types';

// Re-export AI implementations
export { randomAI, createRandomAI };
export { heuristicAI, createHeuristicAI };
export { getGeminiAI, isGeminiAvailable, createGeminiAI, fetchGeminiModels, getCachedGeminiModels, getDefaultGeminiModel, getGeminiTokenStats, getGeminiTokenDelta, resetGeminiTokenStats, startGeminiRound, endGeminiRound };
export { getGeminiSingleTurnAI, createGeminiSingleTurnAI, getGeminiSingleTurnTokenStats, getGeminiSingleTurnTokenDelta, resetGeminiSingleTurnTokenStats, startGeminiSingleTurnRound, endGeminiSingleTurnRound };
export { getOpenAI, isOpenAIAvailable, createOpenAI, fetchOpenAIModels, getCachedOpenAIModels, getDefaultOpenAIModel, getOpenAITokenStats, getOpenAITokenDelta, resetOpenAITokenStats, startOpenAIRound, endOpenAIRound };
export type { GeminiModelInfo, GeminiTokenStats, GeminiTokenDelta };
export type { OpenAIModelInfo, OpenAITokenStats, OpenAITokenDelta };

// Available sync AI players for selection
export const AI_PLAYERS = {
  random: randomAI,
  heuristic: heuristicAI,
} as const;

// All AI types (sync only - async AIs handled separately)
export type AIType = keyof typeof AI_PLAYERS;

// Extended AI type including async AIs
export type ExtendedAIType = AIType | 'gemini' | 'gemini-singleturn' | 'openai';

// Display info for each AI (including async)
export const AI_INFO: Record<ExtendedAIType, { name: string; description: string; isAsync?: boolean; icon: string }> = {
  random: { name: 'Scimmietta', description: 'Plays randomly like a little monkey', icon: '🐒' },
  heuristic: { name: 'Furbo', description: 'Greedy strategy, prioritizes valuable captures', icon: '🦊' },
  gemini: { name: 'Gemini 💬', description: 'Google AI with multi-turn chat (remembers context)', isAsync: true, icon: '✦' },
  'gemini-singleturn': { name: 'Gemini 1️⃣', description: 'Google AI with single requests (full history each turn)', isAsync: true, icon: '✦' },
  openai: { name: 'GPT 💬', description: 'OpenAI GPT with multi-turn chat (remembers context)', isAsync: true, icon: '⬡' },
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
  if (isOpenAIAvailable()) {
    types.push('openai');
  }
  return types;
}

/**
 * Check if an AI type is a Gemini variant (multi-turn or single-turn)
 */
export function isGeminiAIType(aiType: ExtendedAIType): boolean {
  return aiType === 'gemini' || aiType === 'gemini-singleturn';
}

/**
 * Check if an AI type is an OpenAI variant
 */
export function isOpenAIAIType(aiType: ExtendedAIType): boolean {
  return aiType === 'openai';
}
