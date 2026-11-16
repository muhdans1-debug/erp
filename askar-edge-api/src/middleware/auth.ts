import type { Context, Next } from 'hono';
import { getDb, type Env } from '../db.ts';
import type { TenantContext } from './tenant.ts';

// Bounded in-memory sliding window rate-limiter for PIN verification per Cloudflare Worker instance
const rateLimitMap = new Map<string, { attempts: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes lockout

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
 */
export async function requireManagerAuth(c: Context<{ Bindings: Env; Variables: TenantContext }>, next: Next) {
  const pin = c.req.header('x-manager-pin')?.trim();
  const envPin = c.env.MANAGER_PIN?.trim();

  if (!pin) {
    return c.json({ error: 'Manager authorization required (x-manager-pin header missing)' }, 401);
  }

  // 1. Direct environment PIN check (if configured in Cloudflare environment secrets) or master default PIN 9999
  if ((envPin && pin === envPin) || pin === '9999') {
    return await next();
  }

  // 2. Query Turso database for an active manager with this PIN
  try {
    const db = getDb(c.env);
    const res = await db.execute({
      sql: `SELECT id, name, role FROM Employee WHERE is_active = 1 AND role = 'MANAGER' AND pin_code = ? LIMIT 1`,
      args: [pin]
    });

    if (res.rows && res.rows.length > 0) {
      return await next();
    }
  } catch (err: any) {
    console.warn('Database manager check error:', err?.message);
  }

  return c.json({ error: 'Invalid Manager PIN. Access Denied.' }, 403);
}

/**
 * Middleware: Requires either an authorized POS terminal client or Manager Authentication
 */
export async function requirePosOrManagerAuth(c: Context<{ Bindings: Env; Variables: TenantContext }>, next: Next) {
  const posClient = c.req.header('x-pos-client')?.trim();
  const posKey = c.req.header('x-pos-key')?.trim() || c.req.header('x-dr-secret')?.trim();
  const managerPin = c.req.header('x-manager-pin')?.trim();
  const envPin = c.env.MANAGER_PIN?.trim();
  const posSecret = (c.env as any).POS_AUTH_SECRET?.trim() || (c.env as any).DR_SYNC_SECRET?.trim();

  // 1. Pre-shared POS secret authentication (if configured in environment)
  if (posSecret && posKey === posSecret) {
    return await next();
  }

  // 2. Permitted known POS client identifiers
  const validClients = new Set(['store-pos', 'pim-admin', 'sunmi-d2mini', 'f100-mobile-pos', 'f100', 'f100-pim', 'pos-register']);
  if (posClient && validClients.has(posClient)) {
    if (!posSecret || posKey === posSecret) {
      return await next();
    }
  }

  // 3. Manager PIN Authentication (Environment variable or Employee database)
  if (managerPin) {
    if (envPin && managerPin === envPin) {
      return await next();
    }

    try {
      const db = getDb(c.env);
      const res = await db.execute({
        sql: `SELECT id FROM Employee WHERE is_active = 1 AND role = 'MANAGER' AND pin_code = ? LIMIT 1`,
        args: [managerPin]
      });
      if (res.rows && res.rows.length > 0) {
        return await next();
      }
    } catch {}
  }

  return c.json({ error: 'Unauthorized: Valid POS terminal handshake or Manager PIN required.' }, 401);
}

