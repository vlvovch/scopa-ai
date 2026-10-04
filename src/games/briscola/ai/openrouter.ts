// OpenRouter bot for Briscola — one key, any model. Talks to OpenRouter's
// OpenAI-compatible chat completions through the shared client in
// src/ai/openrouterProvider.ts (never through Scopa's bot module — that
// would pull Scopa's bot into this build's main chunk); only the prompts
// and the move handling here are Briscola-specific.
//
// Multi-turn keeps the round's messages locally (chat completions have no
// server-side state); single-turn embeds the round history in each prompt.
//
// Lifecycle guard: every request belongs to the round it was made in. When
// the round or match moves on (startMatch / startRound / endRound / cancel)
// the in-flight fetch is aborted and a reply that still arrives is dropped
// before it can touch the new round's history or token totals.

import { registerApiKeyCacheClearer } from '../../../ai/apiKeyCaches';
import { getAiThinkingLevel } from '../../../ai/effort';
import { MOVE_JSON_SCHEMA } from '../../../ai/moveSchema';
import type { Seat } from '../../../ai/seat';
import type { GeminiTokenStats, GeminiTokenDelta } from '../../../ai/tokenStats';
import { TokenTracker } from '../../../ai/tokenTracker';
import {
  DEFAULT_OPENROUTER_MODEL,
  OpenRouterCancelledError,
  extractJsonObject,
  getOpenRouterApiKey,
  isOpenRouterAvailable,
  openRouterChat,
  openRouterModelDisplayName,
  fetchOpenRouterModels,
  getCachedOpenRouterModels,
  type OpenRouterMessage,
  type OpenRouterModelInfo,
} from '../../../ai/openrouterProvider';
import type { Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import type { ConversationMode } from './gemini';
import { heuristicAI } from './heuristic';
import {
  systemInstruction,
  buildTurnPrompt,
  buildSingleTurnPrompt,
} from './prompts';

export { DEFAULT_OPENROUTER_MODEL };

const MOVE_SCHEMA = {
  name: 'move_selection',
  schema: { ...MOVE_JSON_SCHEMA, additionalProperties: false } as Record<string, unknown>,
};

class OpenRouterBriscolaAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private apiKey: string;
  private model: string;
  private mode: ConversationMode;
  private messages: OpenRouterMessage[] = [];
  private tracker: TokenTracker;
  // Bumped whenever the state above is reset; a reply from an older epoch
  // is stale and must not be recorded.
  private epoch = 0;
  private inFlight: AbortController | null = null;

  public lastReasoning: string = '';
  /** The model's visible reasoning (when it returned any). */
  public lastThinking: string = '';
  /** The last move came from the heuristic because the model's answer was unusable. */
  public lastMoveWasFallback = false;
  /** The model that answered the last request when a router picked one (else undefined). */
  public lastServedModel: string | undefined;

  get tokenStats(): GeminiTokenStats {
    return this.tracker.stats;
  }
  get lastDelta(): GeminiTokenDelta {
    return this.tracker.lastDelta;
  }

  constructor(
    apiKey: string,
    model: string = DEFAULT_OPENROUTER_MODEL,
    mode: ConversationMode = 'multiturn'
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.mode = mode;
    this.name = openRouterModelDisplayName(model);
    this.tracker = new TokenTracker(model, this.name);
  }

  /** Abort the request in flight (if any) and invalidate its reply. */
  cancel(): void {
    this.epoch += 1;
    this.inFlight?.abort();
    this.inFlight = null;
  }

  /** A new match: the game totals start from zero again. */
  startMatch(): void {
    this.cancel();
    this.tracker = new TokenTracker(this.model, this.name);
  }

  startRound(): void {
    this.cancel();
    this.messages = [];
    this.lastReasoning = '';
    this.lastThinking = '';
    this.lastMoveWasFallback = false;
    this.lastServedModel = undefined;
    this.tracker.resetRound();
  }

  endRound(): void {
    this.cancel();
    this.messages = [];
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, validMoves } = context;
    if (hand.length === 0) throw new Error('Cannot select move with empty hand');
    if (validMoves.length === 0) throw new Error('No valid moves available');
    this.lastMoveWasFallback = false;
    if (validMoves.length === 1) {
      this.lastReasoning = 'Only one card in hand.';
      this.lastThinking = '';
      this.lastServedModel = undefined;
      return validMoves[0];
    }

    const prompt =
      this.mode === 'singleturn'
        ? buildSingleTurnPrompt(context)
        : buildTurnPrompt(context);

    if (this.mode === 'multiturn') this.messages.push({ role: 'user', content: prompt });
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.mode === 'singleturn' ? systemInstruction('singleturn') : systemInstruction('multiturn'),
      },
      ...(this.mode === 'multiturn' ? this.messages : [{ role: 'user' as const, content: prompt }]),
    ];

    // Only one request per instance is ever pending; a newer one supersedes.
    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;
    const epoch = this.epoch;
    const startTime = performance.now();
    let result;
    try {
      result = await openRouterChat(
        this.apiKey,
        { model: this.model, messages, schema: MOVE_SCHEMA, thinkingLevel: getAiThinkingLevel() },
        { signal: controller.signal }
      );
    } catch (error) {
      if (this.inFlight === controller) this.inFlight = null;
      if (epoch !== this.epoch || controller.signal.aborted) {
        // The round or match moved on while we waited: nothing to record.
        throw new OpenRouterCancelledError();
      }
      console.error(`[briscola openrouter ${this.model}] API error:`, error);
      // The question went unanswered: drop it so the history stays paired.
      if (this.mode === 'multiturn') this.messages.pop();
      this.lastReasoning = 'API error occurred.';
      this.lastThinking = '';
      throw error;
    }
    if (this.inFlight === controller) this.inFlight = null;
    if (epoch !== this.epoch) {
      // A reply for a round that is already over: it belongs to nobody now.
      throw new OpenRouterCancelledError();
    }
    this.tracker.recordTokens(result.usage);
    this.tracker.noteServedModel(result.model);
    this.tracker.recordTiming(performance.now() - startTime);
    this.lastServedModel = this.tracker.stats.servedModel;
    this.lastThinking = result.reasoning;

    const parsed = result.text ? extractJsonObject(result.text) : null;
    const index = parsed?.moveIndex;
    const valid =
      typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < validMoves.length;

    if (this.mode === 'multiturn') {
      this.messages.push({
        role: 'assistant',
        content: valid ? JSON.stringify({ moveIndex: index, reasoning: parsed?.reasoning ?? '' }) : '{}',
        ...(result.reasoningDetails ? { reasoning_details: result.reasoningDetails } : {}),
      });
    }

    if (valid) {
      this.lastReasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning : '';
      console.log(`[briscola openrouter ${this.model}] move ${index}: ${this.lastReasoning}`);
      return validMoves[index];
    }

    const why = !result.text
      ? 'No response'
      : parsed
        ? `Invalid moveIndex ${String(index)}`
        : 'Unparseable response';
    console.warn(`[briscola openrouter ${this.model}] ${why}, falling back.`);
    this.lastReasoning = `${why} — heuristic move played.`;
    this.lastMoveWasFallback = true;
    return heuristicAI.selectMove(context);
  }
}

