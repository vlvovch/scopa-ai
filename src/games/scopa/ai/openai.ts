// OpenAI GPT AI Player - Uses OpenAI's Responses API with conversation state

import OpenAI from 'openai';
import { getAiThinkingLevel } from '../../../ai/effort';
/** Families that accept the Responses API reasoning.effort param. */
const OPENAI_REASONING_MODELS = /^(gpt-5|o\d)/;

import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';
import { getOpenAIApiKey, isOpenAIKeyValid } from '../../../hooks/useSettings';

// Model info returned from API
export interface OpenAIModelInfo {
  id: string;
  displayName: string;
}

// Token usage statistics
export interface OpenAITokenStats {
  promptTokens: number;
  responseTokens: number;
  reasoningTokens: number;  // For o-series reasoning models
  totalTokens: number;
  cachedTokens: number;
  requestCount: number;
  // Round-specific stats (reset each round)
  roundPromptTokens: number;
  roundResponseTokens: number;
  roundReasoningTokens: number;
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
export interface OpenAITokenDelta {
  promptTokens: number;
  responseTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  turnTimeMs: number;
}

// Default model to use
const DEFAULT_MODEL = 'gpt-5-mini';

// Cached models list
let cachedModels: OpenAIModelInfo[] | null = null;
let modelsFetchPromise: Promise<OpenAIModelInfo[]> | null = null;

/**
 * Format model ID into display name
 * e.g., "gpt-4o-mini" -> "GPT-4o Mini"
 */
function formatModelName(modelId: string): string {
  return modelId
    .replace(/^gpt-/i, 'GPT-')
    .replace(/^o(\d)/, 'O$1')  // o3 -> O3
    .split('-')
    .map((part, i) => {
      if (i === 0) return part; // Keep GPT- or O3 as is
      if (part === 'mini') return 'Mini';
      if (part === 'nano') return 'Nano';
      if (part === 'pro') return 'Pro';
      if (part === 'turbo') return 'Turbo';
      if (/^\d{4}$/.test(part)) return ''; // Skip date parts like 2024
      if (/^\d{2}$/.test(part)) return ''; // Skip month parts like 08
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Fetch available OpenAI models from the API
 * Results are cached after first successful fetch
 */
export async function fetchOpenAIModels(): Promise<OpenAIModelInfo[]> {
  // Return cached models if available
  if (cachedModels !== null) {
    return cachedModels;
  }

  // Return existing promise if fetch is in progress
  if (modelsFetchPromise !== null) {
    return modelsFetchPromise;
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    return [];
  }

  modelsFetchPromise = (async () => {
    try {
      const client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });

      const models: OpenAIModelInfo[] = [];

      // Allowlist pattern for chat models
      // Only matches base models without date suffixes to avoid duplicates
      // e.g., gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, o3, o4-mini, etc.
      const ALLOWED_PATTERNS = [
        /^gpt-4o(-mini)?$/,                              // gpt-4o, gpt-4o-mini (no date suffixes)
        /^gpt-4\.1(-mini|-nano)?$/,                      // gpt-4.1, gpt-4.1-mini, gpt-4.1-nano
        /^gpt-4-turbo$/,                                 // gpt-4-turbo (no date suffixes)
        /^gpt-5(\.\d+)?(-[a-z]+)?$/,                     // gpt-5[-mini|-nano|-pro], gpt-5.1, gpt-5.6-sol/terra/luna, …
        /^o[134](-mini|-pro)?$/,                         // o1, o3, o4, o3-mini, o4-mini, o1-pro
      ];

      const isAllowedModel = (id: string): boolean => {
        return ALLOWED_PATTERNS.some(pattern => pattern.test(id));
      };

      const response = await client.models.list();

      for await (const model of response) {
        if (isAllowedModel(model.id)) {
          // Use raw model ID as display name for clarity
          models.push({
            id: model.id,
            displayName: model.id
          });
        }
      }

      // Sort: gpt-5 family (newest minor version first) > gpt-4.1 > gpt-4o
      // > o-series, then by variant (base > mini > nano)
      models.sort((a, b) => {
        const order = (id: string): number => {
          if (id.startsWith('gpt-5')) return 0;
          if (id.startsWith('gpt-4.1')) return 1;
          if (id.startsWith('gpt-4o')) return 2;
          if (id.startsWith('gpt-4-turbo')) return 3;
          if (id.startsWith('o')) return 4;
          return 5;
        };
        const minorOf = (id: string): number => {
          const m = id.match(/^gpt-5\.(\d+)/);
          return m ? parseInt(m[1], 10) : 0;
        };
        const variantOrder = (id: string): number => {
          if (id.includes('-nano')) return 2;
          if (id.includes('-mini')) return 1;
          if (id.includes('-pro')) return 3;
          return 0;
        };

        return (
          order(a.id) - order(b.id) ||
          minorOf(b.id) - minorOf(a.id) ||
          variantOrder(a.id) - variantOrder(b.id)
        );
      });

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error);
      // Return fallback models on error (use raw IDs as display names)
      return [
        { id: 'gpt-5-mini', displayName: 'gpt-5-mini' },
        { id: 'gpt-5', displayName: 'gpt-5' },
        { id: 'gpt-4.1-mini', displayName: 'gpt-4.1-mini' },
        { id: 'gpt-4o-mini', displayName: 'gpt-4o-mini' },
      ];
    } finally {
      modelsFetchPromise = null;
    }
  })();

  return modelsFetchPromise;
}

/**
 * Get cached models synchronously (returns empty if not yet fetched)
 */
export function getCachedOpenAIModels(): OpenAIModelInfo[] {
  return cachedModels || [];
}

/**
 * OpenAI GPT AI Player using Responses API with conversation state
 */
class OpenAIAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private client: OpenAI;
  private model: string;
  private modelDisplayName: string;
  // Conversation ID for automatic state management (Responses API)
  private conversationId: string | null = null;
  public lastReasoning: string = '';
  public tokenStats: OpenAITokenStats;
  public lastDelta: OpenAITokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    turnTimeMs: 0,
  };

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
    this.model = model;
    this.modelDisplayName = formatModelName(model);
    this.name = this.modelDisplayName;

    // Initialize token stats with model info
    this.tokenStats = {
      promptTokens: 0,
      responseTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundReasoningTokens: 0,
      roundTotalTokens: 0,
      roundRequestCount: 0,
      modelId: model,
      modelDisplayName: this.modelDisplayName,
      totalTimeMs: 0,
      lastTurnTimeMs: 0,
      minTurnTimeMs: 0,
      maxTurnTimeMs: 0,
      roundTotalTimeMs: 0,
    };
  }

  /**
   * Update token stats from Responses API usage metadata
   */
  private updateTokenStats(usage: OpenAI.Responses.ResponseUsage | undefined): void {
    if (!usage) return;

    const promptDelta = usage.input_tokens || 0;
    const responseDelta = usage.output_tokens || 0;
    const reasoningDelta = usage.output_tokens_details?.reasoning_tokens || 0;
    const totalDelta = usage.total_tokens || 0;
    const cachedDelta = usage.input_tokens_details?.cached_tokens || 0;

    // Update cumulative stats
    this.tokenStats.promptTokens += promptDelta;
    this.tokenStats.responseTokens += responseDelta;
    this.tokenStats.reasoningTokens += reasoningDelta;
    this.tokenStats.totalTokens += totalDelta;
    this.tokenStats.cachedTokens += cachedDelta;
    this.tokenStats.requestCount += 1;

    // Update round-specific stats
    this.tokenStats.roundPromptTokens += promptDelta;
    this.tokenStats.roundResponseTokens += responseDelta;
    this.tokenStats.roundReasoningTokens += reasoningDelta;
    this.tokenStats.roundTotalTokens += totalDelta;
    this.tokenStats.roundRequestCount += 1;

    // Track last delta (timing added by updateTimingStats)
    this.lastDelta = {
      promptTokens: promptDelta,
      responseTokens: responseDelta,
      reasoningTokens: reasoningDelta,
      totalTokens: totalDelta,
      cachedTokens: cachedDelta,
      turnTimeMs: 0,
    };
  }

  /**
   * Update timing stats after a turn
   */
  private updateTimingStats(turnTimeMs: number): void {
    this.tokenStats.lastTurnTimeMs = turnTimeMs;
    this.tokenStats.totalTimeMs += turnTimeMs;
    this.tokenStats.roundTotalTimeMs += turnTimeMs;

    // Update min/max (initialize min on first turn)
    if (this.tokenStats.minTurnTimeMs === 0 || turnTimeMs < this.tokenStats.minTurnTimeMs) {
      this.tokenStats.minTurnTimeMs = turnTimeMs;
    }
    if (turnTimeMs > this.tokenStats.maxTurnTimeMs) {
      this.tokenStats.maxTurnTimeMs = turnTimeMs;
    }

    // Include timing in delta
    this.lastDelta.turnTimeMs = turnTimeMs;
  }

  /**
   * Reset token stats (e.g., for new game)
   */
  resetTokenStats(): void {
    this.tokenStats = {
      promptTokens: 0,
      responseTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundReasoningTokens: 0,
      roundTotalTokens: 0,
      roundRequestCount: 0,
      modelId: this.model,
      modelDisplayName: this.modelDisplayName,
      totalTimeMs: 0,
      lastTurnTimeMs: 0,
      minTurnTimeMs: 0,
      maxTurnTimeMs: 0,
      roundTotalTimeMs: 0,
    };
    this.lastDelta = {
      promptTokens: 0,
      responseTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      turnTimeMs: 0,
    };
  }

  /**
   * Reset round-specific stats (called at start of each round)
   */
  resetRoundStats(): void {
    this.tokenStats.roundPromptTokens = 0;
    this.tokenStats.roundResponseTokens = 0;
    this.tokenStats.roundReasoningTokens = 0;
    this.tokenStats.roundTotalTokens = 0;
    this.tokenStats.roundRequestCount = 0;
    this.tokenStats.roundTotalTimeMs = 0;
  }

  /**
   * Start a new round - reset conversation for fresh state
   */
  startRound(): void {
    this.resetRoundStats();
    // Clear conversation ID to start fresh (new conversation will be created on first request)
    this.conversationId = null;
    this.lastReasoning = '';
  }

  /**
   * End the current round
   */
  endRound(): void {
    this.conversationId = null;
  }

  /**
   * Select a move using OpenAI Responses API with conversation state
   */
  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, validMoves } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    try {
      const prompt = buildTurnPrompt(context);
      const startTime = performance.now();

      // Use Responses API with conversation state management
      const thinkingKnob = getAiThinkingLevel();
      const response = await this.client.responses.create({
        model: this.model,
        // Reasoning effort for reasoning-capable families (gpt-5*/o*);
        // omitted otherwise and at knob 'off' (provider default applies).
        reasoning: OPENAI_REASONING_MODELS.test(this.model) && thinkingKnob !== 'off'
          ? { effort: thinkingKnob }
          : undefined,
        instructions: SYSTEM_INSTRUCTION_MULTITURN,
        input: prompt,
        // If we have a conversation ID, continue it; otherwise create new
        conversation: this.conversationId
          ? { id: this.conversationId }
          : undefined,
        text: {
          format: {
            type: 'json_schema',
            name: 'move_selection',
            schema: {
              type: 'object',
              properties: {
                moveIndex: { type: 'integer' },
                reasoning: { type: 'string' }
              },
              required: ['moveIndex', 'reasoning'],
              additionalProperties: false
            }
          }
        }
      });

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usage);
      this.updateTimingStats(turnTime);

      // Store conversation ID for next turn (server manages history)
      if (response.conversation?.id) {
        this.conversationId = response.conversation.id;
      }

      const content = response.output_text;
      if (!content) {
        throw new Error('Empty response from AI');
      }

      const result = JSON.parse(content);
      this.lastReasoning = result.reasoning || '';

      // Only one move - still called API for context continuity
      if (validMoves.length === 1) {
        console.log(`[${this.model}] ${this.lastReasoning}`);
        return validMoves[0];
      }

      const index = result.moveIndex;

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        console.log(`[${this.model}] ${this.lastReasoning}`);
        return validMoves[index];
      }

      console.warn(`[${this.model}] Invalid moveIndex ${index}, using first valid move`);
      return validMoves[0];
    } catch (error) {
      console.error(`[${this.model}] API error:`, error);
      this.lastReasoning = 'API error occurred.';
      // Re-throw so App.tsx can catch and display error badge
      throw error;
    }
  }
}

