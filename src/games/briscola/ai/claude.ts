// Claude bot for Briscola — uses Anthropic's Messages API with locally
// managed history (the SDK doesn't have a server-side conversation
// concept like OpenAI's). Reuses Scopa's key + model-list machinery;
// only the prompts are Briscola-specific.

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import {
  SYSTEM_INSTRUCTION_MULTITURN,
  SYSTEM_INSTRUCTION_SINGLETURN,
  buildTurnPrompt,
  buildSingleTurnPrompt,
} from './prompts';
import type { ConversationMode } from './gemini';
import type { Seat } from '../../../ai/seat';
import {
  isClaudeAvailable,
  fetchClaudeModels,
  getCachedClaudeModels,
  getClaudeApiKey,
  isAdaptiveThinkingModel,
  type ClaudeModelInfo,
} from '../../scopa/ai/claude';
import type { GeminiTokenStats, GeminiTokenDelta } from '../../../ai/tokenStats';
import { TokenTracker } from '../../../ai/tokenTracker';

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

const EXTENDED_THINKING_BUDGET = 10000;

const MOVE_OUTPUT_SCHEMA = {
  type: 'json_schema' as const,
  schema: {
    type: 'object' as const,
    properties: {
      moveIndex: {
        type: 'integer' as const,
        description: '0-based index of the selected move from the valid moves list',
      },
      reasoning: {
        type: 'string' as const,
        description: 'Brief explanation of why this move was chosen',
      },
    },
    required: ['moveIndex', 'reasoning'] as const,
    additionalProperties: false,
  },
};

