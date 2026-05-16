// Mocked-SDK tests for the BYOK Claude bot. Replaces @anthropic-ai/sdk's
// default export with a fake class exposing beta.messages.create.

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

const mocks = vi.hoisted(() => ({ messagesCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    beta = { messages: { create: mocks.messagesCreate } };
  },
}));

vi.mock('../../scopa/ai/claude', () => ({
  getClaudeApiKey: () => 'sk-test',
  isClaudeAvailable: () => true,
  fetchClaudeModels: async () => [],
  getCachedClaudeModels: () => [],
  isAdaptiveThinkingModel: (m: string) => /opus-4-(\d+)/.test(m),
}));

function fakeClaudeResponse(json: object, options: { usage?: object } = {}) {
  return {
    content: [{ type: 'text', text: JSON.stringify(json) }],
    usage: options.usage,
  };
}

describe('ClaudeBriscolaAI', () => {
  beforeEach(() => mocks.messagesCreate.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('multi-turn: accumulates the messages array across calls', async () => {
    // Snapshot the length at call-time — the bot mutates the same array
    // by reference, so a later assertion on mock.calls[0][0].messages
    // would see the post-mutation state.
    const lengths: number[] = [];
    const roles: string[][] = [];
    mocks.messagesCreate.mockImplementation((params: { messages: { role: string }[] }) => {
      lengths.push(params.messages.length);
      roles.push(params.messages.map((m) => m.role));
      return Promise.resolve(
        fakeClaudeResponse({ moveIndex: lengths.length - 1, reasoning: 'r' })
      );
    });
    const { getClaudeBriscolaAI, clearClaudeCache } = await import('./claude');
    clearClaudeCache();
    const ai = getClaudeBriscolaAI('claude-sonnet-4-5-20250929', true, 'multiturn');
    ai!.startRound();
    await ai!.selectMove(ctx());
    await ai!.selectMove(ctx());

    // First call: 1 user message. Second: user + assistant + user = 3.
    expect(lengths).toEqual([1, 3]);
    expect(roles[1]).toEqual(['user', 'assistant', 'user']);
  });

  it('single-turn: messages array is always length 1 (just the prompt)', async () => {
    mocks.messagesCreate
      .mockResolvedValueOnce(fakeClaudeResponse({ moveIndex: 0, reasoning: 'a' }))
      .mockResolvedValueOnce(fakeClaudeResponse({ moveIndex: 1, reasoning: 'b' }));
    const { getClaudeBriscolaAI, clearClaudeCache } = await import('./claude');
    clearClaudeCache();
    const ai = getClaudeBriscolaAI('claude-sonnet-4-5-20250929', true, 'singleturn');
    ai!.startRound();
    await ai!.selectMove(ctx());
    await ai!.selectMove(ctx());

    for (const call of mocks.messagesCreate.mock.calls) {
      expect((call[0].messages as unknown[]).length).toBe(1);
    }
  });

  it('uses adaptive thinking for opus-4-7 (not the legacy "enabled" shape)', async () => {
    mocks.messagesCreate.mockResolvedValueOnce(
      fakeClaudeResponse({ moveIndex: 0, reasoning: 'x' })
    );
    const { getClaudeBriscolaAI, clearClaudeCache } = await import('./claude');
    clearClaudeCache();
    const ai = getClaudeBriscolaAI('claude-opus-4-7-20251015', true, 'multiturn');
    ai!.startRound();
    await ai!.selectMove(ctx());

    const params = mocks.messagesCreate.mock.calls[0][0];
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.output_config).toEqual({ effort: 'high' });
  });

  it('uses legacy thinking.enabled for non-adaptive models (Sonnet)', async () => {
    mocks.messagesCreate.mockResolvedValueOnce(
      fakeClaudeResponse({ moveIndex: 0, reasoning: 'x' })
    );
    const { getClaudeBriscolaAI, clearClaudeCache } = await import('./claude');
    clearClaudeCache();
    const ai = getClaudeBriscolaAI('claude-sonnet-4-5-20250929', true, 'multiturn');
    ai!.startRound();
    await ai!.selectMove(ctx());

    const params = mocks.messagesCreate.mock.calls[0][0];
    expect(params.thinking).toMatchObject({ type: 'enabled' });
    expect(params.thinking.budget_tokens).toBeGreaterThan(0);
  });

  it('omits thinking entirely when useThinking=false (Flash-style)', async () => {
    mocks.messagesCreate.mockResolvedValueOnce(
      fakeClaudeResponse({ moveIndex: 0, reasoning: 'x' })
    );
    const { getClaudeBriscolaAI, clearClaudeCache } = await import('./claude');
    clearClaudeCache();
    const ai = getClaudeBriscolaAI('claude-sonnet-4-5-20250929', false, 'multiturn');
    ai!.startRound();
    await ai!.selectMove(ctx());

    const params = mocks.messagesCreate.mock.calls[0][0];
    expect(params.thinking).toBeUndefined();
  });

  it('falls back to first valid move when response has no text block', async () => {
    mocks.messagesCreate.mockResolvedValueOnce({ content: [], usage: undefined });
    const { getClaudeBriscolaAI, clearClaudeCache } = await import('./claude');
    clearClaudeCache();
    const ai = getClaudeBriscolaAI('claude-sonnet-4-5-20250929', true, 'multiturn');
    ai!.startRound();
    const move = await ai!.selectMove(ctx());
    expect(move.cardPlayed.id).toBe('coins-1');
  });

  it('single-card hand short-circuits (no API call)', async () => {
    const { getClaudeBriscolaAI, clearClaudeCache } = await import('./claude');
    clearClaudeCache();
    const ai = getClaudeBriscolaAI('claude-sonnet-4-5-20250929', true, 'multiturn');
    ai!.startRound();
    const only = card('cups', 1);
    const move = await ai!.selectMove(
      ctx({ hand: [only], validMoves: [{ player: 'cpu', cardPlayed: only }] })
    );
    expect(move.cardPlayed.id).toBe('cups-1');
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
  });
});
