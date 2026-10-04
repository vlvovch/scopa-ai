// The no-key opponent's handling of the proxy's two refusals: the player's
// own daily allowance and the shared daily cap, which the start screen
// tells apart through getGeminiFreeRateLimitInfo.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createDeck } from '../deck';
import { getValidMoves } from '../rules';
import type { Card, Move } from '../types';
import type { LLMAIContext } from './types';

vi.stubEnv('VITE_PROXY_URL', 'https://proxy.test');
const free = await import('./gemini-free');

const deck = createDeck();
const cards = (...ids: string[]): Card[] => ids.map((id) => deck.find((c) => c.id === id)!);
function context(): LLMAIContext {
  const hand = cards('coins-7', 'cups-3');
  const table = cards('coins-4', 'swords-3');
  const validMoves: Move[] = hand.flatMap((c) => getValidMoves(c, table, 'cpu'));
  return {
    hand, table, player: 'cpu', validMoves,
    scores: { self: 0, opponent: 0 }, targetScore: 11, roundNumber: 1,
    opponentHandCount: 3, selfCapturedCount: 0, opponentCapturedCount: 0, deckCount: 30,
    lastOpponentMove: null, lastSelfMove: null,
  };
}

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  free.clearGeminiFreeCache();
  vi.unstubAllGlobals();
});

describe('the no-key opponent and the proxy quotas', () => {
  it('is available only with a proxy URL', () => {
    expect(free.isGeminiFreeAvailable()).toBe(true);
  });

  it("reports the player's own exhausted allowance", async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'rate_limit', scope: 'user', gamesUsed: 3, gamesLimit: 3 }));
    const ai = free.getGeminiFreeAI('cpu')!;
    await expect(ai.selectMove(context())).rejects.toMatchObject({ name: 'RateLimitError', scope: 'user', gamesUsed: 3, gamesLimit: 3 });
    expect(free.getGeminiFreeRateLimitInfo('cpu')).toEqual({ gamesUsed: 3, gamesLimit: 3, globalExhausted: false });
  });

  it('reports the shared cap without touching the player\'s own count', async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'rate_limit', scope: 'global', gamesUsed: 1, gamesLimit: 3, globalGamesUsed: 60, globalGamesLimit: 60 }));
    const ai = free.getGeminiFreeAI('cpu')!;
    const failure = await ai.selectMove(context()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(free.RateLimitError);
    expect((failure as InstanceType<typeof free.RateLimitError>).scope).toBe('global');
    expect((failure as Error).message).toMatch(/limit for all players/);
    expect(free.getGeminiFreeRateLimitInfo('cpu')).toEqual({ gamesUsed: 0, gamesLimit: 3, globalExhausted: true });
  });

  it('treats an old proxy answer without a scope as the player\'s own limit', async () => {
    vi.stubGlobal('fetch', respond(429, { error: 'rate_limit', gamesUsed: 3, gamesLimit: 3 }));
    const ai = free.getGeminiFreeAI('cpu')!;
    await expect(ai.selectMove(context())).rejects.toMatchObject({ scope: 'user' });
    expect(free.getGeminiFreeRateLimitInfo('cpu')?.globalExhausted).toBe(false);
  });

  it('plays the answered move and records the counts on success', async () => {
    vi.stubGlobal('fetch', respond(200, { text: JSON.stringify({ moveIndex: 1, reasoning: 'ok' }), usageMetadata: { totalTokenCount: 10 }, gamesUsed: 2, gamesLimit: 3 }));
    const ai = free.getGeminiFreeAI('cpu')!;
    const ctx = context();
    expect(await ai.selectMove(ctx)).toBe(ctx.validMoves[1]);
    expect(free.getGeminiFreeRateLimitInfo('cpu')).toEqual({ gamesUsed: 2, gamesLimit: 3, globalExhausted: false });
  });
});
