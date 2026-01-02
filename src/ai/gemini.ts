// Gemini AI Player - Uses Google's Gemini API for intelligent play

import { GoogleGenAI, Chat } from '@google/genai';
import type { Move } from '../game/types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { randomAI } from './random';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';

// Model info returned from API
export interface GeminiModelInfo {
  id: string;
  displayName: string;
}

// Token usage statistics
export interface GeminiTokenStats {
  promptTokens: number;
  responseTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  cachedTokens: number;
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
  turnTimeMs: number;
}

// Default model to use
const DEFAULT_MODEL = 'gemini-2.5-flash';

// JSON schema for move selection response
const MOVE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    moveIndex: { type: 'integer', description: '0-based index of the selected move' },
    reasoning: { type: 'string', description: 'Brief explanation of why this move was chosen' },
  },
  required: ['moveIndex', 'reasoning'],
};

/** Pro models cannot fully disable thinking, require minimum budget */
function isProModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('-pro');
}

/**
 * Get thinkingConfig for Gemini API requests.
 * - Thinking enabled + multiple moves: dynamic budget (-1)
 * - Thinking disabled: 0 for Flash models, 128 for Pro models (minimum required)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMessageThinkingConfig(modelId: string, useThinking: boolean, hasMultipleMoves: boolean): any {
  const thinkingBudget = (useThinking && hasMultipleMoves)
    ? -1
    : isProModel(modelId) ? 128 : 0;
  return { thinkingBudget };
}

// Cached models list
let cachedModels: GeminiModelInfo[] | null = null;
let modelsFetchPromise: Promise<GeminiModelInfo[]> | null = null;

/**
 * Fetch available Gemini models from the API
 * Results are cached after first successful fetch
 */
