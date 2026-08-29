// Gemini AI Player - Uses Google's Gemini API for intelligent play

import { GoogleGenAI, Chat, ThinkingLevel } from '@google/genai';
import { getAiThinkingLevel } from '../../../ai/effort';
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';
import { getGeminiApiKey, isGeminiKeyValid } from '../../../hooks/useSettings';

// Model info returned from API
export interface GeminiModelInfo {
  id: string;
  displayName: string;
}

export type { GeminiTokenStats, GeminiTokenDelta } from '../../../ai/tokenStats';
import type { GeminiTokenStats, GeminiTokenDelta } from '../../../ai/tokenStats';
import { MOVE_JSON_SCHEMA } from '../../../ai/moveSchema';
import { TokenTracker } from '../../../ai/tokenTracker';

// Default model to use
const DEFAULT_MODEL = 'gemini-3.5-flash';

/** Pro models cannot fully disable thinking, require minimum budget */
function isProModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('-pro');
}

/**
 * Get thinkingConfig for Gemini API requests, gated by model generation:
 * - Gemini 3+ uses thinkingLevel; thinkingBudget is deprecated there and
 *   mixing the two errors. Thinking on → HIGH, off → LOW. LOW (not
 *   MINIMAL) because supported levels vary per model: 3.7 Flash and
 *   3.1 Pro reject MINIMAL with a validation error, while LOW is
 *   documented across the whole 3.x family. 3.x can't fully disable.
 * - Gemini 2.5 uses thinkingBudget: -1 dynamic when thinking is on,
 *   0 = off for Flash, 128 minimum for Pro (cannot fully disable).
 * Unknown/alias ids (gemini-flash-latest) are treated as current-gen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMessageThinkingConfig(modelId: string, useThinking: boolean, hasMultipleMoves: boolean): any {
  const think = useThinking && hasMultipleMoves;
  const m = modelId.match(/gemini-(\d+)/);
  const major = m ? parseInt(m[1], 10) : 3;
  const knob = getAiThinkingLevel();
  if (major >= 3) {
    const onLevel = knob === 'medium' ? ThinkingLevel.MEDIUM : ThinkingLevel.HIGH;
    return { thinkingLevel: think ? onLevel : ThinkingLevel.LOW };
  }
  const thinkingBudget = think ? (knob === 'medium' ? 8192 : -1) : isProModel(modelId) ? 128 : 0;
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
        { id: 'gemini-3.7-flash', displayName: 'gemini-3.7-flash' },
        { id: 'gemini-3.5-flash', displayName: 'gemini-3.5-flash' },
        { id: 'gemini-3.1-flash-lite', displayName: 'gemini-3.1-flash-lite' },
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
  private tracker: TokenTracker;
  get tokenStats(): GeminiTokenStats { return this.tracker.stats; }
  get lastDelta(): GeminiTokenDelta { return this.tracker.lastDelta; }

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
    this.tracker = new TokenTracker(model, this.modelDisplayName);
  }

  private updateTokenStats(usageMetadata: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  } | undefined): void {
    if (!usageMetadata) return;
    this.tracker.recordTokens({
      promptTokens: usageMetadata.promptTokenCount,
      responseTokens: usageMetadata.candidatesTokenCount,
      thoughtTokens: usageMetadata.thoughtsTokenCount,
      totalTokens: usageMetadata.totalTokenCount,
      cachedTokens: usageMetadata.cachedContentTokenCount,
    });
  }

  private updateTimingStats(turnTimeMs: number): void {
    this.tracker.recordTiming(turnTimeMs);
  }

  resetTokenStats(): void {
    this.tracker = new TokenTracker(this.model, this.modelDisplayName);
  }

  resetRoundStats(): void {
    this.tracker.resetRound();
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
    const { hand, validMoves } = context;

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
      console.error(`[${this.model}] API error:`, error);
      this.lastReasoning = 'API error occurred.';
      // Re-throw so App.tsx can catch and display error badge
      throw error;
    }
  }
}

/**
 * Check if Gemini API key is available AND valid
 */
export function isGeminiAvailable(): boolean {
  return !!getGeminiApiKey() && isGeminiKeyValid();
}

// Re-export for backwards compatibility
export { getGeminiApiKey };

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
export function getGeminiAI(
  model: string = DEFAULT_MODEL,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): AsyncAIPlayer | null {
  if (!isGeminiAvailable()) {
    return null;
  }

  // Cache key includes thinking mode AND seat — spectator-mode same-model
  // self-play needs distinct instances so chat sessions don't intermix.
  const cacheKey = `${model}:${useThinking}:${seat}`;
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
export function getGeminiTokenStats(
  model?: string,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): GeminiTokenStats | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}:${seat}`;
  const instance = instanceCache.get(cacheKey) as GeminiAI | null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from a Gemini AI instance by model and thinking mode
 */
export function getGeminiTokenDelta(
  model?: string,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): GeminiTokenDelta | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}:${seat}`;
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

/**
 * Clear the Gemini AI instance cache (call when API key changes)
 */
export function clearGeminiCache(): void {
  instanceCache.clear();
  cachedModels = null;
}
