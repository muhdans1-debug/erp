/**
 * Unified Dynamic Server IP & API URL Configuration for Sunmi Fleet & Desktop POS
 * Reads/writes both 'server_ip' and 'master_server_url' in localStorage.
 */

export function getServerIp(): string {
  if (typeof window === 'undefined') return '127.0.0.1';
  const custom = localStorage.getItem('server_ip') || localStorage.getItem('master_server_url');
  if (custom && custom.trim()) {
    return custom
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/:[0-9]+.*$/, '')
      .replace(/\/.*$/, '');
  }
  const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
  if (isNative) return '192.168.8.20';
  return window.location.hostname || '127.0.0.1';
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://127.0.0.1:3000';
  const custom = localStorage.getItem('master_server_url') || localStorage.getItem('server_ip');
  if (custom && custom.trim()) {
    let clean = custom.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    if (!clean.includes(':', 7)) {
      clean = `${clean}:3000`;
    }
    return clean.replace(/\/$/, '');
  }
  const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
  if (isNative) return 'http://192.168.8.20:3000';
  const host = window.location.hostname || '127.0.0.1';
  return `http://${host}:3000`;
}

export function setServerIp(input: string): string {
  let clean = (input || '').trim();
  if (!clean) clean = '127.0.0.1';

  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `http://${clean}`;
  }
  if (!clean.includes(':', 7)) {
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

