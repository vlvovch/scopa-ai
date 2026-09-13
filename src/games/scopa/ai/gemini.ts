// Gemini AI Player - Uses Google's Gemini API for intelligent play

import { registerApiKeyCacheClearer } from '../../../ai/apiKeyCaches';
import { GoogleGenAI, Chat, ThinkingLevel } from '@google/genai';
import { getAiThinkingLevel } from '../../../ai/effort';
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';
import { getGeminiApiKey, isGeminiAvailable, clearGeminiModelCache } from '../../../ai/geminiProvider';

// Provider plumbing (key availability, model list) lives in
// src/ai/geminiProvider.ts, shared with Briscola. Re-exported so the Scopa
// barrel and existing importers keep working.
export {
  fetchGeminiModels,
  getCachedGeminiModels,
  isGeminiAvailable,
  getGeminiApiKey,
} from '../../../ai/geminiProvider';
export type { GeminiModelInfo } from '../../../ai/geminiProvider';

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
  clearGeminiModelCache();
}
// Let the shared Settings modal drop these instances when the key changes
// without importing this module statically (keeps the code split intact).
registerApiKeyCacheClearer('gemini', clearGeminiCache);
