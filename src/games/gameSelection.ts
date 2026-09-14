// Runtime game selection — both games live in one bundle on one origin.
//
// Each deployment is still built for ONE game (Vite `--mode scopa|briscola`,
// see .env.<game>). That game is the default for a first visit, ships in the
// main chunk, and keeps its PWA identity untouched: manifest, start_url "/",
// service-worker scope and the Android TWA launch URL are all unchanged.
// The other game is a lazily loaded chunk reachable from the in-app
// switcher (start screen and Settings).
//
// Resolution order on launch (highest priority first):
//   1. A multiplayer invitation (/join/CODE or ?join=CODE). Room codes are
//      game-prefixed by the servers (SCOPA-XXXX / BRISCOLA-XXXX), so an
//      existing link always opens the game it was created in — on either
//      site — and a page refresh mid-game (URL stays /join/CODE) comes back
//      up in the right game for its reconnect.
//   2. An explicit game URL: /scopa, /briscola (or ?game=…).
//   3. The remembered manual selection (localStorage on THIS origin only —
//      the Scopa and Briscola domains never share storage, so each keeps
//      its own preference).
//   4. The deployment's build-time default.

import { storage } from '../platform/storage';

export type GameId = 'scopa' | 'briscola';

export const GAME_IDS: readonly GameId[] = ['scopa', 'briscola'];

/** Display names — proper nouns, identical in every UI language. */
export const GAME_NAMES: Record<GameId, string> = {
  scopa: 'Scopa',
  briscola: 'Briscola',
};

/** The game this deployment was built for (VITE_GAME). First-visit default. */
export const DEFAULT_GAME: GameId =
  import.meta.env.VITE_GAME === 'briscola' ? 'briscola' : 'scopa';

/**
 * The itch.io embeds are separate single-game uploads served from a subpath
 * with no SPA routing, so the switch is disabled there and each page stays
 * exactly the game it was uploaded as.
 */
export const GAME_SWITCH_ENABLED = import.meta.env.VITE_ITCH_MODE !== 'true';

/**
 * localStorage key for the remembered manual selection. A device-level
 * preference like the UI language (`scopa-language`): it lives outside
 * GameSettings on purpose so "Reset to Defaults" never flips the game, and
 * it is never written by URL-driven routing — only by an explicit switch.
 */
export const GAME_PREFERENCE_KEY = 'selected-game';

export function isGameId(value: unknown): value is GameId {
  return value === 'scopa' || value === 'briscola';
}

export function otherGame(game: GameId): GameId {
  return game === 'scopa' ? 'briscola' : 'scopa';
}

export function loadGamePreference(): GameId | null {
  try {
    const stored = storage.get(GAME_PREFERENCE_KEY);
    return isGameId(stored) ? stored : null;
  } catch {
    return null; // localStorage unavailable (private mode) — fall through
  }
}

export function saveGamePreference(game: GameId): void {
  try {
    storage.set(GAME_PREFERENCE_KEY, game);
  } catch {
    // best effort — the in-session choice still applies
  }
}

/**
 * Storage keys that exist only once someone has actually played, saved or
 * joined something on this origin. Keys written on every load (settings,
 * language) are deliberately NOT here: they cannot tell a visitor from a
 * player. Grouped by game so an existing player of one game can be told
 * about the other one exactly once.
 */
const GAME_USE_KEYS: Record<GameId, string[]> = {
  scopa: [
    'scopa-game-state',
    'scopa-game-stats',
    'scopa-mp-session',
    'scopa-spectator-ais',
    'scopa-spectator-models',
  ],
  briscola: ['briscola-game-stats', 'briscola-mp-session'],
};
const SHARED_USE_KEYS = ['mp-nickname'];
const PRIOR_USE_KEYS = [...GAME_USE_KEYS.scopa, ...GAME_USE_KEYS.briscola, ...SHARED_USE_KEYS];

function hasAnyKey(keys: string[]): boolean {
  return keys.some((key) => storage.get(key) !== null);
}

/**
 * localStorage marker: the one-time "you can now play <other game>" notice
 * has been shown on this origin (dismissed or accepted).
 */
export const OTHER_GAME_ANNOUNCED_KEY = 'other-game-announced';

/**
 * True for an EXISTING player of this deployment's game who has never met
 * the other game: prior play of the default game on this origin, no trace
 * of the other one, never chose or switched games, and not told yet. The
 * default game's start screen shows the one-time notice only then — never
 * over a resumed match or a multiplayer reconnect, since it lives on the
 * start screen. New visitors get the first-launch chooser instead.
 */
