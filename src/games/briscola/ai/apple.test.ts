// The on-device Briscola bot: same contract as the Scopa one.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeck } from '../../scopa/deck';
import { getLegalMoves } from '../rules';
import type { Card } from '../types';
import type { LLMAIContext } from './types';
import { setOnDeviceModel, type OnDeviceMoveRequest, type OnDeviceMoveResponse } from '../../../ai/onDeviceModel';
import { AppleBriscolaAI, getAppleBriscolaAI, startAppleBriscolaRound } from './apple';

const deck = createDeck();
const card = (id: string): Card => deck.find((c) => c.id === id)!;

function context(handIds: string[], leadId: string | null = null): LLMAIContext {
  const hand = handIds.map(card);
  return {
    hand, player: 'cpu', trump: card('cups-4'), trumpSuit: 'cups', leadCard: leadId ? card(leadId) : null, deckCount: 10,
    validMoves: getLegalMoves(hand, 'cpu'),
    scores: { self: 30, opponent: 25 }, targetScore: 1, roundNumber: 1, opponentHandCount: 3,
    lastOpponentMove: null, lastSelfMove: null,
  };
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'info').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); setOnDeviceModel(null); });

describe('AppleBriscolaAI', () => {
  it('plays the move the model chose and keeps its reasoning', async () => {
    const ctx = context(['coins-1', 'swords-7', 'cups-2'], 'coins-3');
    expect(ctx.validMoves).toHaveLength(3);
    const selectMove = vi.fn<(request: OnDeviceMoveRequest) => Promise<OnDeviceMoveResponse>>(async () => ({ moveIndex: 2, reasoning: 'Cheap trump takes the ace.' }));
    const ai = new AppleBriscolaAI({ selectMove, cancel: async () => {} });
    expect(await ai.selectMove(ctx)).toBe(ctx.validMoves[2]);
    expect(ai.lastReasoning).toBe('Cheap trump takes the ace.');
    const request = selectMove.mock.calls[0][0];
    expect(request.moveCount).toBe(3);
    expect(request.instructions).toContain('Briscola');
    expect(request.instructions).toContain('moveIndex');
    expect(request.instructions.length + request.prompt.length).toBeLessThan(6000);
  });

  it('sends the round memory when the captured piles are known, and prepares the next session after the answer', async () => {
    const ctx = { ...context(['coins-1', 'swords-7', 'cups-2'], 'coins-3'), myCaptured: [card('cups-1')], oppCaptured: [card('swords-3')] };
    const selectMove = vi.fn<(request: OnDeviceMoveRequest) => Promise<OnDeviceMoveResponse>>(async () => ({ moveIndex: 0, reasoning: 'ok' }));
    const prewarm = vi.fn<(instructions: string) => Promise<void>>(async () => {});
    const ai = new AppleBriscolaAI({ selectMove, cancel: async () => {}, prewarm });
    await ai.selectMove(ctx);
    expect(selectMove.mock.calls[0][0].prompt).toContain('--- ROUND MEMORY');
    expect(selectMove.mock.calls[0][0].prompt).toContain('Points captured: you 11, opponent 10');
    expect(prewarm).toHaveBeenCalledTimes(1);
    expect(prewarm.mock.calls[0][0]).toBe(selectMove.mock.calls[0][0].instructions);
  });

  it('falls back to a legal heuristic move on a bad answer or a failure', async () => {
    const ctx = context(['coins-1', 'swords-7', 'cups-2'], 'coins-3');
    const bad = new AppleBriscolaAI({ selectMove: async () => ({ moveIndex: -1, reasoning: '' }), cancel: async () => {} });
    expect(ctx.hand.map((c) => c.id)).toContain((await bad.selectMove(ctx)).cardPlayed.id);
    expect(bad.lastReasoning).toMatch(/heuristic move was played/);
    const failing = new AppleBriscolaAI({ selectMove: async () => { throw new Error('rate limited'); }, cancel: async () => {} });
    expect(ctx.hand.map((c) => c.id)).toContain((await failing.selectMove(ctx)).cardPlayed.id);
    expect(failing.lastReasoning).toMatch(/did not answer/);
  });

  it('flags a fallback move and clears the flag on the next answer', async () => {
    const ctx = context(['coins-1', 'swords-7', 'cups-2'], 'coins-3');
    let fail = true;
    const ai = new AppleBriscolaAI({ selectMove: async () => { if (fail) throw new Error('guardrail'); return { moveIndex: 0, reasoning: 'fine' }; }, cancel: async () => {} });
    await ai.selectMove(ctx);
    expect(ai.lastMoveWasFallback).toBe(true);
    expect(ai.lastReasoning).toMatch(/heuristic move was played/);
    fail = false;
    await ai.selectMove(ctx);
    expect(ai.lastMoveWasFallback).toBe(false);
    expect(ai.lastReasoning).toBe('fine');
  });

  it('does not call the model with a single card in hand', async () => {
    const ctx = context(['coins-1']);
    const selectMove = vi.fn();
    expect(await new AppleBriscolaAI({ selectMove, cancel: async () => {} }).selectMove(ctx)).toBe(ctx.validMoves[0]);
    expect(selectMove).not.toHaveBeenCalled();
  });

  it('plays a heuristic move when the model misses its deadline, and cancels the request', async () => {
    const ctx = context(['coins-1', 'swords-7', 'cups-2'], 'coins-3');
    const cancel = vi.fn(async () => {});
    const ai = new AppleBriscolaAI({ selectMove: () => new Promise(() => {}), cancel }, 'cpu', { timeoutMs: 20 });
    const move = await ai.selectMove(ctx);
    expect(ctx.hand.map((c) => c.id)).toContain(move.cardPlayed.id);
    expect(ai.lastReasoning).toMatch(/took too long/);
    expect(cancel).toHaveBeenCalledWith('cpu-1');
  });

  it('a request abandoned by a new round is cancelled and its late reply changes nothing', async () => {
    const ctx = context(['coins-1', 'swords-7', 'cups-2'], 'coins-3');
    let finish: (r: { moveIndex: number; reasoning: string }) => void = () => {};
    const cancel = vi.fn(async () => {});
    const ai = new AppleBriscolaAI({ selectMove: () => new Promise((resolve) => { finish = resolve; }), cancel }, 'cpu', { timeoutMs: 5000 });
    const pending = ai.selectMove(ctx);
    ai.startRound();
    expect(cancel).toHaveBeenCalledWith('cpu-1');
    finish({ moveIndex: 1, reasoning: 'late' });
    const move = await pending;
    expect(ctx.hand.map((c) => c.id)).toContain(move.cardPlayed.id);
    expect(ai.lastReasoning).toBe('');
  });

  it('getAppleBriscolaAI is null without a model and cached per seat with it', () => {
    expect(getAppleBriscolaAI('cpu')).toBeNull();
    setOnDeviceModel({ selectMove: async () => ({ moveIndex: 0, reasoning: '' }), cancel: async () => {} });
    const a = getAppleBriscolaAI('cpu');
    expect(a).not.toBeNull();
    expect(getAppleBriscolaAI('cpu')).toBe(a);
    expect(getAppleBriscolaAI('p2')).not.toBe(a);
  });
  it('the round start creates the seat\'s bot and loads the model while the cards are dealt', () => {
    const prewarm = vi.fn<(instructions: string) => Promise<void>>(async () => {});
    setOnDeviceModel({ selectMove: async () => ({ moveIndex: 0, reasoning: '' }), cancel: async () => {}, prewarm });
    startAppleBriscolaRound('p1');
    expect(prewarm).toHaveBeenCalled();
    expect(prewarm.mock.calls[0][0]).toContain('Briscola');
  });
});
