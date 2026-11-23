import { lazy } from 'react';

/**
 * lazyWithRetry: Auto-recovers from Vite chunk mismatch errors when a new build is deployed.
 * If dynamic import fails (e.g. 404 on old hash), it unregisters the service worker,
 * clears stale cache, and reloads once with cache-busting.
 */
export function lazyWithRetry(componentImport, identifier = '') {
  return lazy(async () => {
    const key = 'khata_chunk_retry_' + (identifier || window.location.pathname);
    const hasRetried = sessionStorage.getItem(key);

    try {
      const module = await componentImport();
      sessionStorage.removeItem(key);
      return module;
    } catch (error) {
      console.warn(`Dynamic import failed for ${identifier || 'chunk'}:`, error);

      if (!hasRetried) {
        sessionStorage.setItem(key, 'true');

        // Purge caches and service workers to fetch freshest bundle
        try {
          if ('caches' in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map((c) => caches.delete(c)));
          }
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
        } catch (_) {}

        // Reload with timestamp query parameter to bypass HTTP browser cache
        const target = new URL(window.location.href);
        target.searchParams.set('t', Date.now().toString());
        window.location.replace(target.toString());

        // Return unresolved promise while browser navigates
        return new Promise(() => {});
      }

      throw error;
    }
  });
}
