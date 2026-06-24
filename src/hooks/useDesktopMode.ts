import { useEffect, useState } from 'react';

/**
 * True when the desktop-site-mode rescue is active — i.e. the inline
 * detector in index.html has put `dmode` on <html> because a phone is
 * forced into Chrome's "Desktop site" mode and the whole app is being
 * CSS-zoomed into a mobile column.
 *
 * In that mode framer-motion card DRAG misbehaves: the pointer delta is
 * applied in the zoomed coordinate space, so the card moves ~scale×
 * faster than the finger. Callers use this to disable drag and fall
 * back to tap-to-play (which is unaffected). It's a no-op (always
 * false) for every normal user.
 */
export function useDesktopMode(): boolean {
  const [on, setOn] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dmode')
  );

  useEffect(() => {
    const check = () =>
      setOn(document.documentElement.classList.contains('dmode'));
    check();
    // The class is toggled by the inline detector on resize/orientation.
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);

  return on;
}
