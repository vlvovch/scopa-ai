// OpenRouter bot for Scopa — one key, any model. Talks to OpenRouter's
// OpenAI-compatible chat completions through the shared client in
// src/ai/openrouterProvider.ts (never through Briscola's bot module — that
// would pull it into this build's main chunk); only the prompts, the move
// handling and the fallbacks here are Scopa-specific.
//
// Both conversation modes live in this one class (the other Scopa providers
// split them into two modules): multi-turn keeps the round's messages
// locally — chat completions have no server-side state — and single-turn
// sends the full round history in every request.
//
// Lifecycle guard: every request belongs to the round it was made in. When
// the round or game moves on (startRound / endRound / resetTokenStats /
// cancel) the in-flight fetch is aborted and a reply that still arrives is
// dropped before it can touch the new round's history or token totals.

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
  type OpenRouterMessage,
} from '../../../ai/openrouterProvider';
import type { Card, Move } from '../types';
import type { AsyncAIPlayer, LLMAIContext } from './types';
import { heuristicAI } from './heuristic';
import {
  SYSTEM_INSTRUCTION_MULTITURN,
  SYSTEM_INSTRUCTION_SINGLETURN,
  buildTurnPrompt,
  buildSingleTurnPrompt,
} from './prompts';

// Provider plumbing (key availability, model catalogue) lives in
// src/ai/openrouterProvider.ts, shared with Briscola. Re-exported so the
// Scopa barrel keeps one import path per provider.
export {
  fetchOpenRouterModels,
  getCachedOpenRouterModels,
  isOpenRouterAvailable,
  getOpenRouterApiKey,
} from '../../../ai/openrouterProvider';
export type { OpenRouterModelInfo } from '../../../ai/openrouterProvider';

export type OpenRouterConversationMode = 'multiturn' | 'singleturn';

const MOVE_SCHEMA = {
  name: 'move_selection',
  schema: { ...MOVE_JSON_SCHEMA, additionalProperties: false } as Record<string, unknown>,
};

const ONLY_MOVE = 'Only one valid move.';

export class OpenRouterScopaAI implements AsyncAIPlayer {
  readonly name: string;
  readonly isAsync = true as const;

  private apiKey: string;
  private model: string;
  private mode: OpenRouterConversationMode;
  // Multi-turn: this round's exchange (system prompt prepended per call)
  private messages: OpenRouterMessage[] = [];
  // Single-turn: what the prompt's history section is built from
  private roundMoveHistory: Move[] = [];
  private initialTable: Card[] = [];
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
    mode: OpenRouterConversationMode = 'multiturn'
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.mode = mode;
    const displayName = openRouterModelDisplayName(model);
    this.name = mode === 'singleturn' ? `${displayName} (1-turn)` : displayName;
    this.tracker = new TokenTracker(model, displayName);
  }

  /** Abort the request in flight (if any) and invalidate its reply. */
  cancel(): void {
    this.epoch += 1;
    this.inFlight?.abort();
    this.inFlight = null;
  }

  /** Reset token stats (e.g., for a new game) */
  resetTokenStats(): void {
    this.cancel();
    this.tracker = new TokenTracker(this.model, this.tracker.stats.modelDisplayName);
  }

  /** Start a new round: fresh conversation / history */
  startRound(): void {
    this.cancel();
    this.tracker.resetRound();
    this.messages = [];
    this.roundMoveHistory = [];
    this.initialTable = [];
    this.lastReasoning = '';
    this.lastThinking = '';
    this.lastMoveWasFallback = false;
    this.lastServedModel = undefined;
  }

  endRound(): void {
    this.cancel();
    this.messages = [];
    this.roundMoveHistory = [];
    this.initialTable = [];
  }

  private isInHistory(move: Move): boolean {
    return this.roundMoveHistory.some(
      (m) => m.cardPlayed.id === move.cardPlayed.id && m.player === move.player
    );
  }

  /** Single-turn: keep the round history the prompt is rebuilt from. */
  private trackHistory(context: LLMAIContext): void {
    const { table, lastOpponentMove } = context;
    // Capture the initial table on the first move of the round
    if (this.roundMoveHistory.length === 0 && this.initialTable.length === 0) {
      if (!lastOpponentMove) {
        this.initialTable = [...table];
      } else if (lastOpponentMove.capturedCards.length === 0) {
        // Opponent placed a card: remove it to get the initial table
        this.initialTable = table.filter((c) => c.id !== lastOpponentMove.cardPlayed.id);
      } else {
        // Opponent captured: add the captured cards back
        this.initialTable = [...table, ...lastOpponentMove.capturedCards];
      }
    }
    if (lastOpponentMove && !this.isInHistory(lastOpponentMove)) {
      this.roundMoveHistory.push(lastOpponentMove);
    }
  }

  private noCallDelta(): void {
    this.tracker.lastDelta = {
      promptTokens: 0,
      responseTokens: 0,
      thoughtTokens: 0,
      totalTokens: 0,
      turnTimeMs: 0,
    };
  }

  async selectMove(context: LLMAIContext): Promise<Move> {
    const { hand, validMoves } = context;
    if (hand.length === 0) throw new Error('Cannot select move with empty hand');
    if (validMoves.length === 0) throw new Error('No valid moves available');
    this.lastMoveWasFallback = false;

    if (this.mode === 'singleturn') this.trackHistory(context);
    const prompt =
      this.mode === 'singleturn'
        ? buildSingleTurnPrompt(context, this.roundMoveHistory, this.initialTable)
        : buildTurnPrompt(context);

    // Single legal move: nothing to decide, no API call. Multi-turn keeps a
    // synthetic exchange so later turns still see the move in the history.
    if (validMoves.length === 1) {
      if (this.mode === 'multiturn') {
        this.messages.push({ role: 'user', content: prompt });
        this.messages.push({
          role: 'assistant',
          content: JSON.stringify({ moveIndex: 0, reasoning: ONLY_MOVE }),
        });
      } else {
        this.roundMoveHistory.push(validMoves[0]);
      }
      this.lastReasoning = ONLY_MOVE;
      this.lastThinking = '';
      this.lastServedModel = undefined;
      this.noCallDelta();
      return validMoves[0];
    }

    if (this.mode === 'multiturn') this.messages.push({ role: 'user', content: prompt });
    const messages: OpenRouterMessage[] = [
      {
        role: 'system',
        content: this.mode === 'singleturn' ? SYSTEM_INSTRUCTION_SINGLETURN : SYSTEM_INSTRUCTION_MULTITURN,
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
        // The round or game moved on while we waited: nothing to record.
        throw new OpenRouterCancelledError();
      }
      console.error(`[openrouter ${this.model}] API error:`, error);
      // The question went unanswered: drop it so the history stays paired.
      if (this.mode === 'multiturn') this.messages.pop();
      this.lastReasoning = 'API error occurred.';
      this.lastThinking = '';
      // Re-throw so the app can show the error badge
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
      // Store the canonical JSON (keeps the model's later answers in shape);
      // reasoning blocks go back unchanged, as OpenRouter asks.
      this.messages.push({
        role: 'assistant',
        content: valid ? JSON.stringify({ moveIndex: index, reasoning: parsed?.reasoning ?? '' }) : '{}',
        ...(result.reasoningDetails ? { reasoning_details: result.reasoningDetails } : {}),
      });
    }

    if (valid) {
      this.lastReasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning : '';
      const move = validMoves[index];
      if (this.mode === 'singleturn') this.roundMoveHistory.push(move);
      console.log(`[openrouter ${this.model}] move ${index}: ${this.lastReasoning}`);
      return move;
    }

    // Unusable answer: play the heuristic move and say so (the bubble
    // shows it as a fallback).
    const why = !result.text
      ? 'No response'
      : parsed
        ? `Invalid moveIndex ${String(index)}`
        : 'Unparseable response';
    console.warn(`[openrouter ${this.model}] ${why}, using heuristic move`);
    this.lastReasoning = `${why} — heuristic move played.`;
    this.lastMoveWasFallback = true;
    const fallback = heuristicAI.selectMove(context);
    if (this.mode === 'singleturn') this.roundMoveHistory.push(fallback);
    return fallback;
  }
}

