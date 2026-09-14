// Keep the screen awake while something worth watching but not touching is
// on screen (a watch-mode game): the native app disables the idle timer,
// the website asks for a Screen Wake Lock where the browser has one. The
// lock is released as soon as `active` turns false or the game unmounts.
import { useEffect } from 'react';
import { IS_NATIVE_BUILD } from '../platform/native';

export interface KeepAwakeBackend {
  acquire(): Promise<void>;
  release(): Promise<void>;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

interface NavigatorLike {
  wakeLock?: WakeLockLike;
}

interface DocumentLike {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * The website's backend: the Screen Wake Lock API. Browsers drop the lock
 * whenever the page is hidden, so it is re-requested when the page comes
 * back while still wanted. Null where the API does not exist.
 */
export function createWebWakeLock(
  nav: NavigatorLike | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
  doc: DocumentLike | undefined = typeof document !== 'undefined' ? document : undefined
): KeepAwakeBackend | null {
  const wakeLock = nav?.wakeLock;
  if (!wakeLock || !doc) return null;
  let sentinel: WakeLockSentinelLike | null = null;
  let wanted = false;
  const request = async () => {
    if (!wanted || doc.visibilityState !== 'visible') return;
    try {
      const next = await wakeLock.request('screen');
      if (wanted) sentinel = next;
      else await next.release().catch(() => undefined);
    } catch {
      // denied (low battery, settings): nothing to do
    }
  };
  const onVisibility = () => { void request(); };
  return {
    async acquire() {
      if (wanted) return;
      wanted = true;
      doc.addEventListener('visibilitychange', onVisibility);
      await request();
    },
    async release() {
      if (!wanted) return;
      wanted = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      const current = sentinel;
      sentinel = null;
      await current?.release().catch(() => undefined);
    },
  };
}

async function backendFor(): Promise<KeepAwakeBackend | null> {
  if (IS_NATIVE_BUILD) {
    const { nativeKeepAwake } = await import('../platform/keepAwake');
    return nativeKeepAwake;
  }
  return createWebWakeLock();
}

/** Hold the screen awake while `active` is true. */
export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let backend: KeepAwakeBackend | null = null;
    void (async () => {
      const found = await backendFor();
      if (cancelled || !found) return;
      backend = found;
      await found.acquire();
      // Deactivated while the request was in flight: give the lock back.
      if (cancelled) await found.release();
    })();
    return () => {
      cancelled = true;
      void backend?.release();
    };
  }, [active]);
}
