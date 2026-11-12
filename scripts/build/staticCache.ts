/**
 * Guard for the service worker's static cache (public/sw.js).
 *
 * The worker keeps every file of the site that is not HTML, the manifest or a
 * hashed /assets/ bundle in "<game>-static-<version>", serves it from there
 * first and never asks the server again. A card, sound, icon or badge that is
 * replaced under its old URL therefore reaches returning visitors only when
 * VITE_STATIC_CACHE_VER is raised, in .env.scopa and in .env.briscola (both
 * sites serve the same files). That step is easy to forget: the Napoletane
 * cards redrawn on 2026-11-08 stayed old for returning visitors until the
 * versions were raised three days later.
 *
 * staticCache.lock.json records a fingerprint of each of those files and the
 * two versions they were recorded under. staticCache.test.ts compares the
 * record with the working tree. `npm run cache:record` rewrites the record,
 * and refuses to while a file has changed in place and a version has not been
 * raised, so the record cannot be brought up to date around the bump.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const GAMES = ['scopa', 'briscola'] as const;
export type Game = (typeof GAMES)[number];

/** The static-cache versions and a fingerprint of every file the worker keeps, by path under public/. */
export interface CacheState {
  versions: Record<Game, string>;
  files: Record<string, string>;
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const LOCK = path.join(ROOT, 'scripts/build/staticCache.lock.json');
const VERSION_KEY = 'VITE_STATIC_CACHE_VER';
const RECORD_COMMAND = '"npm run cache:record"';

/**
 * Whether the worker keeps this file (a path under public/) in the static
 * cache. Mirrors the fetch handler of public/sw.js: HTML and the manifest
 * come from the network first, and sw.js is never served by the worker.
 * Left out as well: files no page loads (robots, sitemaps, licence texts,
 * _redirects) and dot-names (.well-known is read by the operating systems).
 */
export function isKeptByWorker(file: string): boolean {
  const parts = file.split('/');
  const name = parts[parts.length - 1];
  if (parts.some((part) => part.startsWith('.'))) return false;
  if (/\.(html|txt|xml)$/.test(name)) return false;
  return !['manifest.json', 'sw.js', '_redirects'].includes(name);
}

function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? filesUnder(path.join(dir, entry.name), file) : [file];
  });
}

function versionOf(game: Game): string {
  const env = readFileSync(path.join(ROOT, `.env.${game}`), 'utf8');
  const match = env.match(new RegExp(`^${VERSION_KEY}=(\\S+)[ \\t]*$`, 'm'));
  if (!match) throw new Error(`${VERSION_KEY} is not set in .env.${game}`);
  return match[1];
}

/** What the working tree holds now. */
export function readWorkingTree(): CacheState {
  const files: Record<string, string> = {};
  for (const file of filesUnder(PUBLIC).filter(isKeptByWorker).sort()) {
    files[file] = createHash('sha256').update(readFileSync(path.join(PUBLIC, file))).digest('hex').slice(0, 16);
  }
  return { versions: { scopa: versionOf('scopa'), briscola: versionOf('briscola') }, files };
}

/** The record, or null before the first `npm run cache:record`. */
export function readRecord(): CacheState | null {
  return existsSync(LOCK) ? (JSON.parse(readFileSync(LOCK, 'utf8')) as CacheState) : null;
}

const numberOf = (version: string) => Number(version.match(/^v(\d+)$/)?.[1] ?? NaN);
const envFiles = (games: readonly Game[]) => games.map((game) => `.env.${game}`).join(' and ');
const named = (files: string[], limit = 12) =>
  files.length <= limit ? files.join(', ') : `${files.slice(0, limit).join(', ')} and ${files.length - limit} more`;

function compare(record: CacheState, now: CacheState) {
  const recorded = Object.keys(record.files);
  const present = Object.keys(now.files);
  return {
    /** Same path, other content: the case that needs both versions raised. */
    changed: recorded.filter((file) => file in now.files && now.files[file] !== record.files[file]),
    added: present.filter((file) => !(file in record.files)),
    removed: recorded.filter((file) => !(file in now.files)),
    moved: GAMES.filter((game) => now.versions[game] !== record.versions[game]),
    notRaised: GAMES.filter((game) => !(numberOf(now.versions[game]) > numberOf(record.versions[game]))),
  };
}

/**
 * Why the record must not be rewritten yet, or null when it may be. It never
 * quotes a fingerprint: the way out is the bump and the recorder, not a paste.
 */
export function blocker(record: CacheState, now: CacheState): string | null {
  for (const game of GAMES) {
    const [was, is] = [record.versions[game], now.versions[game]];
    if (Number.isNaN(numberOf(is))) return `${VERSION_KEY} in .env.${game} is "${is}"; it has to look like v3.`;
    if (numberOf(is) < numberOf(was)) {
      return `${VERSION_KEY} in .env.${game} went down from ${was} to ${is}. A cache name is never used again: browsers may still hold the old one.`;
    }
  }
  const { changed, notRaised } = compare(record, now);
  if (!changed.length || !notRaised.length) return null;
  const raise =
    notRaised.length === GAMES.length
      ? `Raise ${VERSION_KEY} in ${envFiles(notRaised)}`
      : `Raise ${VERSION_KEY} in ${envFiles(notRaised)} too (both sites serve these files)`;
  return [
    `${changed.length === 1 ? '1 file' : `${changed.length} files`} changed under an unchanged URL: ${named(changed)}.`,
    'The service worker never asks the server again, so returning visitors keep the old copy until the static cache version goes up.',
    `${raise}, then run ${RECORD_COMMAND}.`,
  ].join('\n');
}

/** What staticCache.test.ts reports: nothing when the record matches the working tree. */
export function problems(record: CacheState | null, now: CacheState): string[] {
  if (!record) return [`There is no record yet: run ${RECORD_COMMAND}.`];
  const reason = blocker(record, now);
  if (reason) return [reason];
  const { changed, added, removed, moved } = compare(record, now);
  const parts = [
    changed.length && `${changed.length} changed with the versions raised`,
    added.length && `${added.length} new (${named(added, 4)})`,
    removed.length && `${removed.length} gone (${named(removed, 4)})`,
    ...moved.map((game) => `${game} ${record.versions[game]} to ${now.versions[game]}`),
  ].filter(Boolean);
  return parts.length ? [`The record is out of date: ${parts.join('; ')}. Run ${RECORD_COMMAND}.`] : [];
}

/** `npm run cache:record`: bring the record up to date, unless a bump is owed. */
function record(): void {
  const now = readWorkingTree();
  const before = readRecord();
  const reason = before && blocker(before, now);
  if (reason) {
    console.error(reason);
    process.exit(1);
  }
  const text = `${JSON.stringify(now, null, 2)}\n`;
  if (existsSync(LOCK) && readFileSync(LOCK, 'utf8') === text) {
    console.log('static cache record: already up to date');
    return;
  }
  writeFileSync(LOCK, text);
  console.log(
    `static cache record: ${Object.keys(now.files).length} files, scopa ${now.versions.scopa}, briscola ${now.versions.briscola}`,
  );
}

// Only the explicit argument writes the record; importing this module (the test does) never can.
if (process.argv.includes('--record')) record();
