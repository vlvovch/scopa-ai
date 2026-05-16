// Free Gemini bot for Briscola — talks to the same Cloudflare Worker
// proxy that Scopa uses (no API key needed, rate-limited per day by
// gameId). Multi-turn chat with thinking enabled on non-trivial moves.
//
// Mirrors src/games/scopa/ai/gemini-free.ts; the differences are the
// system instruction, the per-turn prompt format, and the JSON schema
// fields we care about — handled in ./prompts.ts.

import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { SYSTEM_INSTRUCTION_MULTITURN, buildTurnPrompt } from './prompts';

const PROXY_URL = import.meta.env.VITE_PROXY_URL as string | undefined;
const MODEL_DISPLAY_NAME = 'Gemini 3 Flash Preview';

const MOVE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    moveIndex: { type: 'integer', description: '0-based index of the selected move' },
    reasoning: { type: 'string', description: 'Brief explanation of why this move was chosen' },
  },
  required: ['moveIndex', 'reasoning'],
};

interface ContentEntry {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export class RateLimitError extends Error {
  gamesUsed: number;
  gamesLimit: number;
  constructor(gamesUsed: number, gamesLimit: number) {
    super(
      `Daily game limit reached (${gamesUsed}/${gamesLimit}). Add your own API key in Settings for unlimited games.`
    );
    this.name = 'RateLimitError';
    this.gamesUsed = gamesUsed;
    this.gamesLimit = gamesLimit;
  }
}

function generateGameId(): string {
  return `briscola-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isGeminiFreeAvailable(): boolean {
  return !!PROXY_URL;
}

class GeminiFreeBriscolaAI implements AsyncAIPlayer {
  readonly name = `${MODEL_DISPLAY_NAME} (Free)`;
  readonly isAsync = true as const;

  private gameId: string;
  private conversationHistory: ContentEntry[] = [];

  public lastReasoning: string = '';
  public gamesUsed: number = 0;
  public gamesLimit: number = 3;

  constructor() {
    this.gameId = generateGameId();
  }

  startRound(): void {
    this.conversationHistory = [];
    this.lastReasoning = '';
  }

  endRound(): void {
    this.conversationHistory = [];
  }

  /** Start a new game — generates a fresh gameId for rate limiting. */
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

    // If there's only one option, pick it locally — saves a round trip
    // and a quota charge, and preserves rate limit for real decisions.
    if (validMoves.length === 1) {
      this.lastReasoning = 'Only one card in hand.';
      return validMoves[0];
    }

    if (!PROXY_URL) {
      throw new Error('Free AI proxy URL not configured');
    }

    const prompt = buildTurnPrompt(context);

    // eslint-disable-next-line no-console
    console.log('[briscola gemini-free] Prompt:\n', prompt);

    const userMessage: ContentEntry = { role: 'user', parts: [{ text: prompt }] };
    const contentsToSend = [...this.conversationHistory, userMessage];

    let response: Response;
    try {
      response = await fetch(`${PROXY_URL}/api/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: SYSTEM_INSTRUCTION_MULTITURN,
          contents: contentsToSend,
          responseJsonSchema: MOVE_JSON_SCHEMA,
          gameId: this.gameId,
          useThinking: true,
        }),
      });
    } catch (e) {
      console.error('[briscola gemini-free] Network error:', e);
      this.lastReasoning = 'Network error.';
      throw e;
    }

    if (response.status === 429) {
      const errorData = (await response.json()) as {
        gamesUsed: number;
        gamesLimit: number;
      };
      this.gamesUsed = errorData.gamesUsed;
      this.gamesLimit = errorData.gamesLimit;
      throw new RateLimitError(errorData.gamesUsed, errorData.gamesLimit);
    }

    if (!response.ok) {
      const errorData = (await response.json()) as { error: string; message?: string };
      throw new Error(errorData.message || `Proxy error: ${errorData.error}`);
    }

    const data = (await response.json()) as {
      text: string;
      gamesUsed: number;
      gamesLimit: number;
    };

    this.gamesUsed = data.gamesUsed;
    this.gamesLimit = data.gamesLimit;

    if (!data.text) {
      console.warn('[briscola gemini-free] Empty response, falling back.');
      this.lastReasoning = 'Empty response — fell back to first valid move.';
      return validMoves[0];
    }

    // Commit the exchange to history before parsing so we keep context
    // even if the model returns something we have to fall back on.
    this.conversationHistory.push(userMessage);
    this.conversationHistory.push({ role: 'model', parts: [{ text: data.text }] });

    try {
      const result = JSON.parse(data.text) as { moveIndex?: number; reasoning?: string };
      this.lastReasoning = result.reasoning ?? '';
      const idx = result.moveIndex;
      if (typeof idx === 'number' && idx >= 0 && idx < validMoves.length) {
        // eslint-disable-next-line no-console
        console.log(`[briscola gemini-free] move ${idx}: ${this.lastReasoning}`);
        return validMoves[idx];
      }
      console.warn(`[briscola gemini-free] Invalid moveIndex ${idx}, falling back.`);
    } catch (e) {
      console.warn('[briscola gemini-free] JSON parse failed, falling back.', e);
      this.lastReasoning = 'Parse error — fell back to first valid move.';
    }
    return validMoves[0];
  }

  getRateLimitInfo(): { gamesUsed: number; gamesLimit: number } {
    return { gamesUsed: this.gamesUsed, gamesLimit: this.gamesLimit };
  }
}

let instance: GeminiFreeBriscolaAI | null = null;

export function getGeminiFreeBriscolaAI(): GeminiFreeBriscolaAI | null {
  if (!isGeminiFreeAvailable()) return null;
  if (!instance) instance = new GeminiFreeBriscolaAI();
  return instance;
}

export function startGeminiFreeRound(): void {
  instance?.startRound();
}

export function endGeminiFreeRound(): void {
  instance?.endRound();
}

export function newGeminiFreeGame(): void {
  instance?.newGame();
}

export function clearGeminiFreeCache(): void {
  instance = null;
}

export function getGeminiFreeRateLimitInfo(): { gamesUsed: number; gamesLimit: number } | null {
  return instance ? instance.getRateLimitInfo() : null;
}
