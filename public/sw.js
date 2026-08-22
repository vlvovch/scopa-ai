// Service Worker for the Scopa/Briscola PWAs — single source for both
// games. The __TOKENS__ below are replaced at build time by the
// injectSwPrecache plugin in vite.config.ts (game name, icon, build id,
// and the content-hashed /assets/* list, which a static file cannot know).
// A build that fails to replace them fails loudly in the plugin.
//
// Two caches with different lifetimes:
//   APP_CACHE  ("<game>-app-<buildId>") — index.html + every /assets/*
//     bundle, written ONLY at install as one atomic set and never
//     overwritten at runtime. This guarantees the cached HTML and the
//     hashed JS/CSS it references are always a matched pair, so an
//     offline launch always boots. (The old single-cache design runtime-
//     cached the JS, then deleted it on the next deploy's cache-name
//     bump before re-caching — one brief online open after a deploy left
//     HTML cached with no JS, and the next offline launch green-screened.)
//   STATIC_CACHE ("<game>-static-v1") — cards, sounds, icons, manifest.
//     Survives deploys (no more re-downloading every card each release);
//     non-default decks are added here at runtime as they are used. Bump
//     the v1 only when media files change in place.
const APP_CACHE = '__GAME__-app-__BUILD_ID__';
const STATIC_CACHE = '__GAME__-static-v1';

const APP_ASSETS = [__APP_ASSETS__];

const STATIC_ASSETS = [
  '__ICON_PATH__',
  '/manifest.json',
  '/pwa-192.png',
  '/pwa-512.png',
  // Card images (Napoletane deck — the shared GameSettings default;
  // other decks are cached at runtime by the fetch handler below)
  '/cards/napoletane/back.webp',
  '/cards/napoletane/coins-1.webp',
  '/cards/napoletane/coins-2.webp',
  '/cards/napoletane/coins-3.webp',
  '/cards/napoletane/coins-4.webp',
  '/cards/napoletane/coins-5.webp',
  '/cards/napoletane/coins-6.webp',
  '/cards/napoletane/coins-7.webp',
  '/cards/napoletane/coins-8.webp',
  '/cards/napoletane/coins-9.webp',
  '/cards/napoletane/coins-10.webp',
  '/cards/napoletane/cups-1.webp',
  '/cards/napoletane/cups-2.webp',
  '/cards/napoletane/cups-3.webp',
  '/cards/napoletane/cups-4.webp',
  '/cards/napoletane/cups-5.webp',
  '/cards/napoletane/cups-6.webp',
  '/cards/napoletane/cups-7.webp',
  '/cards/napoletane/cups-8.webp',
  '/cards/napoletane/cups-9.webp',
  '/cards/napoletane/cups-10.webp',
  '/cards/napoletane/swords-1.webp',
  '/cards/napoletane/swords-2.webp',
  '/cards/napoletane/swords-3.webp',
  '/cards/napoletane/swords-4.webp',
  '/cards/napoletane/swords-5.webp',
  '/cards/napoletane/swords-6.webp',
  '/cards/napoletane/swords-7.webp',
  '/cards/napoletane/swords-8.webp',
  '/cards/napoletane/swords-9.webp',
  '/cards/napoletane/swords-10.webp',
  '/cards/napoletane/clubs-1.webp',
  '/cards/napoletane/clubs-2.webp',
  '/cards/napoletane/clubs-3.webp',
  '/cards/napoletane/clubs-4.webp',
  '/cards/napoletane/clubs-5.webp',
  '/cards/napoletane/clubs-6.webp',
  '/cards/napoletane/clubs-7.webp',
  '/cards/napoletane/clubs-8.webp',
  '/cards/napoletane/clubs-9.webp',
  '/cards/napoletane/clubs-10.webp',
  // Suit icons for score screen
  '/cards/napoletane/suits/coins.svg',
  '/cards/napoletane/suits/cups.svg',
  '/cards/napoletane/suits/swords.svg',
  '/cards/napoletane/suits/clubs.svg',
  // Sound effects (MP3 for Safari/iOS compatibility)
  '/sounds/broom-sweep.mp3',
  '/sounds/card-fan-1.mp3',
  '/sounds/card-fan-2.mp3',
  '/sounds/card-place-1.mp3',
  '/sounds/card-place-2.mp3',
  '/sounds/card-shove-1.mp3',
  '/sounds/card-shove-2.mp3',
  '/sounds/card-slide-1.mp3',
  '/sounds/card-slide-2.mp3',
  '/sounds/chips-stack-1.mp3',
  '/sounds/chips-stack-4.mp3',
  '/sounds/coin-dropped-81172.mp3'
];

// Install: the app set is atomic (all-or-nothing — a half-cached app is
// worse than none, because activate would then delete the old complete
// cache). The static set is incremental: only fetch what this device
// doesn't already hold, so a deploy doesn't re-download every card.
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_CACHE).then((cache) => cache.addAll(APP_ASSETS)),
      caches.open(STATIC_CACHE).then(async (cache) => {
        const missing = [];
        for (const url of STATIC_ASSETS) {
          if (!(await cache.match(url))) missing.push(url);
        }
        if (missing.length) await cache.addAll(missing);
      }),
    ])
  );
  self.skipWaiting();
});

// Activate: drop every cache of ours that isn't current — old app caches
// from previous builds and the pre-split names ("scopa-v18",
// "briscola-v4") both match the prefix. Runs only after install fully
// succeeded, so the new complete app cache is already in place.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith('__GAME__-') && n !== APP_CACHE && n !== STATIC_CACHE)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   - navigations / HTML -> network-first so new deploys land on the next
//     online launch, but the response is NOT written to any cache: the
//     offline fallback always comes from APP_CACHE, whose HTML is
//     guaranteed to match its precached assets. (Runtime-caching a newer
//     HTML over the install-time one is exactly what caused offline
//     launches to reference JS that wasn't cached.)
//   - manifest.json -> network-first with STATIC_CACHE fallback.
//   - /assets/* (content-hashed, immutable) -> cache-first; misses (e.g.
//     a lazy chunk of a newer build fetched while the old SW is still in
//     control) are fetched and added to APP_CACHE.
//   - everything else same-origin (cards of non-default decks, etc.) ->
//     cache-first into STATIC_CACHE, so once used it works offline and
//     survives deploys.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // Skip external API calls (Gemini, OpenAI, Claude) + analytics.
  if (url.hostname.includes('googleapis.com') ||
    url.hostname.includes('openai.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('google.com')) {
    return;
  }
  if (url.pathname.includes('analytics')) return;

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html');

  if (isNavigation) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.open(APP_CACHE).then(async (cache) =>
          (await cache.match(event.request)) || cache.match('/')
        )
      )
    );
    return;
  }

  if (url.pathname === '/manifest.json') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  const targetCache = url.pathname.startsWith('/assets/') ? APP_CACHE : STATIC_CACHE;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(targetCache).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => undefined);
    })
  );
});
