// pos-mvp/middleware/auth.js
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory rate limiting map for brute-force protection
const managerAttemptMap = new Map();

// Automatic Environment Configuration Loader (.env)
if (!process.env.MANAGER_PIN_HASH) {
  const envCandidatePaths = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'pos-mvp', '.env')
  ];
  for (const envFilePath of envCandidatePaths) {
    if (fs.existsSync(envFilePath)) {
      try {
        const rawEnv = fs.readFileSync(envFilePath, 'utf8');
        for (const line of rawEnv.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const k = trimmed.slice(0, eqIdx).trim();
            let v = trimmed.slice(eqIdx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (!process.env[k]) {
              process.env[k] = v;
            }
          }
        }
      } catch {}
    }
  }
}

export const isManagerAuthorized = async (request) => {
  // 1. Machine-to-machine token authentication (using constant-time comparison)
  const managerToken = request.headers?.['x-manager-token'] || request.headers?.['x-pos-key'] || request.headers?.['x-dr-secret'];
  const expectedSecret = process.env.DEV_SECRET || process.env.MANAGER_SECRET || process.env.POS_AUTH_SECRET;
  if (managerToken && expectedSecret && typeof managerToken === 'string') {
    const bufA = Buffer.from(managerToken);
    const bufB = Buffer.from(expectedSecret);
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return { authorized: true, manager: { id: 'machine_token', name: 'Machine Administrator', role: 'ADMIN' } };
    }
  }

  // 2. PIN extraction strictly from headers or JSON body
  const pin = request.headers?.['x-manager-pin'] || request.body?.pin || request.body?.managerPin;
  if (!pin) {
    return { authorized: false, reason: 'NO_PIN' };
  }

  const rawPin = String(pin).trim();
  if (!rawPin) {
    return { authorized: false, reason: 'EMPTY_PIN' };
  }

  // 3. Verify against Employee database table for active managers or admins
  try {
    const res = await db.execute({
      sql: "SELECT id, name, role, is_active, pin_code FROM Employee WHERE is_active = 1 AND (role = 'MANAGER' OR role = 'ADMIN')",
      args: []
    });
    const managers = res.rows || [];

    for (const mgr of managers) {
      const storedPin = String(mgr.pin_code || '').trim();
      let valid = false;
      if (storedPin.startsWith('$2a$') || storedPin.startsWith('$2b$')) {
        valid = await bcrypt.compare(rawPin, storedPin).catch(() => false);
      } else if (storedPin) {
        valid = (rawPin === storedPin);
      }

      if (valid) {
        return { authorized: true, manager: { id: mgr.id, name: mgr.name, role: mgr.role } };
      }
    }
  } catch (dbErr) {
    request.log?.warn?.(`[isManagerAuthorized] Employee DB lookup warning: ${dbErr.message}`);
  }

  // 4. Verify against environment secret MANAGER_PIN_HASH if not matched in DB
  if (process.env.MANAGER_PIN_HASH) {
    const hash = process.env.MANAGER_PIN_HASH.trim();
    const valid = await bcrypt.compare(rawPin, hash).catch(() => false);
    if (valid) {
      return { authorized: true, manager: { id: 'env_manager', name: 'Store Manager', role: 'MANAGER' } };
    }
  }

  return { authorized: false, reason: 'INVALID_PIN' };
};

export const isStaffAuthorized = async (request) => {
  // 1. Machine-to-machine token authentication (constant-time comparison)
  const token = request.headers?.['x-manager-token'] || request.headers?.['x-pos-key'] || request.headers?.['x-dr-secret'];
  const expectedSecret = process.env.DEV_SECRET || process.env.MANAGER_SECRET || process.env.POS_AUTH_SECRET;
  if (token && expectedSecret && typeof token === 'string') {
    const bufA = Buffer.from(token);
    const bufB = Buffer.from(expectedSecret);
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return { authorized: true, user: { id: 'machine_token', name: 'Machine Administrator', role: 'ADMIN' } };
    }
  }

  // 2. PIN extraction from headers or body
  const pin = request.headers?.['x-manager-pin'] || request.headers?.['x-employee-pin'] || request.headers?.['x-pin'] || request.body?.pin || request.body?.managerPin;
  if (!pin) {
    return { authorized: false, reason: 'NO_PIN' };
  }

  const rawPin = String(pin).trim();
  if (!rawPin) {
    return { authorized: false, reason: 'EMPTY_PIN' };
  }

  // 3. Verify against Employee database table for active employees
  try {
    const res = await db.execute({
      sql: "SELECT id, name, role, is_active, pin_code FROM Employee WHERE is_active = 1",
      args: []
    });
    for (const emp of (res.rows || [])) {
      const storedPin = String(emp.pin_code || '').trim();
      let valid = false;
      if (storedPin.startsWith('$2a$') || storedPin.startsWith('$2b$')) {
        valid = await bcrypt.compare(rawPin, storedPin).catch(() => false);
      } else if (storedPin) {
        valid = (rawPin === storedPin);
      }

      if (valid) {
        return { authorized: true, user: { id: emp.id, name: emp.name, role: emp.role } };
      }
    }
  } catch (dbErr) {
    request.log?.warn?.(`[isStaffAuthorized] Employee DB lookup warning: ${dbErr.message}`);
  }

  // 4. Verify against environment secret MANAGER_PIN_HASH
  if (process.env.MANAGER_PIN_HASH) {
    const hash = process.env.MANAGER_PIN_HASH.trim();
    const valid = await bcrypt.compare(rawPin, hash).catch(() => false);
    if (valid) {
      return { authorized: true, user: { id: 'env_manager', name: 'Store Manager', role: 'MANAGER' } };
    }
  }

  return { authorized: false, reason: 'INVALID_PIN' };
};

