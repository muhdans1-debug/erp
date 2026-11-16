/**
 * Unified Dynamic Server IP & API URL Configuration for Sunmi Fleet & Desktop POS
 * Reads/writes both 'server_ip' and 'master_server_url' in localStorage.
 * Defaults to the Sovereign Cloudflare Edge API Gateway (Serverless, zero laptop dependency).
 */

export const DEFAULT_EDGE_API_URL = 'https://askar-edge-api.layali-askar-pos.workers.dev';
export const CLOUD_GATEWAY_URL = DEFAULT_EDGE_API_URL;
export const DEFAULT_EDGE_HOST = 'askar-edge-api.layali-askar-pos.workers.dev';
export const LAN_SERVER_URL = 'http://192.168.8.7:3000';

export function getResilientApiCandidates(): string[] {
  const custom = (typeof window !== 'undefined' && (localStorage.getItem('master_server_url') || localStorage.getItem('server_ip'))) || '';
  let cleanCustom = '';
  if (custom && custom.trim() && !custom.includes('askar-khata-pwa.vercel.app')) {
    cleanCustom = custom.trim();
    if (!cleanCustom.startsWith('http://') && !cleanCustom.startsWith('https://')) {
      cleanCustom = cleanCustom.includes('.') ? `https://${cleanCustom}` : `http://${cleanCustom}:3000`;
    }
  }

  return [
    DEFAULT_EDGE_API_URL,
    cleanCustom,
    LAN_SERVER_URL,
    'http://localhost:3000'
  ].filter((val, idx, arr): val is string => Boolean(val) && arr.indexOf(val) === idx);
}

export function getServerIp(): string {
  if (typeof window === 'undefined') return DEFAULT_EDGE_HOST;
  const custom = localStorage.getItem('server_ip') || localStorage.getItem('master_server_url');
  if (custom && custom.trim()) {
    if (custom.includes('askar-khata-pwa.vercel.app')) {
      localStorage.setItem('master_server_url', DEFAULT_EDGE_API_URL);
      localStorage.setItem('server_ip', DEFAULT_EDGE_HOST);
      return DEFAULT_EDGE_HOST;
    }
    return custom
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/:[0-9]+.*$/, '')
      .replace(/\/.*$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname) {
    const isCapacitorNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (!isCapacitorNative && window.location.port === '3000') {
      return window.location.hostname;
    }
  }
  return DEFAULT_EDGE_HOST;
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_EDGE_API_URL;
  const custom = localStorage.getItem('master_server_url') || localStorage.getItem('server_ip');
  if (custom && custom.trim()) {
    let clean = custom.trim();
    // If stale localStorage pointed to Vercel PWA frontend, force upgrade to Edge API
    if (clean.includes('askar-khata-pwa.vercel.app')) {
      localStorage.setItem('master_server_url', DEFAULT_EDGE_API_URL);
      localStorage.setItem('server_ip', DEFAULT_EDGE_HOST);
      return DEFAULT_EDGE_API_URL;
    }
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      if (clean.includes('.workers.dev') || clean.includes('.app') || clean.includes('.com') || clean.includes('.dev') || clean.includes('.net')) {
        clean = `https://${clean}`;
      } else {
        clean = `http://${clean}`;
      }
    }
    const isDomain = clean.includes('.workers.dev') || clean.includes('.app') || clean.includes('.com') || clean.includes('.dev') || clean.includes('.net');
    const isHttps = clean.startsWith('https://');

    // Only append port 3000 to raw IP or localhost if not HTTPS or domain
    if (!isDomain && !isHttps && !clean.includes(':', 7)) {
      clean = `${clean}:3000`;
    }
    return clean.replace(/\/$/, '');
  }

  // Web Browser / Laptop Auto-Detection:
  // If app is loaded directly from local backend port :3000, bind to origin
  if (typeof window !== 'undefined' && window.location.origin) {
    const isCapacitorNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (!isCapacitorNative && window.location.port === '3000' && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) {
      return window.location.origin.replace(/\/$/, '');
    }
  }

  return DEFAULT_EDGE_API_URL;
}

export function setServerIp(input: string): string {
  let clean = (input || '').trim();
  if (!clean || clean.includes('askar-khata-pwa.vercel.app')) clean = DEFAULT_EDGE_API_URL;

  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    if (clean.includes('.workers.dev') || clean.includes('.app') || clean.includes('.com') || clean.includes('.dev') || clean.includes('.net')) {
      clean = `https://${clean}`;
    } else {
      clean = `http://${clean}`;
    }
  }

  const isDomain = clean.includes('.workers.dev') || clean.includes('.app') || clean.includes('.com') || clean.includes('.dev') || clean.includes('.net');
  const isHttps = clean.startsWith('https://');

  if (!isDomain && !isHttps && !clean.includes(':', 7)) {
    clean = `${clean}:3000`;
  }
  clean = clean.replace(/\/$/, '');

  const rawIp = clean
    .replace(/^https?:\/\//, '')
    .replace(/:[0-9]+.*$/, '')
    .replace(/\/.*$/, '');

  localStorage.setItem('master_server_url', clean);
  localStorage.setItem('server_ip', rawIp);

  return clean;
}
