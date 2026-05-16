// Gemini bot for Briscola — talks directly to the Google AI API with the
// user's own API key (no proxy, no daily quota). Multi-turn chat session
// per round; thinking enabled on non-trivial moves.
//
// Reuses Scopa's API-key + model-list plumbing — those are provider-wide,
// not game-specific. Only the prompts and the response handler are
// Briscola-specific.

import { GoogleGenAI, type Chat } from '@google/genai';
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';
import {
  getGeminiApiKey,
  isGeminiAvailable,
  fetchGeminiModels,
  getCachedGeminiModels,
  type GeminiModelInfo,
} from '../../scopa/ai/gemini';
import type { GeminiTokenStats, GeminiTokenDelta } from '../../scopa/ai';
import { TokenTracker } from './tokenTracker';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const MOVE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    moveIndex: { type: 'integer', description: '0-based index of the selected move' },
    reasoning: { type: 'string', description: 'Brief explanation of why this move was chosen' },
  },
  required: ['moveIndex', 'reasoning'],
};

/** Pro models can't fully disable thinking — they need a minimum budget. */
function isProModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('-pro');
}

function thinkingConfigFor(
  modelId: string,
  useThinking: boolean,
  hasMultipleMoves: boolean
): { thinkingBudget: number } {
  const budget =
    useThinking && hasMultipleMoves ? -1 : isProModel(modelId) ? 128 : 0;
  return { thinkingBudget: budget };
}

/** Derive a human-readable display name from a model id. */
function displayNameFor(modelId: string): string {
  const tail = modelId
    .replace(/^gemini-/, '')
    .split('-')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
  return `Gemini ${tail}`;
}

class GeminiBriscolaAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private ai: GoogleGenAI;
  private model: string;
  private useThinking: boolean;
  private chat: Chat | null = null;
  private tracker: TokenTracker;

  public lastReasoning: string = '';

  get tokenStats(): GeminiTokenStats {
    return this.tracker.stats;
  }
  get lastDelta(): GeminiTokenDelta {
    return this.tracker.lastDelta;
  }

  constructor(apiKey: string, model: string = DEFAULT_GEMINI_MODEL, useThinking = true) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    this.useThinking = useThinking;
    this.name = displayNameFor(model);
    this.tracker = new TokenTracker(model, this.name);
  }

  startRound(): void {
    this.chat = this.ai.chats.create({
      model: this.model,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_MULTITURN,
        responseMimeType: 'application/json',
        responseJsonSchema: MOVE_JSON_SCHEMA,
      },
    });
    this.lastReasoning = '';
    this.tracker.resetRound();
  }

  endRound(): void {
    this.chat = null;
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, validMoves } = context;
    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }
    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    // Single-card hands: skip the API roundtrip but keep chat history fresh
    // for context continuity in subsequent turns.
    if (validMoves.length === 1) {
      this.lastReasoning = 'Only one card in hand.';
      return validMoves[0];
    }

    if (!this.chat) this.startRound();

    const prompt = buildTurnPrompt(context);
    // eslint-disable-next-line no-console
    console.log(`[briscola ${this.model}] Prompt:\n`, prompt);

    try {
      const startTime = performance.now();
      const response = await this.chat!.sendMessage({
        message: prompt,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: MOVE_JSON_SCHEMA,
          thinkingConfig: thinkingConfigFor(this.model, this.useThinking, true),
        },
      });

      this.tracker.recordTokens({
        promptTokens: response.usageMetadata?.promptTokenCount,
        responseTokens: response.usageMetadata?.candidatesTokenCount,
        thoughtTokens: response.usageMetadata?.thoughtsTokenCount,
        totalTokens: response.usageMetadata?.totalTokenCount,
        cachedTokens: response.usageMetadata?.cachedContentTokenCount,
      });
      this.tracker.recordTiming(performance.now() - startTime);

      const jsonText = response.text;
      if (!jsonText) {
        console.warn(`[briscola ${this.model}] Empty response, falling back.`);
        this.lastReasoning = 'Empty response — fell back to first valid move.';
        return validMoves[0];
      }

      try {
        const result = JSON.parse(jsonText) as {
          moveIndex?: number;
          reasoning?: string;
        };
        this.lastReasoning = result.reasoning ?? '';
        const idx = result.moveIndex;
        if (typeof idx === 'number' && idx >= 0 && idx < validMoves.length) {
          // eslint-disable-next-line no-console
          console.log(`[briscola ${this.model}] move ${idx}: ${this.lastReasoning}`);
          return validMoves[idx];
        }
        console.warn(`[briscola ${this.model}] Invalid moveIndex ${idx}, falling back.`);
      } catch (e) {
        console.warn(`[briscola ${this.model}] JSON parse failed, falling back.`, e);
        this.lastReasoning = 'Parse error — fell back to first valid move.';
      }
      return validMoves[0];
    } catch (error) {
      console.error(`[briscola ${this.model}] API error:`, error);
      this.lastReasoning = 'API error occurred.';
      throw error;
    }
  }
}

// Cache instances keyed by (model, useThinking) so switching the model in
// Settings rebuilds the bot, but flipping back/forth doesn't lose context
// mid-match.
const instances = new Map<string, GeminiBriscolaAI>();

function cacheKey(model: string, useThinking: boolean): string {
  return `${model}::${useThinking ? '1' : '0'}`;
}

export function getGeminiBriscolaAI(
  model: string = DEFAULT_GEMINI_MODEL,
  useThinking = true
): GeminiBriscolaAI | null {
  if (!isGeminiAvailable()) return null;
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  const key = cacheKey(model, useThinking);
  let instance = instances.get(key);
  if (!instance) {
    instance = new GeminiBriscolaAI(apiKey, model, useThinking);
    instances.set(key, instance);
  }
  return instance;
}

export function clearGeminiCache(): void {
  instances.clear();
}

export function startGeminiRound(model: string, useThinking = true): void {
  instances.get(cacheKey(model, useThinking))?.startRound();
}

export function endGeminiRound(model: string, useThinking = true): void {
  instances.get(cacheKey(model, useThinking))?.endRound();
}

export function getGeminiBriscolaTokenStats(
  model: string,
  useThinking = true
): GeminiTokenStats | null {
  return instances.get(cacheKey(model, useThinking))?.tokenStats ?? null;
}

export function getGeminiBriscolaTokenDelta(
  model: string,
  useThinking = true
): GeminiTokenDelta | null {
  return instances.get(cacheKey(model, useThinking))?.lastDelta ?? null;
}

// Re-export the shared key/availability/model helpers so callers don't have
// to reach into Scopa's module path.
export {
  isGeminiAvailable,
  getGeminiApiKey,
  fetchGeminiModels,
  getCachedGeminiModels,
};
export type { GeminiModelInfo };