export async function fetchGeminiModels(): Promise<GeminiModelInfo[]> {
  // Return cached models if available
  if (cachedModels !== null) {
    return cachedModels;
  }

  // Return existing promise if fetch is in progress
  if (modelsFetchPromise !== null) {
    return modelsFetchPromise;
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return [];
  }

  modelsFetchPromise = (async () => {
    try {
      const ai = new GoogleGenAI({ apiKey });
      let models: GeminiModelInfo[] = [];

      // Strict allowlist pattern for clean model names only
      // Format: gemini-X[.X]-{flash|flash-lite|pro}[-thinking][-preview]
      const ALLOWED_PATTERN = /^gemini-\d+(\.\d+)?-(flash-lite|flash|pro)(-thinking)?(-preview)?$/;

      // Also allow "latest" aliases
      const ALLOWED_LATEST = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'];

      const isAllowedModel = (id: string): boolean => {
        return ALLOWED_PATTERN.test(id) || ALLOWED_LATEST.includes(id);
      };

      // Get base model name (without -preview suffix)
      const getBaseModel = (id: string): string => {
        return id.replace(/-preview$/, '');
      };

      for await (const model of await ai.models.list()) {
        // Only include models that support generateContent
        if (model.supportedActions?.includes('generateContent')) {
          // Extract model ID from full name (e.g., "models/gemini-2.5-flash" -> "gemini-2.5-flash")
          const id = model.name?.replace('models/', '') || '';

          if (id && isAllowedModel(id)) {
            // Use raw model ID as display name for clarity
            models.push({ id, displayName: id });
          }
        }
      }

      // Filter out preview models if non-preview version exists
      const nonPreviewIds = new Set(
        models.filter(m => !m.id.endsWith('-preview')).map(m => m.id)
      );
      models = models.filter(m => {
        if (!m.id.endsWith('-preview')) return true;
        // Keep preview only if non-preview doesn't exist
        const baseId = getBaseModel(m.id);
        return !nonPreviewIds.has(baseId);
      });

      // Sort by version (descending) then by type (flash before pro)
      models.sort((a, b) => {
        // Extract version numbers for comparison (handles both X.X and X formats)
        const versionA = a.id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || '0';
        const versionB = b.id.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || '0';

        // Sort by version descending
        if (versionA !== versionB) {
          return versionB.localeCompare(versionA, undefined, { numeric: true });
        }

        // Within same version: flash < flash-lite < pro
        const typeOrder = (id: string) => {
          if (id.includes('-flash-lite')) return 1;
          if (id.includes('-flash')) return 0;
          if (id.includes('-pro')) return 2;
          return 3;
        };
        return typeOrder(a.id) - typeOrder(b.id);
      });

      cachedModels = models;
      return models;
    } catch (error) {
      console.error('Failed to fetch Gemini models:', error);
      // Return fallback models on error (use raw IDs as display names)
      return [
        { id: 'gemini-2.5-flash', displayName: 'gemini-2.5-flash' },
        { id: 'gemini-2.5-pro', displayName: 'gemini-2.5-pro' },
        { id: 'gemini-2.0-flash', displayName: 'gemini-2.0-flash' },
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
export function getCachedGeminiModels(): GeminiModelInfo[] {
  return cachedModels || [];
}

/**
 * Gemini AI Player using @google/genai SDK
 */
class GeminiAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private ai: GoogleGenAI;
  private model: string;
  private modelDisplayName: string;
  private chat: Chat | null = null;
  private useThinking: boolean;
  public lastReasoning: string = '';
  public tokenStats: GeminiTokenStats;
  public lastDelta: GeminiTokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    turnTimeMs: 0,
  };

  constructor(apiKey: string, model: string = DEFAULT_MODEL, useThinking: boolean = true) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    this.useThinking = useThinking;
    // Create display name from model ID (e.g., "gemini-2.5-flash" -> "Gemini 2.5 Flash")
    const shortName = model.replace('gemini-', '').split('-').map(
      (part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    ).join(' ');
    this.modelDisplayName = `Gemini ${shortName}`;
    this.name = this.modelDisplayName;

    // Initialize token stats with model info
    this.tokenStats = {
      promptTokens: 0,
      responseTokens: 0,
      thoughtTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundThoughtTokens: 0,
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
   * Update token stats from response metadata
   */
  private updateTokenStats(usageMetadata: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  } | undefined): void {
    if (!usageMetadata) return;

    const promptDelta = usageMetadata.promptTokenCount || 0;
    const responseDelta = usageMetadata.candidatesTokenCount || 0;
    const thoughtDelta = usageMetadata.thoughtsTokenCount || 0;
    const totalDelta = usageMetadata.totalTokenCount || 0;

    // Update cumulative stats
    this.tokenStats.promptTokens += promptDelta;
    this.tokenStats.responseTokens += responseDelta;
    this.tokenStats.thoughtTokens += thoughtDelta;
    this.tokenStats.totalTokens += totalDelta;
    this.tokenStats.cachedTokens += usageMetadata.cachedContentTokenCount || 0;
    this.tokenStats.requestCount += 1;

    // Update round-specific stats
    this.tokenStats.roundPromptTokens += promptDelta;
    this.tokenStats.roundResponseTokens += responseDelta;
    this.tokenStats.roundThoughtTokens += thoughtDelta;
    this.tokenStats.roundTotalTokens += totalDelta;
    this.tokenStats.roundRequestCount += 1;

    // Track last delta (timing added by updateTimingStats)
    this.lastDelta = {
      promptTokens: promptDelta,
      responseTokens: responseDelta,
      thoughtTokens: thoughtDelta,
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
      thoughtTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundThoughtTokens: 0,
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
      thoughtTokens: 0,
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
    this.tokenStats.roundThoughtTokens = 0;
    this.tokenStats.roundTotalTokens = 0;
    this.tokenStats.roundRequestCount = 0;
    this.tokenStats.roundTotalTimeMs = 0;
  }

  /**
   * Start a new round - create fresh chat session with JSON schema config.
   * Per-message thinkingConfig is applied in selectMove() based on settings.
   */
  startRound(): void {
    // Reset round-specific stats
    this.resetRoundStats();

    this.chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_MULTITURN,
        responseMimeType: 'application/json',
        responseJsonSchema: MOVE_JSON_SCHEMA,
      },
    });
    this.lastReasoning = '';
  }

  /**
   * End the current round
   */
  endRound(): void {
    this.chat = null;
  }

  /**
   * Select a move using Gemini AI with extended thinking
   * Uses dynamic thinking budget (-1) for multi-move turns, disabled (0) for single-move
   */
  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, table, player, validMoves } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    // Create chat session if not exists
    if (!this.chat) {
      this.startRound();
    }

    try {
      const prompt = buildTurnPrompt(context);
      const startTime = performance.now();

      const thinkingConfig = getMessageThinkingConfig(this.model, this.useThinking, validMoves.length > 1);

      const response = await this.chat!.sendMessage({
        message: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: MOVE_JSON_SCHEMA,
          thinkingConfig,
        },
      });

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usageMetadata);
      this.updateTimingStats(turnTime);

      const jsonText = response.text;
      if (!jsonText) {
        throw new Error('Empty response from AI');
      }

      const result = JSON.parse(jsonText);
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
      console.error(`[${this.model}] Error, falling back to random:`, error);
      this.lastReasoning = 'Error occurred, random fallback.';
      return randomAI.selectMove({ hand, table, player });
    }
  }
}

