// Native store: hydration, routing of keys to backends, secret splitting,
// write ordering, and the "nothing before hydration" guard. Node
// environment; the Capacitor plugins are replaced by in-memory fakes.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createNativeStorage, mergeSecrets, splitSecrets, webStorage, type NativeStores } from './storage';

function fakeStores(seed: { prefs?: Record<string, string>; files?: Record<string, string>; secrets?: Record<string, string> } = {}) {
  const prefs = new Map(Object.entries(seed.prefs ?? {}));
  const files = new Map(Object.entries(seed.files ?? {}));
  const secrets = new Map(Object.entries(seed.secrets ?? {}));
  const log: string[] = [];
  const stores: NativeStores = {
    prefs: {
      get: async (k) => prefs.get(k) ?? null,
      set: async (k, v) => { log.push(`prefs:set:${k}`); prefs.set(k, v); },
      remove: async (k) => { log.push(`prefs:remove:${k}`); prefs.delete(k); },
      keys: async () => Array.from(prefs.keys()),
    },
    files: {
      read: async (n) => files.get(n) ?? null,
      write: async (n, d) => { log.push(`files:write:${n}`); files.set(n, d); },
      remove: async (n) => { log.push(`files:remove:${n}`); files.delete(n); },
      list: async () => Array.from(files.keys()),
    },
    secrets: {
      get: async (k) => secrets.get(k) ?? null,
      set: async (k, v) => { log.push(`secrets:set:${k}`); secrets.set(k, v); },
      remove: async (k) => { log.push(`secrets:remove:${k}`); secrets.delete(k); },
    },
  };
  return { stores, prefs, files, secrets, log };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('native storage', () => {
  it('hydrates preferences, files and keychain secrets into one view', async () => {
    const { stores } = fakeStores({
      prefs: { 'selected-game': 'briscola', 'scopa-settings': JSON.stringify({ deck: 'sarde', geminiApiKey: '' }) },
      files: { 'scopa-game-stats.json': '{"games":[1]}', 'unrelated.txt': 'x' },
      secrets: { geminiApiKey: 'sk-gem' },
    });
    const store = createNativeStorage(stores);
    expect(store.hydrated).toBe(false);
    await store.ready();
    expect(store.hydrated).toBe(true);
    expect(store.get('selected-game')).toBe('briscola');
    expect(store.get('scopa-game-stats')).toBe('{"games":[1]}');
    expect(store.get('unrelated')).toBeNull();
    expect(JSON.parse(store.get('scopa-settings')!)).toEqual({ deck: 'sarde', geminiApiKey: 'sk-gem' });
  });

  it('refuses writes before hydration so defaults cannot clobber saved data', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stores, prefs } = fakeStores({ prefs: { 'selected-game': 'briscola' } });
    const store = createNativeStorage(stores);
    store.set('selected-game', 'scopa');
    store.remove('selected-game');
    await store.ready();
    await store.flush();
    expect(store.get('selected-game')).toBe('briscola');
    expect(prefs.get('selected-game')).toBe('briscola');
    expect(err).toHaveBeenCalledTimes(2);
  });

  it('routes growing data to files and small values to preferences', async () => {
    const { stores, prefs, files } = fakeStores();
    const store = createNativeStorage(stores);
    await store.ready();
    store.set('scopa-game-stats', '{"games":[]}');
    store.set('scopa-game-state', '{"status":"playing"}');
    store.set('scopa-language', 'it');
    await store.flush();
    expect(files.get('scopa-game-stats.json')).toBe('{"games":[]}');
    expect(files.get('scopa-game-state.json')).toBe('{"status":"playing"}');
    expect(prefs.get('scopa-language')).toBe('it');
    expect(prefs.has('scopa-game-stats')).toBe(false);
    store.remove('scopa-game-state');
    await store.flush();
    expect(files.has('scopa-game-state.json')).toBe(false);
    expect(store.get('scopa-game-state')).toBeNull();
  });

  it('keeps API keys in the keychain and out of preferences, transparently', async () => {
    const { stores, prefs, secrets } = fakeStores();
    const store = createNativeStorage(stores);
    await store.ready();
    const settings = { deck: 'napoletane', geminiApiKey: 'sk-gem', openaiApiKey: '', claudeApiKey: 'sk-cl', openrouterApiKey: 'sk-or' };
    store.set('scopa-settings', JSON.stringify(settings));
    await store.flush();
    expect(JSON.parse(prefs.get('scopa-settings')!)).toEqual({ ...settings, geminiApiKey: '', claudeApiKey: '', openrouterApiKey: '' });
    expect(secrets.get('geminiApiKey')).toBe('sk-gem');
    expect(secrets.get('claudeApiKey')).toBe('sk-cl');
    expect(secrets.get('openrouterApiKey')).toBe('sk-or');
    expect(secrets.has('openaiApiKey')).toBe(false);
    // the app keeps seeing the full settings object
    expect(JSON.parse(store.get('scopa-settings')!)).toEqual(settings);
    // clearing a key removes it from the keychain
    store.set('scopa-settings', JSON.stringify({ ...settings, geminiApiKey: '' }));
    await store.flush();
    expect(secrets.has('geminiApiKey')).toBe(false);
    expect(secrets.get('claudeApiKey')).toBe('sk-cl');
  });

  it('persists overlapping writes to one key in order (last write wins)', async () => {
    const { stores, prefs, log } = fakeStores();
    // make the first write slow
    const realSet = stores.prefs.set;
    let first = true;
    stores.prefs.set = async (k, v) => {
      if (first) { first = false; await new Promise((r) => setTimeout(r, 20)); }
      await realSet(k, v);
    };
    const store = createNativeStorage(stores);
    await store.ready();
    store.set('mp-nickname', 'A');
    store.set('mp-nickname', 'B');
    store.set('mp-nickname', 'C');
    await store.flush();
    expect(prefs.get('mp-nickname')).toBe('C');
    expect(log.filter((l) => l.startsWith('prefs:set:mp-nickname'))).toHaveLength(3);
    expect(store.get('mp-nickname')).toBe('C');
  });

  it('survives a failing backend write without losing the in-memory value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { stores } = fakeStores();
    stores.prefs.set = async () => { throw new Error('disk full'); };
    const store = createNativeStorage(stores);
    await store.ready();
    store.set('scopa-language', 'it');
    await store.flush();
    expect(store.get('scopa-language')).toBe('it');
    expect(warn).toHaveBeenCalled();
  });
});

