// The website wake-lock backend: requests only while wanted and visible,
// re-requests when the page comes back, releases cleanly, and is absent
// where the browser has no API.
import { describe, it, expect, vi } from 'vitest';
import { createWebWakeLock } from './useKeepAwake';

type Sentinel = { release: () => Promise<void> };

function fakeBrowser(visible = true) {
  const released: number[] = [];
  let n = 0;
  const request = vi.fn<(type: 'screen') => Promise<Sentinel>>(async () => {
    const id = ++n;
    return { release: async () => { released.push(id); } };
  });
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: visible ? 'visible' : 'hidden',
    addEventListener: (_: 'visibilitychange', l: () => void) => { listeners.add(l); },
    removeEventListener: (_: 'visibilitychange', l: () => void) => { listeners.delete(l); },
  };
  return { nav: { wakeLock: { request } }, doc, request, released, listeners };
}

describe('createWebWakeLock', () => {
  it('is null without the API', () => {
    expect(createWebWakeLock({}, { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} })).toBeNull();
    expect(createWebWakeLock(undefined, undefined)).toBeNull();
  });

  it('requests a screen lock on acquire and releases it on release', async () => {
    const b = fakeBrowser();
    const lock = createWebWakeLock(b.nav, b.doc)!;
    await lock.acquire();
    expect(b.request).toHaveBeenCalledWith('screen');
    expect(b.listeners.size).toBe(1);
    await lock.release();
    expect(b.released).toEqual([1]);
    expect(b.listeners.size).toBe(0);
    await lock.release(); // idempotent
    expect(b.released).toEqual([1]);
  });

  it('waits for the page to be visible, then re-requests after it comes back', async () => {
    const b = fakeBrowser(false);
    const lock = createWebWakeLock(b.nav, b.doc)!;
    await lock.acquire();
    expect(b.request).not.toHaveBeenCalled();
    b.doc.visibilityState = 'visible';
    for (const l of b.listeners) l();
    await new Promise((r) => setTimeout(r, 0));
    expect(b.request).toHaveBeenCalledTimes(1);
    // the browser drops the lock when hidden; coming back requests again
    for (const l of b.listeners) l();
    await new Promise((r) => setTimeout(r, 0));
    expect(b.request).toHaveBeenCalledTimes(2);
    await lock.release();
    expect(b.released).toEqual([2]);
  });

  it('does not keep a lock that arrives after release', async () => {
    const b = fakeBrowser();
    let resolveRequest: (s: Sentinel) => void = () => {};
    b.nav.wakeLock.request = vi.fn<(type: 'screen') => Promise<Sentinel>>(
      () => new Promise<Sentinel>((r) => { resolveRequest = r; })
    );
    const lock = createWebWakeLock(b.nav, b.doc)!;
    const acquiring = lock.acquire();
    await lock.release();
    const release = vi.fn(async () => {});
    resolveRequest({ release });
    await acquiring;
    expect(release).toHaveBeenCalledTimes(1);
  });
});