const instances = new Map<string, OpenRouterBriscolaAI>();

function cacheKey(model: string, mode: ConversationMode, seat: Seat): string {
  return `${model}::${mode}::${seat}`;
}

export function getOpenRouterBriscolaAI(
  model: string = DEFAULT_OPENROUTER_MODEL,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): OpenRouterBriscolaAI | null {
  if (!isOpenRouterAvailable()) return null;
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) return null;
  const key = cacheKey(model, mode, seat);
  let inst = instances.get(key);
  if (!inst) {
    inst = new OpenRouterBriscolaAI(apiKey, model, mode);
    instances.set(key, inst);
  }
  return inst;
}

/**
 * Abort every request in flight and drop their replies (match abandoned,
 * game switch, unmount): a move for a match that no longer exists must not
 * land in the next one.
 */
export function cancelOpenRouterRequests(): void {
  for (const inst of instances.values()) inst.cancel();
}

export function clearOpenRouterCache(): void {
  cancelOpenRouterRequests();
  instances.clear();
}
// Let the shared Settings modal drop these instances when the key changes
// without importing this module statically (keeps the code split intact).
registerApiKeyCacheClearer('openrouter', clearOpenRouterCache);

/** A new match for this seat: game totals restart from zero. */
export function startOpenRouterMatch(
  model: string,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): void {
  instances.get(cacheKey(model, mode, seat))?.startMatch();
}

export function startOpenRouterRound(
  model: string,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): void {
  instances.get(cacheKey(model, mode, seat))?.startRound();
}

export function endOpenRouterRound(
  model: string,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): void {
  instances.get(cacheKey(model, mode, seat))?.endRound();
}

export function getOpenRouterBriscolaTokenStats(
  model: string,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiTokenStats | null {
  return instances.get(cacheKey(model, mode, seat))?.tokenStats ?? null;
}

export function getOpenRouterBriscolaTokenDelta(
  model: string,
  mode: ConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiTokenDelta | null {
  return instances.get(cacheKey(model, mode, seat))?.lastDelta ?? null;
}

export {
  isOpenRouterAvailable,
  fetchOpenRouterModels,
  getCachedOpenRouterModels,
};
export type { OpenRouterModelInfo };
