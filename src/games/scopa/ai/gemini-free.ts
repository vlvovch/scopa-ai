// Gemini Free AI Player - Uses Cloudflare Worker proxy with rate limiting
// No API key required. Multi-turn with thinking, hardcoded model.

import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import type { GeminiTokenStats, GeminiTokenDelta } from './gemini';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';

const PROXY_URL = import.meta.env.VITE_PROXY_URL as string | undefined;
const MODEL = 'gemini-3-flash-preview';
const MODEL_DISPLAY_NAME = 'Gemini 3 Flash Preview';

// JSON schema for move selection response (same as other Gemini implementations)
const MOVE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    moveIndex: { type: 'integer', description: '0-based index of the selected move' },
    reasoning: { type: 'string', description: 'Brief explanation of why this move was chosen' },
  },
  required: ['moveIndex', 'reasoning'],
};

/** Content entry for multi-turn conversation history */
interface ContentEntry {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/** Error thrown when rate limit is exceeded */
export class RateLimitError extends Error {
  gamesUsed: number;
  gamesLimit: number;
  constructor(gamesUsed: number, gamesLimit: number) {
    super(`Daily game limit reached (${gamesUsed}/${gamesLimit}). Add your own API key in Settings for unlimited games.`);
    this.name = 'RateLimitError';
    this.gamesUsed = gamesUsed;
    this.gamesLimit = gamesLimit;
  }
}

/** Generate a simple game ID */
function generateGameId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Check if the free AI proxy is configured
 */
export function isGeminiFreeAvailable(): boolean {
  return !!PROXY_URL;
}

/**
 * Gemini Free AI Player using Cloudflare Worker proxy.
 * Multi-turn conversation: maintains chat history within each round.
 * Thinking enabled for strategic moves.
 */
class GeminiFreeAI implements AsyncAIPlayer {
  readonly name = `${MODEL_DISPLAY_NAME} (Free)`;
  readonly isAsync = true as const;

  private gameId: string;

  // Multi-turn conversation history for current round
  private conversationHistory: ContentEntry[] = [];

  public lastReasoning: string = '';
  public tokenStats: GeminiTokenStats;
  public lastDelta: GeminiTokenDelta = {
    promptTokens: 0,
    responseTokens: 0,
    thoughtTokens: 0,
    totalTokens: 0,
    turnTimeMs: 0,
  };

  // Rate limit info from last response
  public gamesUsed: number = 0;
  public gamesLimit: number = 3;

  constructor() {
    this.gameId = generateGameId();

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
      modelId: MODEL,
      modelDisplayName: MODEL_DISPLAY_NAME,
      totalTimeMs: 0,
      lastTurnTimeMs: 0,
      minTurnTimeMs: 0,
      maxTurnTimeMs: 0,
      roundTotalTimeMs: 0,
    };
  }

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

    this.tokenStats.promptTokens += promptDelta;
    this.tokenStats.responseTokens += responseDelta;
    this.tokenStats.thoughtTokens += thoughtDelta;
    this.tokenStats.totalTokens += totalDelta;
    this.tokenStats.cachedTokens += usageMetadata.cachedContentTokenCount || 0;
    this.tokenStats.requestCount += 1;

    this.tokenStats.roundPromptTokens += promptDelta;
    this.tokenStats.roundResponseTokens += responseDelta;
    this.tokenStats.roundThoughtTokens += thoughtDelta;
    this.tokenStats.roundTotalTokens += totalDelta;
    this.tokenStats.roundRequestCount += 1;

