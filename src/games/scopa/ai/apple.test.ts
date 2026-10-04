// The on-device Scopa bot: uses the model's answer when it is a legal
// index, never stalls the game otherwise, and asks nothing when there is
// only one legal move.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeck } from '../deck';
import { getValidMoves } from '../rules';
import type { Card, Move } from '../types';
import type { LLMAIContext } from './types';
import { setOnDeviceModel, type OnDeviceMoveRequest, type OnDeviceMoveResponse } from '../../../ai/onDeviceModel';
import { AppleScopaAI, getAppleAI, prewarmAppleAI } from './apple';

const deck = createDeck();
const card = (id: string): Card => deck.find((c) => c.id === id)!;

function context(handIds: string[], tableIds: string[]): LLMAIContext {
  const hand = handIds.map(card);
  const table = tableIds.map(card);
  const validMoves: Move[] = hand.flatMap((c) => getValidMoves(c, table, 'cpu'));
  return {
    hand, table, player: 'cpu', validMoves,
    scores: { self: 3, opponent: 5 }, targetScore: 11, roundNumber: 2,
    opponentHandCount: 3, selfCapturedCount: 8, opponentCapturedCount: 10, deckCount: 12,
    lastOpponentMove: null, lastSelfMove: null,
  };
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); setOnDeviceModel(null); });

