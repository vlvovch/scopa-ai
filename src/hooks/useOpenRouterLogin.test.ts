// The broker that hands a completed sign-in to the screen that is mounted
// when it resolves. The bug it guards against: a screen that unmounted
// during the exchange (a game switch) received the key first and wrote it
// into settings state that no longer existed, so the key was lost while
// the visible screen said "Connected".

import { describe, it, expect, vi } from 'vitest';
import { createLoginBroker, type LoginResult } from './useOpenRouterLogin';

vi.mock('../ai/openrouterAuth', () => ({
  canUseOpenRouterLogin: () => false,
  completeOpenRouterLogin: async () => ({ status: 'none' }),
  hasOpenRouterCallback: () => false,
  startOpenRouterLogin: async () => false,
}));
vi.mock('../ai/validateApiKey', () => ({ validateOpenRouterKey: async () => ({ valid: true }) }));
vi.mock('../ai/apiKeyCaches', () => ({ clearApiKeyCaches: () => {} }));

const connected: LoginResult = { outcome: { status: 'connected', key: 'sk-or-v1-new' }, valid: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createLoginBroker', () => {
  it('gives the result to the screen that is still subscribed, never to one that left', async () => {
    const d = deferred<LoginResult>();
    const broker = createLoginBroker(() => d.promise);
    const scopa = vi.fn();
    const briscola = vi.fn();
    broker.start();
    const leaveScopa = broker.subscribe(scopa);
    leaveScopa();                       // game switch while the exchange runs
    broker.subscribe(briscola);
    d.resolve(connected);
    await flush();
    expect(scopa).not.toHaveBeenCalled();
    expect(briscola).toHaveBeenCalledTimes(1);
    expect(briscola).toHaveBeenCalledWith(connected, true);
  });

  it('marks exactly one live subscriber as the one to act', async () => {
    const d = deferred<LoginResult>();
    const broker = createLoginBroker(() => d.promise);
    const a = vi.fn();
    const b = vi.fn();
    broker.start();
    broker.subscribe(a);
    broker.subscribe(b);
    d.resolve(connected);
    await flush();
    expect(a).toHaveBeenCalledWith(connected, true);
    expect(b).toHaveBeenCalledWith(connected, false);
  });

  it('holds the result for a screen that mounts after everyone left', async () => {
    const d = deferred<LoginResult>();
    const broker = createLoginBroker(() => d.promise);
    const early = vi.fn();
    broker.start();
    broker.subscribe(early)();          // subscribed and gone before the result
    d.resolve(connected);
    await flush();
    expect(early).not.toHaveBeenCalled();
    const late = vi.fn();
    broker.subscribe(late);
    expect(late).toHaveBeenCalledWith(connected, true);
    const later = vi.fn();
    broker.subscribe(later);
    expect(later).toHaveBeenCalledWith(connected, false);
  });

  it('starts the completion once and reports it', async () => {
    const complete = vi.fn(async () => connected);
    const broker = createLoginBroker(complete);
    expect(broker.started).toBe(false);
    broker.start();
    broker.start();
    expect(broker.started).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('never flags a "nothing to do" outcome as one to act on', async () => {
    const broker = createLoginBroker(async () => ({ outcome: { status: 'none' }, valid: false }));
    const a = vi.fn();
    broker.start();
    broker.subscribe(a);
    await flush();
    expect(a).toHaveBeenCalledWith({ outcome: { status: 'none' }, valid: false }, false);
  });
});
