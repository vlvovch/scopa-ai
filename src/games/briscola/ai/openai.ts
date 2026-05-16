// OpenAI GPT bot for Briscola — uses OpenAI's Responses API with the
// `conversation` parameter so the server tracks history across turns
// (we just hand back the conversation id). Reuses Scopa's key + model-
// list machinery; only the prompts are Briscola-specific.

import OpenAI from 'openai';
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';
import {
  isOpenAIAvailable,
  fetchOpenAIModels,
  getCachedOpenAIModels,
  getOpenAIApiKey,
  type OpenAIModelInfo,
} from '../../scopa/ai/openai';
import type { GeminiTokenStats, GeminiTokenDelta } from '../../scopa/ai';
import { TokenTracker } from './tokenTracker';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

const MOVE_SCHEMA = {
  type: 'object' as const,
  properties: {
    moveIndex: { type: 'integer' as const },
    reasoning: { type: 'string' as const },
  },
  required: ['moveIndex', 'reasoning'] as const,
  additionalProperties: false,
};

function displayNameFor(modelId: string): string {
  // gpt-4o-mini → GPT 4o Mini, gpt-4-turbo → GPT 4 Turbo, etc.
  return modelId
    .replace(/^gpt-/i, 'GPT ')
    .split('-')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

class OpenAIBriscolaAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private client: OpenAI;
  private model: string;
  private conversationId: string | null = null;
  private tracker: TokenTracker;

  public lastReasoning: string = '';

  get tokenStats(): GeminiTokenStats {
    return this.tracker.stats;
  }
  get lastDelta(): GeminiTokenDelta {
    return this.tracker.lastDelta;
  }

  constructor(apiKey: string, model: string = DEFAULT_OPENAI_MODEL) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
    this.name = displayNameFor(model);
    this.tracker = new TokenTracker(model, this.name);
  }

  startRound(): void {
    this.conversationId = null;
    this.lastReasoning = '';
    this.tracker.resetRound();
  }

  endRound(): void {
    this.conversationId = null;
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, validMoves } = context;
    if (hand.length === 0) throw new Error('Cannot select move with empty hand');
    if (validMoves.length === 0) throw new Error('No valid moves available');
    if (validMoves.length === 1) {
      this.lastReasoning = 'Only one card in hand.';
      return validMoves[0];
    }

    const prompt = buildTurnPrompt(context);
    // eslint-disable-next-line no-console
    console.log(`[briscola ${this.model}] Prompt:\n`, prompt);

    try {
      const startTime = performance.now();
      const response = await this.client.responses.create({
        model: this.model,
        instructions: SYSTEM_INSTRUCTION_MULTITURN,
        input: prompt,
        conversation: this.conversationId ? { id: this.conversationId } : undefined,
        text: {
          format: {
            type: 'json_schema',
            name: 'move_selection',
            schema: MOVE_SCHEMA,
          },
        },
      });

      if (response.conversation?.id) this.conversationId = response.conversation.id;

      // OpenAI's usage shape: { input_tokens, output_tokens, total_tokens,
      // input_tokens_details: { cached_tokens }, output_tokens_details: { reasoning_tokens } }
      const usage = response.usage as {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
        output_tokens_details?: { reasoning_tokens?: number };
      } | undefined;
      this.tracker.recordTokens({
        promptTokens: usage?.input_tokens,
        responseTokens: usage?.output_tokens,
        thoughtTokens: usage?.output_tokens_details?.reasoning_tokens,
        totalTokens: usage?.total_tokens,
        cachedTokens: usage?.input_tokens_details?.cached_tokens,
      });
      this.tracker.recordTiming(performance.now() - startTime);

      const content = response.output_text;
      if (!content) {
        console.warn(`[briscola ${this.model}] Empty response, falling back.`);
        this.lastReasoning = 'Empty response — fell back to first valid move.';
        return validMoves[0];
      }

      try {
        const result = JSON.parse(content) as { moveIndex?: number; reasoning?: string };
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

const instances = new Map<string, OpenAIBriscolaAI>();

export function getOpenAIBriscolaAI(
  model: string = DEFAULT_OPENAI_MODEL
): OpenAIBriscolaAI | null {
  if (!isOpenAIAvailable()) return null;
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;
  let inst = instances.get(model);
  if (!inst) {
    inst = new OpenAIBriscolaAI(apiKey, model);
    instances.set(model, inst);
  }
  return inst;
}

export function clearOpenAICache(): void {
  instances.clear();
}

export function startOpenAIRound(model: string): void {
  instances.get(model)?.startRound();
}

export function endOpenAIRound(model: string): void {
  instances.get(model)?.endRound();
}

export function getOpenAIBriscolaTokenStats(model: string): GeminiTokenStats | null {
  return instances.get(model)?.tokenStats ?? null;
}

export function getOpenAIBriscolaTokenDelta(model: string): GeminiTokenDelta | null {
  return instances.get(model)?.lastDelta ?? null;
}

export {
  isOpenAIAvailable,
  fetchOpenAIModels,
  getCachedOpenAIModels,
};
export type { OpenAIModelInfo };
