// The Briscola OpenRouter bot with the HTTP client mocked (same shape as
// openai.test.ts): conversation modes, token/cost recording, fallbacks.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LLMAIContext } from './types';
import type { Card, CardValue, Suit } from '../types';
import { OpenRouterCancelledError, type OpenRouterChatResult, type OpenRouterMessage } from '../../../ai/openrouterProvider';

const card = (suit: Suit, value: CardValue, id?: string): Card => ({
  suit,
  value,
  id: id ?? `${suit}-${value}`,
});

const ctx = (overrides: Partial<LLMAIContext> = {}): LLMAIContext => {
  const hand = overrides.hand ?? [card('coins', 1), card('cups', 7), card('clubs', 4)];
  const validMoves =
    overrides.validMoves ?? hand.map((c) => ({ player: 'cpu' as const, cardPlayed: c }));
  return {
    hand,
    player: 'cpu',
    trump: card('coins', 4),
    trumpSuit: 'coins',
    leadCard: null,
    deckCount: 30,
    myCaptured: [],
    oppCaptured: [],
    scores: { self: 0, opponent: 0 },
    targetScore: 1,
    roundNumber: 1,
    opponentHandCount: 3,
    lastSelfMove: null,
    lastOpponentMove: null,
    validMoves,
    roundMoveHistory: [],
    ...overrides,
  };
};

const mocks = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock('../../../ai/openrouterProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ai/openrouterProvider')>()),
  openRouterChat: mocks.chat,
  getOpenRouterApiKey: () => 'sk-or-test',
  isOpenRouterAvailable: () => true,
}));

const answer = (json: object, extra: Partial<OpenRouterChatResult> = {}): OpenRouterChatResult => ({
  text: JSON.stringify(json),
  reasoning: '',
  reasoningDetails: null,
  finishReason: 'stop',
  model: 'openai/gpt-5-mini',
  usage: { promptTokens: 300, responseTokens: 50, thoughtTokens: 10, totalTokens: 350, cachedTokens: 5, cacheCreationTokens: 0, costUsd: 0.0012 },
  ...extra,
});

const sentMessages = (call: number): OpenRouterMessage[] => mocks.chat.mock.calls[call][1].messages;

