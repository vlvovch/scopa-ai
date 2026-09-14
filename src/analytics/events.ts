// Privacy-friendly gameplay analytics on top of the Swetrix pageview
// installation (./loader.ts, which only loads Swetrix where ./gate.ts
// allows it: production builds on public hosts and Release device builds).
//
// Contract (see public/privacy.html):
//   - No cookies, no persistent identifiers, no profileId, no personal
//     data — events carry only which game, the game mode and the
//     opponent *kind* (plus, for a switch, the two game names).
//   - `platform` on every event: 'ios' (the Capacitor app), 'android' (the
//     Trusted Web Activity) or 'web' (./platform.ts).
//   - No `unique` flag: monthly-unique players come from Swetrix's own
//     visitor accounting (funnel Start Visitors), not per-event dedup.
//   - Events are best-effort and must never break gameplay: they no-op
//     when Swetrix is absent (offline launch, blocked, or the gate kept it
//     off: dev servers, dev/test hosts, native Debug builds, the Simulator;
//     the loader sets __swetrixReady only after a successful init).
//
// `game` was added when both games became playable on either site: each
// deployment reports to its own Swetrix project, so without it a Briscola
// match played on the Scopa site would be indistinguishable from Scopa.
import type { GameId } from '../games/gameSelection';
import { detectPlatform } from './platform';

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
    /** Set by the loader once swetrix.init() ran (gated environments only). */
    __swetrixReady?: boolean;
  }
}

function trackEvent(ev: string, meta: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  if (!window.__swetrixReady || !window.swetrix) return;
  try {
    // Every event says which distribution it came from: the iOS app, the
    // Android app or the website (./platform.ts).
    window.swetrix.track({ ev, meta: { ...meta, platform: detectPlatform() } });
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
