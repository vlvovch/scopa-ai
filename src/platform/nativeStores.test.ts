// The Capacitor-backed stores: pins the contract storage.ts relies on —
// a read resolves null when nothing is saved and rejects when it could not
// read — so a failed read can never look like "empty" and get overwritten.
// The plugins are mocked; the module is re-imported per test because it
// caches the data-directory check.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  Filesystem: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    mkdir: vi.fn(),
  },
  Preferences: {
    configure: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    keys: vi.fn(),
  },
  SecureStorage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: mocks.Filesystem,
  Directory: { Library: 'LIBRARY' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/preferences', () => ({ Preferences: mocks.Preferences }));
vi.mock('./keychain', () => ({ SecureStorage: mocks.SecureStorage }));

const listing = (names: string[]) => ({ files: names.map((name) => ({ name })) });

async function freshStores() {
  vi.resetModules();
  const { createCapacitorStores } = await import('./nativeStores');
  return createCapacitorStores();
}

beforeEach(() => {
  for (const group of Object.values(mocks)) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  mocks.Preferences.configure.mockResolvedValue(undefined);
});

describe('files backend', () => {
  it('first launch: no data directory means nothing saved (and nothing is created)', async () => {
    mocks.Filesystem.readdir.mockResolvedValueOnce(listing(['Caches', 'Preferences']));
    const stores = await freshStores();
    await expect(stores.files.list()).resolves.toEqual([]);
    expect(mocks.Filesystem.readdir).toHaveBeenCalledTimes(1);
    expect(mocks.Filesystem.mkdir).not.toHaveBeenCalled();
  });

  it('lists the saved files when the directory exists', async () => {
    mocks.Filesystem.readdir
      .mockResolvedValueOnce(listing(['scopa-data']))
      .mockResolvedValueOnce(listing(['scopa-game-stats.json', 'scopa-game-state.json']));
    const stores = await freshStores();
    await expect(stores.files.list()).resolves.toEqual(['scopa-game-stats.json', 'scopa-game-state.json']);
    expect(mocks.Filesystem.readdir).toHaveBeenLastCalledWith({ path: 'scopa-data', directory: 'LIBRARY' });
  });

  it('rejects when the directory or its parent cannot be listed', async () => {
    mocks.Filesystem.readdir
      .mockResolvedValueOnce(listing(['scopa-data']))
      .mockRejectedValueOnce(new Error('EIO'));
    let stores = await freshStores();
    await expect(stores.files.list()).rejects.toThrow('EIO');

    mocks.Filesystem.readdir.mockRejectedValueOnce(new Error('Library unavailable'));
    stores = await freshStores();
    await expect(stores.files.list()).rejects.toThrow('Library unavailable');
  });

  it('read returns the text, and rejects on failure instead of pretending the file is missing', async () => {
    mocks.Filesystem.readFile.mockResolvedValueOnce({ data: '{"games":[]}' });
    const stores = await freshStores();
    await expect(stores.files.read('scopa-game-stats.json')).resolves.toBe('{"games":[]}');
    expect(mocks.Filesystem.readFile).toHaveBeenCalledWith({
      path: 'scopa-data/scopa-game-stats.json',
      directory: 'LIBRARY',
      encoding: 'utf8',
    });

    mocks.Filesystem.readFile.mockRejectedValueOnce(new Error('EACCES'));
    await expect(stores.files.read('scopa-game-stats.json')).rejects.toThrow('EACCES');

    mocks.Filesystem.readFile.mockResolvedValueOnce({ data: 42 });
    await expect(stores.files.read('scopa-game-stats.json')).rejects.toThrow('unexpected number content');
  });

  it('write creates the directory first, once', async () => {
    mocks.Filesystem.readdir.mockResolvedValueOnce(listing([]));
    mocks.Filesystem.mkdir.mockResolvedValue(undefined);
    mocks.Filesystem.writeFile.mockResolvedValue(undefined);
    const stores = await freshStores();
    await stores.files.write('scopa-game-stats.json', '[]');
    await stores.files.write('scopa-game-state.json', '{}');
    expect(mocks.Filesystem.mkdir).toHaveBeenCalledTimes(1);
    expect(mocks.Filesystem.mkdir).toHaveBeenCalledWith({ path: 'scopa-data', directory: 'LIBRARY', recursive: true });
    expect(mocks.Filesystem.writeFile).toHaveBeenCalledTimes(2);
    expect(mocks.Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'scopa-data/scopa-game-stats.json',
      directory: 'LIBRARY',
      data: '[]',
      encoding: 'utf8',
    });
  });
});

