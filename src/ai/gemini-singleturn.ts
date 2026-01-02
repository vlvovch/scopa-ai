// Gemini Single-Turn AI Player - Uses single requests with full move history
// Unlike the multi-turn version, each request is independent and includes
// the complete round history in the prompt.

import { GoogleGenAI, Type } from '@google/genai';
import type { Card, Move } from '../game/types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { randomAI } from './random';
import {
  getGeminiApiKey,
  isGeminiAvailable,
  type GeminiTokenStats,
  type GeminiTokenDelta,
} from './gemini';
import { SYSTEM_INSTRUCTION_SINGLETURN, buildSingleTurnPrompt } from './prompts';

// Default model to use
const DEFAULT_MODEL = 'gemini-2.5-flash';

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

  // Track moves for this round
  private roundMoveHistory: Move[] = [];
  // Track initial table cards for context
  private initialTable: Card[] = [];

  public lastReasoning: string = '';
  public tokenStats: GeminiTokenStats;
  public lastDelta: GeminiTokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    turnTimeMs: 0,
  };

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
    // Create display name from model ID (e.g., "gemini-2.5-flash" -> "Gemini 2.5 Flash")
    const shortName = model.replace('gemini-', '').split('-').map(
      (part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)
    ).join(' ');
    this.modelDisplayName = `Gemini ${shortName}`;
    this.name = `${this.modelDisplayName} (1-turn)`;

    // Initialize token stats with model info
    this.tokenStats = {
      promptTokens: 0,
      responseTokens: 0,
      thoughtTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundThoughtTokens: 0,
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
   * Update token stats from response metadata
   */
  private updateTokenStats(usageMetadata: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  } | undefined): void {
    if (!usageMetadata) return;

    const promptDelta = usageMetadata.promptTokenCount || 0;
    const responseDelta = usageMetadata.candidatesTokenCount || 0;
    const thoughtDelta = usageMetadata.thoughtsTokenCount || 0;
    const totalDelta = usageMetadata.totalTokenCount || 0;

    // Update cumulative stats
    this.tokenStats.promptTokens += promptDelta;
    this.tokenStats.responseTokens += responseDelta;
    this.tokenStats.thoughtTokens += thoughtDelta;
    this.tokenStats.totalTokens += totalDelta;
    this.tokenStats.cachedTokens += usageMetadata.cachedContentTokenCount || 0;
    this.tokenStats.requestCount += 1;

    // Update round-specific stats
    this.tokenStats.roundPromptTokens += promptDelta;
    this.tokenStats.roundResponseTokens += responseDelta;
    this.tokenStats.roundThoughtTokens += thoughtDelta;
    this.tokenStats.roundTotalTokens += totalDelta;
    this.tokenStats.roundRequestCount += 1;

    // Track last delta (timing added by updateTimingStats)
    this.lastDelta = {
      promptTokens: promptDelta,
      responseTokens: responseDelta,
      thoughtTokens: thoughtDelta,
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
      thoughtTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
      roundPromptTokens: 0,
      roundResponseTokens: 0,
      roundThoughtTokens: 0,
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
      thoughtTokens: 0,
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
    this.tokenStats.roundThoughtTokens = 0;
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
   * Select a move using Gemini AI (single request with full history)
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
      this.lastDelta = {
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

      // Single request with full context (no chat session)
      // Use dynamic thinking (-1) for better reasoning
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION_SINGLETURN,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              moveIndex: { type: Type.INTEGER },
              reasoning: { type: Type.STRING },
            },
            required: ['moveIndex', 'reasoning'],
          },
          thinkingConfig: {
            thinkingBudget: -1, // Dynamic thinking
          },
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
      console.error(`[${this.model}] Error, falling back to random:`, error);
      this.lastReasoning = 'Error occurred, random fallback.';
      const fallbackMove = randomAI.selectMove({ hand, table, player });
      this.roundMoveHistory.push(fallbackMove);
      return fallbackMove;
    }
  }
}

/**
 * Create a Gemini Single-Turn AI player instance
 */
export function createGeminiSingleTurnAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('Gemini API key not found. Set VITE_GEMINI_API_KEY in .env.local');
    return null;
  }
  return new GeminiSingleTurnAI(apiKey, model);
}

// Cache instances by model ID (supports multiple models in spectator mode)
const instanceCache = new Map<string, AsyncAIPlayer>();

/**
 * Get a Gemini Single-Turn AI instance (cached by model ID)
 */
export function getGeminiSingleTurnAI(model: string = DEFAULT_MODEL): AsyncAIPlayer | null {
  if (!isGeminiAvailable()) {
    return null;
  }

  // Return cached instance if exists for this model
  const cached = instanceCache.get(model);
  if (cached) {
    return cached;
  }

  // Create and cache new instance
  const instance = createGeminiSingleTurnAI(model);
  if (instance) {
    instanceCache.set(model, instance);
  }
  return instance;
}

/**
 * Get token stats from a Gemini Single-Turn AI instance by model
 */
export function getGeminiSingleTurnTokenStats(model?: string): GeminiTokenStats | null {
  const instance = model ? instanceCache.get(model) as GeminiSingleTurnAI | null : null;
  if (instance && 'tokenStats' in instance) {
    return { ...instance.tokenStats };
  }
  return null;
}

/**
 * Get last turn delta from a Gemini Single-Turn AI instance by model
 */
export function getGeminiSingleTurnTokenDelta(model?: string): GeminiTokenDelta | null {
  const instance = model ? instanceCache.get(model) as GeminiSingleTurnAI | null : null;
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
