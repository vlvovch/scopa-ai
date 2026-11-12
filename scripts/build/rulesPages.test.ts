// The rules pages (public/regole-scopa.html, primiera.html, regole-briscola.html
// and their English twins scopa-rules.html, primiera-scoring.html,
// briscola-rules.html) are plain files that no build step touches, so nothing
// else would notice a wrong canonical host, a page missing from the sitemap, a
// link to a file that is not there, or a twin that has drifted from its
// original. On these sites a broken link does not even fail: the server answers
// every unknown path with the app (200), so the check has to be made against
// the files.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { APP_STORE_URL, GOOGLE_PLAY_URL, PUBLIC_ORIGINS } from '../../src/platform/links';
import type { GameId } from '../../src/games/gameSelection';
import { en } from '../../src/i18n/en';
import { it as italian } from '../../src/i18n/it';

const PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

/**
 * All six pages are at home on the main site, the Briscola rules included:
 * playbriscola.com is meant to redirect to playscopa.net one day, so nothing
 * new should enter a search index under the host that goes away. (The app's
 * PUBLIC_ORIGINS.briscola stays what it is: invitations use it.)
 */
const HOME = PUBLIC_ORIGINS.scopa;

type Lang = 'it' | 'en';

/**
 * Each page: its language, its twin in the other language, the game its play
 * button opens, and where its icons are. On playscopa.net /pwa-192.png is the
 * Scopa icon; the Briscola artwork is served under /variants/briscola by both
 * sites.
 */
interface Page {
  file: string;
  lang: Lang;
  twin: string;
  game: GameId;
  icons: string;
}

const PAGES: ReadonlyArray<Page> = [
  { file: 'regole-scopa.html', lang: 'it', twin: 'scopa-rules.html', game: 'scopa', icons: '' },
  { file: 'primiera.html', lang: 'it', twin: 'primiera-scoring.html', game: 'scopa', icons: '' },
  { file: 'regole-briscola.html', lang: 'it', twin: 'briscola-rules.html', game: 'briscola', icons: '/variants/briscola' },
  { file: 'scopa-rules.html', lang: 'en', twin: 'regole-scopa.html', game: 'scopa', icons: '' },
  { file: 'primiera-scoring.html', lang: 'en', twin: 'primiera.html', game: 'scopa', icons: '' },
  { file: 'briscola-rules.html', lang: 'en', twin: 'regole-briscola.html', game: 'briscola', icons: '/variants/briscola' },
];

/** What differs by language: the store's own badge wording and credit lines are the app's (src/i18n). */
const BY_LANG: Record<Lang, { locale: string; store: typeof en.start }> = {
  it: { locale: 'it_IT', store: italian.start },
  en: { locale: 'en_US', store: en.start },
};

/** The Scopa build ships public/ as it is; the Briscola build overlays public/variants/briscola. */
const SITEMAPS: Record<GameId, string> = {
  scopa: 'sitemap.xml',
  briscola: 'variants/briscola/sitemap.xml',
};

/** Paths the app itself answers (src/games/gameSelection.ts). */
const APP_ROUTES = ['/', '/scopa', '/briscola'];

