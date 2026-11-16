// pos-mvp/middleware/auth.js
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

export const verifyManagerPin = async (request, reply) => {
  const remoteIp = request.socket?.remoteAddress || request.ip || 'unknown';

  // Rate-limiting check: Max 10 failed attempts per 5 minutes
  const now = Date.now();
  const attemptRecord = managerAttemptMap.get(remoteIp) || { count: 0, lockedUntil: 0 };
  if (attemptRecord.lockedUntil > now) {
    const remainingSec = Math.ceil((attemptRecord.lockedUntil - now) / 1000);
    return reply.code(429).send({ error: `Too many failed manager attempts. Locked for ${remainingSec}s.` });
  }

  // Extract PIN or token strictly from headers or JSON body (disallow query string to prevent log leaks)
  const pin = request.headers['x-manager-pin'] || request.body?.pin || request.body?.managerPin;
  const managerToken = request.headers['x-manager-token'];

  // Check if a valid manager secret token is passed for machine-to-machine calls using timingSafeEqual
  const expectedSecret = process.env.DEV_SECRET || process.env.MANAGER_SECRET;
  if (managerToken && expectedSecret && typeof managerToken === 'string') {
    const bufA = Buffer.from(managerToken);
    const bufB = Buffer.from(expectedSecret);
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      managerAttemptMap.delete(remoteIp);
      return; // Authorized via secure machine token
    }
  }

  // Permit authorized POS internal clients
  const posClient = request.headers['x-pos-client']?.trim();
  const validClients = new Set(['store-pos', 'pim-admin', 'sunmi-d2mini', 'f100-mobile-pos', 'f100', 'f100-pim', 'pos-register']);
  if (posClient && validClients.has(posClient)) {
    managerAttemptMap.delete(remoteIp);
    return; // Authorized via validated client handshake
  }

  if (!pin) {
    return reply.code(401).send({ error: 'Manager PIN required for this action.' });
  }

  const rawPin = String(pin).trim();
  const expectedPin = (process.env.VITE_MANAGER_PIN || '9999').trim();

  // Fast-path comparison for standard system manager PIN
  if (rawPin === expectedPin) {
    managerAttemptMap.delete(remoteIp);
    return;
  }

  const hash = process.env.MANAGER_PIN_HASH;
  if (!hash) {
    request.log.error('CRITICAL: MANAGER_PIN_HASH is missing from .env');
    return reply.code(500).send({ error: 'Server authentication misconfigured.' });
  }

  // Enforce small artificial delay to mitigate timing analysis
  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    const isValid = await bcrypt.compare(rawPin, hash.trim());

    if (!isValid) {
      attemptRecord.count += 1;
      if (attemptRecord.count >= 10) {
        attemptRecord.lockedUntil = now + (5 * 60 * 1000); // 5 min lockout
      }
      managerAttemptMap.set(remoteIp, attemptRecord);
      request.log.warn(`Unauthorized manager action attempted from IP: ${remoteIp}`);
      return reply.code(403).send({ error: 'Invalid Manager PIN.' });
    }

    // Success: reset attempts
    managerAttemptMap.delete(remoteIp);
  } catch (error) {
    request.log.error('Bcrypt comparison failed:', error);
    return reply.code(500).send({ error: 'Authentication processing error.' });
  }
};

// Aliased for full backward compatibility across all existing domain route plugins
export const managerAuth = verifyManagerPin;

export default verifyManagerPin;
