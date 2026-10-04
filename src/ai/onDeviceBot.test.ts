// The request lifecycle the on-device bots share: one request per seat,
// a deadline, cancellation of abandoned requests, stale replies ignored.
import { describe, it, expect, vi } from 'vitest';
import { OnDeviceRequester, withDeadline, DeadlineError, composeReasoning, firstSentences } from './onDeviceBot';
import type { OnDeviceModel, OnDeviceMoveRequest, OnDeviceMoveResponse } from './onDeviceModel';

type Pending = { resolve: (r: OnDeviceMoveResponse) => void; reject: (e: unknown) => void; request: OnDeviceMoveRequest };

/** A model whose requests stay pending until the test settles them. */
function controllableModel() {
  const pending: Pending[] = [];
  const cancel = vi.fn(async () => {});
  const model: OnDeviceModel = {
    selectMove: (request) => new Promise<OnDeviceMoveResponse>((resolve, reject) => pending.push({ resolve, reject, request })),
    cancel,
  };
  return { model, pending, cancel };
}

const REQUEST = { instructions: 'rules', prompt: 'state', moveCount: 3 };

describe('withDeadline', () => {
  it('passes results and errors through, and rejects past the deadline', async () => {
    await expect(withDeadline(Promise.resolve(1), 50)).resolves.toBe(1);
    await expect(withDeadline(Promise.reject(new Error('x')), 50)).rejects.toThrow('x');
    await expect(withDeadline(new Promise(() => {}), 20)).rejects.toBeInstanceOf(DeadlineError);
  });
});

describe('composeReasoning', () => {
  const name = (i: number) => ['7 of cups', '9 of clubs', '2 of coins'][i];
  it('lists each weighed move by its card, ticks the chosen one, then the verdict as its own paragraph', () => {
    const text = composeReasoning({ moveIndex: 0, reasoning: 'The 7 is best: it captures.', candidates: [
      { moveIndex: 0, note: 'captures the 4 and the 3.' }, { moveIndex: 1, note: 'only places a card.' },
    ] }, 3, name);
    expect(text).toBe('✓ 7 of cups: captures the 4 and the 3.\n• 9 of clubs: only places a card.\n\nThe 7 is best: it captures.');
  });
  it('drops candidates with a bad index, an empty note or a repeated index, and copes without any', () => {
    expect(composeReasoning({ moveIndex: 0, reasoning: 'Verdict.', candidates: [
      { moveIndex: 7, note: 'nope' }, { moveIndex: 1, note: '   ' }, { moveIndex: 2, note: ' fine ' }, { moveIndex: 2, note: 'again' },
    ] }, 3, name)).toBe('• 2 of coins: fine\n\nVerdict.');
    expect(composeReasoning({ moveIndex: 0, reasoning: 'Verdict.' }, 3, name)).toBe('Verdict.');
    expect(composeReasoning({ moveIndex: 0, reasoning: '' }, 3, name)).toBe('');
  });
  it('strips the move echoed at the start of a note', () => {
    expect(composeReasoning({ moveIndex: 1, reasoning: 'V.', candidates: [
      { moveIndex: 0, note: 'Play 7 of cups: takes the 4.' }, { moveIndex: 1, note: '9 of clubs - safe.' }, { moveIndex: 2, note: 'Playing 2 of coins' },
    ] }, 3, name)).toBe('• 7 of cups: takes the 4.\n✓ 9 of clubs: safe.\n• 2 of coins\n\nV.');
    expect(composeReasoning({ moveIndex: 2, reasoning: 'V.', candidates: [
      { moveIndex: 2, note: 'Plays 2 of Coins (trump): wins the trick, takes 11 points' }, { moveIndex: 0, note: '7 of cups (10pt) loses the trick' },
    ] }, 3, name)).toBe('✓ 2 of coins: wins the trick, takes 11 points\n• 7 of cups: loses the trick\n\nV.');
  });
  it('keeps at most two sentences of the verdict', () => {
    expect(composeReasoning({ moveIndex: 0, reasoning: 'One. Two! Three? Four.' }, 3, name)).toBe('One. Two!');
    expect(firstSentences('Only 0.5 points here', 2)).toBe('Only 0.5 points here');
    expect(firstSentences('  First.  Second.  ', 1)).toBe('First.');
  });
});

