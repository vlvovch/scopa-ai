// Service Worker for Briscola PWA
// Briscola variant of public/sw.js. The copyVariantAssets Vite plugin
// overlays this over dist-briscola/sw.js so the Briscola build ships
// the right cache name + icon (the base sw.js precaches Scopa's icon).
const CACHE_NAME = 'briscola-v3';

// Assets to cache on install - essential for offline play.
// Using absolute paths for SPA routing compatibility with /join/CODE paths.
// Default deck is Napoletane (shared GameSettings default); other decks
// are picked up at runtime by the stale-while-revalidate handler below.
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/briscola-icon.svg',
  '/manifest.json',
  '/pwa-192.png',
  '/pwa-512.png',
  // Card images (Napoletane deck - default)
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

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch strategy:
//   - HTML / navigations / manifest  -> network-first (always fresh on
//     an online launch so new deploys land immediately; falls back to
//     cache when offline so the game still opens).
//   - everything else (hashed JS/CSS, card images, sounds, icons) ->
//     cache-first with NO background revalidation. These URLs are
//     immutable: Vite content-hashes JS/CSS, and card/sound/icon paths
//     are stable and refreshed by the CACHE_NAME bump on each deploy.
//     The previous stale-while-revalidate re-downloaded EVERY cached
//     asset on EVERY launch for nothing (the "redownloads them again"
//     symptom). Cache-first = zero network once cached.
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

  const isHTML =
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/manifest.json';

  if (isHTML) {
    // Network-first: keep the app current; fall back to cache offline.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Static immutable assets: cache-first, NO revalidation.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => undefined);
    })
  );
});
