// Askar Khata PWA Offline Service Worker (Hardened v4 - BenefitPay Fawri+ Enabled)
const CACHE_NAME = 'askar-khata-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  /* __BUILD_ASSETS_PLACEHOLDER__ */
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Only intercept GET requests (skip POST, webhooks, extensions)
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Skip chrome-extension, moz-extension, non-http schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Do not cache API endpoints, checkout redirects, or payment webhooks
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-first strategy with cache fallback & cache update for HTML navigation (Resolved PWA-R4-07)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('/index.html').then((r) => r || caches.match('/'));
        })
    );
    return;
  }

  // Cache-first strategy for static scripts, styles, images, and fonts
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((networkResponse) => {
          // Cache successful responses or opaque CDN responses (status 0 or 200)
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Graceful offline fallback for uncached assets
          return new Response('', { status: 408, statusText: 'Offline Resource Unavailable' });
        });
    })
  );
});