describe('degraded reads (failed, not missing)', () => {
  it('a healthy hydration degrades nothing, and missing data is not "failed"', async () => {
    const { stores } = fakeStores({ prefs: { 'selected-game': 'scopa' } });
    const store = createNativeStorage(stores);
    await store.ready();
    expect(store.degraded).toEqual([]);
    expect(store.isDegraded('selected-game')).toBe(false);
    expect(store.isDegraded('scopa-game-stats')).toBe(false);
    expect(store.isDegraded('scopa-settings')).toBe(false);
  });

  it('a stats file that fails to read is never overwritten this session', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stores, files, prefs } = fakeStores({
      files: { 'scopa-game-stats.json': '{"games":[1,2,3]}', 'briscola-game-stats.json': '{"games":[9]}' },
    });
    const realRead = stores.files.read;
    stores.files.read = async (n) => {
      if (n === 'scopa-game-stats.json') throw new Error('I/O error');
      return realRead(n);
    };
    const store = createNativeStorage(stores);
    await store.ready();
    // the app starts from an empty history for that key, as if nothing were saved…
    expect(store.get('scopa-game-stats')).toBeNull();
    expect(store.get('briscola-game-stats')).toBe('{"games":[9]}');
    expect(store.degraded).toEqual(['scopa-game-stats']);
    expect(store.isDegraded('scopa-game-stats')).toBe(true);
    expect(store.isDegraded('briscola-game-stats')).toBe(false);
    // …but what useStats writes after the first game must not replace the unread history
    store.set('scopa-game-stats', '{"games":[4]}');
    store.set('briscola-game-stats', '{"games":[9,10]}');
    store.set('scopa-language', 'it');
    await store.flush();
    expect(files.get('scopa-game-stats.json')).toBe('{"games":[1,2,3]}');
    expect(files.get('briscola-game-stats.json')).toBe('{"games":[9,10]}');
    expect(prefs.get('scopa-language')).toBe('it');
    // the session still sees what it wrote, in memory only
    expect(store.get('scopa-game-stats')).toBe('{"games":[4]}');
    store.remove('scopa-game-stats');
    await store.flush();
    expect(files.get('scopa-game-stats.json')).toBe('{"games":[1,2,3]}');
    expect(store.get('scopa-game-stats')).toBeNull();
    expect(err).toHaveBeenCalled();
  });

  it('a keychain read failure never deletes or replaces that API key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stores, secrets, prefs } = fakeStores({
      prefs: { 'scopa-settings': JSON.stringify({ deck: 'sarde', geminiApiKey: '', claudeApiKey: '' }) },
      secrets: { geminiApiKey: 'sk-gem', claudeApiKey: 'sk-cl' },
    });
    const realGet = stores.secrets.get;
    stores.secrets.get = async (k) => {
      if (k === 'geminiApiKey') throw new Error('Keychain read failed (-25308)');
      return realGet(k);
    };
    const store = createNativeStorage(stores);
    await store.ready();
    expect(JSON.parse(store.get('scopa-settings')!)).toEqual({ deck: 'sarde', geminiApiKey: '', claudeApiKey: 'sk-cl' });
    expect(store.degraded).toEqual(['secret:geminiApiKey']);
    expect(store.isDegraded('scopa-settings')).toBe(false);
    // useSettings saves on mount with the empty field; later the user picks a deck and clears the Claude key
    store.set('scopa-settings', JSON.stringify({ deck: 'sarde', geminiApiKey: '', claudeApiKey: 'sk-cl' }));
    store.set('scopa-settings', JSON.stringify({ deck: 'piacentine', geminiApiKey: '', claudeApiKey: '' }));
    await store.flush();
    expect(secrets.get('geminiApiKey')).toBe('sk-gem');
    expect(secrets.has('claudeApiKey')).toBe(false);
    expect(JSON.parse(prefs.get('scopa-settings')!)).toEqual({ deck: 'piacentine', geminiApiKey: '', claudeApiKey: '' });
    // a key typed this session works in memory but does not replace the unread one
    store.set('scopa-settings', JSON.stringify({ deck: 'piacentine', geminiApiKey: 'sk-new', claudeApiKey: '' }));
    await store.flush();
    expect(secrets.get('geminiApiKey')).toBe('sk-gem');
    expect(JSON.parse(store.get('scopa-settings')!).geminiApiKey).toBe('sk-new');
    // and a reset leaves it alone too
    store.remove('scopa-settings');
    await store.flush();
    expect(secrets.get('geminiApiKey')).toBe('sk-gem');
    expect(prefs.has('scopa-settings')).toBe(false);
  });

  it('a failed preferences listing makes every preference read-only, files keep working', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stores, prefs, files } = fakeStores({
      prefs: { 'selected-game': 'briscola' },
      files: { 'scopa-game-stats.json': '[]' },
    });
    stores.prefs.keys = async () => { throw new Error('defaults unavailable'); };
    const store = createNativeStorage(stores);
    await store.ready();
    expect(store.get('selected-game')).toBeNull();
    expect(store.get('scopa-game-stats')).toBe('[]');
    expect(store.degraded).toEqual(['prefs:*']);
    expect(store.isDegraded('selected-game')).toBe(true);
    expect(store.isDegraded('scopa-settings')).toBe(true);
    expect(store.isDegraded('scopa-game-stats')).toBe(false);
    store.set('selected-game', 'scopa');
    store.set('scopa-settings', JSON.stringify({ geminiApiKey: 'sk-new' }));
    store.set('scopa-game-stats', '[1]');
    await store.flush();
    expect(prefs.get('selected-game')).toBe('briscola');
    expect(prefs.has('scopa-settings')).toBe(false);
    expect(files.get('scopa-game-stats.json')).toBe('[1]');
  });

  it('a failed file listing makes the file keys read-only, preferences keep working', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stores, prefs, files } = fakeStores({
      prefs: { 'selected-game': 'briscola' },
      files: { 'scopa-game-state.json': '{"status":"playing"}' },
    });
    stores.files.list = async () => { throw new Error('EIO'); };
    const store = createNativeStorage(stores);
    await store.ready();
    expect(store.get('selected-game')).toBe('briscola');
    expect(store.get('scopa-game-state')).toBeNull();
    expect(store.degraded).toEqual(['files:*']);
    store.set('scopa-game-state', '{"status":"idle"}');
    store.remove('scopa-game-state');
    store.set('selected-game', 'scopa');
    await store.flush();
    expect(files.get('scopa-game-state.json')).toBe('{"status":"playing"}');
    expect(prefs.get('selected-game')).toBe('scopa');
  });

  it('a single preference that fails to read is kept as it was', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stores, prefs } = fakeStores({
      prefs: { 'scopa-mp-session': '{"room":"SCOPA-1"}', 'mp-nickname': 'Player 1' },
    });
    const realGet = stores.prefs.get;
    stores.prefs.get = async (k) => {
      if (k === 'scopa-mp-session') throw new Error('corrupt');
      return realGet(k);
    };
    const store = createNativeStorage(stores);
    await store.ready();
    expect(store.get('mp-nickname')).toBe('Player 1');
    expect(store.get('scopa-mp-session')).toBeNull();
    expect(store.degraded).toEqual(['scopa-mp-session']);
    store.remove('scopa-mp-session');
    store.set('mp-nickname', 'Player 2');
    await store.flush();
    expect(prefs.get('scopa-mp-session')).toBe('{"room":"SCOPA-1"}');
    expect(prefs.get('mp-nickname')).toBe('Player 2');
  });
});

