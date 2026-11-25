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

  // Auto-detect browser origin (e.g. http://192.168.8.7:3000 or http://localhost:3000)
  let originCandidate = '';
  if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) {
    originCandidate = window.location.origin.replace(/\/$/, '');
  }

  const isLocalHostMachine = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // FAST LOCAL RETAIL PRIORITY:
  // 1. Current Origin (if loaded directly from local web host, < 2ms latency)
  // 2. Localhost port 3000
  // 3. Store LAN server (192.168.8.7:3000)
  // 4. Custom configured server URL
  // 5. Cloudflare Edge Gateway (Cloud Fallback)
  return [
    originCandidate,
    isLocalHostMachine ? 'http://localhost:3000' : '',
    LAN_SERVER_URL,
    cleanCustom,
    DEFAULT_EDGE_API_URL
  ].filter((val, idx, arr): val is string => Boolean(val) && arr.indexOf(val) === idx);
}

export function getServerIp(): string {
  if (typeof window === 'undefined') return DEFAULT_EDGE_HOST;
  if (typeof window !== 'undefined' && window.location.hostname) {
    const isCapacitorNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (!isCapacitorNative && window.location.port === '3000') {
      return window.location.hostname;
    }
  }
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
  return DEFAULT_EDGE_HOST;
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_EDGE_API_URL;

  // 1. Web Browser / Laptop Direct Host Auto-Detection:
  // If app is running directly from the local POS backend on port :3000 (localhost or LAN IP e.g. 192.168.8.7),
  // ALWAYS prefer this local origin for sub-millisecond checkout response (<2ms) and zero internet dependency!
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    const isCapacitorNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (!isCapacitorNative && window.location.port === '3000' && window.location.origin !== 'null' && !window.location.origin.startsWith('file:')) {
      return window.location.origin.replace(/\/$/, '');
    }
  }

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

/**
 * Autonomous Subnet & mDNS Probe Scanner
 * Sweeps the local subnet and mDNS host to locate the Master PC when the store router
 * reassigns its IP address via DHCP. Updates localStorage silently once found.
 */
let isDiscoveryRunning = false;

export async function discoverMasterServerIp(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  // If explicitly configured for Sovereign Cloud Gateway, preserve cloud independence
  const currentTarget = localStorage.getItem('master_server_url') || '';
  if (currentTarget.includes('workers.dev') || currentTarget.includes('layali-askar-pos')) {
    return DEFAULT_EDGE_API_URL;
  }
  if (isDiscoveryRunning) return null;
  isDiscoveryRunning = true;

  try {
    const candidates = [
      'http://askar-master.local:3000',
      LAN_SERVER_URL,
      'http://192.168.8.7:3000',
      'http://192.168.8.2:3000',
      'http://192.168.8.3:3000',
      'http://192.168.8.4:3000',
      'http://192.168.8.5:3000',
      'http://192.168.8.6:3000',
      'http://192.168.8.8:3000',
      'http://192.168.8.9:3000',
      'http://192.168.8.10:3000',
      'http://192.168.8.15:3000',
      'http://192.168.8.20:3000',
      'http://192.168.8.50:3000',
      'http://192.168.8.100:3000',
      'http://localhost:3000'
    ];

    const probeUrl = async (base: string): Promise<string | null> => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 1200);
        const res = await fetch(`${base}/api/health`, { signal: ctrl.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.service === 'Askar-POS-Master' || data.status === 'ok') {
            return base;
          }
        }
      } catch (_) {}
      return null;
    };

    const results = await Promise.allSettled(candidates.map((c) => probeUrl(c)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        const found = r.value;
        setServerIp(found);
        console.log(`📡 [Auto-Discovery] Master POS located dynamically at: ${found}`);
        return found;
      }
    }
    return null;
  } finally {
    isDiscoveryRunning = false;
  }
}