export function shouldAnnounceOtherGame(): boolean {
  if (!GAME_SWITCH_ENABLED) return false;
  try {
    if (storage.get(GAME_PREFERENCE_KEY) !== null) return false;
    if (storage.get(OTHER_GAME_ANNOUNCED_KEY) !== null) return false;
    if (hasAnyKey(GAME_USE_KEYS[otherGame(DEFAULT_GAME)])) return false;
    return hasAnyKey(GAME_USE_KEYS[DEFAULT_GAME]) || hasAnyKey(SHARED_USE_KEYS);
  } catch {
    return false;
  }
}

export function markOtherGameAnnounced(): void {
  try {
    storage.set(OTHER_GAME_ANNOUNCED_KEY, '1');
  } catch {
    // best effort
  }
}

/**
 * True for a brand-new visitor on this origin: no remembered game and no
 * trace of prior play. App.tsx shows the one-time game chooser only then,
 * and only when nothing else (an invitation, an explicit game URL) has
 * already decided the game. Existing installs never see it.
 */
export function isFirstVisit(): boolean {
  try {
    if (storage.get(GAME_PREFERENCE_KEY) !== null) return false;
    return !hasAnyKey(PRIOR_USE_KEYS);
  } catch {
    return false; // storage unavailable: never gate the game behind a chooser
  }
}

/**
 * Which game a multiplayer room code belongs to. The servers generate
 * `SCOPA-XXXX` / `BRISCOLA-XXXX`; anything else is unknown (null).
 */
export function gameFromRoomCode(code: string): GameId | null {
  const upper = code.toUpperCase();
  if (upper.startsWith('BRISCOLA-')) return 'briscola';
  if (upper.startsWith('SCOPA-')) return 'scopa';
  return null;
}

/**
 * Join code carried by an invitation URL — `?join=CODE` or `/join/CODE` —
 * exactly as each game's own `getInitialJoinCode` reads it.
 */
export function parseJoinCode(pathname: string, search: string): string | null {
  const fromParam = new URLSearchParams(search).get('join');
  if (fromParam) return fromParam.toUpperCase();
  const pathMatch = pathname.match(/^\/join\/([A-Z0-9-]+)$/i);
  return pathMatch ? pathMatch[1].toUpperCase() : null;
}

export type GameRouteSource = 'invite' | 'url' | 'preference' | 'default' | 'switch' | 'welcome';

export interface GameRoute {
  game: GameId;
  /** Why this game was chosen (diagnostics / tests; not persisted). */
  source: GameRouteSource;
}

export interface GameRouteInput {
  pathname: string;
  search: string;
  /** Remembered manual selection, if any. */
  stored: GameId | null;
  /** Build-time default for this deployment. */
  defaultGame: GameId;
}

/** Pure resolution (see the order documented at the top of this file). */
export function resolveGameRoute(input: GameRouteInput): GameRoute {
  const { pathname, search, stored, defaultGame } = input;

  const joinCode = parseJoinCode(pathname, search);
  if (joinCode) {
    // Unknown prefix (never produced by our servers) falls back to the
    // deployment default, which is what such a link always opened before.
    return { game: gameFromRoomCode(joinCode) ?? defaultGame, source: 'invite' };
  }

  const pathMatch = pathname.match(/^\/(scopa|briscola)\/?$/i);
  if (pathMatch) {
    return { game: pathMatch[1].toLowerCase() as GameId, source: 'url' };
  }
  const fromQuery = new URLSearchParams(search).get('game')?.toLowerCase();
  if (isGameId(fromQuery)) {
    return { game: fromQuery, source: 'url' };
  }

  if (stored) return { game: stored, source: 'preference' };
  return { game: defaultGame, source: 'default' };
}

/** Resolve the game for this page load from the real URL + storage. */
export function readInitialGameRoute(): GameRoute {
  if (!GAME_SWITCH_ENABLED) return { game: DEFAULT_GAME, source: 'default' };
  return resolveGameRoute({
    pathname: window.location.pathname,
    search: window.location.search,
    stored: loadGamePreference(),
    defaultGame: DEFAULT_GAME,
  });
}

/**
 * The "home" URL of a game on this deployment: `/` for the build's default
 * game (the canonical / PWA start URL, unchanged), `/<game>` for the other.
 * Each app scrubs back to this — not to a hard-coded `/` — when it leaves a
 * multiplayer room, so the URL keeps naming the game that is on screen.
 */
export function gameHomePath(game: GameId): string {
  return game === DEFAULT_GAME ? '/' : `/${game}`;
}
