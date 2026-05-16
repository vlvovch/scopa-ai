// Mocked-SDK tests for the BYOK OpenAI bot. We replace the `openai`
// default export with a fake class exposing `responses.create`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LLMAIContext } from './types';
import type { Card, CardValue, Suit } from '../types';

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

const mocks = vi.hoisted(() => ({
  responsesCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    responses = { create: mocks.responsesCreate };
  },
}));

vi.mock('../../scopa/ai/openai', () => ({
  getOpenAIApiKey: () => 'sk-test',
  isOpenAIAvailable: () => true,
  fetchOpenAIModels: async () => [],
  getCachedOpenAIModels: () => [],
}));

function fakeOpenAIResponse(
  json: object,
  options: { conversationId?: string; usage?: object } = {}
) {
  return {
    output_text: JSON.stringify(json),
    conversation: options.conversationId ? { id: options.conversationId } : undefined,
    usage: options.usage,
  };
}

describe('OpenAIBriscolaAI', () => {
  beforeEach(() => mocks.responsesCreate.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('multi-turn: passes conversation id on subsequent calls', async () => {
    mocks.responsesCreate
      .mockResolvedValueOnce(
        fakeOpenAIResponse(
          { moveIndex: 0, reasoning: 'lead Ace' },
          { conversationId: 'conv_123' }
        )
      )
      .mockResolvedValueOnce(
        fakeOpenAIResponse(
          { moveIndex: 1, reasoning: 'second' },
          { conversationId: 'conv_123' }
        )
      );

    const { getOpenAIBriscolaAI, clearOpenAICache } = await import('./openai');
    clearOpenAICache();
    const ai = getOpenAIBriscolaAI('gpt-4o-mini', 'multiturn');
    ai!.startRound();
    await ai!.selectMove(ctx());
    await ai!.selectMove(ctx());

    expect(mocks.responsesCreate).toHaveBeenCalledTimes(2);
    // First call: no conversation
    expect(mocks.responsesCreate.mock.calls[0][0].conversation).toBeUndefined();
    // Second call: continues conv_123
    expect(mocks.responsesCreate.mock.calls[1][0].conversation).toEqual({ id: 'conv_123' });
  });

  it('single-turn: never passes a conversation id', async () => {
    mocks.responsesCreate
      .mockResolvedValueOnce(
        fakeOpenAIResponse({ moveIndex: 0, reasoning: 'a' }, { conversationId: 'conv_123' })
      )
      .mockResolvedValueOnce(
        fakeOpenAIResponse({ moveIndex: 1, reasoning: 'b' }, { conversationId: 'conv_456' })
      );

    const { getOpenAIBriscolaAI, clearOpenAICache } = await import('./openai');
    clearOpenAICache();
    const ai = getOpenAIBriscolaAI('gpt-4o-mini', 'singleturn');
    ai!.startRound();
    await ai!.selectMove(ctx());
    await ai!.selectMove(ctx());

    expect(mocks.responsesCreate.mock.calls[0][0].conversation).toBeUndefined();
    expect(mocks.responsesCreate.mock.calls[1][0].conversation).toBeUndefined();
  });

  it('falls back to first valid move on empty content', async () => {
    mocks.responsesCreate.mockResolvedValueOnce({ output_text: '', usage: undefined });
    const { getOpenAIBriscolaAI, clearOpenAICache } = await import('./openai');
    clearOpenAICache();
    const ai = getOpenAIBriscolaAI('gpt-4o-mini', 'multiturn');
    ai!.startRound();
    const move = await ai!.selectMove(ctx());
    expect(move.cardPlayed.id).toBe('coins-1');
  });

  it('records token usage from OpenAI usage shape', async () => {
    mocks.responsesCreate.mockResolvedValueOnce(
      fakeOpenAIResponse(
        { moveIndex: 0, reasoning: 'x' },
        {
          usage: {
            input_tokens: 300,
            output_tokens: 50,
            total_tokens: 350,
            output_tokens_details: { reasoning_tokens: 10 },
            input_tokens_details: { cached_tokens: 5 },
          },
        }
      )
    );
    const { getOpenAIBriscolaAI, clearOpenAICache } = await import('./openai');
    clearOpenAICache();
    const ai = getOpenAIBriscolaAI('gpt-4o-mini', 'multiturn');
    ai!.startRound();
    await ai!.selectMove(ctx());
    expect(ai!.tokenStats.promptTokens).toBe(300);
    expect(ai!.tokenStats.responseTokens).toBe(50);
    expect(ai!.tokenStats.thoughtTokens).toBe(10);
    expect(ai!.tokenStats.cachedTokens).toBe(5);
    expect(ai!.tokenStats.requestCount).toBe(1);
  });

  it('single-card hand short-circuits (no API call)', async () => {
    const { getOpenAIBriscolaAI, clearOpenAICache } = await import('./openai');
    clearOpenAICache();
    const ai = getOpenAIBriscolaAI('gpt-4o-mini', 'multiturn');
    ai!.startRound();
    const only = card('cups', 1);
    const move = await ai!.selectMove(
      ctx({ hand: [only], validMoves: [{ player: 'cpu', cardPlayed: only }] })
    );
    expect(move.cardPlayed.id).toBe('cups-1');
    expect(mocks.responsesCreate).not.toHaveBeenCalled();
  });
});
