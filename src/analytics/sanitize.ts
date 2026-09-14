// What leaves the device in a pageview or event must not identify a game
// room: an invitation URL (`/join/SCOPA-AB12`, or the older `?join=…`)
// names a room a stranger could enter. Paths are normalised to `/join`
// and invite parameters dropped before anything is sent.

const JOIN_SEGMENT = /\/join\/[^/?#]+/gi;
const INVITE_PARAMS = new Set(['join', 'code', 'room']);
const ROOM_CODE = /^(SCOPA|BRISCOLA)-[A-Z0-9]{3,8}$/i;

/** `/join/SCOPA-AB12` → `/join`; every other path unchanged. */
export function sanitizePagePath(path: string | undefined): string {
  if (!path) return path ?? '';
  return path.replace(JOIN_SEGMENT, '/join').replace(/\/join\/?$/i, '/join');
}

/**
 * Drop invite-bearing parameters from a query string (without the leading
 * `?`): `join=…` and friends by name, and anything whose value is a room
 * code. Keeps the rest (campaign parameters), in order.
 */
export function sanitizeQueryString(qs: string | undefined): string | undefined {
  if (!qs) return qs;
  const kept = qs
    .split('&')
    .filter((pair) => {
      if (!pair) return false;
      const eq = pair.indexOf('=');
      const rawName = eq === -1 ? pair : pair.slice(0, eq);
      const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
      let name = rawName;
      let value = rawValue;
      try {
        name = decodeURIComponent(rawName.replace(/\+/g, ' '));
        value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
      } catch {
        // keep the raw form
      }
      if (INVITE_PARAMS.has(name.toLowerCase())) return false;
      if (ROOM_CODE.test(value.trim())) return false;
      return true;
    });
  return kept.length ? kept.join('&') : undefined;
}

export interface PageviewPayload {
  pg?: string;
  qs?: string;
}

/** The pageview callback for the Swetrix client: the fields it may rewrite. */
export function sanitizePageview(payload: PageviewPayload): { pg: string; qs: string | undefined } {
  return {
    pg: sanitizePagePath(payload.pg) || '/',
    qs: sanitizeQueryString(payload.qs),
  };
}

/** `/?join=SCOPA-AB12` in the address bar → the path form, `/join/SCOPA-AB12`. */
export function invitePathFromQuery(search: string): string | null {
  if (!search || search.length < 2) return null;
  const code = new URLSearchParams(search).get('join')?.trim().toUpperCase();
  return code && ROOM_CODE.test(code) ? `/join/${code}` : null;
}
