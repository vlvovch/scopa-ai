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
  DEFAULT_GEMINI_MODEL,
  type GeminiModelInfo,
} from './gemini';
export {
  getOpenAIBriscolaAI,
  isOpenAIAvailable,
  fetchOpenAIModels,
  getCachedOpenAIModels,
  startOpenAIRound,
  endOpenAIRound,
  clearOpenAICache,
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
  DEFAULT_CLAUDE_MODEL,
  type ClaudeModelInfo,
} from './claude';