function displayNameFor(modelId: string): string {
  // claude-sonnet-4-5-20250929 → Claude Sonnet 4.5
  const noDate = modelId.replace(/-\d{8}$/, '');
  return noDate
    .split('-')
    .map((part, i) => {
      if (i === 0) return 'Claude';
      if (part === 'claude') return '';
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .filter(Boolean)
    .join(' ')
    .replace(/(\d) (\d)/g, '$1.$2');
}

class ClaudeBriscolaAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private client: Anthropic;
  private model: string;
  private useExtendedThinking: boolean;
  private mode: ConversationMode;
  private messages: MessageParam[] = [];
  private tracker: TokenTracker;

  public lastReasoning: string = '';
  public lastThinking: string = '';

  get tokenStats(): GeminiTokenStats {
    return this.tracker.stats;
  }
  get lastDelta(): GeminiTokenDelta {
    return this.tracker.lastDelta;
  }

  constructor(
    apiKey: string,
    model: string = DEFAULT_CLAUDE_MODEL,
    useExtendedThinking = true,
    mode: ConversationMode = 'multiturn'
  ) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
    this.useExtendedThinking = useExtendedThinking;
    this.mode = mode;
    this.name = displayNameFor(model);
    this.tracker = new TokenTracker(model, this.name);
  }

  startRound(): void {
    this.messages = [];
    this.lastReasoning = '';
    this.lastThinking = '';
    this.tracker.resetRound();
  }

  endRound(): void {
    this.messages = [];
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, validMoves } = context;
    if (hand.length === 0) throw new Error('Cannot select move with empty hand');
    if (validMoves.length === 0) throw new Error('No valid moves available');
    if (validMoves.length === 1) {
      this.lastReasoning = 'Only one card in hand.';
      return validMoves[0];
    }

    const prompt =
      this.mode === 'singleturn'
        ? buildSingleTurnPrompt(context)
        : buildTurnPrompt(context);
     
    console.log(`[briscola ${this.model}] Prompt:\n`, prompt);

    // single-turn rebuilds the message list from just this prompt each call;
    // multi-turn appends to the accumulated history.
    const messagesForCall: MessageParam[] =
      this.mode === 'singleturn'
        ? [{ role: 'user', content: prompt }]
        : (this.messages.push({ role: 'user', content: prompt }), this.messages);

    const shouldThink = this.useExtendedThinking;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestParams: any = {
      model: this.model,
      max_tokens: shouldThink ? 16000 : 1024,
      system:
        this.mode === 'singleturn'
          ? SYSTEM_INSTRUCTION_SINGLETURN
          : SYSTEM_INSTRUCTION_MULTITURN,
      output_format: MOVE_OUTPUT_SCHEMA,
      messages: messagesForCall,
      betas: ['structured-outputs-2025-11-13'],
    };

    if (shouldThink) {
      if (isAdaptiveThinkingModel(this.model)) {
        requestParams.thinking = { type: 'adaptive' };
        requestParams.output_config = { effort: 'high' };
      } else {
        requestParams.thinking = {
          type: 'enabled',
          budget_tokens: EXTENDED_THINKING_BUDGET,
        };
      }
    }

    try {
      const startTime = performance.now();
      const response = await this.client.beta.messages.create(requestParams);

      // Anthropic usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }
      // Extended-thinking tokens are part of output_tokens; the SDK exposes
      // them in `thinking` content blocks but not as a separate count.
      const usage = response.usage;
      const thinkingTokens = response.content
        .filter((b): b is Anthropic.ThinkingBlock => b.type === 'thinking')
        .reduce((sum, b) => sum + Math.ceil(b.thinking.length / 4), 0); // rough estimate
      this.tracker.recordTokens({
        promptTokens: usage?.input_tokens,
        responseTokens: usage?.output_tokens,
        thoughtTokens: thinkingTokens,
        totalTokens:
          (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
        cachedTokens: usage?.cache_read_input_tokens ?? undefined,
      });
      this.tracker.recordTiming(performance.now() - startTime);

      const thinkingBlocks = response.content.filter(
        (b): b is Anthropic.ThinkingBlock => b.type === 'thinking'
      );
      this.lastThinking = thinkingBlocks.map((b) => b.thinking).join('\n');

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text'
      );

      if (!textBlock) {
        console.warn(`[briscola ${this.model}] No text in response, falling back.`);
        if (this.mode === 'multiturn') {
          this.messages.push({ role: 'assistant', content: '{}' });
        }
        this.lastReasoning = 'No text in response — fell back to first valid move.';
        return validMoves[0];
      }

      if (this.mode === 'multiturn') {
        this.messages.push({ role: 'assistant', content: textBlock.text });
      }

      try {
        const parsed = JSON.parse(textBlock.text) as {
          moveIndex?: number;
          reasoning?: string;
        };
        this.lastReasoning = parsed.reasoning ?? '';
        const idx = parsed.moveIndex;
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

const instances = new Map<string, ClaudeBriscolaAI>();

function cacheKey(
  model: string,
  useThinking: boolean,
  mode: ConversationMode,
  seat: Seat
): string {
  return `${model}::${useThinking ? '1' : '0'}::${mode}::${seat}`;
}

export function getClaudeBriscolaAI(
  model: string = DEFAULT_CLAUDE_MODEL,
  useExtendedThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): ClaudeBriscolaAI | null {
  if (!isClaudeAvailable()) return null;
  const apiKey = getClaudeApiKey();
  if (!apiKey) return null;
  const key = cacheKey(model, useExtendedThinking, mode, seat);
  let inst = instances.get(key);
  if (!inst) {
    inst = new ClaudeBriscolaAI(apiKey, model, useExtendedThinking, mode);
    instances.set(key, inst);
  }
  return inst;
}

export function clearClaudeCache(): void {
  instances.clear();
}

export function startClaudeRound(
  model: string,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): void {
  instances.get(cacheKey(model, useThinking, mode, seat))?.startRound();
}

export function endClaudeRound(
  model: string,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): void {
  instances.get(cacheKey(model, useThinking, mode, seat))?.endRound();
}

export function getClaudeBriscolaTokenStats(
  model: string,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiTokenStats | null {
  return instances.get(cacheKey(model, useThinking, mode, seat))?.tokenStats ?? null;
}

export function getClaudeBriscolaTokenDelta(
  model: string,
  useThinking = true,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiTokenDelta | null {
  return instances.get(cacheKey(model, useThinking, mode, seat))?.lastDelta ?? null;
}

export {
  isClaudeAvailable,
  fetchClaudeModels,
  getCachedClaudeModels,
};
export type { ClaudeModelInfo };
