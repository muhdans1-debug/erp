import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import App from './App.jsx';

// Register PWA Service Worker for offline resilience (Resolved PWA-OFF-01 & PWA-OFF-04)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (import.meta.env.PROD || window.location.hostname !== 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
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
