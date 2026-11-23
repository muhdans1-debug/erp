import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import App from './App.jsx';

// Register PWA Service Worker for offline resilience (Resolved PWA-OFF-01 & PWA-OFF-04)
if (typeof window !== 'undefined') {
  // Global listener for stale dynamic import / chunk failures
  window.addEventListener('unhandledrejection', (event) => {
    const msg = (event.reason && (event.reason.message || event.reason.toString())) || '';
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Importing a module script failed')
    ) {
      if (!sessionStorage.getItem('khata_unhandled_chunk_recovery')) {
        sessionStorage.setItem('khata_unhandled_chunk_recovery', 'true');
        if ('caches' in window) {
          caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
        }
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((regs) => regs.map((r) => r.unregister())).catch(() => {});
        }
        const url = new URL(window.location.href);
        url.searchParams.set('t', Date.now().toString());
        window.location.replace(url.toString());
      }
    }
  });
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (import.meta.env.PROD || window.location.hostname !== 'localhost')) {
  // Seamless auto-reload when a new service worker version activates and claims clients
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Proactively check for updates on cold launch & whenever app returns from background
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
        }
      });

      // Listen for updates to notify patrons with on-screen action
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('pwa-update-available', { detail: { newWorker } }));
            }
          });
        }
      });
    }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
