// ⚡ Legacy Android (Chrome 62 / Sunmi POS) Compatibility Polyfills
if (typeof window !== 'undefined') {
  if (typeof (window as any).AbortSignal === 'undefined') {
    class SimpleAbortSignal {
      aborted = false;
      _listeners: Array<() => void> = [];
      addEventListener(_type: string, listener: () => void) {
        if (this.aborted) listener();
        else this._listeners.push(listener);
      }
      removeEventListener(_type: string, listener: () => void) {
        this._listeners = this._listeners.filter((l) => l !== listener);
      }
      dispatchEvent() { return false; }
    }
    (window as any).AbortSignal = SimpleAbortSignal;
  }

  if (typeof (window as any).AbortController === 'undefined') {
    (window as any).AbortController = class SimpleAbortController {
      signal = new ((window as any).AbortSignal)();
      abort() {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        for (const l of (this.signal._listeners || [])) {
          try { l(); } catch {}
        }
      }
    };
  }

  if (!(window as any).AbortSignal.timeout) {
    (window as any).AbortSignal.timeout = function (ms: number) {
      const controller = new (window as any).AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    };
  }

  // Purge any legacy plaintext manager credentials from local storage disk
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('askar_manager_pin');
    localStorage.removeItem('manager_pin');
    localStorage.removeItem('MANAGER_PIN');
  }

  // ⚡ Auto-inject POS Terminal Handshake header for Sovereign Edge Gateway authentication
  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      try {
        const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input as Request)?.url || '');
        if (urlStr.includes('/api/') || urlStr.includes('/khata') || urlStr.includes('workers.dev')) {
          const customInit: RequestInit = init ? { ...init } : {};
          const managerPin = getManagerPin();
          if (customInit.headers instanceof Headers) {
            if (!customInit.headers.has('x-pos-client')) {
              customInit.headers.set('x-pos-client', 'store-pos');
            }
            if (managerPin && !customInit.headers.has('x-manager-pin')) {
              customInit.headers.set('x-manager-pin', managerPin);
            }
          } else if (Array.isArray(customInit.headers)) {
            const hasIt = customInit.headers.some(([k]) => k.toLowerCase() === 'x-pos-client');
            if (!hasIt) {
              customInit.headers.push(['x-pos-client', 'store-pos']);
            }
            if (managerPin && !customInit.headers.some(([k]) => k.toLowerCase() === 'x-manager-pin')) {
              customInit.headers.push(['x-manager-pin', managerPin]);
            }
          } else {
            customInit.headers = {
              'x-pos-client': 'store-pos',
              ...(managerPin ? { 'x-manager-pin': managerPin } : {}),
              ...(customInit.headers as Record<string, string> || {})
            };
          }
          return originalFetch.call(this, input, customInit);
        }
      } catch {}
      return originalFetch.call(this, input, init);
    };
  }
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { getManagerPin } from "./utils/authUtils";

// Production & Embedded Android Log Silence (Eliminates logd CPU churn and UI thread lock)
if (import.meta.env.PROD || (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.())) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
