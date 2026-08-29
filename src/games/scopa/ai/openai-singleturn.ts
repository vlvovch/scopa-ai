// OpenAI Single-Turn AI Player - Uses single requests with full move history
// Unlike the multi-turn version, each request is independent and includes
// the complete round history in the prompt.

import OpenAI from 'openai';
import type { Card, Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import {
  getOpenAIApiKey,
  isOpenAIAvailable,
  type OpenAITokenStats,
  type OpenAITokenDelta,
} from './openai';
import { SYSTEM_INSTRUCTION_SINGLETURN, buildSingleTurnPrompt } from './prompts';

// Default model to use
const DEFAULT_MODEL = 'gpt-5-mini';

/**
 * Format model ID into display name
 */
function formatModelName(modelId: string): string {
  return modelId
    .replace(/^gpt-/i, 'GPT-')
    .replace(/^o(\d)/, 'O$1')
    .split('-')
    .map((part, i) => {
      if (i === 0) return part;
      if (part === 'mini') return 'Mini';
      if (part === 'nano') return 'Nano';
      if (part === 'pro') return 'Pro';
      if (part === 'turbo') return 'Turbo';
      if (/^\d{4}$/.test(part)) return '';
      if (/^\d{2}$/.test(part)) return '';
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * OpenAI Single-Turn AI Player using Responses API
 * Each request is independent - no conversation state maintained.
 * Full move history is included in each prompt.
 */
class OpenAISingleTurnAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private client: OpenAI;
  private model: string;
  private modelDisplayName: string;

  // Track moves for this round
  private roundMoveHistory: Move[] = [];
  // Track initial table cards for context
  private initialTable: Card[] = [];

  public lastReasoning: string = '';
  public tokenStats: OpenAITokenStats;
  public lastDelta: OpenAITokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    turnTimeMs: 0,
  };

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
    this.model = model;
    this.modelDisplayName = formatModelName(model);
    this.name = `${this.modelDisplayName} (1-turn)`;

    // Initialize token stats with model info
    this.tokenStats = {
      promptTokens: 0,
      responseTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundReasoningTokens: 0,
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
   * Update token stats from Responses API usage metadata
   */
  private updateTokenStats(usage: OpenAI.Responses.ResponseUsage | undefined): void {
    if (!usage) return;

    const promptDelta = usage.input_tokens || 0;
    const responseDelta = usage.output_tokens || 0;
    const reasoningDelta = usage.output_tokens_details?.reasoning_tokens || 0;
    const totalDelta = usage.total_tokens || 0;
    const cachedDelta = usage.input_tokens_details?.cached_tokens || 0;

    // Update cumulative stats
    this.tokenStats.promptTokens += promptDelta;
    this.tokenStats.responseTokens += responseDelta;
    this.tokenStats.reasoningTokens += reasoningDelta;
    this.tokenStats.totalTokens += totalDelta;
    this.tokenStats.cachedTokens += cachedDelta;
    this.tokenStats.requestCount += 1;

    // Update round-specific stats
    this.tokenStats.roundPromptTokens += promptDelta;
    this.tokenStats.roundResponseTokens += responseDelta;
    this.tokenStats.roundReasoningTokens += reasoningDelta;
    this.tokenStats.roundTotalTokens += totalDelta;
    this.tokenStats.roundRequestCount += 1;

    // Track last delta (timing added by updateTimingStats)
    this.lastDelta = {
      promptTokens: promptDelta,
      responseTokens: responseDelta,
      reasoningTokens: reasoningDelta,
      totalTokens: totalDelta,
      cachedTokens: cachedDelta,
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
      reasoningTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundReasoningTokens: 0,
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
      reasoningTokens: 0,
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
    this.tokenStats.roundReasoningTokens = 0;
    this.tokenStats.roundTotalTokens = 0;
    this.tokenStats.roundRequestCount = 0;
    this.tokenStats.roundTotalTimeMs = 0;
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
   * Select a move using OpenAI Responses API (single request with full history)
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
    if (this.roundMoveHistory.length === 0 && this.initialTable.length === 0) {
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
      this.lastDelta = {
        promptTokens: 0,
        responseTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        turnTimeMs: 0,
      };
      return onlyMove;
    }

    try {
      const prompt = buildSingleTurnPrompt(context, this.roundMoveHistory, this.initialTable);
      console.log(`[${this.model}] Prompt:\n`, prompt);
      const startTime = performance.now();

      // Single request with full context (no conversation state)
      const response = await this.client.responses.create({
        model: this.model,
        instructions: SYSTEM_INSTRUCTION_SINGLETURN,
        input: prompt,
        // No conversation parameter - each request is independent
        text: {
          format: {
            type: 'json_schema',
            name: 'move_selection',
            schema: {
              type: 'object',
              properties: {
                moveIndex: { type: 'integer' },
                reasoning: { type: 'string' }
              },
              required: ['moveIndex', 'reasoning'],
              additionalProperties: false
            }
          }
        }
      });

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usage);
      this.updateTimingStats(turnTime);

      const content = response.output_text;
      console.log(`[${this.model}] Response:`, content);

      if (!content) {
        throw new Error('Empty response from AI');
      }

      const result = JSON.parse(content);
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
 * Create an OpenAI Single-Turn AI player instance
 */
export function createOpenAISingleTurnAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    console.warn('OpenAI API key not found. Set VITE_OPENAI_API_KEY in .env.local');
    return null;
  }
  return new OpenAISingleTurnAI(apiKey, model);
}

// Cache instances by model ID (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get an OpenAI Single-Turn AI instance (cached by model ID)
 */
export function getOpenAISingleTurnAI(
  model: string = DEFAULT_MODEL,
  seat: import('./types').Seat = 'cpu'
): AsyncAIPlayer | null {
  if (!isOpenAIAvailable()) {
    return null;
  }

  const cacheKey = `${model}:${seat}`;
  const cached = instanceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const instance = createOpenAISingleTurnAI(model);
  if (instance) {
    instanceCache.set(cacheKey, instance);
  }
  return instance;
}

/**
 * Get token stats from an OpenAI Single-Turn AI instance by (model, seat)
 */
export function getOpenAISingleTurnTokenStats(
  model?: string,
  seat: import('./types').Seat = 'cpu'
): OpenAITokenStats | null {
  const instance = model
    ? (instanceCache.get(`${model}:${seat}`) as OpenAISingleTurnAI | null)
    : null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from an OpenAI Single-Turn AI instance by (model, seat)
 */
export function getOpenAISingleTurnTokenDelta(
  model?: string,
  seat: import('./types').Seat = 'cpu'
): OpenAITokenDelta | null {
  const instance = model
    ? (instanceCache.get(`${model}:${seat}`) as OpenAISingleTurnAI | null)
    : null;
  if (instance && 'lastDelta' in instance) {
    return { ...instance.lastDelta };
  }
  return null;
}

/**
 * Reset token stats on all cached OpenAI Single-Turn AI instances
 */
export function resetOpenAISingleTurnTokenStats(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as OpenAISingleTurnAI;
    if ('resetTokenStats' in ai) {
      ai.resetTokenStats();
    }
  }
}

/**
 * Start a new round on all cached OpenAI Single-Turn AI instances
 */
export function startOpenAISingleTurnRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as OpenAISingleTurnAI;
    if ('startRound' in ai) {
      ai.startRound();
    }
  }
}

/**
 * End the current round on all cached OpenAI Single-Turn AI instances
 */
export function endOpenAISingleTurnRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as OpenAISingleTurnAI;
    if ('endRound' in ai) {
      ai.endRound();
    }
  }
}

/**
 * Clear the OpenAI single-turn AI instance cache (call when API key changes)
 */
export function clearOpenAISingleTurnCache(): void {
  instanceCache.clear();
}