/**
 * Check if OpenAI API key is available AND valid
 */
export function isOpenAIAvailable(): boolean {
  return !!getOpenAIApiKey() && isOpenAIKeyValid();
}

// Re-export for backwards compatibility
export { getOpenAIApiKey };

/**
 * Create an OpenAI AI player instance
 */
export function createOpenAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    console.warn('OpenAI API key not found. Set VITE_OPENAI_API_KEY in .env.local');
    return null;
  }
  return new OpenAIAI(apiKey, model);
}

// Cache instances by model ID (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get an OpenAI AI instance (cached by model ID)
 */
export function getOpenAI(
  model: string = DEFAULT_MODEL,
  seat: import('./types').Seat = 'cpu'
): AsyncAIPlayer | null {
  if (!isOpenAIAvailable()) {
    return null;
  }

  // Cache key now includes seat — spectator-mode same-model self-play
  // needs distinct instances so the OpenAI conversation id isn't shared.
  const cacheKey = `${model}:${seat}`;
  const cached = instanceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const instance = createOpenAI(model);
  if (instance) {
    instanceCache.set(cacheKey, instance);
  }
  return instance;
}

/**
 * Get the default OpenAI model ID
 */
export function getDefaultOpenAIModel(): string {
  return DEFAULT_MODEL;
}

