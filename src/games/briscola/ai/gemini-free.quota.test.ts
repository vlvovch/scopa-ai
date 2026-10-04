// Briscola's no-key opponent and the proxy's two refusals (own allowance,
// shared cap) reach the start screen through getGeminiFreeRateLimitInfo.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createDeck } from '../deck';
import type { Card, Move } from '../types';
import type { LLMAIContext } from './types';

vi.stubEnv('VITE_PROXY_URL', 'https://proxy.test');
const free = await import('./gemini-free');

const deck = createDeck();
const card = (id: string): Card => deck.find((c) => c.id === id)!;
function context(): LLMAIContext {
  const hand = [card('coins-3'), card('swords-5'), card('clubs-1')];
  const validMoves: Move[] = hand.map((c) => ({ player: 'cpu', cardPlayed: c }));
  return {
    hand, player: 'cpu', validMoves,
    trump: card('coins-10'), trumpSuit: 'coins', leadCard: card('cups-1'), deckCount: 10,
    scores: { self: 0, opponent: 0 }, targetScore: 1, roundNumber: 1, opponentHandCount: 3,
    lastOpponentMove: null, lastSelfMove: null,
  };
}

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  free.clearGeminiFreeCache();
  vi.unstubAllGlobals();
});

describe('the no-key opponent and the proxy quotas (Briscola)', () => {
  it("reports the player's own exhausted allowance", async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'rate_limit', scope: 'user', gamesUsed: 3, gamesLimit: 3 }));
    const ai = free.getGeminiFreeBriscolaAI('cpu')!;
    await expect(ai.selectMove(context())).rejects.toMatchObject({ name: 'RateLimitError', scope: 'user', gamesUsed: 3 });
    expect(free.getGeminiFreeRateLimitInfo('cpu')).toEqual({ gamesUsed: 3, gamesLimit: 3, globalExhausted: false });
  });

  it('reports the shared cap without touching the player\'s own count', async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'rate_limit', scope: 'global', gamesUsed: 0, gamesLimit: 3, globalGamesUsed: 60, globalGamesLimit: 60 }));
    const ai = free.getGeminiFreeBriscolaAI('cpu')!;
    const failure = await ai.selectMove(context()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(free.RateLimitError);
    expect((failure as InstanceType<typeof free.RateLimitError>).scope).toBe('global');
    expect(free.getGeminiFreeRateLimitInfo('cpu')).toEqual({ gamesUsed: 0, gamesLimit: 3, globalExhausted: true });
  });

  it('plays the answered move on success', async () => {
    vi.stubGlobal('fetch', respond(200, { text: JSON.stringify({ moveIndex: 2, reasoning: 'ok' }), usageMetadata: { totalTokenCount: 10 }, gamesUsed: 1, gamesLimit: 3 }));
    const ai = free.getGeminiFreeBriscolaAI('cpu')!;
    const ctx = context();
    expect(await ai.selectMove(ctx)).toBe(ctx.validMoves[2]);
    expect(free.getGeminiFreeRateLimitInfo('cpu')).toEqual({ gamesUsed: 1, gamesLimit: 3, globalExhausted: false });
  });
});
