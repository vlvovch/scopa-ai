/**
 * Canonical token + timing stats shape used by every LLM bot across all
 * games. Named "Gemini..." for historical reasons (Gemini was the first
 * provider integrated) but is provider-agnostic — OpenAI and Anthropic
 * bots fill the same fields. The shared TokenStatsDisplay component
 * renders any provider uniformly off this shape.
 */

export interface GeminiTokenStats {
  promptTokens: number;
  responseTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  cachedTokens: number;
  /** Anthropic cache writes (billed at 1.25x input); other providers 0 */
  cacheCreationTokens?: number;
  requestCount: number;
  // Round-specific stats (reset each round)
  roundPromptTokens: number;
  roundResponseTokens: number;
  roundThoughtTokens: number;
  roundTotalTokens: number;
  roundRequestCount: number;
  // Model info
  modelId: string;
  modelDisplayName: string;
  // Timing stats (in milliseconds)
  totalTimeMs: number;
  lastTurnTimeMs: number;
  minTurnTimeMs: number;
  maxTurnTimeMs: number;
  // Round-specific timing
  roundTotalTimeMs: number;
}

// Delta from last API call
export interface GeminiTokenDelta {
  promptTokens: number;
  responseTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  turnTimeMs: number;
}
