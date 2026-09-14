// Briscola AI — barrel exports

export type {
  AIContext,
  LLMAIContext,
  AIPlayer,
  AsyncAIPlayer,
  AnyAIPlayer,
  AIPlayerFactory,
} from './types';
export { isAsyncAI } from './types';

export { randomAI, createRandomAI } from './random';
export { getAppleBriscolaAI, isAppleAvailable } from './apple';
export { heuristicAI, createHeuristicAI, scoreCandidate } from './heuristic';
export { expertAI, createExpertAI } from './expert';
export {
  getGeminiFreeBriscolaAI,
  isGeminiFreeAvailable,
  startGeminiFreeRound,
  endGeminiFreeRound,
  newGeminiFreeGame,
  clearGeminiFreeCache,
  getGeminiFreeRateLimitInfo,
  getGeminiFreeTokenStats,
  getGeminiFreeTokenDelta,
  RateLimitError,
} from './gemini-free';
export {
  getGeminiBriscolaAI,
  isGeminiAvailable,
  fetchGeminiModels,
  getCachedGeminiModels,
  startGeminiRound,
  endGeminiRound,
  clearGeminiCache,
  getGeminiBriscolaTokenStats,
  getGeminiBriscolaTokenDelta,
  DEFAULT_GEMINI_MODEL,
  type GeminiModelInfo,
  type ConversationMode,
  type Seat,
} from './gemini';
export {
  getOpenAIBriscolaAI,
  isOpenAIAvailable,
  fetchOpenAIModels,
  getCachedOpenAIModels,
  startOpenAIRound,
  endOpenAIRound,
  clearOpenAICache,
  getOpenAIBriscolaTokenStats,
  getOpenAIBriscolaTokenDelta,
  DEFAULT_OPENAI_MODEL,
  type OpenAIModelInfo,
} from './openai';
export {
  getClaudeBriscolaAI,
  isClaudeAvailable,
  fetchClaudeModels,
  getCachedClaudeModels,
  startClaudeRound,
  endClaudeRound,
  clearClaudeCache,
  getClaudeBriscolaTokenStats,
  getClaudeBriscolaTokenDelta,
  DEFAULT_CLAUDE_MODEL,
  type ClaudeModelInfo,
} from './claude';
export {
  getOpenRouterBriscolaAI,
  isOpenRouterAvailable,
  fetchOpenRouterModels,
  getCachedOpenRouterModels,
  startOpenRouterMatch,
  startOpenRouterRound,
  endOpenRouterRound,
  cancelOpenRouterRequests,
  clearOpenRouterCache,
  getOpenRouterBriscolaTokenStats,
  getOpenRouterBriscolaTokenDelta,
  DEFAULT_OPENROUTER_MODEL,
  type OpenRouterModelInfo,
} from './openrouter';
