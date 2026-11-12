// https://playscopa.net/briscola is the app page with Briscola's head (see
// gamePageHead.ts). The build writes it from the finished index.html, so
// this test rebuilds that head from the real index.html and .env files.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withGameHead, type GameHead } from './gamePageHead';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The VITE_ values of one build variant, as Vite reads them from its .env file. */
function envOf(game: string): Record<string, string> {
  const lines = readFileSync(path.join(ROOT, `.env.${game}`), 'utf8').split('\n');
  return Object.fromEntries(
    lines
      .map((line) => line.match(/^(VITE_[A-Z_]+)=(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2].replace(/^"(.*)"$/, '$1')]),
  );
}

/** index.html as the Scopa build leaves it: every %VITE_X% replaced. */
function builtScopaPage(): string {
  const env = envOf('scopa');
  return readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/%(VITE_[A-Z_]+)%/g, (_, key: string) => env[key] ?? '');
}

const scopa = envOf('scopa');
const briscola = envOf('briscola');
const BRISCOLA_PAGE: GameHead = {
  name: briscola.VITE_APP_NAME,
  description: briscola.VITE_APP_DESCRIPTION,
  themeColor: briscola.VITE_THEME_COLOR,
  url: `${scopa.VITE_SITE_URL}/briscola`,
  icons: '/variants/briscola',
  svgIcon: '/variants/briscola/briscola-icon.svg',
};

describe('the Briscola page of the Scopa site', () => {
  const source = builtScopaPage();
  const page = withGameHead(source, BRISCOLA_PAGE);
  const head = page.slice(0, page.indexOf('</head>'));

  it('names Briscola in its title, description and share card', () => {
    expect(head).toContain('<title>Briscola AI</title>');
    expect(head).toContain(`<meta name="description" content="${briscola.VITE_APP_DESCRIPTION}" />`);
    expect(head).toContain('<meta property="og:title" content="Briscola AI" />');
    expect(head).toContain(`<meta name="twitter:description" content="${briscola.VITE_APP_DESCRIPTION}" />`);
    expect(head).toContain('<meta name="theme-color" content="#1A237E" />');
  });

  it('is its own canonical address on the main site', () => {
    expect(head).toContain('<link rel="canonical" href="https://playscopa.net/briscola" />');
    expect(head).toContain('<meta property="og:url" content="https://playscopa.net/briscola" />');
  });

  it('shows the Briscola icons, from files this site serves', () => {
    expect(head).toContain('<meta property="og:image" content="https://playscopa.net/variants/briscola/pwa-512.png" />');
    expect(head).toContain('<link rel="icon" type="image/svg+xml" href="/variants/briscola/briscola-icon.svg" />');
    expect(head).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/variants/briscola/pwa-192.png" />');
    for (const file of ['pwa-192.png', 'pwa-512.png', 'briscola-icon.svg']) {
      expect(existsSync(path.join(ROOT, 'public/variants/briscola', file)), file).toBe(true);
    }
  });

  it("leaves what belongs to installing the site as the site's", () => {
    // The manifest is the Scopa site's and starts at "/": a home-screen icon added from /briscola
    // opens that, so it keeps the site's icon and name.
    expect(head).toContain('<link rel="apple-touch-icon" sizes="192x192" href="/pwa-192.png" />');
    expect(head).toContain(`<meta name="apple-mobile-web-app-title" content="${scopa.VITE_APP_NAME}" />`);
    expect(head).toContain('<link rel="manifest" href="/manifest.json" />');
  });

  it('keeps nothing else of the Scopa page in its head, and changes nothing after it', () => {
    const rest = head
      .split('\n')
      .filter((line) => !/rel="apple-touch-icon"|name="apple-mobile-web-app-title"/.test(line))
      .join('\n');
    expect(rest).not.toContain(scopa.VITE_APP_NAME);
    expect(rest).not.toContain(scopa.VITE_APP_DESCRIPTION);
    expect(rest).not.toContain(`"${scopa.VITE_SITE_URL}/"`);
    expect(rest).not.toContain(scopa.VITE_THEME_COLOR);
    expect(rest).not.toMatch(/href="\/(pwa-\d+\.png|scopa-icon\.svg)"/);
    expect(page.slice(page.indexOf('</head>'))).toBe(source.slice(source.indexOf('</head>')));
  });

  it('refuses a page whose head it does not recognise', () => {
    expect(() => withGameHead(source.replace('<link rel="canonical"', '<link rel="canonical-x"'), BRISCOLA_PAGE)).toThrow(/canonical/);
    expect(() => withGameHead(source.replace('</title>', '</title><title>again</title>'), BRISCOLA_PAGE)).toThrow(/title/);
  });

  it('escapes what it writes into the page', () => {
    const odd = withGameHead(source, { ...BRISCOLA_PAGE, description: 'Tricks & "trumps" <fast>' });
    expect(odd).toContain('<meta name="description" content="Tricks &amp; &quot;trumps&quot; &lt;fast&gt;" />');
  });
});
