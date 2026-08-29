// Gemini Single-Turn AI Player - Uses single requests with full move history
// Unlike the multi-turn version, each request is independent and includes
// the complete round history in the prompt.

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getAiThinkingLevel } from '../../../ai/effort';
import type { Card, Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import {
  getGeminiApiKey,
  isGeminiAvailable,
  type GeminiTokenStats,
  type GeminiTokenDelta,
} from './gemini';
import { SYSTEM_INSTRUCTION_SINGLETURN, buildSingleTurnPrompt } from './prompts';
import { MOVE_JSON_SCHEMA } from '../../../ai/moveSchema';
import { TokenTracker } from '../../../ai/tokenTracker';

// Default model to use
const DEFAULT_MODEL = 'gemini-3.5-flash';

/** Pro models cannot fully disable thinking, require minimum budget */
function isProModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('-pro');
}

/**
 * Get generation config with JSON schema and thinking settings.
 * - Thinking enabled + multiple moves: dynamic budget (-1)
 * - Thinking disabled: 0 for Flash models, 128 for Pro models (minimum required)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGenerationConfig(modelId: string, useThinking: boolean, hasMultipleMoves: boolean): any {
  const think = useThinking && hasMultipleMoves;
  // Gemini 3+ takes thinkingLevel (HIGH on, LOW off — MINIMAL is rejected
  // by some 3.x models); thinkingBudget is the 2.5-era shape.
  const m = modelId.match(/gemini-(\d+)/);
  const major = m ? parseInt(m[1], 10) : 3;
  const knob = getAiThinkingLevel();
  const onLevel = knob === 'medium' ? ThinkingLevel.MEDIUM : ThinkingLevel.HIGH;
  const thinkingConfig =
    major >= 3
      ? { thinkingLevel: think ? onLevel : ThinkingLevel.LOW }
      : { thinkingBudget: think ? (knob === 'medium' ? 8192 : -1) : isProModel(modelId) ? 128 : 0 };

  return {
    responseJsonSchema: MOVE_JSON_SCHEMA,
    thinkingConfig,
  };
}

/**
 * Gemini Single-Turn AI Player using @google/genai SDK
 * Each request is independent - no chat session maintained.
 * Full move history is included in each prompt.
 */
class GeminiSingleTurnAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private ai: GoogleGenAI;
  private model: string;
  private modelDisplayName: string;
  private useThinking: boolean;

  // Track moves for this round
  private roundMoveHistory: Move[] = [];
  // Track initial table cards for context
  private initialTable: Card[] = [];

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
    this.name = `${this.modelDisplayName} (1-turn)`;
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
   * Start a new round - reset move history
   */
  startRound(): void {
    this.resetRoundStats();
    this.roundMoveHistory = [];
    this.initialTable = [];
    this.lastReasoning = '';
  }

  /**
   * End the current round
   */
  endRound(): void {
    this.roundMoveHistory = [];
    this.initialTable = [];
  }

  /**
   * Check if a move is already in history (by comparing card played)
   */
  private isInHistory(move: Move): boolean {
    return this.roundMoveHistory.some(
      m => m.cardPlayed.id === move.cardPlayed.id && m.player === move.player
    );
  }

  /**
   * Select a move using Gemini AI (single request with full history)
   */
  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, table, validMoves, lastOpponentMove } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    // Capture initial table on first move of the round
    // We need to reconstruct it from current table + any cards that have been captured/placed
    if (this.roundMoveHistory.length === 0 && this.initialTable.length === 0) {
      // First move - if there's no opponent move yet, current table IS the initial table
      // If opponent moved first, we need to reconstruct by adding back their played card (if placed)
      // or removing their captured cards (if captured)
      if (!lastOpponentMove) {
        // We are first to move - current table is initial table
        this.initialTable = [...table];
      } else {
        // Opponent moved first - reconstruct initial table
        if (lastOpponentMove.capturedCards.length === 0) {
          // Opponent placed a card - remove it from table to get initial
          this.initialTable = table.filter(c => c.id !== lastOpponentMove.cardPlayed.id);
        } else {
          // Opponent captured - add back captured cards to get initial
          this.initialTable = [...table, ...lastOpponentMove.capturedCards];
        }
      }
      console.log(`[${this.model}] Initial table:`, this.initialTable.map(c => c.id).join(', '));
    }

    // Add opponent's last move to history if not already tracked
    if (lastOpponentMove && !this.isInHistory(lastOpponentMove)) {
      this.roundMoveHistory.push(lastOpponentMove);
      console.log(`[${this.model}] Added opponent move to history:`, lastOpponentMove.cardPlayed.id);
    }

    console.log(`[${this.model}] Move history length:`, this.roundMoveHistory.length);

    // If only one move, just add it to history and return
    if (validMoves.length === 1) {
      const onlyMove = validMoves[0];
      this.roundMoveHistory.push(onlyMove);
      this.lastReasoning = 'Only one move available.';
      // Reset delta since no API call was made
      this.tracker.lastDelta = {
        promptTokens: 0,
        responseTokens: 0,
        thoughtTokens: 0,
        totalTokens: 0,
        turnTimeMs: 0,
      };
      return onlyMove;
    }

    try {
      const prompt = buildSingleTurnPrompt(context, this.roundMoveHistory, this.initialTable);
      console.log(`[${this.model}] Prompt:\n`, prompt);
      const startTime = performance.now();

      const generationConfig = getGenerationConfig(this.model, this.useThinking, validMoves.length > 1);

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_SINGLETURN,
          responseMimeType: 'application/json',
          ...generationConfig,
        },
      });

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usageMetadata);
      this.updateTimingStats(turnTime);

      const jsonText = response.text;
      console.log(`[${this.model}] Response:`, jsonText);

      if (!jsonText) {
        throw new Error('Empty response from AI');
      }

      const result = JSON.parse(jsonText);
      const index = result.moveIndex;
      this.lastReasoning = result.reasoning || '';

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        const selectedMove = validMoves[index];
        // Add our move to history
        this.roundMoveHistory.push(selectedMove);
        console.log(`[${this.model}] ${this.lastReasoning}`);
        return selectedMove;
      }

      console.warn(`[${this.model}] Invalid moveIndex ${index}, using first valid move`);
      const fallbackMove = validMoves[0];
      this.roundMoveHistory.push(fallbackMove);
      return fallbackMove;
    } catch (error) {
      console.error(`[${this.model}] API error:`, error);
      this.lastReasoning = 'API error occurred.';
      // Re-throw so App.tsx can catch and display error badge
      throw error;
    }
  }
}

