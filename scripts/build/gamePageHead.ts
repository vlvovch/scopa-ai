/**
 * The page of the other game on the main site.
 *
 * The server answers every path that is not a file with the same
 * index.html, so https://playscopa.net/briscola told search engines and
 * link previews "Scopa AI", with the root as its canonical address, while
 * the app showed Briscola. playscopa.net is meant to become the home of
 * both games (playbriscola.com is to redirect there one day), so its build
 * writes a second copy of the app page, <outDir>/briscola/index.html, that
 * differs only in what the head says about the game: title, description,
 * share card, tab icons, theme colour and canonical address. What belongs to
 * installing the site stays the site's (manifest, apple-touch-icon,
 * apple-mobile-web-app-title): a home-screen icon added from /briscola opens
 * the manifest's start page, so it must not be labelled Briscola. The server sends
 * it for /briscola (`try_files {path} {path}/index.html /index.html`, see
 * docs/deployment.md); without that rule the path keeps getting index.html,
 * as before.
 *
 * Used by vite.config.ts (otherGamePage) and unit-tested.
 */
export interface GameHead {
  /** The game's name as the page title, e.g. "Briscola AI". */
  name: string;
  description: string;
  themeColor: string;
  /** Canonical address of the page, e.g. https://playscopa.net/briscola. */
  url: string;
  /** Site path of the folder with the game's pwa-192.png and pwa-512.png, e.g. /variants/briscola. */
  icons: string;
  /** Site path of the game's SVG icon, e.g. /variants/briscola/briscola-icon.svg. */
  svgIcon: string;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Every place where the head of index.html names the game: what precedes the value, and the value to put there. */
function replacements(head: GameHead): Array<[before: string, value: string]> {
  const image = `${new URL(head.url).origin}${head.icons}/pwa-512.png`;
  return [
    ['<title>', head.name],
    ['<meta name="description" content="', head.description],
    ['<meta name="theme-color" content="', head.themeColor],
    ['<link rel="canonical" href="', head.url],
    ['<meta property="og:site_name" content="', head.name],
    ['<meta property="og:title" content="', head.name],
    ['<meta property="og:description" content="', head.description],
    ['<meta property="og:url" content="', head.url],
    ['<meta property="og:image" content="', image],
    ['<meta property="og:image:alt" content="', head.name],
    ['<meta name="twitter:title" content="', head.name],
    ['<meta name="twitter:description" content="', head.description],
    ['<meta name="twitter:image" content="', image],
    ['<link rel="icon" type="image/png" sizes="512x512" href="', `${head.icons}/pwa-512.png`],
    ['<link rel="icon" type="image/png" sizes="192x192" href="', `${head.icons}/pwa-192.png`],
    ['<link rel="icon" type="image/svg+xml" href="', head.svgIcon],
  ];
}

/**
 * The built index.html with its head rewritten for another game. Throws when
 * a tag it expects is missing or appears twice, so a change to index.html
 * cannot ship a page that names one game in its title and the other in its
 * share card.
 */
export function withGameHead(html: string, head: GameHead): string {
  let out = html;
  for (const [before, value] of replacements(head)) {
    const start = out.indexOf(before);
    if (start < 0 || out.indexOf(before, start + 1) >= 0) {
      throw new Error(`withGameHead: expected exactly one ${before.trim()} in index.html`);
    }
    const from = start + before.length;
    // The value runs to the end of the attribute, or of the element for <title>.
    const to = out.indexOf(before === '<title>' ? '<' : '"', from);
    if (to < 0) throw new Error(`withGameHead: unterminated ${before.trim()} in index.html`);
    out = out.slice(0, from) + escapeHtml(value) + out.slice(to);
  }
  return out;
}
