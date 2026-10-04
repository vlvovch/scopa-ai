// Invitation links and incoming URLs.
//
// On the website an invite is simply `${location.origin}/join/CODE` — the
// page's own origin, whichever alias domain the host is on. Inside the
// packaged app the origin would be capacitor://localhost, which nobody can
// open, so links are built on each game's public HTTPS domain instead;
// those are the domains the app claims as Universal Links (docs/ios.md).
//
// Incoming URLs (cold launch or while running) come in three shapes:
//   https://playscopa.net/join/BRISCOLA-AB12      universal link
//   https://playscopa.net/?join=BRISCOLA-AB12     query form
//   playscopa://join/BRISCOLA-AB12               custom scheme (simulator /
//                                                pre-verification fallback)
import { DEFAULT_GAME, gameFromRoomCode, isGameId, parseJoinCode, type GameId } from '../games/gameSelection';
import { IS_NATIVE_BUILD } from './native';

/** Public HTTPS origin of each game — where its invitation links point. */
export const PUBLIC_ORIGINS: Record<GameId, string> = {
  scopa: 'https://playscopa.net',
  briscola: 'https://playbriscola.com',
};

/** Custom URL scheme registered by the iOS app (Info.plist CFBundleURLSchemes). */
export const APP_URL_SCHEME = 'playscopa';

/** The website behind this build (VITE_SITE_URL, else the build-time game's
 *  domain): where the privacy policy and the "main site" links point. */
export const MAIN_SITE_URL: string = import.meta.env.VITE_SITE_URL || PUBLIC_ORIGINS[DEFAULT_GAME];

/** The iPhone and iPad app's page on the App Store (the id is its Apple ID). */
export const APP_STORE_ID = '6812582287';
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/**
 * Whether this copy of the site advertises the iPhone and iPad app: not
 * inside the app itself, and not on Android, where the badge leads nowhere
 * useful (that includes the Play Store app, which is this site in a Trusted
 * Web Activity).
 */
export function showsAppStoreBadge(
  native: boolean = IS_NATIVE_BUILD,
  userAgent: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): boolean {
  return !native && !/android/i.test(userAgent);
}

export function inviteUrl(roomCode: string, options: { native?: boolean; origin?: string } = {}): string {
  const native = options.native ?? IS_NATIVE_BUILD;
  if (!native) {
    const origin = options.origin ?? window.location.origin;
    return `${origin}/join/${roomCode}`;
  }
  const game = gameFromRoomCode(roomCode) ?? DEFAULT_GAME;
  return `${PUBLIC_ORIGINS[game]}/join/${roomCode}`;
}

export interface IncomingLink {
  /** Room code from a /join/CODE or ?join=CODE URL, uppercased. */
  joinCode: string | null;
  /** Game named by a /scopa or /briscola path (or ?game=), if any. */
  game: GameId | null;
}

/** Parse a URL the app was opened with. Never throws. */
export function parseIncomingLink(url: string | null | undefined): IncomingLink {
  const none: IncomingLink = { joinCode: null, game: null };
  if (!url) return none;
  let parsed: URL;
  try {
    // Custom-scheme URLs may lack the `//` authority: playscopa:join/X
    parsed = new URL(url.replace(/^([a-z][a-z0-9+.-]*):(?!\/\/)/i, '$1://'));
  } catch {
    return none;
  }
  let pathname = parsed.pathname;
  // playscopa://join/CODE parses "join" as the host: fold it back into the path.
  if (parsed.protocol === `${APP_URL_SCHEME}:` && parsed.hostname && parsed.hostname !== 'localhost') {
    pathname = `/${parsed.hostname}${pathname === '/' ? '' : pathname}`;
  }
  const joinCode = parseJoinCode(pathname, parsed.search);
  const pathMatch = pathname.match(/^\/(scopa|briscola)\/?$/i);
  const queryGame = parsed.searchParams.get('game')?.toLowerCase();
  const game = pathMatch
    ? (pathMatch[1].toLowerCase() as GameId)
    : isGameId(queryGame)
      ? queryGame
      : null;
  return { joinCode, game };
}

/**
 * The in-app path that makes the existing router and lobbies pick an
 * incoming link up: /join/CODE for invitations, /<game> for a game link.
 */
export function pathForIncomingLink(link: IncomingLink): string | null {
  if (link.joinCode) return `/join/${link.joinCode}`;
  if (link.game) return `/${link.game}`;
  return null;
}