describe('OnDeviceRequester', () => {
  it('sends ids and the deadline, and returns the answer', async () => {
    const { model, pending } = controllableModel();
    const requester = new OnDeviceRequester(model, 'cpu', { timeoutMs: 5000 });
    const outcome = requester.ask(REQUEST);
    expect(pending[0].request).toEqual({ ...REQUEST, requestId: 'cpu-1', timeoutMs: 5000 });
    pending[0].resolve({ moveIndex: 2, reasoning: 'ok' });
    expect(await outcome).toEqual({ kind: 'answer', response: { moveIndex: 2, reasoning: 'ok' }, requestId: 'cpu-1' });
  });

  it('times out, cancels the native request, and ignores the late reply', async () => {
    const { model, pending, cancel } = controllableModel();
    const requester = new OnDeviceRequester(model, 'cpu', { timeoutMs: 20 });
    const outcome = await requester.ask(REQUEST);
    expect(outcome).toEqual({ kind: 'timeout' });
    expect(cancel).toHaveBeenCalledWith('cpu-1');
    pending[0].resolve({ moveIndex: 0, reasoning: 'late' }); // nothing listens any more
    const next = requester.ask(REQUEST);
    expect(pending[1].request.requestId).toBe('cpu-2');
    pending[1].resolve({ moveIndex: 1, reasoning: 'fresh' });
    expect((await next).kind).toBe('answer');
  });

  it('a new request supersedes the pending one, whose reply becomes stale', async () => {
    const { model, pending, cancel } = controllableModel();
    const requester = new OnDeviceRequester(model, 'p1', { timeoutMs: 5000 });
    const first = requester.ask(REQUEST);
    const second = requester.ask(REQUEST);
    expect(cancel).toHaveBeenCalledWith('p1-1');
    pending[0].resolve({ moveIndex: 0, reasoning: 'old' });
    expect(await first).toEqual({ kind: 'stale' });
    pending[1].resolve({ moveIndex: 1, reasoning: 'new' });
    expect((await second).kind).toBe('answer');
  });

  it('cancelPending abandons the request in flight; its rejection is stale, not a failure', async () => {
    const { model, pending, cancel } = controllableModel();
    const requester = new OnDeviceRequester(model, 'cpu', { timeoutMs: 5000 });
    const outcome = requester.ask(REQUEST);
    requester.cancelPending();
    expect(cancel).toHaveBeenCalledWith('cpu-1');
    pending[0].reject(new Error('On-device model request cancelled'));
    expect(await outcome).toEqual({ kind: 'stale' });
    requester.cancelPending(); // nothing in flight: no second cancel
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('prewarm and release reach the model when it offers them, and are no-ops otherwise', async () => {
    const prewarm = vi.fn(async () => {});
    const release = vi.fn(async () => {});
    const { model } = controllableModel();
    const requester = new OnDeviceRequester({ ...model, prewarm, release }, 'cpu');
    requester.prewarm('rules');
    expect(prewarm).toHaveBeenCalledWith('rules');
    requester.release();
    expect(release).toHaveBeenCalledTimes(1);
    expect(() => new OnDeviceRequester(model, 'cpu').prewarm('rules')).not.toThrow();
    expect(() => new OnDeviceRequester(model, 'cpu').release()).not.toThrow();
    // a rejecting shell is swallowed, never an unhandled rejection
    const failing = new OnDeviceRequester({ ...model, prewarm: async () => { throw new Error('busy'); } }, 'cpu');
    expect(() => failing.prewarm('rules')).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('treats the shell\'s own "timed out" rejection as a timeout', async () => {
    const { model, pending, cancel } = controllableModel();
    const requester = new OnDeviceRequester(model, 'cpu', { timeoutMs: 5000 });
    const outcome = requester.ask(REQUEST);
    pending[0].reject({ message: 'On-device model timed out after 1000 ms' });
    expect(await outcome).toEqual({ kind: 'timeout' });
    expect(cancel).not.toHaveBeenCalled(); // the shell already cancelled it
  });

  it('reports a rejected request as failed', async () => {
    const { model, pending } = controllableModel();
    const requester = new OnDeviceRequester(model, 'cpu', { timeoutMs: 5000 });
    const outcome = requester.ask(REQUEST);
    pending[0].reject(new Error('guardrail'));
    const result = await outcome;
    expect(result.kind).toBe('failed');
  });
});
