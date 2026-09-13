// Resolve a multiplayer WebSocket URL from build-time configuration.
//
// Both games live in one bundle, so every build now carries BOTH servers'
// URLs (VITE_WS_URL for Scopa, VITE_BRISCOLA_WS_URL for Briscola) — a
// Briscola match started from the Scopa site must reach the Briscola
// backend, not the Scopa one. Two forms are accepted:
//   - an absolute ws:// or wss:// URL, used verbatim
//     (e.g. wss://playbriscola.com/ws — cross-origin WebSockets are fine,
//     the servers apply no origin check);
//   - a path such as "/ws-briscola", resolved against the page's own
//     origin (wss: on https:), for deployments that proxy the other game's
//     server under a same-origin route. Domain-agnostic, so one build
//     serves every alias domain.
// Unset → the local dev fallback.
export function resolveWsUrl(
  configured: string | undefined,
  fallback: string,
  location: { protocol: string; host: string } | undefined = typeof window !== 'undefined'
    ? window.location
    : undefined
): string {
  const value = configured?.trim();
  if (!value) return fallback;
  if (value.startsWith('/')) {
    if (!location) return fallback;
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${location.host}${value}`;
  }
  return value;
}
