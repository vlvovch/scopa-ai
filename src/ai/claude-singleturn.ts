// Claude Single-Turn AI Player - Uses single requests with full move history
// Unlike the multi-turn version, each request is independent and includes
// the complete round history in the prompt.

import Anthropic from '@anthropic-ai/sdk';
import type { Card, Move } from '../game/types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { randomAI } from './random';
import {
  getClaudeApiKey,
  isClaudeAvailable,
  type ClaudeTokenStats,
  type ClaudeTokenDelta,
} from './claude';
import { SYSTEM_INSTRUCTION_SINGLETURN, buildSingleTurnPrompt } from './prompts';

// Default model to use
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// Tool definition for structured output
const SELECT_MOVE_TOOL: Anthropic.Tool = {
  name: 'select_move',
  description: 'Select the best move from the valid moves list',
  input_schema: {
    type: 'object' as const,
    properties: {
      moveIndex: { type: 'integer', description: '0-based index of the selected move from the valid moves list' },
      reasoning: { type: 'string', description: 'Brief explanation of why this move was chosen' }
    },
    required: ['moveIndex', 'reasoning']
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

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({
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
    const { hand, table, player, validMoves, lastOpponentMove } = context;

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

      // Single request with full context (no conversation state)
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM_INSTRUCTION_SINGLETURN,
        tools: [SELECT_MOVE_TOOL],
        tool_choice: { type: 'tool', name: 'select_move' },
        messages: [{ role: 'user', content: prompt }]
      });

      const turnTime = performance.now() - startTime;
      this.updateTokenStats(response.usage);
      this.updateTimingStats(turnTime);

      // Extract tool use result
      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUse) {
        throw new Error('No tool use in response');
      }

      const input = toolUse.input as { moveIndex: number; reasoning: string };
      const index = input.moveIndex;
      this.lastReasoning = input.reasoning || '';

      console.log(`[${this.model}] Response: moveIndex=${index}, reasoning=${this.lastReasoning}`);

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
      console.error(`[${this.model}] Error, falling back to random:`, error);
      this.lastReasoning = 'Error occurred, random fallback.';
      const fallbackMove = randomAI.selectMove({ hand, table, player });
      this.roundMoveHistory.push(fallbackMove);
      return fallbackMove;
    }
  }
}

/**
 * Create a Claude Single-Turn AI player instance
 */
export function createClaudeSingleTurnAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    console.warn('Claude API key not found. Set VITE_CLAUDE_API_KEY in .env.local');
    return null;
  }
  return new ClaudeSingleTurnAI(apiKey, model);
}

// Cache instances by model ID (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get a Claude Single-Turn AI instance (cached by model ID)
 */
export function getClaudeSingleTurnAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  if (!isClaudeAvailable()) {
    return null;
  }

  // Return cached instance if exists for this model
  const cached = instanceCache.get(model);
  if (cached) {
    return cached;
  }

  // Create and cache new instance
  const instance = createClaudeSingleTurnAI(model);
  if (instance) {
    instanceCache.set(model, instance);
  }
  return instance;
}

/**
 * Get token stats from a Claude Single-Turn AI instance by model
 */
export function getClaudeSingleTurnTokenStats(model?: string): ClaudeTokenStats | null {
  const instance = model ? instanceCache.get(model) as ClaudeSingleTurnAI | null : null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from a Claude Single-Turn AI instance by model
 */
export function getClaudeSingleTurnTokenDelta(model?: string): ClaudeTokenDelta | null {
  const instance = model ? instanceCache.get(model) as ClaudeSingleTurnAI | null : null;
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
