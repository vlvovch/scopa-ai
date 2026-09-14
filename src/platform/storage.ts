// Platform-aware key/value storage with the synchronous shape the app has
// always used (get / set / remove of string values under the existing
// localStorage keys), so no consumer had to become async.
//
// Web (and the Android TWA): a straight pass-through to localStorage —
// same keys, same JSON, same exceptions, existing data untouched.
//
// Native (the Capacitor iOS app): an in-memory map, hydrated ONCE from
// native stores before React renders (src/main.tsx awaits `ready()`), with
// write-through persistence:
//   - Preferences (UserDefaults)  — small values: settings, language,
//     remembered game, multiplayer sessions, nickname, spectator picks…
//   - Filesystem (Library dir)    — growing data: game history / stats and
//     the saved solo game, one JSON file per key.
//   - Keychain (SecureStorage)    — the user's LLM API keys, split out of
//     the settings JSON on write and merged back on hydration, so
//     `useSettings` keeps its schema and never learns where they live.
// Writes are queued per key so an overlapping write can never persist out
// of order, and a write attempted before hydration is refused (logged),
// so a startup default can never clobber saved data.
//
// Missing data and unreadable data are different things. A backend that
// resolves null (no such key, file or keychain item) means "nothing saved"
// and the key is fully writable. A backend that REJECTS during hydration
// means a saved value may well exist but could not be read. Such a key is
// "degraded" for the rest of the session: the app sees no value, keeps
// whatever it writes in memory only, and nothing is persisted for it, so
// the startup defaults that follow (empty history, empty API key…) cannot
// overwrite what is still on disk. Recovery is the next successful
// hydration, i.e. the next launch.
//
// Web storage inside the app's web view is NOT used for app data: Safari
// website stats and this app's data are separate (docs/ios.md).

import { IS_NATIVE_BUILD } from './native';

export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * Async backends the native store persists to (fakes in tests). Reads
 * resolve null for "nothing saved" and reject for "could not read" — the
 * store treats the two very differently (see the header).
 */
export interface NativeStores {
  prefs: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };
  files: {
    read(name: string): Promise<string | null>;
    write(name: string, data: string): Promise<void>;
    remove(name: string): Promise<void>;
    list(): Promise<string[]>;
  };
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
}

/** Keys whose values grow with play: kept as files, not UserDefaults. */
export const FILE_KEYS: ReadonlySet<string> = new Set([
  'scopa-game-stats',
  'briscola-game-stats',
  'scopa-game-state',
]);

/** The settings JSON key and the fields inside it that are secrets. */
export const SETTINGS_KEY = 'scopa-settings';
export const SECRET_FIELDS = ['geminiApiKey', 'openaiApiKey', 'claudeApiKey'] as const;

const FILE_SUFFIX = '.json';

// A removal that fails leaves stale data on disk that nothing rewrites
// later (a cleared save would come back at the next launch), so it gets a
// few attempts before the failure is logged.
const REMOVE_ATTEMPTS = 3;
const REMOVE_RETRY_MS = 250;

async function withRetries(task: () => Promise<void>, attempts: number, delayMs: number): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await task();
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export interface NativeStorage extends KeyValueStorage {
  /** Resolves once hydration finished; safe to call repeatedly. */
  ready(): Promise<void>;
  /** Resolves when every queued write has been persisted (tests / teardown). */
  flush(): Promise<void>;
  /** True after ready() resolved. */
  readonly hydrated: boolean;
  /**
   * True when the saved value for `key` could not be read at start-up (as
   * opposed to not existing). The key is then kept in memory only and never
   * written back this session, so the unread value survives on disk.
   */
  isDegraded(key: string): boolean;
  /**
   * What could not be read at start-up, for logging and diagnostics: key
   * names, `prefs:*` / `files:*` when a whole backend failed to list its
   * keys, and `secret:<field>` for keychain items. Empty when hydration
   * read everything.
   */
  readonly degraded: readonly string[];
}

