/**
 * Native (Capacitor) builds drop the parts of index.html that belong to the
 * website only — service-worker registration and its update/reload flow,
 * analytics loaders, the PWA install counter. They are fenced in
 * index.html with `<!-- @web-only:start -->` … `<!-- @web-only:end -->`.
 * Used by vite.config.ts (stripWebOnlyHtml) and unit-tested.
 */
export const WEB_ONLY_BLOCK = /[ \t]*<!-- @web-only:start -->[\s\S]*?<!-- @web-only:end -->[ \t]*\n?/g;

export function stripWebOnlyBlocks(html: string): string {
  const out = html.replace(WEB_ONLY_BLOCK, '');
  if (out.includes('serviceWorker.register')) {
    throw new Error('stripWebOnlyBlocks: service-worker registration survived in the native build');
  }
  if (out.includes('@web-only:')) {
    throw new Error('stripWebOnlyBlocks: unbalanced @web-only fence');
  }
  return out;
}
