/**
 * Safe UUID Generator for Secure & Insecure Contexts (LAN HTTP, Android WebView, Older Browsers)
 * In Chrome/Edge, `crypto.randomUUID` is strictly restricted to secure contexts (HTTPS or localhost).
 * Over LAN IP (e.g. http://192.168.8.7:3000), `crypto.randomUUID` is undefined in browser environments.
 */
export function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  // Resilient RFC4122 v4 UUID generator (works everywhere, including non-secure LAN HTTP)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
