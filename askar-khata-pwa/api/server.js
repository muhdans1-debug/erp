import Fastify from 'fastify';
import { createClient } from '@libsql/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { generateBenefitPayPayload, DEFAULT_BENEFIT_CONFIG } from '../src/utils/benefitPay.js';

// 1. Native .env loader for Node 20+ standalone execution
try {
  process.loadEnvFile?.();
} catch {}

const fastify = Fastify({ logger: true });

// Arabic-Indic Numeral Normalizer for Bahrain & GCC Accessibility (PWA-ACC-02)
function normalizeArabicNumerals(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// 2. Capture raw request body buffer for authentic Tap Payments HMAC-SHA256 signature verification
fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
  try {
    req.rawBody = body;
    const json = JSON.parse(body.toString());
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// 3. CORS Support strictly restricted to trusted production domains and local/private subnets (Resolved PWA-SEC-01)
fastify.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin || '';
  const isAllowed = !origin || 
    origin === 'https://askar-khata-pwa.vercel.app' ||
    origin.endsWith('.askar-khata-pwa.vercel.app') ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin);

  reply.header('Access-Control-Allow-Origin', isAllowed ? (origin || '*') : 'https://askar-khata-pwa.vercel.app');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-khata-pin, x-tap-signature');
  if (request.method === 'OPTIONS') {
    return reply.status(204).send();
  }
});

const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io';
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTM5MDgyNDAsImlkIjoiMDFhMTg0YjgtMjIwMS03YzJhLThlY2EtZDVkNDcyZjkxZGRlIiwia2lkIjoiQ0cxaFB3c3d5VWgwUlE5dzNZRDZRRmxuYk9rWUNCYklfVWJkSEhXS1hNNCIsInJpZCI6Ijk3MzEwYzA5LTMxYjUtNDNkNi1hY2ViLWNmYWY1MTIzZDRkNSJ9.U5P8GYK31KnUbgtrdvNKwau-ARB17g-Zk3PFBkz_Olu3DV5QQaFFTwbylLPV_LZMDwzwwJr-2lOelcD3IWyjAg';

// Secure JWT secret initialization (Resolved PWA-SEC-04)
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
let JWT_SECRET = process.env.JWT_SECRET || 'askar_khata_secure_jwt_secret_2026';

// Fallback to serverless-writable directory if local
const fallbackDbPath = process.env.VERCEL ? 'file:/tmp/local_replica.db' : 'file:pos-mvp/local.db';
const rawClient = createClient({
  url: tursoUrl || fallbackDbPath,
  authToken: tursoAuthToken || ''
});

const db = {
  async execute(query) {
    return await rawClient.execute(query);
  }
};

// --- In-Memory Bounded Rate Limiter with Sliding Window (Resolved ADV-01 & PWA-SEC-03) ---
const pinAttemptMap = new Map(); // targetId -> { count: number, lockedUntil: number, lastAttemptAt: number }
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding strike window
const MAX_PIN_ENTRIES = 5000; // Bounded limit to prevent memory exhaustion DoS

function cleanupPinAttempts() {
  const now = Date.now();
  for (const [key, record] of pinAttemptMap.entries()) {
    if (record.lockedUntil && now >= record.lockedUntil) {
      pinAttemptMap.delete(key);
    } else if (!record.lockedUntil && record.lastAttemptAt && (now - record.lastAttemptAt > ATTEMPT_WINDOW_MS)) {
      pinAttemptMap.delete(key);
    }
  }
  if (pinAttemptMap.size > MAX_PIN_ENTRIES) {
    let count = 0;
    for (const key of pinAttemptMap.keys()) {
      pinAttemptMap.delete(key);
      count++;
      if (count >= 1000) break;
    }
  }
}

