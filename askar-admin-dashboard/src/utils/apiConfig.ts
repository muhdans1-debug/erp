export const DEFAULT_EDGE_API_URL = 'https://askar-edge-api.layali-askar-pos.workers.dev';
export const CLOUD_GATEWAY_URL = DEFAULT_EDGE_API_URL;
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

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_EDGE_API_URL;
  const custom = localStorage.getItem('master_server_url') || localStorage.getItem('server_ip');
  if (custom && custom.trim()) {
    let clean = custom.trim();
    // If stale localStorage pointed to Vercel PWA frontend, force upgrade to Edge API
    if (clean.includes('askar-khata-pwa.vercel.app')) {
      localStorage.setItem('master_server_url', DEFAULT_EDGE_API_URL);
      return DEFAULT_EDGE_API_URL;
    }
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = (clean.includes('.workers.dev') || clean.includes('.app') || clean.includes('.com') || clean.includes('.dev') || clean.includes('.net'))
        ? `https://${clean}`
        : `http://${clean}:3000`;
    }
    return clean.replace(/\/$/, '');
  }
  return DEFAULT_EDGE_API_URL;
}
