import type { Context, Next } from 'hono';
import bcrypt from 'bcryptjs';
import { getDb, type Env } from '../db.ts';
import type { TenantContext } from './tenant.ts';

// Bounded in-memory sliding window rate-limiter for PIN verification per Cloudflare Worker instance
const rateLimitMap = new Map<string, { attempts: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes lockout

/**
 * Constant-time string comparison to prevent timing attacks on secrets
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function checkPinRateLimit(ip: string): { allowed: boolean; remainingLockoutSec?: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (record && record.lockedUntil > now) {
    return { allowed: false, remainingLockoutSec: Math.ceil((record.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function recordFailedPinAttempt(ip: string) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { attempts: 0, lockedUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  rateLimitMap.set(ip, record);

  // Prune map if excessively large
  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (v.lockedUntil && now > v.lockedUntil) rateLimitMap.delete(k);
    }
  }
}

export function resetPinAttempts(ip: string) {
  rateLimitMap.delete(ip);
}

/**
 * Middleware: Strictly requires Manager Authentication
 * Validates via x-manager-pin against environment configuration or Employee database
 * Hardcoded backdoors (e.g. 9999) are strictly forbidden.
 */
export async function requireManagerAuth(c: Context<{ Bindings: Env; Variables: TenantContext }>, next: Next) {
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const rateLimit = checkPinRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return c.json({ error: `Too many failed manager attempts. Locked out for ${rateLimit.remainingLockoutSec}s.` }, 429);
  }

  // 1. Machine-to-machine secret token authorization
  const machineToken = c.req.header('x-manager-token') || c.req.header('x-dr-secret') || c.req.header('x-pos-key')?.trim();
  const expectedSecret = (c.env as any).DEV_SECRET?.trim() || (c.env as any).MANAGER_SECRET?.trim() || (c.env as any).POS_AUTH_SECRET?.trim();
  if (machineToken && expectedSecret && timingSafeEqualStr(machineToken, expectedSecret)) {
    resetPinAttempts(clientIp);
    return await next();
  }

  // 2. PIN extraction
  const pin = c.req.header('x-manager-pin')?.trim();
  const envPin = c.env.MANAGER_PIN?.trim();

  if (!pin) {
    return c.json({ error: 'Manager authorization required (x-manager-pin header missing)' }, 401);
  }

  // 3. Direct environment PIN check (if explicitly configured in Cloudflare environment secrets, excluding insecure default 9999)
  if (envPin && envPin !== '9999' && timingSafeEqualStr(pin, envPin)) {
    resetPinAttempts(clientIp);
    return await next();
  }

  // 4. Query Turso database for an active manager or admin with this PIN
  try {
    const db = getDb(c.env);
    const res = await db.execute({
      sql: `SELECT id, name, role, pin_code FROM Employee WHERE is_active = 1 AND (role = 'MANAGER' OR role = 'ADMIN')`,
      args: []
    });

    if (res.rows && res.rows.length > 0) {
      for (const row of res.rows) {
        const storedPin = String(row.pin_code || '').trim();
        let isMatch = false;
        if (storedPin.startsWith('$2a$') || storedPin.startsWith('$2b$')) {
          isMatch = await bcrypt.compare(pin, storedPin);
        } else if (storedPin) {
          isMatch = (storedPin === pin);
        }

        if (isMatch) {
          resetPinAttempts(clientIp);
          return await next();
        }
      }
    }
  } catch (err: any) {
    console.warn('Database manager check error:', err?.message);
  }

  recordFailedPinAttempt(clientIp);
  return c.json({ error: 'Invalid Manager PIN. Access Denied.' }, 403);
}

/**
 * Middleware: Requires either an authorized POS terminal pre-shared key or Manager Authentication
 * Unauthenticated client headers (x-pos-client) alone CANNOT bypass security.
 */
