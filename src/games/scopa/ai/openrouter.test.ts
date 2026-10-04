// The Scopa OpenRouter bot with the HTTP client mocked: what it sends in
// each conversation mode, how it keeps its history, and that every
// unusable answer degrades to a marked heuristic move instead of a crash.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeck } from '../deck';
import { getValidMoves } from '../rules';
import type { Card, Move } from '../types';
import type { LLMAIContext } from './types';
import { OpenRouterCancelledError, type OpenRouterChatResult, type OpenRouterMessage } from '../../../ai/openrouterProvider';

const mocks = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock('../../../ai/openrouterProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ai/openrouterProvider')>()),
  openRouterChat: mocks.chat,
  getOpenRouterApiKey: () => 'sk-or-test',
  isOpenRouterAvailable: () => true,
}));

import { OpenRouterScopaAI, getOpenRouterAI, clearOpenRouterCache, getOpenRouterTokenStats } from './openrouter';

const deck = createDeck();
const card = (id: string): Card => deck.find((c) => c.id === id)!;

function context(handIds: string[], tableIds: string[], extra: Partial<LLMAIContext> = {}): LLMAIContext {
  const hand = handIds.map(card);
  const table = tableIds.map(card);
  const validMoves: Move[] = hand.flatMap((c) => getValidMoves(c, table, 'cpu'));
  return {
    hand, table, player: 'cpu', validMoves,
    scores: { self: 3, opponent: 5 }, targetScore: 11, roundNumber: 2,
    opponentHandCount: 3, selfCapturedCount: 8, opponentCapturedCount: 10, deckCount: 12,
    lastOpponentMove: null, lastSelfMove: null,
    ...extra,
  };
}

const answer = (json: object, extra: Partial<OpenRouterChatResult> = {}): OpenRouterChatResult => ({
  text: JSON.stringify(json),
  reasoning: '',
  reasoningDetails: null,
  finishReason: 'stop',
  model: 'openai/gpt-5-mini',
  usage: { promptTokens: 200, responseTokens: 20, thoughtTokens: 5, totalTokens: 220, cachedTokens: 0, cacheCreationTokens: 0, costUsd: 0.0003 },
  ...extra,
});

const sentMessages = (call: number): OpenRouterMessage[] => mocks.chat.mock.calls[call][1].messages;

