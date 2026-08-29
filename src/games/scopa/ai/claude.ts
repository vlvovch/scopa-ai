// Claude Anthropic AI Player - Uses Messages API with local conversation state
// Supports extended thinking for enhanced reasoning capabilities

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';
import { heuristicAI } from './heuristic';
import { getClaudeApiKey, isClaudeKeyValid } from '../../../hooks/useSettings';

// Extended thinking configuration
const EXTENDED_THINKING_BUDGET = 10000; // Max tokens for thinking (legacy, pre-Opus 4.6)

/**
 * Check if a model uses adaptive thinking. Everything from the 4.6
 * generation onward — Opus 4.6/4.7/4.8, Sonnet 4.6, and the 5-family
 * (Opus 5, Sonnet 5, Fable 5) — REJECTS the legacy `thinking.type ===
 * 'enabled'` + `budget_tokens` shape with a 400 and takes
 * `thinking: {type: 'adaptive'}` plus `output_config.effort` instead.
 * Only the older generations (Sonnet 4.5, Haiku 4.5, Opus 4.5/4.1/4.0,
 * 3.x) still use budget_tokens, so unknown and future models default to
 * adaptive — that keeps next year's models working without a code change.
 */
export function isAdaptiveThinkingModel(model: string): boolean {
  if (model.includes('claude-3')) return false; // 3.x family: legacy shape
  const m = model.match(/claude-(?:opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
  if (!m) return true; // unrecognized family (fable, future names): adaptive
  const major = parseInt(m[1], 10);
  // A trailing 8-digit group is a date suffix, not a minor version
  // (e.g. claude-opus-4-20250514 is Opus 4.0).
  const minor = m[2] && m[2].length <= 2 ? parseInt(m[2], 10) : 0;
  if (major >= 5) return true;
  return major === 4 && minor >= 6;
}

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

// Default model to use — current model IDs are dateless
const DEFAULT_MODEL = 'claude-sonnet-5';

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

      // Sort newest version first, then by capability tier within a
      // version (fable > opus > sonnet > haiku). Parsed from the id so
      // future models sort correctly without a code change.
      const versionOf = (id: string): number => {
        // "claude-opus-4-8" / "claude-sonnet-4-5-20250929" → major.minor;
        // "claude-sonnet-5" → major only. A trailing 8-digit group is a
        // date suffix, never a minor version.
        let m = id.match(/-(\d+)-(\d{1,2})(?:-\d{8})?$/);
        if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / 100;
        m = id.match(/-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      };
      const familyOf = (id: string): number => {
        if (id.includes('fable')) return 3;
        if (id.includes('opus')) return 2;
        if (id.includes('sonnet')) return 1;
        if (id.includes('haiku')) return 0;
        return -1;
      };
      models.sort(
        (a, b) => versionOf(b.id) - versionOf(a.id) || familyOf(b.id) - familyOf(a.id)
      );

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch Claude models:', error);
      // Return fallback models on error
      return [
        { id: 'claude-opus-5', displayName: 'Claude Opus 5' },
        { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5' },
        { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
        { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' },
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
    const { hand, validMoves } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    try {
      const prompt = buildTurnPrompt(context);

      // Single valid move: nothing to decide — skip the API round-trip.
      // A synthetic exchange keeps the conversation history intact for
      // later turns, and it keeps every real call's parameters
      // byte-identical (a thinking/effort flip mid-round would
      // invalidate the prompt cache).
      if (validMoves.length === 1) {
        this.messages.push({ role: 'user', content: prompt });
        this.messages.push({
          role: 'assistant',
          content: '{"moveIndex":0,"reasoning":"Only one valid move."}',
        });
        this.lastReasoning = 'Only one valid move.';
        this.lastThinking = '';
        this.lastDelta = { promptTokens: 0, responseTokens: 0, totalTokens: 0, turnTimeMs: 0 };
        return validMoves[0];
      }

      const startTime = performance.now();

      // Add user message to conversation
      this.messages.push({ role: 'user', content: prompt });

      const shouldThink = this.useExtendedThinking;

      // Build API request parameters. Structured outputs are GA via
      // output_config.format (the old output_format param is deprecated);
      // the grammar applies only to direct output, not thinking.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestParams: any = {
        model: this.model,
        max_tokens: shouldThink ? 16000 : 1024, // Higher limit for thinking
        system: SYSTEM_INSTRUCTION_MULTITURN,
        output_config: { format: MOVE_OUTPUT_SCHEMA },
        messages: this.messages,
        // Incremental prompt caching: auto-places a breakpoint at the last
        // cacheable block, so each turn re-reads the system prompt + all
        // prior turns from cache (~10% of input price) instead of
        // re-billing the whole growing conversation. Verify via the
        // cache_read_input_tokens field in usage (shown in token stats).
        cache_control: { type: 'ephemeral' },
      };

      // Add extended thinking if enabled and there's a decision to make
      if (shouldThink) {
        if (isAdaptiveThinkingModel(this.model)) {
          // 4.6+ and the 5-family: adaptive thinking + effort knob.
          // display must be requested explicitly — since Opus 4.7 the
          // default is 'omitted' (empty thinking text), which left the
          // reasoning UI blank on current models.
          requestParams.thinking = { type: 'adaptive', display: 'summarized' };
          requestParams.output_config.effort = 'high';
        } else {
          // Older models (Sonnet/Haiku/Opus 4.5 and earlier): manual
          // thinking with budget_tokens
          requestParams.thinking = {
            type: 'enabled',
            budget_tokens: EXTENDED_THINKING_BUDGET
          };
        }
      }

      const response = await this.client.messages.create(requestParams);

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usage);
      this.updateTimingStats(turnTime);

      // Safety refusal (HTTP 200 + stop_reason 'refusal' on current
      // models): don't crash the game — play the heuristic move.
      if (response.stop_reason === 'refusal') {
        console.warn(`[${this.model}] Refusal stop reason, using heuristic move`);
        this.messages.push({ role: 'assistant', content: '{}' });
        this.lastThinking = '';
        this.lastReasoning = 'Model declined — heuristic move played.';
        return heuristicAI.selectMove(context);
      }

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
        console.warn(`[${this.model}] No text in response, using heuristic move`);
        // Store empty response for context continuity
        this.messages.push({ role: 'assistant', content: '{}' });
        this.lastReasoning = 'No response — heuristic move played.';
        return heuristicAI.selectMove(context);
      }

      // Parse JSON from text response (schema-enforced, but a malformed
      // response should degrade to the heuristic, not crash the game)
      let parsed: { moveIndex?: number; reasoning?: string };
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        console.warn(`[${this.model}] Unparseable response, using heuristic move`);
        this.messages.push({ role: 'assistant', content: '{}' });
        this.lastReasoning = 'Unparseable response — heuristic move played.';
        return heuristicAI.selectMove(context);
      }
      this.lastReasoning = parsed.reasoning || '';

      // Add assistant response to conversation for context continuity
      // Store just the text (JSON) since content blocks have richer types
      this.messages.push({ role: 'assistant', content: textBlock.text });

      const index = parsed.moveIndex;

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        console.log(`[${this.model}] ${this.lastReasoning}`);
        return validMoves[index];
      }

      console.warn(`[${this.model}] Invalid moveIndex ${index}, using heuristic move`);
      return heuristicAI.selectMove(context);
    } catch (error) {
      console.error(`[${this.model}] API error:`, error);
      this.lastReasoning = 'API error occurred.';
      this.lastThinking = '';
      // Re-throw so App.tsx can catch and display error badge
      throw error;
    }
  }
}