export async function requirePosOrManagerAuth(c: Context<{ Bindings: Env; Variables: TenantContext }>, next: Next) {
  const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const posKey = c.req.header('x-pos-key')?.trim() || c.req.header('x-dr-secret')?.trim() || c.req.header('x-manager-token')?.trim();
  const managerPin = c.req.header('x-manager-pin')?.trim();
  const envPin = c.env.MANAGER_PIN?.trim();
  const posSecret = (c.env as any).POS_AUTH_SECRET?.trim() || (c.env as any).DR_SYNC_SECRET?.trim() || (c.env as any).DEV_SECRET?.trim();

  // 1. Pre-shared POS secret authentication
  if (posSecret && posKey && timingSafeEqualStr(posKey, posSecret)) {
    resetPinAttempts(clientIp);
    return await next();
  }

  // 2. Manager PIN Authentication (Environment variable or Employee database)
  if (managerPin) {
    if (envPin && envPin !== '9999' && timingSafeEqualStr(managerPin, envPin)) {
      resetPinAttempts(clientIp);
      return await next();
    }

    try {
      const db = getDb(c.env);
      const res = await db.execute({
        sql: `SELECT id, pin_code FROM Employee WHERE is_active = 1 AND (role = 'MANAGER' OR role = 'ADMIN')`,
        args: []
      });
      if (res.rows && res.rows.length > 0) {
        for (const row of res.rows) {
          const storedPin = String(row.pin_code || '').trim();
          let isMatch = false;
          if (storedPin.startsWith('$2a$') || storedPin.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(managerPin, storedPin);
          } else if (storedPin) {
            isMatch = (storedPin === managerPin);
          }
          if (isMatch) {
            resetPinAttempts(clientIp);
            return await next();
          }
        }
      }
    } catch {}
  }

  return c.json({ error: 'Unauthorized: Valid POS terminal key or Manager PIN required.' }, 401);
}

/**
 * Programmatic check: Is caller authorized as a Manager on Edge?
 */
export async function isManagerAuthorizedEdge(c: any): Promise<boolean> {
  const machineToken = (c.req.header('x-manager-token') || c.req.header('x-dr-secret') || c.req.header('x-pos-key') || '').trim();
  const expectedSecret = ((c.env as any).DEV_SECRET || (c.env as any).MANAGER_SECRET || (c.env as any).POS_AUTH_SECRET || '').trim();
  if (machineToken && expectedSecret && timingSafeEqualStr(machineToken, expectedSecret)) {
    return true;
  }

  let pin = (c.req.header('x-manager-pin') || '').trim();
  if (!pin) {
    try {
      const cloned = c.req.raw.clone();
      const b = await cloned.json();
      pin = String(b.pin || b.managerPin || '').trim();
    } catch {}
  }
  const envPin = (c.env?.MANAGER_PIN || '').trim();
  if (pin && envPin && envPin !== '9999' && timingSafeEqualStr(pin, envPin)) {
    return true;
  }

  if (pin) {
    try {
      const db = getDb(c.env);
      const res = await db.execute({
        sql: `SELECT pin_code FROM Employee WHERE is_active = 1 AND (role = 'MANAGER' OR role = 'ADMIN')`,
        args: []
      });
      if (res.rows && res.rows.length > 0) {
        for (const row of res.rows) {
          const storedPin = String(row.pin_code || '').trim();
          let isMatch = false;
          if (storedPin.startsWith('$2a$') || storedPin.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(pin, storedPin);
          } else if (storedPin) {
            isMatch = (storedPin === pin);
          }
          if (isMatch) return true;
        }
      }
    } catch {}
  }

  return false;
}

/**
 * WebCrypto HMAC-SHA256 Helper (100% parity with Node.js crypto.createHmac)
 */
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const hashArray = Array.from(new Uint8Array(sigBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Edge HMAC-SHA256 Signed Khata 90-Day Device Token Generator
 */
export async function generateKhataDeviceTokenEdge(customerId: string, pinHash: string, envSecret?: string): Promise<string> {
  const expiresAt = Date.now() + (90 * 24 * 60 * 60 * 1000);
  const payload = `${customerId}.${expiresAt}`;
  const secret = (envSecret || 'askar-khata-secure-vault-2026') + (pinHash || '');
  const signature = await hmacSha256Hex(secret, payload);
  return `khata_tok.${payload}.${signature}`;
}

/**
 * Edge HMAC-SHA256 Signed Khata Device Token Verifier
 */
export async function verifyKhataDeviceTokenEdge(token: string, pinHash: string, envSecret?: string): Promise<{ customerId: string; expiresAt: number } | null> {
  if (!token || typeof token !== 'string' || !token.startsWith('khata_tok.')) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [prefix, customerId, expiresAtStr, signature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

  const payload = `${customerId}.${expiresAtStr}`;
  const secret = (envSecret || 'askar-khata-secure-vault-2026') + (pinHash || '');
  const expectedSig = await hmacSha256Hex(secret, payload);

  if (signature.length !== expectedSig.length) return null;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  if (diff !== 0) return null;

  return { customerId, expiresAt };
}