/**
 * Create a Gemini Single-Turn AI player instance
 * @param model - Model ID to use
 * @param useThinking - Enable thinking/reasoning mode (default: true)
 */
export function createGeminiSingleTurnAI(model: string = DEFAULT_MODEL, useThinking: boolean = true): AsyncAIPlayer | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('Gemini API key not found. Set VITE_GEMINI_API_KEY in .env.local');
    return null;
  }
  return new GeminiSingleTurnAI(apiKey, model, useThinking);
}

// Cache instances by model ID + thinking mode (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get a Gemini Single-Turn AI instance (cached by model ID and thinking mode)
 * @param model - Model ID to use
 * @param useThinking - Enable thinking/reasoning mode (default: true)
 */
export function getGeminiSingleTurnAI(
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
  const instance = createGeminiSingleTurnAI(model, useThinking);
  if (instance) {
    instanceCache.set(cacheKey, instance);
  }
  return instance;
}

/**
 * Get token stats from a Gemini Single-Turn AI instance by model and thinking mode
 */
export function getGeminiSingleTurnTokenStats(
  model?: string,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): GeminiTokenStats | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}:${seat}`;
  const instance = instanceCache.get(cacheKey) as GeminiSingleTurnAI | null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from a Gemini Single-Turn AI instance by model and thinking mode
 */
export function getGeminiSingleTurnTokenDelta(
  model?: string,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): GeminiTokenDelta | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}:${seat}`;
  const instance = instanceCache.get(cacheKey) as GeminiSingleTurnAI | null;
  if (instance && 'lastDelta' in instance) {
    return { ...instance.lastDelta };
  }
  return null;
}

/**
 * Reset token stats on all cached Gemini Single-Turn AI instances
 */
export function resetGeminiSingleTurnTokenStats(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as GeminiSingleTurnAI;
    if ('resetTokenStats' in ai) {
      ai.resetTokenStats();
    }
  }
}

/**
 * Start a new round on all cached Gemini Single-Turn AI instances
 */
export function startGeminiSingleTurnRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as GeminiSingleTurnAI;
    if ('startRound' in ai) {
      ai.startRound();
    }
  }
}

/**
 * End the current round on all cached Gemini Single-Turn AI instances
 */
export function endGeminiSingleTurnRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as GeminiSingleTurnAI;
    if ('endRound' in ai) {
      ai.endRound();
    }
  }
}

/**
 * Clear the Gemini single-turn AI instance cache (call when API key changes)
 */
export function clearGeminiSingleTurnCache(): void {
  instanceCache.clear();
}
