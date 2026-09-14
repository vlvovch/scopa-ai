// The PKCE sign-in helpers: challenge derivation, the auth URL, the code
// exchange and the callback completion (with its single-use verifier).

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  pkceChallenge,
  createPkcePair,
  buildOpenRouterAuthUrl,
  exchangeOpenRouterCode,
  completeOpenRouterLogin,
  hasOpenRouterCallback,
  canUseOpenRouterLogin,
} from './openrouterAuth';

vi.mock('../hooks/useSettings', () => ({
  getOpenRouterApiKey: () => null,
  isOpenRouterKeyValid: () => false,
}));

afterEach(() => vi.unstubAllGlobals());

describe('canUseOpenRouterLogin', () => {
  const fakeStorage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    };
  };

  it('is true with a usable session storage', () => {
    vi.stubGlobal('window', { sessionStorage: fakeStorage() });
    expect(canUseOpenRouterLogin()).toBe(true);
  });

  it('is false, and does not throw, where storage access is denied', () => {
    const denied = {};
    Object.defineProperty(denied, 'sessionStorage', {
      get() {
        throw new Error('SecurityError: access denied');
      },
    });
    vi.stubGlobal('window', denied);
    expect(canUseOpenRouterLogin()).toBe(false);
    const readOnly = { sessionStorage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} } };
    vi.stubGlobal('window', readOnly);
    expect(canUseOpenRouterLogin()).toBe(false);
  });
});

describe('PKCE', () => {
  it('derives the S256 challenge of RFC 7636 appendix B', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
  });

  it('makes a url-safe 43-character verifier and a matching challenge', async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(await pkceChallenge(verifier));
    const again = await createPkcePair();
    expect(again.verifier).not.toBe(verifier);
  });

  it('builds the auth url with the callback and the challenge', () => {
    const url = new URL(buildOpenRouterAuthUrl('https://playscopa.net/briscola', 'abc-_'));
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth');
    expect(url.searchParams.get('callback_url')).toBe('https://playscopa.net/briscola');
    expect(url.searchParams.get('code_challenge')).toBe('abc-_');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('exchangeOpenRouterCode', () => {
  it('posts code, verifier and method and returns the key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ key: 'sk-or-v1-new' }), { status: 200 }));
    const key = await exchangeOpenRouterCode('CODE', 'VERIFIER', fetchMock as unknown as typeof fetch);
    expect(key).toBe('sk-or-v1-new');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/auth/keys');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'CODE', code_verifier: 'VERIFIER', code_challenge_method: 'S256' });
  });

  it('surfaces OpenRouter error messages with the status', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: 400, message: 'Invalid code' } }), { status: 400 }));
    await expect(exchangeOpenRouterCode('bad', 'v', fetchMock as unknown as typeof fetch)).rejects.toThrowError(/Invalid code \(HTTP 400\)/);
    const noKey = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    await expect(exchangeOpenRouterCode('c', 'v', noKey as unknown as typeof fetch)).rejects.toThrowError(/no key/);
  });
});

describe('completeOpenRouterLogin', () => {
  it('does nothing without a code in the url', async () => {
    expect(hasOpenRouterCallback('?game=scopa')).toBe(false);
    await expect(completeOpenRouterLogin({ search: '?game=scopa' })).resolves.toEqual({ status: 'none' });
  });

  it('strips the code, consumes the verifier once and exchanges it', async () => {
    const strip = vi.fn();
    const takeVerifier = vi.fn(() => 'VERIFIER');
    const exchange = vi.fn(async (code: string, verifier: string) => `key-for-${code}-${verifier}`);
    expect(hasOpenRouterCallback('?code=ABC')).toBe(true);
    const outcome = await completeOpenRouterLogin({ search: '?code=ABC&game=scopa', strip, takeVerifier, exchange });
    expect(outcome).toEqual({ status: 'connected', key: 'key-for-ABC-VERIFIER' });
    expect(strip).toHaveBeenCalledTimes(1);
    expect(takeVerifier).toHaveBeenCalledTimes(1);
  });

  it('explains a callback without a stored verifier (another tab or session)', async () => {
    const outcome = await completeOpenRouterLogin({ search: '?code=ABC', strip: () => {}, takeVerifier: () => null, exchange: async () => 'x' });
    expect(outcome.status).toBe('error');
    expect((outcome as { message: string }).message).toMatch(/another tab or session/);
  });

  it('reports an exchange failure without throwing', async () => {
    const outcome = await completeOpenRouterLogin({
      search: '?code=ABC', strip: () => {}, takeVerifier: () => 'v',
      exchange: async () => { throw new Error('Invalid code (HTTP 400)'); },
    });
    expect(outcome).toEqual({ status: 'error', message: 'Invalid code (HTTP 400)' });
  });
});