/**
 * Check if Claude API key is available AND valid
 */
export function isClaudeAvailable(): boolean {
  return !!getClaudeApiKey() && isClaudeKeyValid();
}

// Re-export for backwards compatibility
export { getClaudeApiKey };

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

// Cache instances by model ID + thinking mode (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get a Claude AI instance (cached by model ID and thinking mode)
 * @param model - Model ID to use
 * @param useExtendedThinking - Enable extended thinking (default: true)
 */
export function getClaudeAI(
  model: string = DEFAULT_MODEL,
  useExtendedThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): AsyncAIPlayer | null {
  if (!isClaudeAvailable()) {
    return null;
  }

  // Cache key includes thinking mode AND seat — spectator-mode same-model
  // self-play needs distinct instances so message arrays don't intermix.
  const cacheKey = `${model}:${useExtendedThinking}:${seat}`;
  const cached = instanceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const instance = createClaudeAI(model, useExtendedThinking);
  if (instance) {
    instanceCache.set(cacheKey, instance);
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
 * Get token stats from a Claude AI instance by (model, thinking, seat)
 */
export function getClaudeTokenStats(
  model?: string,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): ClaudeTokenStats | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}:${seat}`;
  const instance = instanceCache.get(cacheKey) as ClaudeAI | null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from a Claude AI instance by (model, thinking, seat)
 */
export function getClaudeTokenDelta(
  model?: string,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): ClaudeTokenDelta | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}:${seat}`;
  const instance = instanceCache.get(cacheKey) as ClaudeAI | null;
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

/**
 * Clear the Claude instance cache (call when API key changes)
 */
export function clearClaudeCache(): void {
  instanceCache.clear();
  cachedModels = null;
}
