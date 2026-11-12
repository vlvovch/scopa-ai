// The service worker keeps cards, sounds, icons and badges forever under a
// versioned cache name, so a file replaced under its old URL needs the version
// raised in both .env files (see staticCache.ts). This test is the reminder:
// it fails, naming the files, while a recorded file has changed in place and
// a version has not gone up.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { blocker, isKeptByWorker, problems, readRecord, readWorkingTree, type CacheState } from './staticCache';

const state = (scopa: string, briscola: string, files: Record<string, string>): CacheState => ({
  versions: { scopa, briscola },
  files,
});

const FILES = { 'cards/a.webp': 'aaaa1111', 'sounds/b.mp3': 'bbbb2222' };
const REDRAWN = { ...FILES, 'cards/a.webp': 'cccc3333' };
const RECORD = state('v2', 'v3', FILES);

describe('static cache guard: the rule', () => {
  it('has nothing to report while files and versions are as recorded', () => {
    expect(problems(RECORD, state('v2', 'v3', FILES))).toEqual([]);
  });

  it('names a file that changed in place and asks for the version in both .env files', () => {
    const now = state('v2', 'v3', REDRAWN);
    const [message, ...rest] = problems(RECORD, now);
    expect(rest).toEqual([]);
    expect(message).toContain('cards/a.webp');
    expect(message).not.toContain('sounds/b.mp3');
    expect(message).toContain('.env.scopa and .env.briscola');
    expect(blocker(RECORD, now)).toBe(message);
  });

  it('is not satisfied by a bump on one site only', () => {
    const now = state('v3', 'v3', REDRAWN);
    expect(blocker(RECORD, now)).toContain('.env.briscola too');
    expect(blocker(RECORD, now)).not.toContain('.env.scopa');
  });

  it('accepts the change once both versions are higher, and then only wants a new record', () => {
    const now = state('v3', 'v4', REDRAWN);
    expect(blocker(RECORD, now)).toBeNull();
    expect(problems(RECORD, now)).toEqual([expect.stringContaining('out of date')]);
  });

  it('wants a new record, not a bump, when files were added or removed', () => {
    const added = state('v2', 'v3', { ...FILES, 'cards/new.webp': 'dddd4444' });
    const removed = state('v2', 'v3', { 'cards/a.webp': FILES['cards/a.webp'] });
    for (const now of [added, removed]) {
      expect(blocker(RECORD, now)).toBeNull();
      expect(problems(RECORD, now)).toEqual([expect.stringContaining('out of date')]);
    }
    expect(problems(RECORD, added)[0]).toContain('cards/new.webp');
    expect(problems(RECORD, removed)[0]).toContain('sounds/b.mp3');
  });

  it('never quotes a fingerprint: the way out is the bump and the recorder, not a paste', () => {
    const cases = [state('v2', 'v3', REDRAWN), state('v3', 'v4', REDRAWN), state('v2', 'v3', { ...FILES, 'cards/new.webp': 'dddd4444' })];
    for (const now of cases) {
      expect(problems(RECORD, now).join('\n')).not.toMatch(/aaaa1111|bbbb2222|cccc3333|dddd4444/);
    }
  });

  it('refuses a version that goes down or does not look like v3', () => {
    expect(blocker(RECORD, state('v1', 'v3', FILES))).toContain('went down from v2 to v1');
    expect(blocker(RECORD, state('v2', '3', FILES))).toContain('.env.briscola');
  });

  it('asks for the first record when there is none', () => {
    expect(problems(null, state('v2', 'v3', FILES))).toEqual([expect.stringContaining('no record yet')]);
  });
});

describe('static cache guard: this repository', () => {
  it('finds every recorded file unchanged, or both versions raised (see the message for what to do)', () => {
    expect(problems(readRecord(), readWorkingTree())).toEqual([]);
  });

  it('covers every file the worker precaches', () => {
    const worker = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    const list = worker.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/)?.[1] ?? '';
    // The icon is a build token and the manifest is fetched from the network first.
    const precached = [...list.matchAll(/'\/([^']+)'/g)].map((match) => match[1]).filter((file) => file !== 'manifest.json');
    expect(precached.length).toBeGreaterThan(50);
    const recorded = Object.keys(readRecord()?.files ?? {});
    for (const file of precached) expect(recorded, file).toContain(file);
  });

  it('leaves out what the worker takes from the network and what no page loads', () => {
    const kept = ['cards/napoletane/coins-7.webp', 'sounds/broom-sweep.mp3', 'badges/google-play-badge-it.png', 'pwa-192.png', 'variants/briscola/pwa-192.png', 'scopa-icon.svg'];
    const left = ['regole-scopa.html', 'manifest.json', 'variants/briscola/manifest.json', 'sw.js', 'robots.txt', 'sitemap.xml', 'sounds/kenney-license.txt', '_redirects', '.well-known/assetlinks.json', 'cards/.DS_Store'];
    for (const file of kept) expect(isKeptByWorker(file), file).toBe(true);
    for (const file of left) expect(isKeptByWorker(file), file).toBe(false);
  });
});
