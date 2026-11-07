import { useCallback, useSyncExternalStore } from 'react';

const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Whether a CSS media query matches right now; re-renders when that changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => supported() && window.matchMedia(query).matches,
    () => false,
  );
}