describe('files backend: remove', () => {
  it('deletes only files it has listed or written, and never asks the plugin about others', async () => {
    mocks.Filesystem.readdir
      .mockResolvedValueOnce(listing(['scopa-data']))
      .mockResolvedValueOnce(listing(['scopa-game-stats.json']));
    mocks.Filesystem.writeFile.mockResolvedValue(undefined);
    mocks.Filesystem.deleteFile.mockResolvedValue(undefined);
    const stores = await freshStores();
    await stores.files.list();
    await stores.files.write('scopa-game-state.json', '{}');
    // never existed: no plugin call, so the bridge logs no failed delete
    await stores.files.remove('briscola-game-stats.json');
    expect(mocks.Filesystem.deleteFile).not.toHaveBeenCalled();
    await stores.files.remove('scopa-game-stats.json');
    await stores.files.remove('scopa-game-state.json');
    expect(mocks.Filesystem.deleteFile).toHaveBeenCalledTimes(2);
    expect(mocks.Filesystem.deleteFile).toHaveBeenCalledWith({ path: 'scopa-data/scopa-game-stats.json', directory: 'LIBRARY' });
    // deleted once, forgotten: a second remove is a no-op
    await stores.files.remove('scopa-game-stats.json');
    expect(mocks.Filesystem.deleteFile).toHaveBeenCalledTimes(2);
  });

  it('treats the plugin\'s "does not exist" rejection as done', async () => {
    mocks.Filesystem.mkdir.mockResolvedValue(undefined);
    mocks.Filesystem.writeFile.mockResolvedValue(undefined);
    mocks.Filesystem.deleteFile.mockRejectedValueOnce(new Error("'deleteFile' failed because file at 'file:///x/scopa-data/scopa-game-state.json'  does not exist."));
    const stores = await freshStores();
    await stores.files.write('scopa-game-state.json', '{}');
    await expect(stores.files.remove('scopa-game-state.json')).resolves.toBeUndefined();
    await stores.files.remove('scopa-game-state.json'); // forgotten: no second plugin call
    expect(mocks.Filesystem.deleteFile).toHaveBeenCalledTimes(1);
  });

  it('propagates any other failure and keeps the file known so the next attempt really retries', async () => {
    mocks.Filesystem.mkdir.mockResolvedValue(undefined);
    mocks.Filesystem.writeFile.mockResolvedValue(undefined);
    mocks.Filesystem.deleteFile
      .mockRejectedValueOnce(new Error('EBUSY: resource busy'))
      .mockResolvedValueOnce(undefined);
    const stores = await freshStores();
    await stores.files.write('scopa-game-state.json', '{}');
    await expect(stores.files.remove('scopa-game-state.json')).rejects.toThrow('EBUSY');
    await expect(stores.files.remove('scopa-game-state.json')).resolves.toBeUndefined();
    expect(mocks.Filesystem.deleteFile).toHaveBeenCalledTimes(2);
    await stores.files.remove('scopa-game-state.json'); // now forgotten
    expect(mocks.Filesystem.deleteFile).toHaveBeenCalledTimes(2);
  });
});

describe('preferences and keychain backends', () => {
  it('preferences: null for a missing key, a rejection propagates, the group is configured once', async () => {
    mocks.Preferences.get
      .mockResolvedValueOnce({ value: null })
      .mockResolvedValueOnce({ value: 'briscola' });
    mocks.Preferences.keys.mockRejectedValueOnce(new Error('defaults unavailable'));
    const stores = await freshStores();
    await expect(stores.prefs.get('selected-game')).resolves.toBeNull();
    await expect(stores.prefs.get('selected-game')).resolves.toBe('briscola');
    await expect(stores.prefs.keys()).rejects.toThrow('defaults unavailable');
    expect(mocks.Preferences.configure).toHaveBeenCalledTimes(1);
    expect(mocks.Preferences.configure).toHaveBeenCalledWith({ group: 'ScopaAI' });
  });

  it('keychain: null for a missing item, a rejection propagates', async () => {
    mocks.SecureStorage.get
      .mockResolvedValueOnce({ value: null })
      .mockRejectedValueOnce(new Error('Keychain read failed (-25308)'));
    const stores = await freshStores();
    await expect(stores.secrets.get('geminiApiKey')).resolves.toBeNull();
    await expect(stores.secrets.get('geminiApiKey')).rejects.toThrow('-25308');
  });
});
