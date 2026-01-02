// Claude Anthropic AI Player - Uses Messages API with local conversation state
// Supports extended thinking for enhanced reasoning capabilities

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { Move } from '../game/types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { randomAI } from './random';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';

// Extended thinking configuration
const EXTENDED_THINKING_BUDGET = 10000; // Max tokens for thinking

// Model info returned from API
export interface ClaudeModelInfo {
  id: string;
  displayName: string;
}

// Token usage statistics
export interface ClaudeTokenStats {
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  requestCount: number;
  // Round-specific stats (reset each round)
  roundPromptTokens: number;
  roundResponseTokens: number;
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
export interface ClaudeTokenDelta {
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  turnTimeMs: number;
}

// Default model to use
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// Cached models list
let cachedModels: ClaudeModelInfo[] | null = null;
let modelsFetchPromise: Promise<ClaudeModelInfo[]> | null = null;

// JSON schema for structured output using output_format
// Compatible with extended thinking (grammar applies only to direct output, not thinking)
const MOVE_OUTPUT_SCHEMA = {
  type: 'json_schema' as const,
  schema: {
    type: 'object' as const,
    properties: {
      moveIndex: { type: 'integer' as const, description: '0-based index of the selected move from the valid moves list' },
      reasoning: { type: 'string' as const, description: 'Brief explanation of why this move was chosen' }
    },
    required: ['moveIndex', 'reasoning'] as const,
    additionalProperties: false
  }
};

/**
 * Format model ID into display name
 * e.g., "claude-sonnet-4-5-20250929" -> "Claude Sonnet 4.5"
 */
function formatModelName(modelId: string): string {
  // Remove date suffix if present
  const withoutDate = modelId.replace(/-\d{8}$/, '');

  return withoutDate
    .split('-')
    .map((part, i) => {
      if (i === 0) return 'Claude';
      if (part === 'claude') return '';
      // Convert version numbers like "4-5" to "4.5"
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .filter(Boolean)
    .join(' ')
    .replace(/(\d) (\d)/g, '$1.$2'); // "4 5" -> "4.5"
}

/**
 * Fetch available Claude models from the API
 * Results are cached after first successful fetch
 */
export async function fetchClaudeModels(): Promise<ClaudeModelInfo[]> {
  // Return cached models if available
  if (cachedModels !== null) {
    return cachedModels;
  }

  // Return existing promise if fetch is in progress
  if (modelsFetchPromise !== null) {
    return modelsFetchPromise;
  }

  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return [];
  }

  modelsFetchPromise = (async () => {
    try {
      const client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true
      });

      const models: ClaudeModelInfo[] = [];

      // Fetch models from API (beta endpoint)
      const response = await client.beta.models.list({ limit: 100 });

      for (const model of response.data) {
        // Only include Claude chat models
        if (model.id.startsWith('claude-')) {
          models.push({
            id: model.id,
            displayName: model.display_name || model.id
          });
        }
      }

      // Sort by model family and version (newest first)
      models.sort((a, b) => {
        // Extract version info for sorting
        const getOrder = (id: string): number => {
          if (id.includes('opus-4-5')) return 0;
          if (id.includes('sonnet-4-5')) return 1;
          if (id.includes('haiku-4-5')) return 2;
          if (id.includes('opus-4')) return 3;
          if (id.includes('sonnet-4')) return 4;
          if (id.includes('haiku-4')) return 5;
          if (id.includes('opus-3')) return 6;
          if (id.includes('sonnet-3')) return 7;
          if (id.includes('haiku-3')) return 8;
          return 9;
        };
        return getOrder(a.id) - getOrder(b.id);
      });

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch Claude models:', error);
      // Return fallback models on error
      return [
        { id: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5' },
        { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
        { id: 'claude-opus-4-5-20251101', displayName: 'Claude Opus 4.5' },
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
export function getCachedClaudeModels(): ClaudeModelInfo[] {
  return cachedModels || [];
}

/**
 * Claude AI Player using Messages API with local conversation state
 * Supports extended thinking for enhanced reasoning
 */
class ClaudeAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private client: Anthropic;
  private model: string;
  private modelDisplayName: string;
  // Messages array for conversation history (managed locally)
  private messages: MessageParam[] = [];
  // Extended thinking support
  private useExtendedThinking: boolean;
  public lastReasoning: string = '';
  public lastThinking: string = ''; // Exposed thinking summary
  public tokenStats: ClaudeTokenStats;
  public lastDelta: ClaudeTokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    totalTokens: 0,
    turnTimeMs: 0,
  };

  constructor(apiKey: string, model: string = DEFAULT_MODEL, useExtendedThinking: boolean = true) {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true
    });
    this.model = model;
    this.modelDisplayName = formatModelName(model);
    this.name = this.modelDisplayName;
    this.useExtendedThinking = useExtendedThinking;

    // Initialize token stats with model info
    this.tokenStats = {
      promptTokens: 0,
      responseTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
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
   * Update token stats from API usage metadata
   */
  private updateTokenStats(usage: Anthropic.Usage | undefined): void {
    if (!usage) return;

    const promptDelta = usage.input_tokens || 0;
    const responseDelta = usage.output_tokens || 0;
    const totalDelta = promptDelta + responseDelta;
    // Cache tokens are in separate fields
    const cachedDelta = (usage as { cache_read_input_tokens?: number }).cache_read_input_tokens || 0;
    const cacheCreationDelta = (usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens || 0;

    // Update cumulative stats
    this.tokenStats.promptTokens += promptDelta;
    this.tokenStats.responseTokens += responseDelta;
    this.tokenStats.totalTokens += totalDelta;
    this.tokenStats.cachedTokens += cachedDelta;
    this.tokenStats.cacheCreationTokens += cacheCreationDelta;
    this.tokenStats.requestCount += 1;

    // Update round-specific stats
    this.tokenStats.roundPromptTokens += promptDelta;
    this.tokenStats.roundResponseTokens += responseDelta;
    this.tokenStats.roundTotalTokens += totalDelta;
    this.tokenStats.roundRequestCount += 1;

    // Track last delta (timing added by updateTimingStats)
    this.lastDelta = {
      promptTokens: promptDelta,
      responseTokens: responseDelta,
      totalTokens: totalDelta,
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
      totalTokens: 0,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
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
    this.tokenStats.roundTotalTokens = 0;
    this.tokenStats.roundRequestCount = 0;
    this.tokenStats.roundTotalTimeMs = 0;
  }

  /**
   * Start a new round - clear messages for fresh conversation
   */
  startRound(): void {
    this.resetRoundStats();
    // Clear messages array for fresh conversation
    this.messages = [];
    this.lastReasoning = '';
    this.lastThinking = '';
  }

  /**
   * End the current round
   */
  endRound(): void {
    this.messages = [];
  }

  /**
   * Select a move using Claude Messages API with structured output
   * Uses output_format for guaranteed JSON response, compatible with extended thinking
   */
  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, table, player, validMoves } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    try {
      const prompt = buildTurnPrompt(context);
      const startTime = performance.now();

      // Add user message to conversation
      this.messages.push({ role: 'user', content: prompt });

      // Skip extended thinking if only one move (no decision to make)
      const shouldThink = this.useExtendedThinking && validMoves.length > 1;

      // Build API request parameters using structured outputs (beta)
      // output_format is compatible with extended thinking - grammar applies only to direct output
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestParams: any = {
        model: this.model,
        max_tokens: shouldThink ? 16000 : 1024, // Higher limit for thinking
        system: SYSTEM_INSTRUCTION_MULTITURN,
        output_format: MOVE_OUTPUT_SCHEMA,
        messages: this.messages,
        betas: ['structured-outputs-2025-11-13']
      };

      // Add extended thinking if enabled and there's a decision to make
      if (shouldThink) {
        requestParams.thinking = {
          type: 'enabled',
          budget_tokens: EXTENDED_THINKING_BUDGET
        };
      }

      // Call Claude API with beta endpoint for structured outputs
      const response = await this.client.beta.messages.create(requestParams);

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usage);
      this.updateTimingStats(turnTime);

      // Extract thinking blocks (for extended thinking mode)
      const thinkingBlocks = response.content.filter(
        (block): block is Anthropic.ThinkingBlock => block.type === 'thinking'
      );

      // Store thinking summary for display
      if (thinkingBlocks.length > 0) {
        this.lastThinking = thinkingBlocks.map(b => b.thinking).join('\n');
        console.log(`[${this.model}] Thinking: ${this.lastThinking}`);
      } else {
        this.lastThinking = '';
      }

      // Extract text block with JSON response
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      if (!textBlock) {
        console.warn(`[${this.model}] No text in response, using first valid move`);
        // Store empty response for context continuity
        this.messages.push({ role: 'assistant', content: '{}' });
        return validMoves[0];
      }

      // Parse JSON from text response (guaranteed by output_format schema)
      const parsed = JSON.parse(textBlock.text) as { moveIndex: number; reasoning: string };
      this.lastReasoning = parsed.reasoning || '';

      // Add assistant response to conversation for context continuity
      // Store just the text (JSON) since beta content blocks have different types
      this.messages.push({ role: 'assistant', content: textBlock.text });

      // Only one move - still called API for context continuity
      if (validMoves.length === 1) {
        console.log(`[${this.model}] ${this.lastReasoning}`);
        return validMoves[0];
      }

      const index = parsed.moveIndex;

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        console.log(`[${this.model}] ${this.lastReasoning}`);
        return validMoves[index];
      }

      console.warn(`[${this.model}] Invalid moveIndex ${index}, using first valid move`);
      return validMoves[0];
    } catch (error) {
      console.error(`[${this.model}] Error, falling back to random:`, error);
      this.lastReasoning = 'Error occurred, random fallback.';
      this.lastThinking = '';
      return randomAI.selectMove({ hand, table, player });
    }
  }
}

/**
 * Check if Claude API key is available
 */
export function isClaudeAvailable(): boolean {
  return !!import.meta.env.VITE_CLAUDE_API_KEY;
}

/**
 * Get the Claude API key from environment
 */
export function getClaudeApiKey(): string | null {
  return import.meta.env.VITE_CLAUDE_API_KEY || null;
}

/**
 * Create a Claude AI player instance
 * @param model - Model ID to use
 * @param useExtendedThinking - Enable extended thinking for enhanced reasoning (default: true)
 */
export function createClaudeAI(model: string = DEFAULT_MODEL, useExtendedThinking: boolean = true): AsyncAIPlayer | null {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    console.warn('Claude API key not found. Set VITE_CLAUDE_API_KEY in .env.local');
    return null;
  }
  return new ClaudeAI(apiKey, model, useExtendedThinking);
}

// Cache instances by model ID (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get a Claude AI instance (cached by model ID)
 * Note: Extended thinking is always enabled for cached instances
 */
export function getClaudeAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  if (!isClaudeAvailable()) {
    return null;
  }

  // Return cached instance if exists for this model
  const cached = instanceCache.get(model);
  if (cached) {
    return cached;
  }

  // Create and cache new instance (extended thinking enabled by default)
  const instance = createClaudeAI(model, true);
  if (instance) {
    instanceCache.set(model, instance);
  }
  return instance;
}

/**
 * Get the default Claude model ID
 */
export function getDefaultClaudeModel(): string {
  return DEFAULT_MODEL;
}

/**
 * Get token stats from a Claude AI instance by model
 */
export function getClaudeTokenStats(model?: string): ClaudeTokenStats | null {
  const instance = model ? instanceCache.get(model) as ClaudeAI | null : null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from a Claude AI instance by model
 */
export function getClaudeTokenDelta(model?: string): ClaudeTokenDelta | null {
  const instance = model ? instanceCache.get(model) as ClaudeAI | null : null;
  if (instance && 'lastDelta' in instance) {
    return { ...instance.lastDelta };
  }
  return null;
}

/**
 * Reset token stats on all cached Claude AI instances
 */
export function resetClaudeTokenStats(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as ClaudeAI;
    if ('resetTokenStats' in ai) {
      ai.resetTokenStats();
    }
  }
}

/**
 * Start a new round on all cached Claude AI instances (clears conversations)
 */
export function startClaudeRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as ClaudeAI;
    if ('startRound' in ai) {
      ai.startRound();
    }
  }
}

/**
 * End the current round on all cached Claude AI instances (clears conversations)
 */
export function endClaudeRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as ClaudeAI;
    if ('endRound' in ai) {
      ai.endRound();
    }
  }
}