describe('file removal retries', () => {
  it('retries a transient deletion failure so a cleared save cannot come back at the next launch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { stores, files } = fakeStores({ files: { 'scopa-game-state.json': '{"status":"playing"}' } });
    const realRemove = stores.files.remove;
    let calls = 0;
    stores.files.remove = async (n) => {
      calls++;
      if (calls === 1) throw new Error('EBUSY');
      return realRemove(n);
    };
    const store = createNativeStorage(stores);
    await store.ready();
    store.remove('scopa-game-state');
    await store.flush();
    expect(files.has('scopa-game-state.json')).toBe(false);
    expect(calls).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('gives up after a few attempts with a warning, and a later remove tries again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { stores, files } = fakeStores({ files: { 'scopa-game-state.json': '{"status":"playing"}' } });
    const realRemove = stores.files.remove;
    let calls = 0;
    stores.files.remove = async () => { calls++; throw new Error('EIO'); };
    const store = createNativeStorage(stores);
    await store.ready();
    store.remove('scopa-game-state');
    await store.flush();
    expect(calls).toBe(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.get('scopa-game-state')).toBeNull();      // the session no longer sees it
    expect(files.has('scopa-game-state.json')).toBe(true);  // but the disk copy is still there
    stores.files.remove = realRemove;
    store.remove('scopa-game-state');
    await store.flush();
    expect(files.has('scopa-game-state.json')).toBe(false);
  });
});

describe('secret helpers', () => {
  it('split and merge round-trip and tolerate non-JSON', () => {
    const { stored, secrets } = splitSecrets(JSON.stringify({ a: 1, geminiApiKey: 'k' }));
    expect(JSON.parse(stored)).toEqual({ a: 1, geminiApiKey: '' });
    expect(secrets).toEqual({ geminiApiKey: 'k' });
    expect(JSON.parse(mergeSecrets(stored, secrets))).toEqual({ a: 1, geminiApiKey: 'k' });
    expect(splitSecrets('not json')).toEqual({ stored: 'not json', secrets: {} });
    expect(mergeSecrets('not json', { geminiApiKey: 'k' })).toBe('not json');
  });
});

describe('web storage', () => {
  it('is a pass-through to localStorage with the same keys', () => {
    const map = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    };
    webStorage.set('scopa-settings', '{}');
    expect(webStorage.get('scopa-settings')).toBe('{}');
    webStorage.remove('scopa-settings');
    expect(webStorage.get('scopa-settings')).toBeNull();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
