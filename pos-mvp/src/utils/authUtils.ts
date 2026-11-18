// pos-mvp/src/utils/authUtils.ts

/**
 * Universal Web Crypto & Node SHA-256 Hasher.
 * Generates hex-encoded SHA-256 digest of input strings.
 */
export async function hashPinSha256(pin: string): Promise<string> {
  const clean = String(pin || '').trim();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(clean);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
  }
  return clean;
}

/**
 * Retrieves the currently active manager PIN from session storage.
 * Strictly avoids persisting manager credentials into localStorage disk.
 * Returns empty string if the active user role is not MANAGER.
 */
export const getManagerPin = (): string => {
  // Enforce role isolation: if a cashier is logged in, never expose manager PIN
  if (typeof localStorage !== 'undefined') {
    const activeRole = localStorage.getItem('askar_role');
    if (activeRole && activeRole !== 'MANAGER') {
      return '';
    }
  }

  // Session storage only (ephemeral, cleared on tab close)
  if (typeof sessionStorage !== 'undefined') {
    const sessionPin = sessionStorage.getItem('askar_admin_pin');
    if (sessionPin) return sessionPin.trim();
  }

  return '';
};

/**
 * Stores the authenticated manager PIN in session storage ONLY for the active manager shift.
 * Immediately purges any plaintext PINs from persistent localStorage.
 */
export const setManagerSessionPin = (pin: string): void => {
  const clean = String(pin || '').trim();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('askar_admin_pin', clean);
  }
  // Sanitize localStorage immediately - no plaintext credentials on disk
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('askar_manager_pin');
    localStorage.removeItem('manager_pin');
    localStorage.removeItem('MANAGER_PIN');
    localStorage.removeItem('askar_admin_pin');
  }
};

/**
 * Clears the manager session upon shift lock, logout, or timeout.
 */
export const clearManagerSessionPin = (): void => {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('askar_admin_pin');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('askar_manager_pin');
    localStorage.removeItem('manager_pin');
    localStorage.removeItem('MANAGER_PIN');
    localStorage.removeItem('askar_admin_pin');
  }
};

/**
 * Synchronous check: Verifies if an input PIN matches the currently active manager session.
 */
export const verifyManagerPin = (inputPin: string): boolean => {
  const clean = String(inputPin || '').trim();
  if (!clean) return false;
  const configured = getManagerPin();
  if (configured && clean === configured) return true;
  return false;
};

/**
 * Asynchronous enterprise manager verification:
 * 1. Matches active in-memory session (if manager logged in)
 * 2. Remote check via /api/employees/verify-pin against bcrypt hashes
 * 3. Offline check via cached employee SHA-256 hashes
 */
export const verifyManagerPinAsync = async (
  inputPin: string,
  apiBase?: string
): Promise<{ authorized: boolean; employee?: any; error?: string }> => {
  const clean = String(inputPin || '').trim();
  if (!clean) {
    return { authorized: false, error: 'Manager PIN is required.' };
  }

  // 1. In-session match
  const currentPin = getManagerPin();
  if (currentPin && clean === currentPin) {
    return { authorized: true, employee: { role: 'MANAGER' } };
  }

  // 2. Online verification across candidate endpoints
  const resolvedBase = (apiBase && !apiBase.includes('askar-khata-pwa.vercel.app'))
    ? apiBase
    : (typeof window !== 'undefined' ? (window.location.origin || 'http://localhost:3000') : 'http://localhost:3000');

  const candidates = [
    resolvedBase,
    'http://192.168.8.7:3000',
    'http://localhost:3000',
    'https://askar-edge-api.askar-market.workers.dev'
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/api/employees/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: clean }),
        signal: AbortSignal.timeout(2500)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.employee?.role === 'MANAGER') {
          return { authorized: true, employee: data.employee };
        } else if (data.success && data.employee?.role !== 'MANAGER') {
          return { authorized: false, error: 'Employee is not authorized as a Manager.' };
        }
      }
    } catch {}
  }

  // 3. Offline fallback verification via cached SHA-256 hashes
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('askar_cached_employees');
      if (raw) {
        const hashedInput = await hashPinSha256(clean);
        const list: any[] = JSON.parse(raw);
        const match = list.find(
          (e: any) =>
            e.role === 'MANAGER' &&
            (e.pin_hash === hashedInput || e.pin_code === hashedInput) &&
            (e.is_active === 1 || e.is_active === true || e.is_active === undefined)
        );
        if (match) {
          return { authorized: true, employee: match };
        }
      }
    } catch {}
  }

  return { authorized: false, error: 'Invalid Manager PIN.' };
};
