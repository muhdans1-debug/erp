// pos-mvp/src/utils/network.ts

/**
 * Resolves the Master Server base URL with zero-config mDNS discovery
 * Priority Order:
 * 1. Explicit user override from localStorage (`master_server_url`)
 * 2. Zero-config mDNS domain (`http://askar-master.local:3000`)
 * 3. Current window hostname if served directly by the master server
 * 4. Last known good fallback IP (`ASKAR_FALLBACK_IP`) or local subnet default
 */
export const resolveMasterServer = async (): Promise<string> => {
  if (typeof window === 'undefined') return 'http://localhost:3000';

  // 1. Explicit user manual override
  const custom = localStorage.getItem('master_server_url');
  if (custom) return custom.replace(/\/+$/, '');

  // 2. Try the zero-config mDNS domain first (<800ms)
  try {
    const res = await fetch('http://askar-master.local:3000/api/health', {
      signal: AbortSignal.timeout(800)
    });
    if (res.ok) {
      localStorage.setItem('ASKAR_FALLBACK_IP', 'http://askar-master.local:3000');
      return 'http://askar-master.local:3000';
    }
  } catch {
    // mDNS resolution timeout, continue to network fallback
  }

  // 3. Current window hostname if served directly by master or dev server
  const currentHost = window.location.hostname;
  if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
    try {
      const res = await fetch(`http://${currentHost}:3000/api/health`, {
        signal: AbortSignal.timeout(800)
      });
      if (res.ok) {
        const url = `http://${currentHost}:3000`;
        localStorage.setItem('ASKAR_FALLBACK_IP', url);
        return url;
      }
    } catch {}
  }

  // 4. Fallback to last known good IP from localStorage or local defaults
  const fallback = localStorage.getItem('ASKAR_FALLBACK_IP');
  if (fallback) return fallback.replace(/\/+$/, '');

  // Default to zero-config mDNS domain
  return 'http://askar-master.local:3000';
};

/**
 * Synchronous resolver for immediate component initialization
 */
export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('master_server_url');
    if (custom) return custom.replace(/\/+$/, '');
    const fallback = localStorage.getItem('ASKAR_FALLBACK_IP');
    if (fallback) return fallback.replace(/\/+$/, '');
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:3000`;
    }
  }
  return 'http://askar-master.local:3000';
};

/**
 * Returns the unified WebSocket URL corresponding to the resolved master server
 */
export const getWsBaseUrl = (masterUrl?: string): string => {
  const base = masterUrl || getApiBaseUrl();
  return base.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://') + '/ws';
};