/** Split the settings JSON into a storable part and the secret fields. */
export function splitSecrets(json: string): { stored: string; secrets: Record<string, string> } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { stored: json, secrets: {} };
  }
  if (!parsed || typeof parsed !== 'object') return { stored: json, secrets: {} };
  const secrets: Record<string, string> = {};
  const rest: Record<string, unknown> = { ...parsed };
  for (const field of SECRET_FIELDS) {
    const value = parsed[field];
    if (typeof value === 'string') {
      secrets[field] = value;
      rest[field] = '';
    }
  }
  return { stored: JSON.stringify(rest), secrets };
}

/** Put secret fields back into a stored settings JSON. */
export function mergeSecrets(stored: string, secrets: Record<string, string | null>): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return stored;
  }
  if (!parsed || typeof parsed !== 'object') return stored;
  for (const field of SECRET_FIELDS) {
    const value = secrets[field];
    if (typeof value === 'string' && value) parsed[field] = value;
  }
  return JSON.stringify(parsed);
}

export function createNativeStorage(stores: NativeStores): NativeStorage {
  const memory = new Map<string, string>();
  const queues = new Map<string, Promise<void>>();
  let hydrated = false;
  let readyPromise: Promise<void> | null = null;

  // Read failures during hydration (see the header): individual keys,
  // whole backends whose key listing failed, and keychain fields. Each
  // refused write is reported once per key so a stats write after every
  // game does not flood the console.
  const degradedKeys = new Set<string>();
  const degradedSecrets = new Set<string>();
  let prefsDegraded = false;
  let filesDegraded = false;
  const reported = new Set<string>();

  function isDegraded(key: string): boolean {
    if (degradedKeys.has(key)) return true;
    return FILE_KEYS.has(key) ? filesDegraded : prefsDegraded;
  }

  function degradedList(): string[] {
    const list: string[] = [];
    if (prefsDegraded) list.push('prefs:*');
    if (filesDegraded) list.push('files:*');
    list.push(...degradedKeys);
    list.push(...Array.from(degradedSecrets, (field) => `secret:${field}`));
    return list;
  }

  function reportSkipped(what: string): void {
    if (reported.has(what)) return;
    reported.add(what);
    console.error(
      `[storage] not persisting "${what}": its saved value could not be read at start-up, ` +
        'so it is kept in memory only this session (relaunch to retry)'
    );
  }

  function enqueue(key: string, task: () => Promise<void>): void {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev
      .then(task)
      .catch((err) => {
        console.warn(`[storage] persisting "${key}" failed:`, err);
      });
    queues.set(key, next);
  }

  async function hydrate(): Promise<void> {
    const [prefKeys, fileNames] = await Promise.all([
      stores.prefs.keys().catch((err) => {
        prefsDegraded = true;
        console.error('[storage] listing preferences failed:', err);
        return [] as string[];
      }),
      stores.files.list().catch((err) => {
        filesDegraded = true;
        console.error('[storage] listing data files failed:', err);
        return [] as string[];
      }),
    ]);
    await Promise.all(
      prefKeys.map(async (key) => {
        try {
          const value = await stores.prefs.get(key);
          if (value !== null) memory.set(key, value);
        } catch (err) {
          degradedKeys.add(key);
          console.error(`[storage] reading preference "${key}" failed:`, err);
        }
      })
    );
    await Promise.all(
      fileNames
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map(async (name) => {
          const key = name.slice(0, -FILE_SUFFIX.length);
          if (!FILE_KEYS.has(key)) return;
          try {
            const value = await stores.files.read(name);
            if (value !== null) memory.set(key, value);
          } catch (err) {
            degradedKeys.add(key);
            console.error(`[storage] reading data file "${name}" failed:`, err);
          }
        })
    );
    const secrets: Record<string, string | null> = {};
    await Promise.all(
      SECRET_FIELDS.map(async (field) => {
        try {
          secrets[field] = await stores.secrets.get(field);
        } catch (err) {
          secrets[field] = null;
          degradedSecrets.add(field);
          console.error(`[storage] keychain read for ${field} failed:`, err);
        }
      })
    );
    const settings = memory.get(SETTINGS_KEY);
    const hasSecret = SECRET_FIELDS.some((f) => secrets[f]);
    if (hasSecret) {
      memory.set(SETTINGS_KEY, mergeSecrets(settings ?? '{}', secrets));
    }
    hydrated = true;
    const degraded = degradedList();
    if (degraded.length) {
      console.error(
        '[storage] some saved data could not be read; it will not be written this session ' +
          `so it survives for the next launch: ${degraded.join(', ')}`
      );
    }
  }

  /** Keychain write for one field; skipped while that field is degraded. */
  function persistSecret(field: string, secret: string | undefined): void {
    if (degradedSecrets.has(field)) {
      reportSkipped(`secret:${field}`);
      return;
    }
    enqueue(`secret:${field}`, () =>
      secret ? stores.secrets.set(field, secret) : stores.secrets.remove(field)
    );
  }

  function persist(key: string, value: string): void {
    if (FILE_KEYS.has(key)) {
      enqueue(key, () => stores.files.write(key + FILE_SUFFIX, value));
      return;
    }
    if (key === SETTINGS_KEY) {
      const { stored, secrets } = splitSecrets(value);
      enqueue(key, () => stores.prefs.set(key, stored));
      for (const field of SECRET_FIELDS) persistSecret(field, secrets[field]);
      return;
    }
    enqueue(key, () => stores.prefs.set(key, value));
  }

  function unpersist(key: string): void {
    if (FILE_KEYS.has(key)) {
      enqueue(key, () => withRetries(() => stores.files.remove(key + FILE_SUFFIX), REMOVE_ATTEMPTS, REMOVE_RETRY_MS));
      return;
    }
    enqueue(key, () => stores.prefs.remove(key));
    if (key === SETTINGS_KEY) {
      for (const field of SECRET_FIELDS) persistSecret(field, undefined);
    }
  }

  return {
    get hydrated() {
      return hydrated;
    },
    get degraded() {
      return degradedList();
    },
    isDegraded,
    ready() {
      if (!readyPromise) readyPromise = hydrate();
      return readyPromise;
    },
    async flush() {
      await Promise.all(Array.from(queues.values()));
    },
    get(key) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    set(key, value) {
      if (!hydrated) {
        console.error(`[storage] write to "${key}" before hydration ignored (would clobber saved data)`);
        return;
      }
      memory.set(key, value);
      if (isDegraded(key)) {
        reportSkipped(key);
        return;
      }
      persist(key, value);
    },
    remove(key) {
      if (!hydrated) {
        console.error(`[storage] remove of "${key}" before hydration ignored`);
        return;
      }
      memory.delete(key);
      if (isDegraded(key)) {
        reportSkipped(key);
        return;
      }
      unpersist(key);
    },
  };
}

/** The website: localStorage itself (same keys, same data, same errors). */
export const webStorage: KeyValueStorage = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
};

let nativeStorage: NativeStorage | null = null;

/**
 * Native only: build the store on top of the real Capacitor plugins. Kept
 * behind a dynamic import so the plugins never enter the website bundles.
 */
export async function initNativeStorage(): Promise<NativeStorage> {
  if (!nativeStorage) {
    const { createCapacitorStores } = await import('./nativeStores');
    nativeStorage = createNativeStorage(createCapacitorStores());
  }
  await nativeStorage.ready();
  return nativeStorage;
}

/**
 * The store every consumer uses. Synchronous by design; on native it is
 * only valid after initNativeStorage() resolved, which src/main.tsx
 * guarantees before rendering anything.
 */
export const storage: KeyValueStorage = {
  get(key) {
    return IS_NATIVE_BUILD && nativeStorage ? nativeStorage.get(key) : webStorage.get(key);
  },
  set(key, value) {
    if (IS_NATIVE_BUILD && nativeStorage) nativeStorage.set(key, value);
    else webStorage.set(key, value);
  },
  remove(key) {
    if (IS_NATIVE_BUILD && nativeStorage) nativeStorage.remove(key);
    else webStorage.remove(key);
  },
};