// Cache instances by (model, mode, seat): spectator-mode same-model
// self-play needs distinct histories per seat.
const instanceCache = new Map<string, OpenRouterScopaAI>();

function cacheKey(model: string, mode: OpenRouterConversationMode, seat: Seat): string {
  return `${model}::${mode}::${seat}`;
}

/**
 * Get an OpenRouter Scopa bot (cached by model, mode and seat); null when no
 * valid key is configured.
 */
export function getOpenRouterAI(
  model: string = DEFAULT_OPENROUTER_MODEL,
  mode: OpenRouterConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): OpenRouterScopaAI | null {
  if (!isOpenRouterAvailable()) return null;
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) return null;
  const key = cacheKey(model, mode, seat);
  let instance = instanceCache.get(key);
  if (!instance) {
    instance = new OpenRouterScopaAI(apiKey, model, mode);
    instanceCache.set(key, instance);
  }
  return instance;
}

/** The default OpenRouter model id */
export function getDefaultOpenRouterModel(): string {
  return DEFAULT_OPENROUTER_MODEL;
}

/** Token stats of one bot instance by (model, mode, seat) */
export function getOpenRouterTokenStats(
  model?: string,
  mode: OpenRouterConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiTokenStats | null {
  if (!model) return null;
  const instance = instanceCache.get(cacheKey(model, mode, seat));
  return instance ? { ...instance.tokenStats } : null;
}

/** Last-turn delta of one bot instance by (model, mode, seat) */
export function getOpenRouterTokenDelta(
  model?: string,
  mode: OpenRouterConversationMode = 'multiturn',
  seat: Seat = 'cpu'
): GeminiTokenDelta | null {
  if (!model) return null;
  const instance = instanceCache.get(cacheKey(model, mode, seat));
  return instance ? { ...instance.lastDelta } : null;
}

/** Reset token stats on every cached instance (new game) */
export function resetOpenRouterTokenStats(): void {
  for (const instance of instanceCache.values()) instance.resetTokenStats();
}

/** Start a new round on every cached instance (fresh conversations) */
export function startOpenRouterRound(): void {
  for (const instance of instanceCache.values()) instance.startRound();
}

/** End the round on every cached instance (clears conversations) */
export function endOpenRouterRound(): void {
  for (const instance of instanceCache.values()) instance.endRound();
}

/**
 * Abort every request in flight and drop their replies (game reset, game
 * switch, unmount): a move for a game that no longer exists must not land
 * in the next one.
 */
export function cancelOpenRouterRequests(): void {
  for (const instance of instanceCache.values()) instance.cancel();
}

/** Drop every cached instance (the key changed) */
export function clearOpenRouterCache(): void {
  cancelOpenRouterRequests();
  instanceCache.clear();
}
// Let the shared Settings modal drop these instances when the key changes
// without importing this module statically (keeps the code split intact).
registerApiKeyCacheClearer('openrouter', clearOpenRouterCache);
