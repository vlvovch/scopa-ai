// "Sign in with OpenRouter" for a game app: starts the PKCE flow from the
// Settings modal and, on the callback page load, finishes it and stores
// the new key through the caller (the settings hook). Shared by Scopa and
// Briscola; the flow itself lives in src/ai/openrouterAuth.ts.
//
// The callback is completed once per page load at module level and handed
// to whichever app screen is MOUNTED when it resolves. A screen that
// unmounted meanwhile (a game switch, React's strict-mode double mount)
// unsubscribes and never sees the result, so it cannot swallow the key by
// writing it into settings state that no longer exists; the next mounted
// screen receives it instead.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canUseOpenRouterLogin,
  completeOpenRouterLogin,
  hasOpenRouterCallback,
  startOpenRouterLogin,
  type OpenRouterLoginOutcome,
} from '../ai/openrouterAuth';
import { clearApiKeyCaches } from '../ai/apiKeyCaches';
import { validateOpenRouterKey } from '../games/scopa/ai/validateApiKey';

export type OpenRouterLoginStatus = 'idle' | 'redirecting' | 'exchanging' | 'connected' | 'error';

export interface OpenRouterLogin {
  /** Sign-in is possible here (website, secure context, keys allowed). */
  available: boolean;
  status: OpenRouterLoginStatus;
  /** What went wrong, when status is 'error'. */
  error: string | null;
  /** Leave for openrouter.ai; the page comes back with the code. */
  start: () => void;
  /** Back to idle (hides a result line). */
  dismiss: () => void;
}

interface Options {
  /** Store the key (and its validity) the way a pasted key is stored. */
  onKey: (key: string, valid: boolean) => void;
  /** Called once the callback was handled, so the app can open Settings. */
  onConnected?: () => void;
}

export interface LoginResult {
  outcome: OpenRouterLoginOutcome;
  valid: boolean;
}

/**
 * Hands a completed callback to live subscribers only. `first` is true for
 * exactly one delivery of a result that needs acting on (the subscriber
 * that must store the key and open Settings); a subscriber that comes
 * later, or one that unsubscribed before the result arrived, only learns
 * the status. Exported for tests.
 */
export interface LoginBroker {
  readonly started: boolean;
  start(): void;
  subscribe(listener: (result: LoginResult, first: boolean) => void): () => void;
}

export function createLoginBroker(complete: () => Promise<LoginResult>): LoginBroker {
  type Listener = (result: LoginResult, first: boolean) => void;
  const listeners = new Set<Listener>();
  let promise: Promise<LoginResult> | null = null;
  let result: LoginResult | null = null;
  let applied = false;

  const deliver = (listener: Listener, value: LoginResult) => {
    const first = !applied && value.outcome.status !== 'none';
    if (first) applied = true;
    listener(value, first);
  };

  return {
    get started() {
      return promise !== null;
    },
    start() {
      if (promise) return;
      promise = complete();
      promise.then((value) => {
        result = value;
        // Only the screens still listening at this moment get the result.
        for (const listener of Array.from(listeners)) {
          if (listeners.has(listener)) deliver(listener, value);
        }
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      // A screen mounted after the result arrived (or after every earlier
      // screen went away) takes over where nobody acted yet.
      if (result) deliver(listener, result);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

async function completeAndValidate(): Promise<LoginResult> {
  const outcome = await completeOpenRouterLogin();
  const valid = outcome.status === 'connected' ? (await validateOpenRouterKey(outcome.key)).valid : false;
  return { outcome, valid };
}

let broker: LoginBroker = createLoginBroker(completeAndValidate);

/** Tests only: forget a completed callback. */
export function resetOpenRouterLoginForTests(): void {
  broker = createLoginBroker(completeAndValidate);
}

export function useOpenRouterLogin(options: Options): OpenRouterLogin {
  const available = canUseOpenRouterLogin();
  const [status, setStatus] = useState<OpenRouterLoginStatus>(() =>
    available && hasOpenRouterCallback() ? 'exchanging' : 'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!available) return;
    if (!hasOpenRouterCallback() && !broker.started) return;
    broker.start();
    return broker.subscribe(({ outcome, valid }, first) => {
      if (outcome.status === 'none') {
        setStatus('idle');
        return;
      }
      if (outcome.status === 'connected') {
        if (first) {
          clearApiKeyCaches('openrouter');
          optionsRef.current.onKey(outcome.key, valid);
        }
        setStatus('connected');
      } else {
        setStatus('error');
        setError(outcome.message);
      }
      if (first) optionsRef.current.onConnected?.();
    });
  }, [available]);

  const start = useCallback(() => {
    setError(null);
    setStatus('redirecting');
    const callbackUrl = `${window.location.origin}${window.location.pathname}`;
    startOpenRouterLogin(callbackUrl).then((started) => {
      if (!started) {
        setStatus('error');
        setError('sign-in is not available in this browser');
      }
    });
  }, []);

  const dismiss = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { available, status, error, start, dismiss };
}
