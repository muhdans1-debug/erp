// Askar Khata PWA Offline Service Worker (Hardened v22 - WebAuthn allowCredentials Fix)
const CACHE_NAME = 'askar-khata-v22';
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

  // Stale-While-Revalidate with Instant Cache Return for HTML Navigation (Zero-Wait App Launch)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cachedResponse) => {
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        // Instant launch from cache (< 50ms), fallback to network on first visit
        return cachedResponse || networkFetch;
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
          const contentType = networkResponse.headers?.get('content-type') || '';
          const isAsset = url.pathname.startsWith('/assets/');
          // Stale asset defense: never cache HTML masquerading as CSS or JS
          if (isAsset && contentType.includes('text/html')) {
            return new Response('Asset Not Found', { status: 404, statusText: 'Not Found' });
          }

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

// --- PWA Background Push Notification Handler with Strict Anti-Loop De-duplication ---
const recentPushEvents = new Map();

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    try {
      data = { title: 'Layali Supermarket Notice', message: event.data ? event.data.text() : 'New transaction recorded' };
    } catch (_) {}
  }

  // Guard: Never display 0.000 BHD phantom sales
  const amt = Number(data.amount || 0);
  if (amt <= 0 && (!data.txType || data.txType === 'SALE')) {
    console.log('[SW] Ignoring zero-amount transaction push');
    return;
  }

  const notifTag = data.id || (data.invoiceNo ? `askar-inv-${data.invoiceNo}` : `askar-tx-${data.amount || '0'}`);
  const lastSeen = recentPushEvents.get(notifTag);
  if (lastSeen && (Date.now() - lastSeen) < 60000) {
    console.log('[SW] Duplicate push event suppressed for tag:', notifTag);
    return;
  }
  recentPushEvents.set(notifTag, Date.now());
  if (recentPushEvents.size > 200) {
    const now = Date.now();
    for (const [k, v] of recentPushEvents.entries()) {
      if (now - v > 120000) recentPushEvents.delete(k);
    }
  }

  const title = data.title || 'Layali Supermarket • Purchase Notice';
  const body = data.message || (data.amount ? `Total: ${data.amount} BHD` : 'New transaction recorded');
  const options = {
    body: body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [150, 75, 150],
    data: data,
    tag: notifTag,
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'PUSH_TRANSACTION_NOTIFICATION',
            payload: {
              ...data,
              id: notifTag,
              title,
              message: body
            }
          });
        });
      });
    })
  );
});

// Handle clicking on notification -> focus or open customer tab
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url 
    ? data.url 
    : (data.customerId && data.customerId !== 'ALL')
      ? `/tab/${data.customerId}`
      : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
