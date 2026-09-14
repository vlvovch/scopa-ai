// Privacy-friendly gameplay analytics on top of the Swetrix pageview
// installation in index.html.
//
// Contract (see public/privacy.html):
//   - No cookies, no persistent identifiers, no profileId, no personal
//     data — events carry only which game, the game mode and the
//     opponent *kind* (plus, for a switch, the two game names).
//   - No `unique` flag: monthly-unique players come from Swetrix's own
//     visitor accounting (funnel Start Visitors), not per-event dedup.
//   - Events are best-effort and must never break gameplay: they no-op
//     when Swetrix is absent (offline launch, blocked, dev/test hosts —
//     index.html only initializes it on production hostnames and sets
//     __swetrixReady after init).
//
// `game` was added when both games became playable on either site: each
// deployment reports to its own Swetrix project, so without it a Briscola
// match played on the Scopa site would be indistinguishable from Scopa.
import type { GameId } from './games/gameSelection';

export interface GameEventMeta {
  /** Which game: 'scopa' | 'briscola'. */
  game: GameId;
  /** How the game is played. */
  mode: 'solo' | 'multiplayer';
  /** What kind of opponent: local bot, LLM, or human. */
  opponent: 'cpu' | 'ai' | 'human';
}

export interface GameSwitchMeta {
  from: GameId;
  to: GameId;
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

function trackEvent(ev: string, meta: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  if (!window.__swetrixReady || !window.swetrix) return;
  try {
    window.swetrix.track({ ev, meta });
  } catch {
    // Analytics must never interfere with the game.
  }
}

/** Fire once when cards are dealt and a game genuinely begins. */
export function trackGameStarted(meta: GameEventMeta): void {
  trackEvent('GAME_STARTED', { game: meta.game, mode: meta.mode, opponent: meta.opponent });
}

/** Fire once when a game reaches its final result. */
export function trackGameCompleted(meta: GameEventMeta): void {
  trackEvent('GAME_COMPLETED', { game: meta.game, mode: meta.mode, opponent: meta.opponent });
}

/** Fire when the user switches between Scopa and Briscola in-app. */
export function trackGameSwitched(meta: GameSwitchMeta): void {
  trackEvent('GAME_SWITCHED', { from: meta.from, to: meta.to });
}

/** Fire when a first-time visitor picks a game on the welcome chooser. */
export function trackGameChosen(meta: { game: GameId }): void {
  trackEvent('GAME_CHOSEN', { game: meta.game });
}
