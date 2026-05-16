// Mocked-fetch tests for the Gemini Free (Cloudflare proxy) bot.
//
// We stub `import.meta.env.VITE_PROXY_URL` before importing the module so
// `isGeminiFreeAvailable()` returns true and selectMove actually hits its
// fetch branch. The fetch itself is replaced with a vi.fn returning the
// shape the proxy normally returns.

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
  const validMoves = overrides.validMoves ?? hand.map((c) => ({ player: 'cpu' as const, cardPlayed: c }));
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
    ...overrides,
  };
};

/** Build a `Response`-shaped object that mimics what `await fetch(...)` returns. */
function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('GeminiFreeBriscolaAI', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PROXY_URL', 'http://test-proxy.local');
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns the indexed valid move when the proxy responds normally', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      fakeResponse({
        text: JSON.stringify({ moveIndex: 1, reasoning: 'take the cups 7' }),
        gamesUsed: 1,
        gamesLimit: 3,
      })
    );
    const { getGeminiFreeBriscolaAI, clearGeminiFreeCache } = await import('./gemini-free');
    clearGeminiFreeCache();
    const ai = getGeminiFreeBriscolaAI();
    expect(ai).not.toBeNull();
    ai!.startRound();
    const c = ctx();
    const move = await ai!.selectMove(c);
    expect(move.cardPlayed.id).toBe(c.validMoves[1].cardPlayed.id);
    expect(ai!.lastReasoning).toBe('take the cups 7');
    expect(ai!.gamesUsed).toBe(1);
  });

  it('falls back to the first valid move when the proxy returns invalid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      fakeResponse({
        text: 'not actually json',
        gamesUsed: 1,
        gamesLimit: 3,
      })
    );
    const { getGeminiFreeBriscolaAI, clearGeminiFreeCache } = await import('./gemini-free');
    clearGeminiFreeCache();
    const ai = getGeminiFreeBriscolaAI();
    ai!.startRound();
    const c = ctx();
    const move = await ai!.selectMove(c);
    expect(move.cardPlayed.id).toBe(c.validMoves[0].cardPlayed.id);
  });

  it('falls back to the first valid move on an out-of-range moveIndex', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      fakeResponse({
        text: JSON.stringify({ moveIndex: 99, reasoning: 'huh' }),
        gamesUsed: 1,
        gamesLimit: 3,
      })
    );
    const { getGeminiFreeBriscolaAI, clearGeminiFreeCache } = await import('./gemini-free');
    clearGeminiFreeCache();
    const ai = getGeminiFreeBriscolaAI();
    ai!.startRound();
    const move = await ai!.selectMove(ctx());
    expect(move.cardPlayed.id).toBe('coins-1'); // first valid
  });

  it('throws RateLimitError on HTTP 429 and surfaces the quota counts', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      fakeResponse({ gamesUsed: 3, gamesLimit: 3 }, 429)
    );
    const { getGeminiFreeBriscolaAI, clearGeminiFreeCache, RateLimitError } =
      await import('./gemini-free');
    clearGeminiFreeCache();
    const ai = getGeminiFreeBriscolaAI();
    ai!.startRound();
    await expect(ai!.selectMove(ctx())).rejects.toBeInstanceOf(RateLimitError);
    expect(ai!.gamesUsed).toBe(3);
    expect(ai!.gamesLimit).toBe(3);
  });

  it('short-circuits when only one valid move exists (no proxy call)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const { getGeminiFreeBriscolaAI, clearGeminiFreeCache } = await import('./gemini-free');
    clearGeminiFreeCache();
    const ai = getGeminiFreeBriscolaAI();
    ai!.startRound();
    const only = card('cups', 1);
    const move = await ai!.selectMove(
      ctx({ hand: [only], validMoves: [{ player: 'cpu', cardPlayed: only }] })
    );
    expect(move.cardPlayed.id).toBe('cups-1');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accumulates token stats from usageMetadata across calls', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({
          text: JSON.stringify({ moveIndex: 0, reasoning: 'first' }),
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 20,
            totalTokenCount: 120,
          },
          gamesUsed: 1,
          gamesLimit: 3,
        })
      )
      .mockResolvedValueOnce(
        fakeResponse({
          text: JSON.stringify({ moveIndex: 0, reasoning: 'second' }),
          usageMetadata: {
            promptTokenCount: 150,
            candidatesTokenCount: 30,
            totalTokenCount: 180,
          },
          gamesUsed: 2,
          gamesLimit: 3,
        })
      );
    const { getGeminiFreeBriscolaAI, clearGeminiFreeCache } = await import('./gemini-free');
    clearGeminiFreeCache();
    const ai = getGeminiFreeBriscolaAI();
    ai!.startRound();
    await ai!.selectMove(ctx());
    await ai!.selectMove(ctx());
    expect(ai!.tokenStats.requestCount).toBe(2);
    expect(ai!.tokenStats.promptTokens).toBe(250);
    expect(ai!.tokenStats.totalTokens).toBe(300);
  });
});

describe('GeminiFreeBriscolaAI without proxy', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PROXY_URL', '');
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('isGeminiFreeAvailable returns false and the factory returns null', async () => {
    const { isGeminiFreeAvailable, getGeminiFreeBriscolaAI, clearGeminiFreeCache } =
      await import('./gemini-free');
    clearGeminiFreeCache();
    expect(isGeminiFreeAvailable()).toBe(false);
    expect(getGeminiFreeBriscolaAI()).toBeNull();
  });
});
