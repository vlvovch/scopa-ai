// Service Worker for Scopa PWA
const CACHE_NAME = 'scopa-v5';

// Assets to cache on install - essential for offline play
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './scopa-icon.svg',
  './manifest.json',
  './pwa-192.png',
  './pwa-512.png',
  // Card images (Napoletane deck)
  './cards/napoletane/back.webp',
  './cards/napoletane/coins-1.webp',
  './cards/napoletane/coins-2.webp',
  './cards/napoletane/coins-3.webp',
  './cards/napoletane/coins-4.webp',
  './cards/napoletane/coins-5.webp',
  './cards/napoletane/coins-6.webp',
  './cards/napoletane/coins-7.webp',
  './cards/napoletane/coins-8.webp',
  './cards/napoletane/coins-9.webp',
  './cards/napoletane/coins-10.webp',
  './cards/napoletane/cups-1.webp',
  './cards/napoletane/cups-2.webp',
  './cards/napoletane/cups-3.webp',
  './cards/napoletane/cups-4.webp',
  './cards/napoletane/cups-5.webp',
  './cards/napoletane/cups-6.webp',
  './cards/napoletane/cups-7.webp',
  './cards/napoletane/cups-8.webp',
  './cards/napoletane/cups-9.webp',
  './cards/napoletane/cups-10.webp',
  './cards/napoletane/swords-1.webp',
  './cards/napoletane/swords-2.webp',
  './cards/napoletane/swords-3.webp',
  './cards/napoletane/swords-4.webp',
  './cards/napoletane/swords-5.webp',
  './cards/napoletane/swords-6.webp',
  './cards/napoletane/swords-7.webp',
  './cards/napoletane/swords-8.webp',
  './cards/napoletane/swords-9.webp',
  './cards/napoletane/swords-10.webp',
  './cards/napoletane/clubs-1.webp',
  './cards/napoletane/clubs-2.webp',
  './cards/napoletane/clubs-3.webp',
  './cards/napoletane/clubs-4.webp',
  './cards/napoletane/clubs-5.webp',
  './cards/napoletane/clubs-6.webp',
  './cards/napoletane/clubs-7.webp',
  './cards/napoletane/clubs-8.webp',
  './cards/napoletane/clubs-9.webp',
  './cards/napoletane/clubs-10.webp',
  // Suit icons for score screen
  './cards/napoletane/suits/coins.svg',
  './cards/napoletane/suits/cups.svg',
  './cards/napoletane/suits/swords.svg',
  './cards/napoletane/suits/clubs.svg',
  // Sound effects (MP3 for Safari/iOS compatibility)
  './sounds/broom-sweep.mp3',
  './sounds/card-fan-1.mp3',
  './sounds/card-fan-2.mp3',
  './sounds/card-place-1.mp3',
  './sounds/card-place-2.mp3',
  './sounds/card-shove-1.mp3',
  './sounds/card-shove-2.mp3',
  './sounds/card-slide-1.mp3',
  './sounds/card-slide-2.mp3',
  './sounds/chips-stack-1.mp3',
  './sounds/chips-stack-4.mp3',
  './sounds/coin-dropped-81172.mp3'
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

// Fetch event - cache-first for assets, skip API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip external API calls (Gemini, OpenAI, Claude)
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('openai.com') ||
      url.hostname.includes('anthropic.com') ||
      url.hostname.includes('google.com')) {
    return;
  }

  // Skip analytics
  if (url.hostname.includes('googletagmanager.com') ||
      url.hostname.includes('google-analytics.com') ||
      url.pathname.includes('analytics')) {
    return;
  }

  // For same-origin requests, use cache-first strategy
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version and update cache in background
          event.waitUntil(
            fetch(event.request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, networkResponse.clone());
                });
              }
            }).catch(() => {})
          );
          return cachedResponse;
        }

        // Not in cache - fetch and cache
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Offline and not in cache - return offline page for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('./');
          }
        });
      })
    );
  }
});
