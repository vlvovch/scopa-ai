// Public-asset URL helper. Production builds use base '/' (absolute
// paths, required for SPA routes like /join/CODE), where this is a
// no-op. The itch.io build (`build:itch`) uses `--base=./` because itch
// serves the game from a subpath on its CDN, where absolute paths 404
// (the blank-embed bug) — there this rewrites '/cards/x' to './cards/x'.
const BASE = import.meta.env.BASE_URL;

export function assetUrl(path: string): string {
  return BASE === '/' ? path : BASE.replace(/\/$/, '') + path;
}
