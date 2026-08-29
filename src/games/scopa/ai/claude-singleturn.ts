// Claude Single-Turn AI Player - Uses single requests with full move history
// Unlike the multi-turn version, each request is independent and includes
// the complete round history in the prompt.

import Anthropic from '@anthropic-ai/sdk';
import type { Card, Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import {
  getClaudeApiKey,
  isClaudeAvailable,
  isAdaptiveThinkingModel,
  isAlwaysThinkingModel,
  type ClaudeTokenStats,
  type ClaudeTokenDelta,
} from './claude';
import { SYSTEM_INSTRUCTION_SINGLETURN, buildSingleTurnPrompt } from './prompts';
import { heuristicAI } from './heuristic';
import { getAiThinkingLevel } from '../../../ai/effort';

// Default model to use
const DEFAULT_MODEL = 'claude-sonnet-5';

// JSON schema for structured output using output_format
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
 */
function formatModelName(modelId: string): string {
  // Remove date suffix if present
  const withoutDate = modelId.replace(/-\d{8}$/, '');

  return withoutDate
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

/**
 * Claude Single-Turn AI Player using Messages API
 * Each request is independent - no conversation state maintained.
 * Full move history is included in each prompt.
 */
class ClaudeSingleTurnAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private client: Anthropic;
  private model: string;
  private modelDisplayName: string;
  private useExtendedThinking: boolean;

  // Track moves for this round
  private roundMoveHistory: Move[] = [];
  // Track initial table cards for context
  private initialTable: Card[] = [];

  public lastReasoning: string = '';
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
    this.useExtendedThinking = useExtendedThinking;
    this.name = `${this.modelDisplayName} (1-turn)`;

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
      cachedTokens: cachedDelta,
      cacheCreationTokens: cacheCreationDelta,
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
   * Select a move using Claude Messages API (single request with full history)
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
        totalTokens: 0,
        turnTimeMs: 0,
      };
      return onlyMove;
    }

    try {
      const prompt = buildSingleTurnPrompt(context, this.roundMoveHistory, this.initialTable);
      console.log(`[${this.model}] Prompt:\n`, prompt);
      const startTime = performance.now();

      // Single request with full context using structured outputs (beta)
      // Extended thinking enabled when useExtendedThinking is true and multiple moves available
      // 5-family models think even when the param is omitted — "off"
      // there is adaptive at effort 'low' (and needs thinking headroom).
      const alwaysThinks = isAlwaysThinkingModel(this.model);
      const shouldThink = (this.useExtendedThinking || alwaysThinks) && validMoves.length > 1;

      // Build API request parameters using structured outputs
      // (GA via output_config.format; output_format is deprecated)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestParams: any = {
        model: this.model,
        max_tokens: shouldThink ? 16000 : 1024,
        system: SYSTEM_INSTRUCTION_SINGLETURN,
        output_config: { format: MOVE_OUTPUT_SCHEMA },
        messages: [{ role: 'user', content: prompt }],
      };

      // Add extended thinking if enabled and there's a decision to make
      if (shouldThink) {
        if (isAdaptiveThinkingModel(this.model)) {
          // 4.6+ and the 5-family: adaptive thinking; explicit display
          // (the default is 'omitted' since Opus 4.7)
          requestParams.thinking = { type: 'adaptive', display: 'summarized' };
          requestParams.output_config.effort = !this.useExtendedThinking
            ? 'low'
            : getAiThinkingLevel() === 'medium' ? 'medium' : 'high';
        } else {
          // Older models: Use manual thinking with budget_tokens
          requestParams.thinking = {
            type: 'enabled',
            budget_tokens: getAiThinkingLevel() === 'medium' ? 4000 : 10000,
          };
        }
      }

      const response = await this.client.messages.create(requestParams);

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usage);
      this.updateTimingStats(turnTime);

      const heuristicFallback = (reason: string): Move => {
        console.warn(`[${this.model}] ${reason}, using heuristic move`);
        this.lastReasoning = `${reason} — heuristic move played.`;
        const move = heuristicAI.selectMove(context);
        this.roundMoveHistory.push(move);
        return move;
      };

      // Safety refusal (HTTP 200 + stop_reason 'refusal' on current
      // models): don't crash the game — play the heuristic move.
      if (response.stop_reason === 'refusal') {
        return heuristicFallback('Refusal stop reason');
      }

      // Extract text block with JSON response
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );

      if (!textBlock) {
        return heuristicFallback('No text in response');
      }

      // Parse JSON from text response (schema-enforced, but a malformed
      // response should degrade to the heuristic, not crash the game)
      let parsed: { moveIndex?: number; reasoning?: string };
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        return heuristicFallback('Unparseable response');
      }
      const index = parsed.moveIndex;
      this.lastReasoning = parsed.reasoning || '';

      console.log(`[${this.model}] Response: moveIndex=${index}, reasoning=${this.lastReasoning}`);

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        const selectedMove = validMoves[index];
        // Add our move to history
        this.roundMoveHistory.push(selectedMove);
        console.log(`[${this.model}] ${this.lastReasoning}`);
        return selectedMove;
      }

      return heuristicFallback(`Invalid moveIndex ${index}`);
    } catch (error) {
      console.error(`[${this.model}] API error:`, error);
      this.lastReasoning = 'API error occurred.';
      // Re-throw so App.tsx can catch and display error badge
      throw error;
    }
  }
}