    this.lastDelta = {
      promptTokens: promptDelta,
      responseTokens: responseDelta,
      thoughtTokens: thoughtDelta,
      totalTokens: totalDelta,
      turnTimeMs: 0,
    };
  }

  private updateTimingStats(turnTimeMs: number): void {
    this.tokenStats.lastTurnTimeMs = turnTimeMs;
    this.tokenStats.totalTimeMs += turnTimeMs;
    this.tokenStats.roundTotalTimeMs += turnTimeMs;

    if (this.tokenStats.minTurnTimeMs === 0 || turnTimeMs < this.tokenStats.minTurnTimeMs) {
      this.tokenStats.minTurnTimeMs = turnTimeMs;
    }
    if (turnTimeMs > this.tokenStats.maxTurnTimeMs) {
      this.tokenStats.maxTurnTimeMs = turnTimeMs;
    }

    this.lastDelta.turnTimeMs = turnTimeMs;
  }

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
      modelId: MODEL,
      modelDisplayName: MODEL_DISPLAY_NAME,
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

  resetRoundStats(): void {
    this.tokenStats.roundPromptTokens = 0;
    this.tokenStats.roundResponseTokens = 0;
    this.tokenStats.roundThoughtTokens = 0;
    this.tokenStats.roundTotalTokens = 0;
    this.tokenStats.roundRequestCount = 0;
    this.tokenStats.roundTotalTimeMs = 0;
  }

  startRound(): void {
    this.resetRoundStats();
    this.conversationHistory = [];
    this.lastReasoning = '';
  }

  endRound(): void {
    this.conversationHistory = [];
  }

  /** Start a new game (generates new gameId for rate limiting) */
  newGame(): void {
    this.gameId = generateGameId();
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, validMoves } = context;

    if (hand.length === 0) {
      throw new Error('Cannot select move with empty hand');
    }

    if (validMoves.length === 0) {
      throw new Error('No valid moves available');
    }

    // If only one move, still send to API for context continuity in multi-turn
    // but use thinking disabled to save cost
    const hasMultipleMoves = validMoves.length > 1;

    if (!PROXY_URL) {
      throw new Error('Free AI proxy URL not configured');
    }

    try {
      const prompt = buildTurnPrompt(context);
      console.log(`[gemini-free] Prompt:\n`, prompt);
      const startTime = performance.now();

      // Add user message to conversation history
      const userMessage: ContentEntry = { role: 'user', parts: [{ text: prompt }] };
      const contentsToSend = [...this.conversationHistory, userMessage];

      const response = await fetch(`${PROXY_URL}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: SYSTEM_INSTRUCTION_MULTITURN,
          contents: contentsToSend,
          responseJsonSchema: MOVE_JSON_SCHEMA,
          gameId: this.gameId,
          useThinking: hasMultipleMoves,
        }),
      });

      const turnTime = performance.now() - startTime;

      if (response.status === 429) {
        const errorData = await response.json() as { gamesUsed: number; gamesLimit: number };
        this.gamesUsed = errorData.gamesUsed;
        this.gamesLimit = errorData.gamesLimit;
        throw new RateLimitError(errorData.gamesUsed, errorData.gamesLimit);
      }

      if (!response.ok) {
        const errorData = await response.json() as { error: string; message?: string };
        throw new Error(errorData.message || `Proxy error: ${errorData.error}`);
      }

      const data = await response.json() as {
        text: string;
        usageMetadata: Record<string, unknown>;
        gamesUsed: number;
        gamesLimit: number;
      };

      // Update rate limit info
      this.gamesUsed = data.gamesUsed;
      this.gamesLimit = data.gamesLimit;

      this.updateTokenStats(data.usageMetadata as {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
        cachedContentTokenCount?: number;
        thoughtsTokenCount?: number;
      });
      this.updateTimingStats(turnTime);

      console.log(`[gemini-free] Response:`, data.text);

      if (!data.text) {
        throw new Error('Empty response from AI');
      }

      // Append user message and model response to conversation history
      this.conversationHistory.push(userMessage);
      this.conversationHistory.push({ role: 'model', parts: [{ text: data.text }] });

      const result = JSON.parse(data.text);
      const index = result.moveIndex;
      this.lastReasoning = result.reasoning || '';

      if (typeof index === 'number' && index >= 0 && index < validMoves.length) {
        console.log(`[gemini-free] ${this.lastReasoning}`);
        return validMoves[index];
      }

      console.warn(`[gemini-free] Invalid moveIndex ${index}, using first valid move`);
      return validMoves[0];
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      console.error(`[gemini-free] API error:`, error);
      this.lastReasoning = 'API error occurred.';
      throw error;
    }
  }
}

// Per-seat instance map — spectator-mode with Free AI on both sides
// would otherwise share a single chat session and rate-limit counter.
// Each seat ('cpu' | 'p1' | 'p2') gets its own instance.
import type { Seat } from './types';

const instances = new Map<Seat, GeminiFreeAI>();

export function createGeminiFreeAI(): AsyncAIPlayer | null {
  if (!isGeminiFreeAvailable()) return null;
  return new GeminiFreeAI();
}

export function getGeminiFreeAI(seat: Seat = 'cpu'): AsyncAIPlayer | null {
  if (!isGeminiFreeAvailable()) return null;
  let inst = instances.get(seat);
  if (!inst) {
    inst = new GeminiFreeAI();
    instances.set(seat, inst);
  }
  return inst;
}

export function getGeminiFreeTokenStats(seat: Seat = 'cpu'): GeminiTokenStats | null {
  const inst = instances.get(seat);
  if (inst && 'tokenStats' in inst) {
    return { ...inst.tokenStats };
  }
  return null;
}

export function getGeminiFreeTokenDelta(seat: Seat = 'cpu'): GeminiTokenDelta | null {
  const inst = instances.get(seat);
  if (inst && 'lastDelta' in inst) {
    return { ...inst.lastDelta };
  }
  return null;
}

export function resetGeminiFreeTokenStats(): void {
  for (const inst of instances.values()) {
    if ('resetTokenStats' in inst) inst.resetTokenStats();
  }
}

export function startGeminiFreeRound(seat: Seat = 'cpu'): void {
  const inst = instances.get(seat);
  if (inst && 'startRound' in inst) {
    inst.startRound();
  }
}

export function endGeminiFreeRound(seat: Seat = 'cpu'): void {
  const inst = instances.get(seat);
  if (inst && 'endRound' in inst) {
    inst.endRound();
  }
}

/** Call when starting a new game to get a fresh gameId for rate limiting */
export function newGeminiFreeGame(seat: Seat = 'cpu'): void {
  instances.get(seat)?.newGame();
}

export function clearGeminiFreeCache(): void {
  instances.clear();
}

/** Get rate limit info from the free AI instance */
export function getGeminiFreeRateLimitInfo(
  seat: Seat = 'cpu'
): { gamesUsed: number; gamesLimit: number } | null {
  const inst = instances.get(seat);
  if (inst) {
    return { gamesUsed: inst.gamesUsed, gamesLimit: inst.gamesLimit };
  }
  return null;
}
