// Mocked-SDK tests for the BYOK Gemini bot. We replace @google/genai's
// GoogleGenAI class with a fake that records calls and returns canned
// responses, and stub the api-key getter so the factory returns a real
// instance.

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

// vi.mock factories are hoisted to before imports, so they can't reference
// regular `const`s defined here. vi.hoisted() lets us share refs.
const mocks = vi.hoisted(() => {
  const sendMessage = vi.fn();
  const generateContent = vi.fn();
  const chatsCreate = vi.fn(() => ({ sendMessage }));
  return { sendMessage, generateContent, chatsCreate };
});
const { sendMessage, generateContent, chatsCreate } = mocks;

// Plain class instead of vi.fn().mockImplementation — vi.restoreAllMocks
// in afterEach wipes mock implementations but leaves class definitions intact.
vi.mock('@google/genai', () => ({
  GoogleGenAI: class FakeGoogleGenAI {
    chats = { create: mocks.chatsCreate };
    models = { generateContent: mocks.generateContent };
  },
}));

// Stub the api-key getter + availability flag so the factory creates a real
// instance instead of returning null.
vi.mock('../../scopa/ai/gemini', () => ({
  getGeminiApiKey: () => 'sk-test',
  isGeminiAvailable: () => true,
  fetchGeminiModels: async () => [],
  getCachedGeminiModels: () => [],
}));

function fakeChatResponse(json: object, usage?: object) {
  return {
    text: JSON.stringify(json),
    usageMetadata: usage,
  };
}

describe('GeminiBriscolaAI (multi-turn)', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    generateContent.mockReset();
    chatsCreate.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('multi-turn: creates a chat at startRound and routes selectMove through sendMessage', async () => {
    sendMessage.mockResolvedValueOnce(
      fakeChatResponse({ moveIndex: 2, reasoning: 'dump 4 of Clubs' }, {
        promptTokenCount: 200,
        candidatesTokenCount: 40,
        totalTokenCount: 240,
      })
    );
    const { getGeminiBriscolaAI, clearGeminiCache } = await import('./gemini');
    clearGeminiCache();
    const ai = getGeminiBriscolaAI('gemini-2.5-flash', true, 'multiturn');
    expect(ai).not.toBeNull();
    ai!.startRound();
    expect(chatsCreate).toHaveBeenCalledTimes(1);

    const c = ctx();
    const move = await ai!.selectMove(c);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(generateContent).not.toHaveBeenCalled();
    expect(move.cardPlayed.id).toBe(c.validMoves[2].cardPlayed.id);
    expect(ai!.tokenStats.requestCount).toBe(1);
    expect(ai!.tokenStats.promptTokens).toBe(200);
  });

  it('falls back to first valid move on empty response text', async () => {
    sendMessage.mockResolvedValueOnce({ text: '', usageMetadata: undefined });
    const { getGeminiBriscolaAI, clearGeminiCache } = await import('./gemini');
    clearGeminiCache();
    const ai = getGeminiBriscolaAI('gemini-2.5-flash', true, 'multiturn');
    ai!.startRound();
    const move = await ai!.selectMove(ctx());
    expect(move.cardPlayed.id).toBe('coins-1');
  });

  it('falls back to first valid move on malformed JSON', async () => {
    sendMessage.mockResolvedValueOnce({ text: '{not-json', usageMetadata: undefined });
    const { getGeminiBriscolaAI, clearGeminiCache } = await import('./gemini');
    clearGeminiCache();
    const ai = getGeminiBriscolaAI('gemini-2.5-flash', true, 'multiturn');
    ai!.startRound();
    const move = await ai!.selectMove(ctx());
    expect(move.cardPlayed.id).toBe('coins-1');
  });

  it('rethrows on transport-level errors so the caller can surface them', async () => {
    sendMessage.mockRejectedValueOnce(new Error('network down'));
    const { getGeminiBriscolaAI, clearGeminiCache } = await import('./gemini');
    clearGeminiCache();
    const ai = getGeminiBriscolaAI('gemini-2.5-flash', true, 'multiturn');
    ai!.startRound();
    await expect(ai!.selectMove(ctx())).rejects.toThrow('network down');
  });
});

describe('GeminiBriscolaAI (single-turn)', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    generateContent.mockReset();
    chatsCreate.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('single-turn: does NOT create a chat; routes selectMove through generateContent', async () => {
    generateContent.mockResolvedValueOnce(
      fakeChatResponse({ moveIndex: 0, reasoning: 'first card' })
    );
    const { getGeminiBriscolaAI, clearGeminiCache } = await import('./gemini');
    clearGeminiCache();
    const ai = getGeminiBriscolaAI('gemini-2.5-flash', true, 'singleturn');
    ai!.startRound();
    expect(chatsCreate).not.toHaveBeenCalled();
    const move = await ai!.selectMove(ctx());
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(move.cardPlayed.id).toBe('coins-1');
  });
});

describe('GeminiBriscolaAI common', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    generateContent.mockReset();
    chatsCreate.mockClear();
  });

  it('single-card hands short-circuit (no SDK call)', async () => {
    const { getGeminiBriscolaAI, clearGeminiCache } = await import('./gemini');
    clearGeminiCache();
    const ai = getGeminiBriscolaAI('gemini-2.5-flash', true, 'multiturn');
    ai!.startRound();
    const only = card('cups', 1);
    const move = await ai!.selectMove(
      ctx({ hand: [only], validMoves: [{ player: 'cpu', cardPlayed: only }] })
    );
    expect(move.cardPlayed.id).toBe('cups-1');
    expect(sendMessage).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('different cache keys for (model, useThinking, mode) — different instances', async () => {
    const { getGeminiBriscolaAI, clearGeminiCache } = await import('./gemini');
    clearGeminiCache();
    const a = getGeminiBriscolaAI('gemini-2.5-flash', true, 'multiturn');
    const b = getGeminiBriscolaAI('gemini-2.5-flash', false, 'multiturn');
    const c = getGeminiBriscolaAI('gemini-2.5-flash', true, 'singleturn');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
    // Same key → same instance
    expect(a).toBe(getGeminiBriscolaAI('gemini-2.5-flash', true, 'multiturn'));
  });
});