/**
 * Create a Claude Single-Turn AI player instance
 * @param model - Model ID to use
 * @param useExtendedThinking - Enable extended thinking (default: true)
 */
export function createClaudeSingleTurnAI(model: string = DEFAULT_MODEL, useExtendedThinking: boolean = true): AsyncAIPlayer | null {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    console.warn('Claude API key not found. Set VITE_CLAUDE_API_KEY in .env.local');
    return null;
  }
  return new ClaudeSingleTurnAI(apiKey, model, useExtendedThinking);
}

// Cache instances by model ID + thinking mode (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get a Claude Single-Turn AI instance (cached by model ID and thinking mode)
 * @param model - Model ID to use
 * @param useExtendedThinking - Enable extended thinking (default: true)
 */
export function getClaudeSingleTurnAI(
  model: string = DEFAULT_MODEL,
  useExtendedThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): AsyncAIPlayer | null {
  if (!isClaudeAvailable()) {
    return null;
  }

  const cacheKey = `${model}:${useExtendedThinking}:${seat}`;
  const cached = instanceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const instance = createClaudeSingleTurnAI(model, useExtendedThinking);
  if (instance) {
    instanceCache.set(cacheKey, instance);
  }
  return instance;
}

/**
 * Get token stats from a Claude Single-Turn AI instance by (model, thinking, seat)
 */
export function getClaudeSingleTurnTokenStats(
  model?: string,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): ClaudeTokenStats | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}:${seat}`;
  const instance = instanceCache.get(cacheKey) as ClaudeSingleTurnAI | null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from a Claude Single-Turn AI instance by (model, thinking, seat)
 */
export function getClaudeSingleTurnTokenDelta(
  model?: string,
  useThinking: boolean = true,
  seat: import('./types').Seat = 'cpu'
): ClaudeTokenDelta | null {
  if (!model) return null;
  const cacheKey = `${model}:${useThinking}:${seat}`;
  const instance = instanceCache.get(cacheKey) as ClaudeSingleTurnAI | null;
  if (instance && 'lastDelta' in instance) {
    return { ...instance.lastDelta };
  }
  return null;
}

/**
 * Reset token stats on all cached Claude Single-Turn AI instances
 */
export function resetClaudeSingleTurnTokenStats(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as ClaudeSingleTurnAI;
    if ('resetTokenStats' in ai) {
      ai.resetTokenStats();
    }
  }
}

/**
 * Start a new round on all cached Claude Single-Turn AI instances
 */
export function startClaudeSingleTurnRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as ClaudeSingleTurnAI;
    if ('startRound' in ai) {
      ai.startRound();
    }
  }
}

/**
 * End the current round on all cached Claude Single-Turn AI instances
 */
export function endClaudeSingleTurnRound(): void {
  for (const instance of instanceCache.values()) {
    const ai = instance as ClaudeSingleTurnAI;
    if ('endRound' in ai) {
      ai.endRound();
    }
  }
}

/**
 * Clear the Claude single-turn AI instance cache (call when API key changes)
 */
export function clearClaudeSingleTurnCache(): void {
  instanceCache.clear();
}