/**
 * Check if Gemini API key is available
 */
export function isGeminiAvailable(): boolean {
  return !!import.meta.env.VITE_GEMINI_API_KEY;
}

/**
 * Get the Gemini API key from environment
 */
export function getGeminiApiKey(): string | null {
  return import.meta.env.VITE_GEMINI_API_KEY || null;
}

/**
 * Create a Gemini AI player instance
 * @param model - Model ID to use
 * @param useThinking - Enable thinking/reasoning mode (default: true)
 */
export function createGeminiAI(model: string = DEFAULT_MODEL, useThinking: boolean = true): AsyncAIPlayer | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('Gemini API key not found. Set VITE_GEMINI_API_KEY in .env.local');
    return null;
  }
  return new GeminiAI(apiKey, model, useThinking);
}

// Cache instances by model ID + thinking mode (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get a Gemini AI instance (cached by model ID and thinking mode)
 * @param model - Model ID to use
 * @param useThinking - Enable thinking/reasoning mode (default: true)
 */
export function getGeminiAI(model: string = DEFAULT_MODEL, useThinking: boolean = true): AsyncAIPlayer | null {
  if (!isGeminiAvailable()) {
    return null;
  }

  // Cache key includes thinking mode
  const cacheKey = `${model}:${useThinking}`;
  const cached = instanceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Create and cache new instance
  const instance = createGeminiAI(model, useThinking);
  if (instance) {
    instanceCache.set(cacheKey, instance);
  }
  return instance;
}

/**
 * Get the default Gemini model ID
 */
export function getDefaultGeminiModel(): string {
  return DEFAULT_MODEL;
}

/**
 * Get token stats from a Gemini AI instance by model and thinking mode
 */
export function getGeminiTokenStats(model?: string, useThinking: boolean = true): GeminiTokenStats | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}`;
  const instance = instanceCache.get(cacheKey) as GeminiAI | null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from a Gemini AI instance by model and thinking mode
 */
export function getGeminiTokenDelta(model?: string, useThinking: boolean = true): GeminiTokenDelta | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}`;
  const instance = instanceCache.get(cacheKey) as GeminiAI | null;
  if (instance && 'lastDelta' in instance) {
    return { ...instance.lastDelta };
  }
  return null;
}

/**
 * Reset token stats on all cached Gemini AI instances
 */
export function resetGeminiTokenStats(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as GeminiAI;
    if ('resetTokenStats' in ai) {
      ai.resetTokenStats();
    }
  }
}

/**
 * Start a new round on all cached Gemini AI instances (creates fresh chat sessions)
 */
export function startGeminiRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as GeminiAI;
    if ('startRound' in ai) {
      ai.startRound();
    }
  }
}

/**
 * End the current round on all cached Gemini AI instances (clears chat sessions)
 */
export function endGeminiRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as GeminiAI;
    if ('endRound' in ai) {
      ai.endRound();
    }
  }
}