describe('OpenRouterBriscolaAI', () => {
  beforeEach(() => {
    mocks.chat.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('multi-turn: keeps the conversation locally and sends it whole each turn', async () => {
    mocks.chat
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'lead Ace' }))
      .mockResolvedValueOnce(answer({ moveIndex: 1, reasoning: 'second' }));
    const { getOpenRouterBriscolaAI, clearOpenRouterCache } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openai/gpt-5-mini', 'multiturn');
    ai!.startRound();
    const move = await ai!.selectMove(ctx());
    expect(move.cardPlayed.id).toBe('coins-1');
    await ai!.selectMove(ctx());
    expect(mocks.chat).toHaveBeenCalledTimes(2);
    expect(sentMessages(0).map((m) => m.role)).toEqual(['system', 'user']);
    expect(sentMessages(0)[0].content).toContain('Briscola');
    expect(sentMessages(1).map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(JSON.parse(sentMessages(1)[2].content)).toEqual({ moveIndex: 0, reasoning: 'lead Ace' });
    expect(ai!.lastReasoning).toBe('second');
  });

  it('single-turn: sends only the current prompt', async () => {
    mocks.chat
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'a' }))
      .mockResolvedValueOnce(answer({ moveIndex: 1, reasoning: 'b' }));
    const { getOpenRouterBriscolaAI, clearOpenRouterCache } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openai/gpt-5-mini', 'singleturn');
    ai!.startRound();
    await ai!.selectMove(ctx());
    await ai!.selectMove(ctx());
    expect(sentMessages(1).map((m) => m.role)).toEqual(['system', 'user']);
    expect(sentMessages(1)[0].content).toContain('Single-turn');
  });

  it('falls back to a marked heuristic move on empty content', async () => {
    mocks.chat.mockResolvedValueOnce(answer({}, { text: '' }));
    const { getOpenRouterBriscolaAI, clearOpenRouterCache } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openai/gpt-5-mini', 'multiturn');
    ai!.startRound();
    const c = ctx();
    const move = await ai!.selectMove(c);
    expect(c.validMoves.map((m) => m.cardPlayed.id)).toContain(move.cardPlayed.id);
    expect(ai!.lastMoveWasFallback).toBe(true);
    expect(ai!.lastReasoning).toMatch(/No response — heuristic move played/);
  });

  it('records token usage and the exact cost', async () => {
    mocks.chat.mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'x' }, { reasoning: 'thinking…' }));
    const { getOpenRouterBriscolaAI, clearOpenRouterCache, getOpenRouterBriscolaTokenStats } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openai/gpt-5-mini', 'multiturn');
    ai!.startRound();
    await ai!.selectMove(ctx());
    expect(ai!.tokenStats.promptTokens).toBe(300);
    expect(ai!.tokenStats.responseTokens).toBe(50);
    expect(ai!.tokenStats.thoughtTokens).toBe(10);
    expect(ai!.tokenStats.cachedTokens).toBe(5);
    expect(ai!.tokenStats.costUsd).toBe(0.0012);
    expect(ai!.tokenStats.requestCount).toBe(1);
    expect(ai!.lastThinking).toBe('thinking…');
    expect(getOpenRouterBriscolaTokenStats('openai/gpt-5-mini', 'multiturn', 'cpu')?.costUsd).toBe(0.0012);
  });

  it('single-card hand short-circuits (no API call)', async () => {
    const { getOpenRouterBriscolaAI, clearOpenRouterCache } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openai/gpt-5-mini', 'multiturn');
    ai!.startRound();
    const only = card('cups', 1);
    const move = await ai!.selectMove(
      ctx({ hand: [only], validMoves: [{ player: 'cpu', cardPlayed: only }] })
    );
    expect(move.cardPlayed.id).toBe('cups-1');
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it('re-throws API errors and drops the unanswered prompt from the history', async () => {
    mocks.chat
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'ok' }));
    const { getOpenRouterBriscolaAI, clearOpenRouterCache } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openai/gpt-5-mini', 'multiturn');
    ai!.startRound();
    await expect(ai!.selectMove(ctx())).rejects.toThrow('boom');
    await ai!.selectMove(ctx());
    expect(sentMessages(1).map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('remembers the model the free router actually used', async () => {
    mocks.chat.mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'x' }, { model: 'google/gemma-4-31b-it:free' }));
    const { getOpenRouterBriscolaAI, clearOpenRouterCache } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openrouter/free', 'multiturn');
    ai!.startRound();
    await ai!.selectMove(ctx());
    expect(ai!.lastServedModel).toBe('google/gemma-4-31b-it:free');
    expect(ai!.tokenStats.servedModel).toBe('google/gemma-4-31b-it:free');
  });

  it('a new match starts the game totals from zero', async () => {
    mocks.chat.mockResolvedValue(answer({ moveIndex: 0, reasoning: 'x' }));
    const { getOpenRouterBriscolaAI, clearOpenRouterCache, startOpenRouterMatch, startOpenRouterRound, getOpenRouterBriscolaTokenStats } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openai/gpt-5-mini', 'multiturn');
    startOpenRouterMatch('openai/gpt-5-mini', 'multiturn', 'cpu');
    startOpenRouterRound('openai/gpt-5-mini', 'multiturn', 'cpu');
    await ai!.selectMove(ctx());
    await ai!.selectMove(ctx());
    expect(ai!.tokenStats.requestCount).toBe(2);
    expect(ai!.tokenStats.costUsd).toBeCloseTo(0.0024, 10);
    // second match: fresh totals, not a continuation
    startOpenRouterMatch('openai/gpt-5-mini', 'multiturn', 'cpu');
    startOpenRouterRound('openai/gpt-5-mini', 'multiturn', 'cpu');
    expect(getOpenRouterBriscolaTokenStats('openai/gpt-5-mini', 'multiturn', 'cpu')?.requestCount).toBe(0);
    await ai!.selectMove(ctx());
    expect(ai!.tokenStats.requestCount).toBe(1);
    expect(ai!.tokenStats.costUsd).toBeCloseTo(0.0012, 10);
  });

  it('drops a reply that arrives after the round was reset', async () => {
    mocks.chat.mockImplementationOnce((_key: string, _params: unknown, options: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new OpenRouterCancelledError()));
      })
    );
    const { getOpenRouterBriscolaAI, clearOpenRouterCache } = await import('./openrouter');
    clearOpenRouterCache();
    const ai = getOpenRouterBriscolaAI('openai/gpt-5-mini', 'multiturn');
    ai!.startRound();
    const pending = ai!.selectMove(ctx());
    ai!.startRound();
    await expect(pending).rejects.toBeInstanceOf(OpenRouterCancelledError);
    expect(ai!.tokenStats.requestCount).toBe(0);
    mocks.chat.mockResolvedValueOnce(answer({ moveIndex: 0, reasoning: 'fresh' }));
    await ai!.selectMove(ctx());
    expect(sentMessages(1).map((m) => m.role)).toEqual(['system', 'user']);
  });
});