const read = (rel: string) => readFileSync(path.join(PUBLIC, rel), 'utf8');
const urlOf = (file: string) => `${HOME}/${file}`;
const other = (lang: Lang): Lang => (lang === 'it' ? 'en' : 'it');
const attrValues = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);
const sitemapLocs = (game: GameId) =>
  [...read(SITEMAPS[game]).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
/** A site path is fine when the app answers it or a file in public/ does. */
const resolves = (sitePath: string) =>
  APP_ROUTES.includes(sitePath) || existsSync(path.join(PUBLIC, decodeURIComponent(sitePath)));

describe.each(PAGES)('rules page $file', (page) => {
  const html = read(page.file);
  const { locale, store } = BY_LANG[page.lang];
  const twinLang = other(page.lang);

  it('declares its language, with one h1, a title and a description of a sensible length', () => {
    expect(html).toContain(`<html lang="${page.lang}">`);
    expect(html).toContain(`<meta property="og:locale" content="${locale}">`);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    expect(title.length).toBeGreaterThan(20);
    expect(title.length).toBeLessThanOrEqual(65);
    const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1] ?? '';
    expect(description.length).toBeGreaterThanOrEqual(110);
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it('names the main site as canonical: the file ships to both sites and their alias domains', () => {
    expect(html).toContain(`<link rel="canonical" href="${urlOf(page.file)}">`);
    expect(html).toContain(`<meta property="og:url" content="${urlOf(page.file)}">`);
  });

  it('carries the full hreflang set: itself, its twin, and the English page as x-default', () => {
    const [itFile, enFile] = page.lang === 'it' ? [page.file, page.twin] : [page.twin, page.file];
    expect(html).toContain(`<link rel="alternate" hreflang="it" href="${urlOf(itFile)}">`);
    expect(html).toContain(`<link rel="alternate" hreflang="en" href="${urlOf(enFile)}">`);
    expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${urlOf(enFile)}">`);
    expect(html.match(/<link rel="alternate"/g)).toHaveLength(3);
  });

  it('links to its twin from the top bar and from the footer', () => {
    const link = `<a href="${urlOf(page.twin)}" hreflang="${twinLang}" lang="${twinLang}"`;
    expect(html.split(link).length - 1).toBe(2);
  });

  it('carries the icon of its own game, also when it is served by the other site', () => {
    expect(html).toContain(`<meta property="og:image" content="${HOME}${page.icons}/pwa-512.png">`);
    expect(html).toContain(`<link rel="icon" type="image/png" sizes="192x192" href="${page.icons}/pwa-192.png">`);
    expect(html).toContain(`<link rel="apple-touch-icon" href="${page.icons}/pwa-192.png">`);
  });

  it("is listed in the main site's sitemap and not in the Briscola one", () => {
    expect(sitemapLocs('scopa')).toContain(urlOf(page.file));
    expect(sitemapLocs('briscola').filter((loc) => loc.endsWith(`/${page.file}`))).toEqual([]);
  });

  it('links to the three pages of its own language and, across languages, only to its twin', () => {
    const hrefs = attrValues(html, 'href');
    for (const peer of PAGES.filter((p) => p.lang === page.lang)) {
      expect(hrefs, peer.file).toContain(urlOf(peer.file));
    }
    for (const stranger of PAGES.filter((p) => p.lang !== page.lang && p.file !== page.twin)) {
      expect(hrefs, stranger.file).not.toContain(urlOf(stranger.file));
    }
    // No link to the Briscola site's copy of a page: that host is the one that goes away.
    for (const href of hrefs) expect(href.startsWith(PUBLIC_ORIGINS.briscola), href).toBe(false);
  });

  it('has no link or image that leads nowhere', () => {
    const ids = new Set(attrValues(html, 'id'));
    const ownOrigins = Object.values(PUBLIC_ORIGINS);
    for (const ref of [...attrValues(html, 'href'), ...attrValues(html, 'src')]) {
      if (ref.startsWith('#')) {
        expect(ids.has(ref.slice(1)), `anchor ${ref}`).toBe(true);
      } else if (ref.startsWith('/')) {
        expect(resolves(ref), `local path ${ref}`).toBe(true);
      } else {
        const url = new URL(ref); // throws on anything that is not an absolute URL
        if (ownOrigins.includes(url.origin)) {
          expect(resolves(url.pathname), `own-site link ${ref}`).toBe(true);
        }
      }
    }
  });

  it("sends the play buttons to this page's game by its explicit path", () => {
    const buttons = [...html.matchAll(/<a class="btn" href="([^"]+)">/g)].map((m) => m[1]);
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    // /scopa and /briscola open that game on either site and skip the first-visit chooser; "/" would not.
    expect(new Set(buttons)).toEqual(new Set([`/${page.game}`]));
  });

  it('shows both store badges in its language, linked and worded as in the app', () => {
    expect(html).toContain(
      `<a class="b-ios" href="${APP_STORE_URL}"><img src="/badges/app-store-badge-${page.lang}.svg" alt="${store.appStoreBadgeAlt}"`,
    );
    expect(html).toContain(
      `<a class="b-play" href="${GOOGLE_PLAY_URL}"><img src="/badges/google-play-badge-${page.lang}.png" alt="${store.googlePlayBadgeAlt}"`,
    );
    expect(html).toContain(store.appStoreCredit);
    expect(html).toContain(store.googlePlayCredit);
  });

  it('is self-contained: no external script, stylesheet or font, and no analytics tag', () => {
    // The service worker would cache a shared stylesheet or script forever (cache-first, never
    // revalidated), and analytics load only through src/analytics/gate.ts, inside the app.
    expect(html).not.toMatch(/<script[^>]*\ssrc=/);
    expect(html).not.toMatch(/<link[^>]*rel="stylesheet"/);
    expect(html).not.toMatch(/@import|url\(/);
    expect(html.toLowerCase()).not.toContain('swetrix');
    for (const src of attrValues(html, 'src')) expect(src.startsWith('/'), src).toBe(true);
  });
});

/** What a page shows and counts, whatever its language: the outline, the card images, the numbers. */
function skeleton(html: string) {
  const body = html.slice(html.indexOf('<body'));
  const count = (tag: string) => (body.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
  const digitsIn = (pattern: RegExp) => [...body.matchAll(pattern)].flatMap((m) => m[1].match(/\d+/g) ?? []);
  return {
    outline: Object.fromEntries(['section', 'h2', 'h3', 'figure', 'table', 'tr', 'dt'].map((tag) => [tag, count(tag)])),
    cards: attrValues(body, 'src').filter((src) => src.startsWith('/cards/')),
    // Scores, card values and totals: the cells of the tables and everything set in bold on the felt.
    tableNumbers: digitsIn(/<td class="num">([^<]*)<\/td>/g),
    feltNumbers: digitsIn(/<b>([^<]*)<\/b>/g),
    captionNumbers: digitsIn(/<p class="fan-cap">([^<]*)<\/p>/g),
  };
}

describe('rules pages as a set', () => {
  it('repeat one identical stylesheet (edit all six together)', () => {
    const styles = PAGES.map((page) => read(page.file).match(/^<style>\n([\s\S]*?)\n<\/style>$/m)?.[1]);
    expect(styles[0]?.length ?? 0).toBeGreaterThan(1000);
    for (const style of styles) expect(style).toBe(styles[0]);
  });

  it.each(PAGES.filter((page) => page.lang === 'it'))('$file and its English twin show the same outline, cards and numbers', (page) => {
    const twin = PAGES.find((candidate) => candidate.file === page.twin);
    expect(twin).toMatchObject({ lang: 'en', twin: page.file, game: page.game, icons: page.icons });
    expect(skeleton(read(page.twin))).toEqual(skeleton(read(page.file)));
  });

  it.each(Object.keys(SITEMAPS) as GameId[])('the %s sitemap lists only pages of its own site that exist', (game) => {
    const locs = sitemapLocs(game);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      const url = new URL(loc);
      expect(url.origin, loc).toBe(PUBLIC_ORIGINS[game]);
      expect(resolves(url.pathname), loc).toBe(true);
    }
  });
});
