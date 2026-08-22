// Privacy-friendly gameplay analytics on top of the Swetrix pageview
// installation in index.html.
//
// Contract (see public/privacy.html):
//   - No cookies, no persistent identifiers, no profileId, no personal
//     data — events carry only the game mode and the opponent *kind*.
//   - No `unique` flag: monthly-unique players come from Swetrix's own
//     visitor accounting (funnel Start Visitors), not per-event dedup.
//   - Events are best-effort and must never break gameplay: they no-op
//     when Swetrix is absent (offline launch, blocked, dev/test hosts —
//     index.html only initializes it on production hostnames and sets
//     __swetrixReady after init).
export interface GameEventMeta {
  /** How the game is played. */
  mode: 'solo' | 'multiplayer';
  /** What kind of opponent: local bot, LLM, or human. */
  opponent: 'cpu' | 'ai' | 'human';
}

interface SwetrixLike {
  track(event: { ev: string; meta?: Record<string, string> }): void;
}

declare global {
  interface Window {
    swetrix?: SwetrixLike;
    /** Set by index.html once swetrix.init() ran (production hosts only). */
    __swetrixReady?: boolean;
  }
}

function trackEvent(ev: string, meta: GameEventMeta): void {
  if (typeof window === 'undefined') return;
  if (!window.__swetrixReady || !window.swetrix) return;
  try {
    window.swetrix.track({ ev, meta: { mode: meta.mode, opponent: meta.opponent } });
  } catch {
    // Analytics must never interfere with the game.
  }
}

/** Fire once when cards are dealt and a game genuinely begins. */
export function trackGameStarted(meta: GameEventMeta): void {
  trackEvent('GAME_STARTED', meta);
}

/** Fire once when a game reaches its final result. */
export function trackGameCompleted(meta: GameEventMeta): void {
  trackEvent('GAME_COMPLETED', meta);
}
