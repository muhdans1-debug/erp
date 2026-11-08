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
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

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
