// Real backends for src/platform/storage.ts on the Capacitor app:
// Preferences (UserDefaults), Filesystem (the app's Library directory —
// backed up, never user-visible) and the Keychain (SecureStorage plugin).
// Only reachable through the dynamic import in initNativeStorage().
//
// Contract with the store: a read resolves null when nothing is saved and
// REJECTS when something may be saved but could not be read. The store
// then keeps that key read-only for the session instead of treating the
// failure as "empty" and overwriting the saved value (see storage.ts).
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { SecureStorage } from './keychain';
import type { NativeStores } from './storage';

const DATA_DIR = 'scopa-data';
const PREFS_GROUP = 'ScopaAI';

let dirReady: Promise<void> | null = null;

/** Whether the data directory exists. Checked by listing its parent: a
 *  rejected plugin call (stat on a missing path) is logged as an error by
 *  the Capacitor bridge, so avoid provoking one. Rejects if the parent
 *  itself cannot be listed. */
async function dataDirExists(): Promise<boolean> {
  const parent = await Filesystem.readdir({ path: '', directory: Directory.Library });
  return parent.files.some((f) => f.name === DATA_DIR);
}

/** The plugin's "no such file" rejection (iOS: "… does not exist.",
 *  Android / web: "File does not exist"), which for a delete means done. */
function isMissingFileError(err: unknown): boolean {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && /does not exist|not found|ENOENT/i.test(message);
}

/** Create the data directory once, before the first write. */
function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = (async () => {
      const exists = await dataDirExists().catch(() => false);
      if (exists) return;
      await Filesystem.mkdir({ path: DATA_DIR, directory: Directory.Library, recursive: true }).catch(() => {});
    })();
  }
  return dirReady;
}

export function createCapacitorStores(): NativeStores {
  let configured: Promise<void> | null = null;
  // Files known to exist (listed at hydration or written since). A remove
  // of anything else is a no-op: the plugin rejects a delete of a missing
  // file and the bridge logs that as an error on every launch (the saved
  // solo game is cleared at start-up whenever there is nothing to resume).
  const known = new Set<string>();
  const prefsReady = () => {
    if (!configured) configured = Preferences.configure({ group: PREFS_GROUP });
    return configured;
  };
  return {
    prefs: {
      async get(key) {
        await prefsReady();
        return (await Preferences.get({ key })).value;
      },
      async set(key, value) {
        await prefsReady();
        await Preferences.set({ key, value });
      },
      async remove(key) {
        await prefsReady();
        await Preferences.remove({ key });
      },
      async keys() {
        await prefsReady();
        return (await Preferences.keys()).keys;
      },
    },
    files: {
      // Only called for names that list() returned, so a rejection here is
      // a real read failure, never a missing file.
      async read(name) {
        const result = await Filesystem.readFile({
          path: `${DATA_DIR}/${name}`,
          directory: Directory.Library,
          encoding: Encoding.UTF8,
        });
        if (typeof result.data !== 'string') {
          throw new Error(`unexpected ${typeof result.data} content for ${name}`);
        }
        return result.data;
      },
      async write(name, data) {
        await ensureDir();
        await Filesystem.writeFile({
          path: `${DATA_DIR}/${name}`,
          directory: Directory.Library,
          data,
          encoding: Encoding.UTF8,
        });
        known.add(name);
      },
      // Forgotten only once the file is really gone: a delete that fails
      // for any other reason rejects (the store logs it and retries), and
      // the name stays known so the next attempt is not skipped.
      async remove(name) {
        if (!known.has(name)) return;
        try {
          await Filesystem.deleteFile({ path: `${DATA_DIR}/${name}`, directory: Directory.Library });
        } catch (err) {
          if (!isMissingFileError(err)) throw err;
        }
        known.delete(name);
      },
      // First launch (no directory yet) is "nothing saved"; a directory
      // that exists but cannot be listed, or a parent that cannot be
      // listed, rejects so the store treats every file key as unreadable.
      async list() {
        if (!(await dataDirExists())) return [];
        if (!dirReady) dirReady = Promise.resolve();
        const result = await Filesystem.readdir({ path: DATA_DIR, directory: Directory.Library });
        const names = result.files.map((f) => f.name);
        names.forEach((name) => known.add(name));
        return names;
      },
    },
    secrets: {
      // The plugin resolves null for a missing item and rejects with the
      // OSStatus for anything else (locked keychain, entitlement problem).
      async get(key) {
        return (await SecureStorage.get({ key })).value;
      },
      async set(key, value) {
        await SecureStorage.set({ key, value });
      },
      async remove(key) {
        await SecureStorage.remove({ key });
      },
    },
  };
}