beforeEach(() => {
  mocks.chat.mockReset();
  clearOpenRouterCache();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('OpenRouterScopaAI multi-turn', () => {
  it('sends the system prompt plus the growing conversation, echoing reasoning blocks back', async () => {
    const details = [{ type: 'reasoning.encrypted', data: 'abc' }];
    mocks.chat
      .mockResolvedValueOnce(answer({ moveIndex: 1, reasoning: 'first' }, { reasoning: 'hmm', reasoningDetails: details }))
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'second' }));
    const ai = new OpenRouterScopaAI('sk-or-test', 'openai/gpt-5-mini', 'multiturn');
    ai.startRound();
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    expect(ctx.validMoves.length).toBeGreaterThan(1);

    const move = await ai.selectMove(ctx);
    expect(move).toBe(ctx.validMoves[1]);
    expect(ai.lastReasoning).toBe('first');
    expect(ai.lastThinking).toBe('hmm');
    expect(ai.lastMoveWasFallback).toBe(false);
    const first = mocks.chat.mock.calls[0][1];
    expect(first.model).toBe('openai/gpt-5-mini');
    expect(first.schema.name).toBe('move_selection');
    expect(first.thinkingLevel).toBe('medium'); // the knob's default
    expect(sentMessages(0).map((m) => m.role)).toEqual(['system', 'user']);
    expect(sentMessages(0)[0].content).toContain('Multi-turn');
    expect(sentMessages(0)[1].content).toContain('[0]');

    await ai.selectMove(context(['cups-3', 'swords-10'], ['coins-4', 'clubs-3']));
    const second = sentMessages(1);
    expect(second.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(JSON.parse(second[2].content)).toEqual({ moveIndex: 1, reasoning: 'first' });
    expect(second[2].reasoning_details).toBe(details);
    expect(ai.tokenStats.requestCount).toBe(2);
    expect(ai.tokenStats.promptTokens).toBe(400);
    expect(ai.tokenStats.thoughtTokens).toBe(10);
    expect(ai.tokenStats.costUsd).toBeCloseTo(0.0006, 10);
    expect(ai.lastDelta.costUsd).toBe(0.0003);
  });

  it('skips the API for a single legal move but keeps the exchange in the history', async () => {
    mocks.chat.mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'later' }));
    const ai = new OpenRouterScopaAI('sk-or-test', 'openai/gpt-5-mini', 'multiturn');
    ai.startRound();
    // one card that captures: the capture is mandatory, so one legal move
    const only = context(['coins-7'], ['swords-7']);
    expect(only.validMoves).toHaveLength(1);
    const move = await ai.selectMove(only);
    expect(move).toBe(only.validMoves[0]);
    expect(mocks.chat).not.toHaveBeenCalled();
    expect(ai.lastReasoning).toBe('Only one valid move.');
    expect(ai.lastDelta.totalTokens).toBe(0);

    await ai.selectMove(context(['cups-3', 'swords-10'], ['coins-4', 'clubs-3']));
    const roles = sentMessages(0).map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
    expect(JSON.parse(sentMessages(0)[2].content).moveIndex).toBe(0);
  });

  it('plays a marked heuristic move on an unparseable or out-of-range answer', async () => {
    mocks.chat
      .mockResolvedValueOnce(answer({}, { text: 'I would play the seven of coins.' }))
      .mockResolvedValueOnce(answer({ moveIndex: 99, reasoning: 'nope' }))
      .mockResolvedValueOnce(answer({}, { text: '' }))
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'back' }));
    const ai = new OpenRouterScopaAI('sk-or-test', 'openai/gpt-5-mini', 'multiturn');
    ai.startRound();
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);

    const legalIds = ctx.validMoves.map((m) => m.cardPlayed.id);
    let move = await ai.selectMove(ctx);
    expect(legalIds).toContain(move.cardPlayed.id);
    expect(ai.lastMoveWasFallback).toBe(true);
    expect(ai.lastReasoning).toMatch(/Unparseable response — heuristic move played/);

    move = await ai.selectMove(ctx);
    expect(legalIds).toContain(move.cardPlayed.id);
    expect(ai.lastMoveWasFallback).toBe(true);
    expect(ai.lastReasoning).toMatch(/Invalid moveIndex 99/);

    move = await ai.selectMove(ctx);
    expect(ai.lastMoveWasFallback).toBe(true);
    expect(ai.lastReasoning).toMatch(/No response/);

    move = await ai.selectMove(ctx);
    expect(move).toBe(ctx.validMoves[0]);
    expect(ai.lastMoveWasFallback).toBe(false);
    // the failed turns stay in the history as empty answers
    const roles = sentMessages(3).map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user']);
    expect(sentMessages(3)[2].content).toBe('{}');
  });

  it('re-throws API errors for the error badge and drops the unanswered prompt', async () => {
    mocks.chat
      .mockRejectedValueOnce(new Error('Insufficient credits (HTTP 402)'))
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'ok' }));
    const ai = new OpenRouterScopaAI('sk-or-test', 'openai/gpt-5-mini', 'multiturn');
    ai.startRound();
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    await expect(ai.selectMove(ctx)).rejects.toThrow('Insufficient credits (HTTP 402)');
    expect(ai.lastReasoning).toBe('API error occurred.');
    await ai.selectMove(ctx);
    expect(sentMessages(1).map((m) => m.role)).toEqual(['system', 'user']);
    expect(ai.tokenStats.requestCount).toBe(1);
  });
});

describe('OpenRouterScopaAI single-turn', () => {
  it('sends one user message with the round history every time', async () => {
    mocks.chat
      .mockResolvedValueOnce(answer({ moveIndex: 1, reasoning: 'a' }))
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'b' }));
    const ai = new OpenRouterScopaAI('sk-or-test', 'anthropic/claude-sonnet-5', 'singleturn');
    expect(ai.name).toContain('(1-turn)');
    ai.startRound();
    const ctx1 = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    const move1 = await ai.selectMove(ctx1);
    expect(move1).toBe(ctx1.validMoves[1]);
    expect(sentMessages(0).map((m) => m.role)).toEqual(['system', 'user']);
    expect(sentMessages(0)[0].content).toContain('Single-turn');

    // the opponent answered with a capture; our earlier move must be in the history now
    const opponentMove: Move = { player: 'human', cardPlayed: card('cups-4'), capturedCards: [card('coins-4')], isScopa: false };
    const ctx2 = context(['cups-3', 'swords-10'], ['clubs-3', 'swords-2'], { lastOpponentMove: opponentMove, lastSelfMove: move1 });
    await ai.selectMove(ctx2);
    expect(sentMessages(1).map((m) => m.role)).toEqual(['system', 'user']);
    const prompt = sentMessages(1)[1].content;
    expect(prompt).toContain('4 of cups');
    expect(prompt).toContain(`${move1.cardPlayed.value} of ${move1.cardPlayed.suit}`);
  });

  it('records a single legal move in the history without an API call', async () => {
    mocks.chat.mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'x' }));
    const ai = new OpenRouterScopaAI('sk-or-test', 'anthropic/claude-sonnet-5', 'singleturn');
    ai.startRound();
    const only = context(['coins-7'], ['swords-7']);
    await ai.selectMove(only);
    expect(mocks.chat).not.toHaveBeenCalled();
    await ai.selectMove(context(['cups-3', 'swords-10'], ['clubs-3', 'swords-2'], { lastSelfMove: only.validMoves[0] }));
    expect(sentMessages(0)[1].content).toContain('7 of coins');
  });
});