export const verifyManagerPin = async (request, reply) => {
  const remoteIp = request.socket?.remoteAddress || request.ip || 'unknown';

  // 1. First, check machine-to-machine token authentication (using constant-time comparison)
  // This bypasses IP lockout so automated sync daemons and admin tooling cannot be DoS-locked
  const managerToken = request.headers?.['x-manager-token'] || request.headers?.['x-pos-key'] || request.headers?.['x-dr-secret'];
  const expectedSecret = process.env.DEV_SECRET || process.env.MANAGER_SECRET || process.env.POS_AUTH_SECRET;
  if (managerToken && expectedSecret && typeof managerToken === 'string') {
    const bufA = Buffer.from(managerToken);
    const bufB = Buffer.from(expectedSecret);
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      managerAttemptMap.delete(remoteIp); // Reset lock upon verified machine token
      request.manager = { id: 'machine_token', name: 'Machine Administrator', role: 'ADMIN' };
      return; // Authorized via secure machine secret
    }
  }

  // 2. Rate-limiting check for human PIN attempts: Max 5 failed attempts per 10 minutes
  const now = Date.now();
  const attemptRecord = managerAttemptMap.get(remoteIp) || { count: 0, lockedUntil: 0 };
  if (attemptRecord.lockedUntil > now) {
    const remainingSec = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
    return reply.code(429).send({ error: `Too many failed manager authorization attempts. Locked out for ${remainingSec}s.` });
  }

  // 3. Extract PIN strictly from headers or JSON body (disallow query string to prevent log leaks)
  const pin = request.headers?.['x-manager-pin'] || request.body?.pin || request.body?.managerPin;

  if (!pin) {
    return reply.code(401).send({ error: 'Manager authorization required. Please provide a valid manager PIN.' });
  }

  const rawPin = String(pin).trim();
  if (!rawPin) {
    return reply.code(401).send({ error: 'Manager PIN cannot be empty.' });
  }

  // Enforce artificial delay to mitigate timing analysis attacks
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const authResult = await isManagerAuthorized(request);

    // 4. Decision: Authorize or enforce lockout
    if (authResult.authorized) {
      managerAttemptMap.delete(remoteIp);
      request.manager = authResult.manager;
      return; // Authorized!
    }

    // Failed attempt: increment counter and lock out if threshold reached
    attemptRecord.count += 1;
    if (attemptRecord.count >= 5) {
      attemptRecord.lockedUntil = now + (10 * 60 * 1000); // 10 minute lockout
    }
    managerAttemptMap.set(remoteIp, attemptRecord);
    request.log?.warn?.(`Unauthorized manager action attempted from IP: ${remoteIp} (Attempt ${attemptRecord.count}/5)`);
    return reply.code(403).send({ error: 'Invalid Manager PIN. Access Denied.' });
  } catch (error) {
    request.log?.error?.('Authentication processing error:', error);
    return reply.code(500).send({ error: 'Authentication processing error.' });
  }
};

// Aliased for backward compatibility
export const managerAuth = verifyManagerPin;

// -------------------------------------------------------------------------------------------------
// CUSTOMER KHATA IDENTITY & DEVICE TRUST: 90-DAY CRYPTOGRAPHIC TOKEN GENERATION & VALIDATION
// -------------------------------------------------------------------------------------------------
const KHATA_TOKEN_SECRET = process.env.KHATA_TOKEN_SECRET || process.env.DEV_SECRET || 'askar_khata_pwa_secret_2026';

/**
 * Generate a cryptographically signed, tamper-proof 90-day device pairing token.
 * Token structure: khata_tok.<customerId>.<expiresAt>.<hmacSignature>
 * The HMAC signature binds customerId, expiresAt, and the customer's PIN hash.
 * If the customer changes their PIN, previously issued device tokens become invalid instantly.
 */
export const generateKhataDeviceToken = (customerId, pinHash) => {
  const expiresAt = Date.now() + (90 * 24 * 60 * 60 * 1000); // 90 days in ms
  const payload = `${customerId}:${expiresAt}:${pinHash || ''}`;
  const sig = crypto.createHmac('sha256', KHATA_TOKEN_SECRET).update(payload).digest('hex');
  return `khata_tok.${customerId}.${expiresAt}.${sig}`;
};

/**
 * Verify a customer's Khata device token using constant-time comparison
 */
export const verifyKhataDeviceToken = (token, customerId, pinHash) => {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'khata_tok') return false;

  const [_, tokCustId, expiresAtStr, sig] = parts;
  if (tokCustId !== customerId) return false;

  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;

  const expectedPayload = `${customerId}:${expiresAt}:${pinHash || ''}`;
  const expectedSig = crypto.createHmac('sha256', KHATA_TOKEN_SECRET).update(expectedPayload).digest('hex');

  const bufSig = Buffer.from(sig);
  const bufExpected = Buffer.from(expectedSig);
  if (bufSig.length !== bufExpected.length) return false;

  return crypto.timingSafeEqual(bufSig, bufExpected);
};

export default verifyManagerPin;