describe('AppleScopaAI', () => {
  it('plays the move the model chose and keeps its reasoning', async () => {
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    expect(ctx.validMoves.length).toBeGreaterThan(1);
    const selectMove = vi.fn<(request: OnDeviceMoveRequest) => Promise<OnDeviceMoveResponse>>(async () => ({ moveIndex: 1, reasoning: 'Take the three.' }));
    const ai = new AppleScopaAI({ selectMove, cancel: async () => {} });
    const move = await ai.selectMove(ctx);
    expect(move).toBe(ctx.validMoves[1]);
    expect(ai.lastReasoning).toBe('Take the three.');
    expect(ai.lastMoveWasFallback).toBe(false);
    const request = selectMove.mock.calls[0][0];
    expect(request.moveCount).toBe(ctx.validMoves.length);
    expect(request.instructions).toContain('Scopa');
    expect(request.instructions).toContain('moveIndex');
    expect(request.prompt).toContain('[0]');
    expect(request.prompt).toContain(`(0-${ctx.validMoves.length - 1})`);
    // the whole request stays far below the model's 4096-token window
    expect(request.instructions.length + request.prompt.length).toBeLessThan(6000);
  });

  it('sends the round memory when the captured piles are known, and prepares the next session after the answer', async () => {
    const ctx = { ...context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']), selfCaptured: [card('coins-1')], opponentCaptured: [card('cups-5')] };
    const selectMove = vi.fn<(request: OnDeviceMoveRequest) => Promise<OnDeviceMoveResponse>>(async () => ({ moveIndex: 0, reasoning: 'ok' }));
    const prewarm = vi.fn<(instructions: string) => Promise<void>>(async () => {});
    const ai = new AppleScopaAI({ selectMove, cancel: async () => {}, prewarm });
    await ai.selectMove(ctx);
    expect(selectMove.mock.calls[0][0].prompt).toContain('--- ROUND MEMORY');
    expect(selectMove.mock.calls[0][0].prompt).toContain('7 of coins: in your hand');
    expect(prewarm).toHaveBeenCalledTimes(1);
    expect(prewarm.mock.calls[0][0]).toBe(selectMove.mock.calls[0][0].instructions);
    ai.startRound();
    expect(prewarm).toHaveBeenCalledTimes(2);
  });

  it('shows the weighed moves by card name before the verdict', async () => {
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    const ai = new AppleScopaAI({ selectMove: async () => ({ moveIndex: 1, reasoning: 'The second is best.', candidates: [
      { moveIndex: 0, note: 'takes the 4 and 3.' }, { moveIndex: 1, note: 'takes the 3.' },
    ] }), cancel: async () => {} });
    const move = await ai.selectMove(ctx);
    expect(move).toBe(ctx.validMoves[1]);
    const card0 = `${ctx.validMoves[0].cardPlayed.value} of ${ctx.validMoves[0].cardPlayed.suit}`;
    const card1 = `${ctx.validMoves[1].cardPlayed.value} of ${ctx.validMoves[1].cardPlayed.suit}`;
    expect(ai.lastReasoning).toBe(`• ${card0}: takes the 4 and 3.\n✓ ${card1}: takes the 3.\n\nThe second is best.`);
  });

  it('falls back to a legal heuristic move on an out-of-range answer', async () => {
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    const ai = new AppleScopaAI({ selectMove: async () => ({ moveIndex: 99, reasoning: 'nope' }), cancel: async () => {} });
    const move = await ai.selectMove(ctx);
    expect(ctx.hand.map((c) => c.id)).toContain(move.cardPlayed.id);
    expect(ai.lastReasoning).toMatch(/heuristic move was played/);
    expect(ai.lastMoveWasFallback).toBe(true);
  });

  it('falls back to a legal heuristic move when the model fails', async () => {
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    const ai = new AppleScopaAI({ selectMove: async () => { throw new Error('guardrail'); }, cancel: async () => {} });
    const move = await ai.selectMove(ctx);
    expect(ctx.hand.map((c) => c.id)).toContain(move.cardPlayed.id);
    expect(ai.lastReasoning).toMatch(/did not answer/);
  });

  it('does not call the model when only one move is legal', async () => {
    const ctx = context(['coins-7'], ['cups-2']);
    expect(ctx.validMoves).toHaveLength(1);
    const selectMove = vi.fn();
    const ai = new AppleScopaAI({ selectMove, cancel: async () => {} });
    expect(await ai.selectMove(ctx)).toBe(ctx.validMoves[0]);
    expect(selectMove).not.toHaveBeenCalled();
  });

  it('plays a heuristic move when the model misses its deadline, and cancels the request', async () => {
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    const cancel = vi.fn(async () => {});
    const ai = new AppleScopaAI({ selectMove: () => new Promise(() => {}), cancel }, 'cpu', { timeoutMs: 20 });
    const move = await ai.selectMove(ctx);
    expect(ctx.hand.map((c) => c.id)).toContain(move.cardPlayed.id);
    expect(ai.lastReasoning).toMatch(/took too long/);
    expect(cancel).toHaveBeenCalledWith('cpu-1');
  });

  it('a request abandoned by a new round is cancelled and its late reply changes nothing', async () => {
    const ctx = context(['coins-7', 'cups-3', 'swords-10'], ['coins-4', 'clubs-3', 'swords-2']);
    let finish: (r: { moveIndex: number; reasoning: string }) => void = () => {};
    const cancel = vi.fn(async () => {});
    const ai = new AppleScopaAI({ selectMove: () => new Promise((resolve) => { finish = resolve; }), cancel }, 'cpu', { timeoutMs: 5000 });
    const pending = ai.selectMove(ctx);
    ai.startRound();
    expect(cancel).toHaveBeenCalledWith('cpu-1');
    finish({ moveIndex: 1, reasoning: 'late' });
    const move = await pending;
    expect(ctx.hand.map((c) => c.id)).toContain(move.cardPlayed.id);
    expect(ai.lastReasoning).toBe('');
  });
});

describe('getAppleAI', () => {
  it('is null without a model, and one cached instance per seat with it', () => {
    expect(getAppleAI('cpu')).toBeNull();
    setOnDeviceModel({ selectMove: async () => ({ moveIndex: 0, reasoning: '' }), cancel: async () => {} });
    const a = getAppleAI('cpu');
    expect(a).not.toBeNull();
    expect(getAppleAI('cpu')).toBe(a);
    expect(getAppleAI('p1')).not.toBe(a);
    expect(a!.name).toBe('Apple Intelligence');
  });
  it('prewarmAppleAI loads the model for a seat before its first move', () => {
    const prewarm = vi.fn<(instructions: string) => Promise<void>>(async () => {});
    setOnDeviceModel({ selectMove: async () => ({ moveIndex: 0, reasoning: '' }), cancel: async () => {}, prewarm });
    prewarmAppleAI('p2');
    expect(prewarm).toHaveBeenCalled();
    expect(prewarm.mock.calls[0][0]).toContain('Scopa');
  });
});
