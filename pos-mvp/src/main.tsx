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