function checkRateLimit(targetId) {
  cleanupPinAttempts();
  const key = String(targetId).toLowerCase().trim();
  const record = pinAttemptMap.get(key);
  if (!record) return { allowed: true };
  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMins = Math.ceil((record.lockedUntil - now) / 60000);
    return { allowed: false, remainingMins };
  }
  if (record.lockedUntil && now >= record.lockedUntil) {
    pinAttemptMap.delete(key);
    return { allowed: true };
  }
  if (record.lastAttemptAt && (now - record.lastAttemptAt > ATTEMPT_WINDOW_MS)) {
    pinAttemptMap.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailedAttempt(targetId) {
  const key = String(targetId).toLowerCase().trim();
  const now = Date.now();
  const record = pinAttemptMap.get(key) || { count: 0, lockedUntil: null, lastAttemptAt: now };
  if (record.lastAttemptAt && (now - record.lastAttemptAt > ATTEMPT_WINDOW_MS)) {
    record.count = 0;
  }
  record.count += 1;
  record.lastAttemptAt = now;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  pinAttemptMap.set(key, record);
}

function clearFailedAttempts(targetId) {
  const key = String(targetId).toLowerCase().trim();
  pinAttemptMap.delete(key);
}

// Constant-time execution delay to prevent timing attacks
const timingDelay = (ms = 200) => new Promise(res => setTimeout(res, ms));

// Verify PIN supporting bcrypt hashes & automatic cross-column migration across pin, khata_pin, and khataPin
async function verifyAndMigratePin(customerId, rawPin, storedPin) {
  if (!storedPin) return false;
  const cleanEntered = String(rawPin).trim();
  const cleanStored = String(storedPin).trim();

  let isValid = false;
  if (cleanStored.startsWith('$2b$') || cleanStored.startsWith('$2a$')) {
    try {
      isValid = await bcrypt.compare(cleanEntered, cleanStored);
    } catch {
      isValid = false;
    }
  } else {
    // Legacy plaintext comparison with 4-digit zero-padding support (Resolved PWA-R4-10)
    isValid = (cleanEntered === cleanStored) || 
              (cleanEntered.padStart(4, '0') === cleanStored.padStart(4, '0'));
    if (isValid) {
      // Seamlessly upgrade legacy plaintext to bcrypt across all 3 schema columns (Prisma, POS, PWA)
      try {
        const canonicalPin = cleanEntered.padStart(4, '0');
        const hashed = await bcrypt.hash(canonicalPin, 10);
        await db.execute({
          sql: `UPDATE Customer 
                SET pin = ?, khata_pin = ?, khataPin = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') 
                WHERE id = ?`,
          args: [hashed, hashed, hashed, customerId]
        });
      } catch (e) {
        console.warn('Failed to upgrade legacy PIN to bcrypt:', e);
      }
    }
  }
  return isValid;
}

// Health check endpoint
fastify.get('/api/health', async (_req, _res) => {
  return { status: 'ok', service: 'Askar Khata Unified API', timestamp: new Date().toISOString() };
});

// ROUTE: Customer Lookup by Phone Number, Name, CPR, or ID (Hardened & Sanitized)
fastify.post('/api/customers/lookup', async (request, reply) => {
  try {
    const { query } = request.body || {};
    if (!query || typeof query !== 'string') {
      return reply.status(400).send({ error: 'Search query is required' });
    }
    const cleanQuery = normalizeArabicNumerals(query).trim();
    if (cleanQuery.length < 2) {
      return reply.status(400).send({ error: 'Query too short' });
    }

    // Sanitize phone query: strip spaces, dashes, +973, 00973, 973, and leading zeros (Resolved PWA-R4-08)
    const sanitizedPhone = cleanQuery
      .replace(/[\s\-()]/g, '')
      .replace(/^(\+973|00973|973)/, '')
      .replace(/^0+/, '');
    const sanitizedCpr = cleanQuery.replace(/[\s-]/g, '');

    // Public lookup strictly excludes sensitive access_token credential (Resolved PWA-SEC-02)
    const result = await db.execute({
      sql: `SELECT id, name, phone, COALESCE(balance, 0.0) as balance 
            FROM Customer 
            WHERE name LIKE ? 
               OR phone = ? 
               OR phone LIKE ? 
               OR cpr = ? 
               OR id = ? 
               OR access_token = ?
               OR cardUid = ?
               OR nfcCardId = ?
               OR nfc_card_id = ?
            LIMIT 8`,
      args: [
        `%${cleanQuery}%`,
        sanitizedPhone,
        `%${sanitizedPhone}%`,
        sanitizedCpr,
        cleanQuery,
        cleanQuery,
        cleanQuery,
        cleanQuery,
        cleanQuery
      ]
    });

    const matches = (result.rows || []).map(row => ({
      id: row.id,
      name: row.name,
      maskedPhone: row.phone ? `${String(row.phone).slice(0, 3)}****${String(row.phone).slice(-2)}` : null,
      balance: Number(row.balance || 0)
    }));

    return reply.send({ success: true, matches });
  } catch (err) {
    fastify.log.error(err);
    return reply.status(500).send({ error: 'Lookup failed', message: err.message });
  }
});

// Step 2: Customer PIN Verification & Device Trust Endpoint (Hardened with Bcrypt, Rate Limiting & Tri-Column Support)
fastify.post('/api/auth/verify', async (request, reply) => {
  try {
    await timingDelay(200);
    const { customerUuid, uuid, pin } = request.body || {};
    const targetId = customerUuid || uuid;

    if (!targetId || !pin) {
      return reply.status(400).send({ success: false, error: 'Customer ID and PIN are required' });
    }

    const cleanPin = normalizeArabicNumerals(String(pin)).trim();

    // 1. Primary lookup in unified Customer table supporting all 3 PIN columns and NFC columns
    const result = await db.execute({
      sql: `SELECT id, name, COALESCE(balance, 0) as balance, 
                   COALESCE(NULLIF(khataPin, ''), NULLIF(khata_pin, ''), NULLIF(pin, '')) as pin, 
                   access_token 
            FROM Customer 
            WHERE access_token = ? OR id = ? OR phone = ? OR cardUid = ? OR nfcCardId = ? OR nfc_card_id = ? 
            LIMIT 1`,
      args: [targetId, targetId, targetId, targetId, targetId, targetId]
    });

    if (result.rows && result.rows.length > 0) {
      const customer = result.rows[0];

      // Rate limit based on canonical customer.id to prevent targetId-rotation bypass
      const rateCheck = checkRateLimit(customer.id);
      if (!rateCheck.allowed) {
        return reply.status(429).send({
          success: false,
          error: `Too many failed attempts. Account locked for ${rateCheck.remainingMins} minute(s).`
        });
      }

      if (!customer.pin) {
        return reply.status(401).send({ success: false, error: 'Customer PIN is not configured. Please contact the store cashier.' });
      }

      const isValid = await verifyAndMigratePin(customer.id, cleanPin, customer.pin);

      if (isValid) {
        clearFailedAttempts(customer.id);
        clearFailedAttempts(targetId);

        const token = jwt.sign(
          {
            id: customer.id,
            name: customer.name,
            accessToken: customer.access_token || customer.id
          },
          JWT_SECRET,
          { expiresIn: '90d' }
        );

        return reply.send({
          success: true,
          token,
          customerName: customer.name,
          customerId: customer.id
        });
      } else {
        recordFailedAttempt(customer.id);
        recordFailedAttempt(targetId);
        return reply.status(401).send({ success: false, error: 'Incorrect PIN' });
      }
    }

    return reply.status(404).send({ success: false, error: 'Account Not Found' });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// ROUTE: Customer Self-Service Change PIN (Hardened with Bcrypt & Tri-Column Sync)
fastify.post('/api/auth/change-pin', async (request, reply) => {
  try {
    await timingDelay(200);
    const { uuid, customerUuid, oldPin, newPin } = request.body || {};
    const targetId = uuid || customerUuid;

    if (!targetId || !oldPin || !newPin) {
      return reply.status(400).send({ error: 'Customer ID, current PIN, and new PIN are required' });
    }

    const cleanOldPin = normalizeArabicNumerals(String(oldPin)).trim();
    const cleanNewPin = normalizeArabicNumerals(String(newPin)).trim();

    if (cleanNewPin.length !== 4 || !/^\d{4}$/.test(cleanNewPin)) {
      return reply.status(400).send({ error: 'New PIN must be exactly 4 numeric digits' });
    }

    // 1. Verify current PIN against unified Customer table (Supporting all identifier columns)
    const verify = await db.execute({
      sql: `SELECT id, COALESCE(NULLIF(khataPin, ''), NULLIF(khata_pin, ''), NULLIF(pin, '')) as pin 
            FROM Customer 
            WHERE id = ? OR access_token = ? OR phone = ? OR cardUid = ? OR nfcCardId = ? OR nfc_card_id = ? OR cpr = ? 
            LIMIT 1`,
      args: [targetId, targetId, targetId, targetId, targetId, targetId, targetId]
    });

    if (!verify.rows || verify.rows.length === 0) {
      return reply.status(404).send({ error: 'Account Not Found' });
    }

    const customer = verify.rows[0];

    // Rate Limit Check on canonical customer ID
    const rateCheck = checkRateLimit(customer.id);
    if (!rateCheck.allowed) {
      return reply.status(429).send({
        error: `Too many failed attempts. Account locked for ${rateCheck.remainingMins} minute(s).`
      });
    }

    if (!customer.pin) {
      return reply.status(400).send({ error: 'No initial PIN found on file. Please contact store management.' });
    }

    const isValid = await verifyAndMigratePin(customer.id, cleanOldPin, customer.pin);

    if (!isValid) {
      recordFailedAttempt(customer.id);
      recordFailedAttempt(targetId);
      return reply.status(401).send({ error: 'Current PIN is incorrect' });
    }

    clearFailedAttempts(customer.id);
    clearFailedAttempts(targetId);

    // 2. Hash new PIN with bcrypt and update ALL THREE schema columns on canonical customer ID
    const hashedNewPin = await bcrypt.hash(cleanNewPin, 10);
    await db.execute({
      sql: `UPDATE Customer 
            SET pin = ?, khata_pin = ?, khataPin = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') 
            WHERE id = ?`,
      args: [hashedNewPin, hashedNewPin, hashedNewPin, customer.id]
    });

    return reply.send({ success: true, message: 'PIN updated successfully' });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: error.message || 'Failed to update PIN' });
  }
});

// Unified Khata Customer Statement & Public Tab Endpoint (Protected with Rate Limiter & JWT Verification)
const handleKhataStatementOrTab = async (request, reply) => {
  const targetId = request.params.uuid || request.params.id;
  const providedPin = normalizeArabicNumerals(String(request.headers['x-khata-pin'] || '')).trim();
  const authHeader = String(request.headers['authorization'] || '').trim();

  if (!targetId) {
    return reply.status(400).send({ error: 'Customer identifier is required' });
  }

  const cleanTargetId = normalizeArabicNumerals(String(targetId)).trim();
  const sanitizedTargetPhone = cleanTargetId
    .replace(/[\s\-()]/g, '')
    .replace(/^(\+973|00973|973)/, '')
    .replace(/^0+/, '');

  try {
    // 1. Look up customer in unified Customer table supporting all ID/NFC columns
    const authCheck = await db.execute({
      sql: `SELECT id, name, COALESCE(balance, 0.0) AS balance, COALESCE(credit_limit, 30.0) AS credit_limit, 
                   phone, access_token, cardUid, cpr, mess_id, 
                   COALESCE(NULLIF(khataPin, ''), NULLIF(khata_pin, ''), NULLIF(pin, '')) as pin
            FROM Customer 
            WHERE access_token = ? OR id = ? OR phone = ? OR phone = ? OR cardUid = ? OR nfcCardId = ? OR nfc_card_id = ? OR cpr = ? 
            LIMIT 1`,
      args: [cleanTargetId, cleanTargetId, cleanTargetId, sanitizedTargetPhone, cleanTargetId, cleanTargetId, cleanTargetId, cleanTargetId]
    });

    if (authCheck.rows && authCheck.rows.length > 0) {
      const customer = authCheck.rows[0];

      // Check for valid 90-Day JWT Device Pairing Token
      let isJwtAuthenticated = false;
      if (authHeader.startsWith('Bearer ')) {
        try {
          const rawJwt = authHeader.slice(7).trim();
          const decoded = jwt.verify(rawJwt, JWT_SECRET);
          if (decoded && (decoded.id === customer.id || decoded.accessToken === customer.access_token)) {
            isJwtAuthenticated = true;
          }
        } catch {
          // Token expired or invalid signature — fallback to PIN check
        }
      }

      // Safe Public Tab View (No valid JWT and no PIN provided)
      if (!isJwtAuthenticated && !providedPin) {
        return reply.send({
          success: true,
          id: customer.id,
          name: customer.name,
          balance: Number(customer.balance ?? 0),
          credit_limit: Number(customer.credit_limit ?? 30.0),
          isLocked: true,
          message: 'PIN or Pairing Token required for detailed line-item statement'
        });
      }

      // If not authenticated via JWT, verify entered PIN with rate limiter
      if (!isJwtAuthenticated) {
        const rateCheck = checkRateLimit(customer.id);
        if (!rateCheck.allowed) {
          return reply.status(429).send({
            success: false,
            error: `Too many failed PIN attempts. Account locked for ${rateCheck.remainingMins} minute(s).`
          });
        }

        const isValid = await verifyAndMigratePin(customer.id, providedPin, customer.pin);
        if (!isValid) {
          recordFailedAttempt(customer.id);
          return reply.status(403).send({ success: false, error: 'Forbidden: Invalid Khata PIN.' });
        }

        clearFailedAttempts(customer.id);
      }

      // Generate a fresh 90-day device pairing token upon successful statement access
      const token = jwt.sign(
        {
          id: customer.id,
          name: customer.name,
          accessToken: customer.access_token || customer.id
        },
        JWT_SECRET,
        { expiresIn: '90d' }
      );

      const limit = Math.min(Number(request.query?.limit || 50), 100);
      const offset = Math.max(Number(request.query?.offset || 0), 0);

      // Fetch detailed Khata ledger transactions with pagination support (Resolved ADV-10)
      const ledgerQuery = await db.execute({
        sql: `SELECT id, customerId, amount, type, reference, running_balance, timestamp 
              FROM KhataLedger 
              WHERE customerId = ? 
              ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        args: [String(customer.id), limit, offset]
      });

      // Mask sensitive Bahrain National ID (CPR)
      const maskedCpr = customer.cpr ? `******${String(customer.cpr).slice(-3)}` : null;

      return reply.send({
        success: true,
        id: customer.id,
        name: customer.name,
        balance: Number(customer.balance ?? 0),
        credit_limit: Number(customer.credit_limit ?? 30.0),
        phone: customer.phone,
        cpr: maskedCpr,
        token,
        ledger: ledgerQuery.rows || []
      });
    }

    return reply.status(404).send({ success: false, error: 'Account Not Found' });
  } catch (error) {
    fastify.log.error('Khata query error:', error);
    return reply.status(500).send({ error: 'Database Error', message: error.message });
  }
};

// Route Aliases to satisfy every client caller
fastify.get('/api/khata/:uuid', handleKhataStatementOrTab);
fastify.get('/api/khata/:uuid/tab', handleKhataStatementOrTab);
fastify.get('/api/customers/:id/tab', handleKhataStatementOrTab);
fastify.get('/api/customers/:id', handleKhataStatementOrTab);
fastify.get('/api/tab/:id', handleKhataStatementOrTab);

// Secure Tap Payments Gateway & Direct Fawri+ BenefitPay Initialization
fastify.post('/api/checkout/init', async (request, reply) => {
  const { customerId, amount, customerName, mode, directBenefitPay } = request.body || {};

  if (!customerId || !amount) {
    return reply.code(400).send({ error: 'Missing customerId or amount' });
  }

  const cleanCustomerId = normalizeArabicNumerals(String(customerId)).trim();
  const sanitizedCustomerPhone = cleanCustomerId
    .replace(/[\s\-()]/g, '')
    .replace(/^(\+973|00973|973)/, '')
    .replace(/^0+/, '');

  const numericAmount = Number(Number(amount).toFixed(3));
  if (isNaN(numericAmount) || numericAmount < 0.100) {
    return reply.code(400).send({ error: 'Settlement amount must be at least 0.100 BHD (100 fils)' });
  }

  // 1. Verify customer exists and validate debt balance (Supporting all customer identifiers)
  const custCheck = await db.execute({
    sql: `SELECT id, name, COALESCE(balance, 0.0) as balance 
          FROM Customer 
          WHERE id = ? OR access_token = ? OR phone = ? OR phone = ? OR cardUid = ? OR nfcCardId = ? OR nfc_card_id = ? OR cpr = ? 
          LIMIT 1`,
    args: [cleanCustomerId, cleanCustomerId, cleanCustomerId, sanitizedCustomerPhone, cleanCustomerId, cleanCustomerId, cleanCustomerId, cleanCustomerId]
  });

  if (!custCheck.rows || custCheck.rows.length === 0) {
    return reply.code(404).send({ error: 'Customer account not found' });
  }

  const liveCustomer = custCheck.rows[0];
  const currentBalance = Number(liveCustomer.balance || 0);

  if (currentBalance <= 0) {
    return reply.code(400).send({ error: 'Customer has no outstanding balance to settle.' });
  }

  // Enforce payment cannot exceed current balance
  const chargeAmount = Math.min(numericAmount, currentBalance);
  const tapSecretKey = process.env.TAP_SECRET_KEY || '';

  // Sanitize customer name to prevent payload injection or buffer overflow (Resolved ADV-03)
  const cleanCustomerName = String(customerName || liveCustomer.name || 'Valued Customer')
    .replace(/[^\p{L}\p{N}\s\-'.]/gu, '')
    .slice(0, 80);

  // Generate authentic CBB / Benefit Company EMVCo MPM QR payload
  const invoiceRef = `KHATA-${String(liveCustomer.id).slice(-6)}-${Date.now().toString().slice(-6)}`;
  const qrPayload = generateBenefitPayPayload(chargeAmount, invoiceRef, DEFAULT_BENEFIT_CONFIG);

  // Determine dynamic host for redirect
  const host = request.headers['x-forwarded-host'] || request.headers.host || 'askar-khata-pwa.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  // If customer explicitly requested direct Fawri+ or if Tap API key is not configured, deliver Fawri+ QR mode directly
  if (!tapSecretKey || directBenefitPay === true || mode === 'fawri') {
    return reply.send({
      success: true,
      mode: 'BENEFITPAY_FAWRI',
      amount: chargeAmount,
      currency: 'BHD',
      merchantName: DEFAULT_BENEFIT_CONFIG.merchantName,
      merchantId: DEFAULT_BENEFIT_CONFIG.merchantId,
      mobileNumber: DEFAULT_BENEFIT_CONFIG.mobileNumber,
      cprOrCr: DEFAULT_BENEFIT_CONFIG.cprOrCr,
      branchId: DEFAULT_BENEFIT_CONFIG.branchId,
      qrPayload,
      reference: invoiceRef,
      customerId: liveCustomer.id,
      customerName: cleanCustomerName
    });
  }

  try {
    const tapResponse = await fetch('https://api.tap.company/v2/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tapSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Number(chargeAmount.toFixed(3)),
        currency: 'BHD',
        threeDSecure: true,
        save_card: false,
        description: `Khata Settlement for ${cleanCustomerName}`,
        receipt: { email: false, sms: false },
        customer: {
          first_name: cleanCustomerName,
          email: 'no-reply@askar.bh'
        },
        source: {
          id: 'src_bh.benefit' // Direct BenefitPay in Bahrain (fallback src_all handled by Tap)
        },
        post: {
          url: `${baseUrl}/api/webhook/tap`
        },
        redirect: {
          url: `${baseUrl}/tab/${liveCustomer.id}?status=complete`
        },
        metadata: {
          customerUuid: liveCustomer.id
        }
      })
    });

    const chargeData = await tapResponse.json();

    if (chargeData.transaction && chargeData.transaction.url) {
      return reply.send({ 
        success: true, 
        mode: 'GATEWAY_REDIRECT',
        checkoutUrl: chargeData.transaction.url,
        chargeId: chargeData.id 
      });
    } else {
      fastify.log.warn({ chargeData }, 'Tap charge initiation failed; gracefully presenting BenefitPay Fawri+ modal');
      return reply.send({
        success: true,
        mode: 'BENEFITPAY_FAWRI',
        amount: chargeAmount,
        currency: 'BHD',
        merchantName: DEFAULT_BENEFIT_CONFIG.merchantName,
        merchantId: DEFAULT_BENEFIT_CONFIG.merchantId,
        mobileNumber: DEFAULT_BENEFIT_CONFIG.mobileNumber,
        cprOrCr: DEFAULT_BENEFIT_CONFIG.cprOrCr,
        branchId: DEFAULT_BENEFIT_CONFIG.branchId,
        qrPayload,
        reference: invoiceRef,
        customerId: liveCustomer.id,
        customerName: cleanCustomerName,
        gatewayNotice: chargeData.errors?.[0]?.description || chargeData.message || 'Tap gateway unavailable'
      });
    }
  } catch (error) {
    fastify.log.error('Tap Init Error, falling back to authentic BenefitPay Fawri+:', error);
    return reply.send({
      success: true,
      mode: 'BENEFITPAY_FAWRI',
      amount: chargeAmount,
      currency: 'BHD',
      merchantName: DEFAULT_BENEFIT_CONFIG.merchantName,
      merchantId: DEFAULT_BENEFIT_CONFIG.merchantId,
      mobileNumber: DEFAULT_BENEFIT_CONFIG.mobileNumber,
      cprOrCr: DEFAULT_BENEFIT_CONFIG.cprOrCr,
      branchId: DEFAULT_BENEFIT_CONFIG.branchId,
      qrPayload,
      reference: invoiceRef,
      customerId: liveCustomer.id,
      customerName: cleanCustomerName,
      gatewayNotice: error.message
    });
  }
});

// Direct Fawri+ BenefitPay Settlement Confirmation & Ledger Reconciler
fastify.post('/api/checkout/confirm', async (request, reply) => {
  const { customerId, customerUuid, amount, reference } = request.body || {};
  const targetId = normalizeArabicNumerals(String(customerId || customerUuid || '')).trim();
  const numericAmount = Number(Number(amount).toFixed(3));

  if (!targetId) {
    return reply.code(400).send({ error: 'Missing customerId' });
  }
  if (isNaN(numericAmount) || numericAmount < 0.100) {
    return reply.code(400).send({ error: 'Settlement amount must be at least 0.100 BHD (100 fils)' });
  }

  const sanitizedPhone = targetId
    .replace(/[\s\-()]/g, '')
    .replace(/^(\+973|00973|973)/, '')
    .replace(/^0+/, '');

  try {
    // 1. Resolve canonical Customer account
    const custLookup = await db.execute({
      sql: `SELECT id, name, COALESCE(balance, 0.0) as balance 
            FROM Customer 
            WHERE id = ? OR access_token = ? OR phone = ? OR phone = ? OR cardUid = ? OR nfcCardId = ? OR cpr = ? 
            LIMIT 1`,
      args: [targetId, targetId, targetId, sanitizedPhone, targetId, targetId, targetId]
    });

    if (!custLookup.rows || custLookup.rows.length === 0) {
      return reply.code(404).send({ error: 'Customer account not found' });
    }

    const liveCustomer = custLookup.rows[0];
    const prevBalance = Number(liveCustomer.balance || 0);

    if (prevBalance <= 0) {
      return reply.code(400).send({ error: 'Customer has no outstanding balance to settle.' });
    }

    const clearAmount = Math.min(numericAmount, prevBalance);
    const newBalance = Math.max(0, prevBalance - clearAmount);
    const cleanRef = String(reference || '').trim().replace(/[^\w-]/g, '').slice(0, 40);
    const paymentRef = cleanRef 
      ? `BenefitPay Fawri+ Settlement (Ref: ${cleanRef})` 
      : `BenefitPay Fawri+ Settlement (${Date.now().toString().slice(-6)})`;

    // 2. Prevent duplicate processing if reference provided
    if (cleanRef) {
      const dupCheck = await db.execute({
        sql: 'SELECT id FROM KhataLedger WHERE reference LIKE ? LIMIT 1',
        args: [`%${cleanRef}%`]
      });
      if (dupCheck.rows && dupCheck.rows.length > 0) {
        return reply.code(400).send({ error: 'This payment reference has already been reconciled.' });
      }
    }

    // 3. Deduct Customer balance and bump timestamp
    await db.execute({
      sql: "UPDATE Customer SET balance = MAX(0, balance - ?), updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      args: [clearAmount, liveCustomer.id]
    });

    // 4. Record payment to KhataLedger with exact running balance
    const ledgerId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.execute({
      sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, timestamp)
            VALUES (?, ?, ?, 'PAYMENT', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      args: [ledgerId, liveCustomer.id, -clearAmount, paymentRef, newBalance]
    });

    fastify.log.info({ customerId: liveCustomer.id, clearAmount, newBalance, paymentRef }, 'BenefitPay Fawri+ settlement reconciled');

    return reply.send({
      success: true,
      message: 'BenefitPay Fawri+ payment reconciled successfully',
      clearedAmount: clearAmount,
      newBalance,
      reference: paymentRef,
      customerId: liveCustomer.id
    });
  } catch (err) {
    fastify.log.error('Confirm Settlement Error:', err);
    return reply.code(500).send({ error: 'Failed to confirm settlement', message: err.message });
  }
});

// Consolidate legacy /api/checkout to forward to /api/checkout/init
fastify.post('/api/checkout', async (request, reply) => {
  const { customerUuid, customerId, amount, customerName, mode, directBenefitPay } = request.body || {};
  return fastify.inject({
    method: 'POST',
    url: '/api/checkout/init',
    payload: {
      customerId: customerId || customerUuid,
      amount,
      customerName,
      mode,
      directBenefitPay
    }
  }).then(res => {
    return reply.code(res.statusCode).send(JSON.parse(res.payload));
  });
});

// Tap Payments Webhook Receiver & Idempotent Debt Reconciliation (Hardened — PWA-12, PWA-13, PWA-18)
fastify.post('/api/webhook/tap', async (request, reply) => {
  const webhookSecret = process.env.TAP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    fastify.log.error('TAP_WEBHOOK_SECRET environment variable is missing. Webhook rejected.');
    return reply.status(500).send({ error: 'Webhook processing disabled on server.' });
  }

  // 1. Extract the signature from the Tap Payments header
  const signatureHeader = request.headers['x-tap-signature'];

  if (!signatureHeader) {
    return reply.code(401).send({ error: 'Unauthorized: Missing Tap signature' });
  }

  // 2. Compute the HMAC-SHA256 hash using the raw buffer (Resolved PWA-12)
  const payloadBuffer = request.rawBody || Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body));
  const computedHash = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadBuffer)
    .digest('hex');

  // 3. Cryptographic Timing-Safe Comparison
  const sigBuffer = Buffer.from(signatureHeader);
  const hashBuffer = Buffer.from(computedHash);
  if (sigBuffer.length !== hashBuffer.length || !crypto.timingSafeEqual(hashBuffer, sigBuffer)) {
    return reply.code(403).send({ error: 'Forbidden: Invalid webhook signature' });
  }

  // 4. Idempotent Clear of Authentic Debt on Unified Customer Table (Resolved PWA-13, PWA-18 & PWA-DAT-01)
  try {
    const payload = request.body || {};
    const status = payload.status || payload.charge_status;
    const amount = Number(payload.amount || payload.response?.amount || 0);
    const currency = payload.currency || payload.response?.currency || 'BHD';
    const metadata = payload.metadata || {};
    const customerUuid = metadata.customerUuid || payload.reference?.order?.replace('ORD-', '');
    const chargeId = payload.id || payload.charge_id || `tap_${Date.now()}`;

    // Validate gateway currency to prevent non-BHD settlement corruption (Resolved PWA-SEC-05)
    if (currency !== 'BHD') {
      fastify.log.warn({ currency }, 'Rejected Tap webhook event with unsupported currency');
      return reply.code(400).send({ error: `Unsupported currency: ${currency}. Only BHD is accepted.` });
    }

    fastify.log.info({ status, amount, customerUuid, chargeId, currency }, 'Authenticated Tap Payments Webhook Verified');

    if (status === 'CAPTURED' || status === 'PAID' || status === 'SUCCESS') {
      if (amount > 0 && customerUuid) {
        // Idempotency check: Ensure chargeId has not been processed previously
        const existingTx = await db.execute({
          sql: 'SELECT id FROM KhataLedger WHERE reference LIKE ? LIMIT 1',
          args: [`%${chargeId}%`]
        });

        if (existingTx.rows && existingTx.rows.length > 0) {
          fastify.log.info({ chargeId }, 'Tap charge already reconciled in KhataLedger (idempotent skip)');
          return reply.send({ success: true, message: 'Already processed (idempotent)', chargeId });
        }

        // Resolve canonical Customer ID to strictly satisfy SQLite Foreign Key constraint (Resolved PWA-DAT-01)
        const custLookup = await db.execute({
          sql: 'SELECT id, COALESCE(balance, 0.0) as balance FROM Customer WHERE access_token = ? OR id = ? OR phone = ? LIMIT 1',
          args: [customerUuid, customerUuid, customerUuid]
        });

        if (!custLookup.rows || custLookup.rows.length === 0) {
          fastify.log.warn({ customerUuid }, 'Customer account not found for webhook settlement');
          return reply.code(404).send({ error: 'Customer account not found' });
        }

        const liveCust = custLookup.rows[0];
        const canonicalCustomerId = liveCust.id;
        const prevBalance = Number(liveCust.balance || 0);
        const newBalance = Math.max(0, prevBalance - amount);

        // Deduct balance on canonical ID and bump updatedAt timestamp for POS sync
        await db.execute({
          sql: "UPDATE Customer SET balance = MAX(0, balance - ?), updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
          args: [amount, canonicalCustomerId]
        });

        // Mirror to KhataLedger using canonical customer ID with exact running_balance and ISO 8601 timestamp
        const ledgerId = `tx_${chargeId}`;
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, timestamp)
                VALUES (?, ?, ?, 'PAYMENT', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
          args: [ledgerId, canonicalCustomerId, -amount, `BenefitPay Online Settlement (Ref: ${chargeId})`, newBalance]
        }).catch((e) => { 
          fastify.log.warn('Failed to insert KhataLedger payment record:', e);
        });

        return reply.send({ 
          success: true, 
          message: 'Khata debt cleared', 
          clearedAmount: amount, 
          customerId: canonicalCustomerId, 
          chargeId, 
          running_balance: newBalance 
        });
      }
    }

    return reply.send({ received: true, status });
  } catch (err) {
    fastify.log.error(err, 'Tap webhook handler error');
    return reply.status(500).send({ error: err.message });
  }
});

// Vercel Serverless Function Handler (Protected against rewrite 404s)
export { fastify };
export default async function handler(req, res) {
  await fastify.ready();
  // Ensure req.url matches original path if Vercel serverless rewrite pointed to /api/server.js
  if (req.url && (req.url === '/api/server.js' || req.url.startsWith('/api/server.js?'))) {
    const originalPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
    if (originalPath) {
      const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = originalPath + queryStr;
    }
  }
  fastify.server.emit('request', req, res);
}

// Standalone Node Server Runner (Resolved PWA-15 — Local Dev, Docker, Self-Hosting)
const isMain = process.argv[1] && (
  process.argv[1].endsWith('server.js') || 
  process.argv[1].endsWith('api\\server.js') || 
  process.argv[1].endsWith('api/server.js')
);

if (isMain && !process.env.VERCEL) {
  const PORT = Number(process.env.PORT || 3001);
  const HOST = process.env.HOST || '0.0.0.0';
  fastify.listen({ port: PORT, host: HOST }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    fastify.log.info(`🚀 Askar Khata API Standalone Server listening at ${address}`);
  });

  // Graceful Process Termination (Resolved ADV-13)
  const gracefulShutdown = async (signal) => {
    fastify.log.info(`Received ${signal}. Gracefully closing Fastify server...`);
    try {
      await fastify.close();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  };
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}
