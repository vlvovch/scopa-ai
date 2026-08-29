// Gemini bot for Briscola — talks directly to the Google AI API with the
// user's own API key (no proxy, no daily quota). Multi-turn chat session
// per round; thinking enabled on non-trivial moves.
//
// Reuses Scopa's API-key + model-list plumbing — those are provider-wide,
// not game-specific. Only the prompts and the response handler are
// Briscola-specific.

import { GoogleGenAI, ThinkingLevel, type Chat, type ThinkingConfig } from '@google/genai';
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import {
  SYSTEM_INSTRUCTION_MULTITURN,
  SYSTEM_INSTRUCTION_SINGLETURN,
  buildTurnPrompt,
  buildSingleTurnPrompt,
} from './prompts';

export type ConversationMode = 'multiturn' | 'singleturn';
import {
  getGeminiApiKey,
  isGeminiAvailable,
  fetchGeminiModels,
  getCachedGeminiModels,
  type GeminiModelInfo,
} from '../../scopa/ai/gemini';
import type { GeminiTokenStats, GeminiTokenDelta } from '../../../ai/tokenStats';
import { TokenTracker } from '../../../ai/tokenTracker';
import { MOVE_JSON_SCHEMA } from '../../../ai/moveSchema';
import type { Seat } from '../../../ai/seat';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

/** Pro models can't fully disable thinking — they need a minimum budget. */
function isProModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('-pro');
}

function thinkingConfigFor(
  modelId: string,
  useThinking: boolean,
  hasMultipleMoves: boolean
): ThinkingConfig {
  const think = useThinking && hasMultipleMoves;
  // Gemini 3+ takes thinkingLevel; thinkingBudget is the 2.5-era shape
  // (deprecated on 3.x, and mixing the two errors).
  const m = modelId.match(/gemini-(\d+)/);
  const major = m ? parseInt(m[1], 10) : 3;
  if (major >= 3) {
    return { thinkingLevel: think ? ThinkingLevel.HIGH : ThinkingLevel.MINIMAL };
  }
  return { thinkingBudget: think ? -1 : isProModel(modelId) ? 128 : 0 };
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
  private mode: ConversationMode;
  private chat: Chat | null = null;
  private tracker: TokenTracker;

  public lastReasoning: string = '';

  get tokenStats(): GeminiTokenStats {
    return this.tracker.stats;
  }
  get lastDelta(): GeminiTokenDelta {
    return this.tracker.lastDelta;
  }

  constructor(
    apiKey: string,
    model: string = DEFAULT_GEMINI_MODEL,
    useThinking = true,
    mode: ConversationMode = 'multiturn'
  ) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    this.useThinking = useThinking;
    this.mode = mode;
    this.name = displayNameFor(model);
    this.tracker = new TokenTracker(model, this.name);
  }

  startRound(): void {
    if (this.mode === 'multiturn') {
      this.chat = this.ai.chats.create({
        model: this.model,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_MULTITURN,
          responseMimeType: 'application/json',
          responseJsonSchema: MOVE_JSON_SCHEMA,
        },
      });
    } else {
      // single-turn keeps no per-round state
      this.chat = null;
    }
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

    if (this.mode === 'multiturn' && !this.chat) this.startRound();

    const prompt =
      this.mode === 'singleturn'
        ? buildSingleTurnPrompt(context)
        : buildTurnPrompt(context);
     
    console.log(`[briscola ${this.model}] Prompt:\n`, prompt);

    try {
      const startTime = performance.now();
      const response =
        this.mode === 'singleturn'
          ? await this.ai.models.generateContent({
              model: this.model,
              contents: prompt,
              config: {
                systemInstruction: SYSTEM_INSTRUCTION_SINGLETURN,
                responseMimeType: 'application/json',
                responseJsonSchema: MOVE_JSON_SCHEMA,
                thinkingConfig: thinkingConfigFor(
                  this.model,
                  this.useThinking,
                  true
                ),
              },
            })
          : await this.chat!.sendMessage({
              message: prompt,
              config: {
                responseMimeType: 'application/json',
                responseJsonSchema: MOVE_JSON_SCHEMA,
                thinkingConfig: thinkingConfigFor(
                  this.model,
                  this.useThinking,
                  true
                ),
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

export type { Seat } from '../../../ai/seat';

function cacheKey(
  model: string,
  useThinking: boolean,
  mode: ConversationMode,
  seat: Seat
): string {
  return `${model}::${useThinking ? '1' : '0'}::${mode}::${seat}`;
}

export function getGeminiBriscolaAI(
  model: string = DEFAULT_GEMINI_MODEL,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiBriscolaAI | null {
  if (!isGeminiAvailable()) return null;
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  const key = cacheKey(model, useThinking, mode, seat);
  let instance = instances.get(key);
  if (!instance) {
    instance = new GeminiBriscolaAI(apiKey, model, useThinking, mode);
    instances.set(key, instance);
  }
  return instance;
}

export function clearGeminiCache(): void {
  instances.clear();
}

export function startGeminiRound(
  model: string,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): void {
  instances.get(cacheKey(model, useThinking, mode, seat))?.startRound();
}

export function endGeminiRound(
  model: string,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): void {
  instances.get(cacheKey(model, useThinking, mode, seat))?.endRound();
}

export function getGeminiBriscolaTokenStats(
  model: string,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiTokenStats | null {
  return instances.get(cacheKey(model, useThinking, mode, seat))?.tokenStats ?? null;
}

export function getGeminiBriscolaTokenDelta(
  model: string,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiTokenDelta | null {
  return instances.get(cacheKey(model, useThinking, mode, seat))?.lastDelta ?? null;
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