describe('getOpenRouterAI', () => {
  it('caches one instance per model, mode and seat and exposes its stats', async () => {
    mocks.chat.mockResolvedValue(answer({ moveIndex: 0, reasoning: 'x' }));
    const a = getOpenRouterAI('openai/gpt-5-mini', 'multiturn', 'p1');
    const b = getOpenRouterAI('openai/gpt-5-mini', 'multiturn', 'p2');
    const c = getOpenRouterAI('openai/gpt-5-mini', 'singleturn', 'p1');
    expect(a).not.toBeNull();
    expect(getOpenRouterAI('openai/gpt-5-mini', 'multiturn', 'p1')).toBe(a);
    expect(b).not.toBe(a);
    expect(c).not.toBe(a);
    a!.startRound();
    await a!.selectMove(context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']));
    expect(getOpenRouterTokenStats('openai/gpt-5-mini', 'multiturn', 'p1')?.requestCount).toBe(1);
    expect(getOpenRouterTokenStats('openai/gpt-5-mini', 'multiturn', 'p2')?.requestCount).toBe(0);
    expect(getOpenRouterTokenStats(undefined)).toBeNull();
    clearOpenRouterCache();
    expect(getOpenRouterAI('openai/gpt-5-mini', 'multiturn', 'p1')).not.toBe(a);
  });
});

describe('served model', () => {
  it('remembers the model a router actually used, and ignores variant suffixes', async () => {
    mocks.chat
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'a' }, { model: 'google/gemma-4-31b-it:free' }))
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'b' }, { model: 'nex-agi/mini' }));
    const router = new OpenRouterScopaAI('sk-or-test', 'openrouter/free', 'multiturn');
    router.startRound();
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    await router.selectMove(ctx);
    expect(router.lastServedModel).toBe('google/gemma-4-31b-it:free');
    expect(router.tokenStats.servedModel).toBe('google/gemma-4-31b-it:free');
    expect(router.lastDelta.servedModel).toBe('google/gemma-4-31b-it:free');

    const direct = new OpenRouterScopaAI('sk-or-test', 'nex-agi/mini:free', 'multiturn');
    direct.startRound();
    await direct.selectMove(ctx);
    expect(direct.lastServedModel).toBeUndefined();
    expect(direct.tokenStats.servedModel).toBeUndefined();
  });
});

describe('late replies', () => {
  const ctx = () => context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);

  it('aborts the request in flight when the round resets and records nothing for it', async () => {
    mocks.chat.mockImplementationOnce((_key: string, _params: unknown, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new OpenRouterCancelledError()));
      })
    );
    const ai = new OpenRouterScopaAI('sk-or-test', 'openai/gpt-5-mini', 'multiturn');
    ai.startRound();
    const pending = ai.selectMove(ctx());
    ai.startRound(); // a new round (or game) while the request is out
    await expect(pending).rejects.toBeInstanceOf(OpenRouterCancelledError);
    expect(mocks.chat.mock.calls[0][2].signal.aborted).toBe(true);
    expect(ai.tokenStats.requestCount).toBe(0);
    expect(ai.lastReasoning).toBe('');

    // the next turn starts from a clean history
    mocks.chat.mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'fresh' }));
    await ai.selectMove(ctx());
    expect(sentMessages(1).map((m) => m.role)).toEqual(['system', 'user']);
    expect(ai.tokenStats.requestCount).toBe(1);
  });

  it('drops a reply that still arrives after a reset, even when the fetch was not interrupted', async () => {
    let deliver!: (r: OpenRouterChatResult) => void;
    mocks.chat.mockImplementationOnce(() => new Promise<OpenRouterChatResult>((resolve) => { deliver = resolve; }));
    const ai = new OpenRouterScopaAI('sk-or-test', 'openai/gpt-5-mini', 'multiturn');
    ai.startRound();
    const pending = ai.selectMove(ctx());
    ai.resetTokenStats(); // new game
    ai.startRound();
    deliver(answer({ moveIndex: 1, reasoning: 'stale' }));
    await expect(pending).rejects.toBeInstanceOf(OpenRouterCancelledError);
    expect(ai.tokenStats.requestCount).toBe(0);
    expect(ai.tokenStats.costUsd).toBeUndefined();
    expect(ai.lastReasoning).toBe('');
    mocks.chat.mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'fresh' }));
    await ai.selectMove(ctx());
    expect(sentMessages(1).map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('cancelOpenRouterRequests aborts every cached instance', async () => {
    const { cancelOpenRouterRequests } = await import('./openrouter');
    mocks.chat.mockImplementationOnce((_key: string, _params: unknown, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new OpenRouterCancelledError()));
      })
    );
    const ai = getOpenRouterAI('openai/gpt-5-mini', 'multiturn', 'p1')!;
    ai.startRound();
    const pending = ai.selectMove(ctx());
    cancelOpenRouterRequests();
    await expect(pending).rejects.toBeInstanceOf(OpenRouterCancelledError);
    expect(ai.tokenStats.requestCount).toBe(0);
  });
});
