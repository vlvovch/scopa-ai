// "Sign in with OpenRouter": OpenRouter's OAuth PKCE flow, which issues an
// API key for this app from the user's OpenRouter account without any
// copy-paste — and without a server or client secret, so it fits the
// static site. The resulting key is an ordinary key and is stored exactly
// where a pasted one goes (settings → browser storage), so everything
// downstream (validation, bots, the security notice) is unchanged.
//
// Flow: start() stores a fresh PKCE verifier in sessionStorage and sends
// the browser to https://openrouter.ai/auth with the S256 challenge and this
// page as callback; OpenRouter comes back to the same page with ?code=; on
// load, completeOpenRouterLogin() strips the parameter, exchanges the code
// plus verifier for the key (POST /api/v1/auth/keys) and hands it over.
//
// Website only: the iOS app's web view is not a URL OpenRouter can return
// to (that would need the system browser plus a deep link back), so the
// button is hidden there and the paste field stays.

import { IS_NATIVE_BUILD } from '../platform/native';
import { OPENROUTER_API_URL, OpenRouterError } from './openrouterProvider';

export const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
const VERIFIER_STORAGE_KEY = 'openrouter-pkce-verifier';
const CODE_PARAM = 'code';

/**
 * Session storage that can actually be used. Merely touching
 * `window.sessionStorage` throws where storage is denied (privacy modes,
 * some embedded contexts), and this runs during render, so it must never
 * throw — a denied store just means no sign-in button.
 */
function sessionStorageUsable(): boolean {
  try {
    const store = window.sessionStorage;
    if (!store) return false;
    const probe = '__openrouter_storage_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Sign-in works here: the website, in a secure context, with keys allowed. */
export function canUseOpenRouterLogin(): boolean {
  if (IS_NATIVE_BUILD) return false;
  if (import.meta.env.VITE_ITCH_MODE === 'true') return false;
  try {
    return (
      typeof window !== 'undefined' &&
      typeof crypto !== 'undefined' &&
      !!crypto.subtle &&
      sessionStorageUsable()
    );
  } catch {
    return false;
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 of the verifier, base64url-encoded (PKCE S256). Exported for tests. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** A fresh verifier (43 url-safe characters) and its challenge. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: await pkceChallenge(verifier) };
}

export function buildOpenRouterAuthUrl(callbackUrl: string, challenge: string): string {
  const url = new URL(OPENROUTER_AUTH_URL);
  url.searchParams.set('callback_url', callbackUrl);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export function stashPkceVerifier(verifier: string): boolean {
  try {
    sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
    return true;
  } catch {
    return false;
  }
}

/** The verifier stored by start(); single use. */
export function takePkceVerifier(): string | null {
  try {
    const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
    sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
    return verifier;
  } catch {
    return null;
  }
}

/** Trade the one-time code (plus our verifier) for the new API key. */
export async function exchangeOpenRouterCode(
  code: string,
  verifier: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const response = await fetchFn(`${OPENROUTER_API_URL}/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = (json as { error?: { message?: unknown } } | null)?.error?.message;
    throw new OpenRouterError(
      typeof message === 'string' ? message : 'Could not complete the sign-in',
      response.status
    );
  }
  const key = (json as { key?: unknown } | null)?.key;
  if (typeof key !== 'string' || !key) throw new OpenRouterError('OpenRouter returned no key');
  return key;
}

/** True when this page load is OpenRouter's callback (?code=…). */
export function hasOpenRouterCallback(search: string = window.location.search): boolean {
  return new URLSearchParams(search).has(CODE_PARAM);
}

/** Remove ?code= from the address bar so a reload cannot replay a used code. */
function stripCodeParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(CODE_PARAM)) return;
    url.searchParams.delete(CODE_PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    // leave the address bar alone
  }
}

/**
 * Begin the sign-in: the browser leaves for OpenRouter and comes back to
 * `callbackUrl` with a code. Resolves false when sign-in is not possible
 * here (native app, itch build, no secure context, storage blocked).
 */
export async function startOpenRouterLogin(callbackUrl: string): Promise<boolean> {
  if (!canUseOpenRouterLogin()) return false;
  const { verifier, challenge } = await createPkcePair();
  if (!stashPkceVerifier(verifier)) return false;
  window.location.assign(buildOpenRouterAuthUrl(callbackUrl, challenge));
  return true;
}

export type OpenRouterLoginOutcome =
  | { status: 'none' }
  | { status: 'connected'; key: string }
  | { status: 'error'; message: string };

/**
 * Finish the sign-in on the callback page load. The code parameter is
 * stripped first (it is single use), the stored verifier is consumed, and
 * the exchange yields the key. Dependencies are injectable for tests.
 */
export async function completeOpenRouterLogin(deps: {
  search?: string;
  takeVerifier?: () => string | null;
  exchange?: (code: string, verifier: string) => Promise<string>;
  strip?: () => void;
} = {}): Promise<OpenRouterLoginOutcome> {
  const search = deps.search ?? window.location.search;
  const code = new URLSearchParams(search).get(CODE_PARAM);
  if (!code) return { status: 'none' };
  (deps.strip ?? stripCodeParam)();
  const verifier = (deps.takeVerifier ?? takePkceVerifier)();
  if (!verifier) {
    return {
      status: 'error',
      message: 'this sign-in was started in another tab or session — please try again',
    };
  }
  try {
    const key = await (deps.exchange ?? exchangeOpenRouterCode)(code, verifier);
    return { status: 'connected', key };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
