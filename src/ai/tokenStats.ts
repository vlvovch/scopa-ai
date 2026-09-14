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
  /** Exact spend in USD as reported by the provider (OpenRouter); undefined
   *  for providers that report tokens only — the UI then estimates from
   *  list prices (src/ai/pricing.ts). */
  costUsd?: number;
  /** The model that answered the last request when a router substituted
   *  one for the configured id (OpenRouter's free router); undefined when
   *  the configured model answered. */
  servedModel?: string;
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
  costUsd?: number;
  servedModel?: string;
  turnTimeMs: number;
}