/**
 * Get token stats from an OpenAI AI instance by (model, seat)
 */
export function getOpenAITokenStats(
  model?: string,
  seat: import('./types').Seat = 'cpu'
): OpenAITokenStats | null {
  const instance = model
    ? (instanceCache.get(`${model}:${seat}`) as OpenAIAI | null)
    : null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from an OpenAI AI instance by (model, seat)
 */
export function getOpenAITokenDelta(
  model?: string,
  seat: import('./types').Seat = 'cpu'
): OpenAITokenDelta | null {
  const instance = model
    ? (instanceCache.get(`${model}:${seat}`) as OpenAIAI | null)
    : null;
  if (instance && 'lastDelta' in instance) {
    return { ...instance.lastDelta };
  }
  return null;
}

/**
 * Reset token stats on all cached OpenAI AI instances
 */
export function resetOpenAITokenStats(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as OpenAIAI;
    if ('resetTokenStats' in ai) {
      ai.resetTokenStats();
    }
  }
}

/**
 * Start a new round on all cached OpenAI AI instances (creates fresh conversations)
 */
export function startOpenAIRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as OpenAIAI;
    if ('startRound' in ai) {
      ai.startRound();
    }
  }
}

/**
 * End the current round on all cached OpenAI AI instances (clears conversations)
 */
export function endOpenAIRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as OpenAIAI;
    if ('endRound' in ai) {
      ai.endRound();
    }
  }
}

/**
 * Clear the OpenAI instance cache (call when API key changes)
 */
export function clearOpenAICache(): void {
  instanceCache.clear();
  cachedModels = null;
}
