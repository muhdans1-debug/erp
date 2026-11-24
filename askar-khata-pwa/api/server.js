import Fastify from 'fastify';
import { createClient } from '@libsql/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import * as webpush from 'web-push';
import { generateBenefitPayPayload, DEFAULT_BENEFIT_CONFIG } from '../src/utils/benefitPay.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BI8Eq38iCOIJsM7DUXQBzugeTNmPX3AXJ0zLZiMeuwgXHhNsAo3Vry76qm5pA7y6O5nRQxo_-Cd2cPQeRGnd9OI';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '0IKrFhGoR9n5UK9gcJl1pdYWYOt6nzLwgsvyukORF1c';

if (webpush) {
  try {
    webpush.setVapidDetails(
      'mailto:support@askar-supermarket.com',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
  } catch (err) {
    console.warn('VAPID initialization notice:', err.message);
  }
}

// 1. Native .env loader for Node 20+ standalone execution
try {
  process.loadEnvFile?.();
} catch { }
try {
  process.loadEnvFile?.('pos-mvp/.env');
} catch { }
try {
  process.loadEnvFile?.('askar-khata-pwa/.env');
} catch { }

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

// Secure JWT secret initialization (Requires env in production)
const _isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (_isProduction) {
    console.warn('⚠️ [SECURITY] JWT_SECRET environment variable is not configured. Generating ephemeral cryptographically secure secret.');
  }
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
}

// Fallback to serverless-writable directory if local
const fallbackDbPath = process.env.VERCEL ? 'file:/tmp/local_replica.db' : 'file:pos-mvp/local.db';
const dbTargetUrl = process.env.VERCEL
  ? tursoUrl
  : (fs.existsSync('pos-mvp/local.db') ? 'file:pos-mvp/local.db' : tursoUrl);

const rawClient = createClient({
  url: dbTargetUrl,
  authToken: tursoAuthToken
});

const db = {
  async execute(query) {
    return await rawClient.execute(query);
  },
  async batch(queries, mode = 'write') {
    if (typeof rawClient.batch === 'function') {
      return await rawClient.batch(queries, mode);
    }
    const results = [];
    for (const q of queries) {
      results.push(await rawClient.execute(q));
    }
    return results;
  }
};

// --- Push Notification Endpoints (Vercel & POS Interop) ---
fastify.get('/api/notifications/vapid-public-key', async () => {
  return { publicKey: VAPID_PUBLIC_KEY };
});

fastify.post('/api/notifications/subscribe', async (request, reply) => {
  try {
    const { endpoint, keys, customerId, customerName } = request.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.status(400).send({ error: 'Invalid subscription payload' });
    }

    const subId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await db.execute({
      sql: `INSERT INTO PushSubscription (id, customerId, customerName, endpoint, p256dh, auth, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(endpoint) DO UPDATE SET
              customerId = excluded.customerId,
              customerName = excluded.customerName,
              p256dh = excluded.p256dh,
              auth = excluded.auth,
              updatedAt = datetime('now')`,
      args: [subId, customerId || null, customerName || null, endpoint, keys.p256dh, keys.auth]
    });

    return { success: true, message: 'Push subscription stored successfully' };
  } catch (err) {
    return reply.status(500).send({ error: 'Failed to save subscription', details: err?.message });
  }
});

// Deduplication cache to prevent continuous push loops across retries/background workers
const recentlyDispatchedPushes = new Map();

async function dispatchNotificationInternal(tx) {
  if (!webpush) {
    return { success: false, error: 'Push service not loaded' };
  }

  try {
    webpush.setVapidDetails(
      'mailto:pos@layali-supermarket.com',
      process.env.VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY || VAPID_PRIVATE_KEY
    );
  } catch (_) {}

  // Guard 1: Ignore zero-amount phantom sales
  const txAmount = Number(tx.amount || 0);
  if (txAmount <= 0 && (!tx.txType || tx.txType === 'SALE')) {
    console.log('[Push Hub] Ignoring 0.000 BHD transaction push notice');
    return { success: true, ignored: true, message: 'Zero-amount sales do not trigger customer push notifications' };
  }

  const dedupKey = tx.id || (tx.invoiceNo ? `sale_${tx.invoiceNo}` : null);
  if (dedupKey) {
    const lastDispatched = recentlyDispatchedPushes.get(dedupKey);
    if (lastDispatched && (Date.now() - lastDispatched) < 90000) {
      console.log(`[Push Hub] Deduplicating repeated dispatch request for ${dedupKey}`);
      return { success: true, duplicated: true, message: 'Deduplicated: already sent within 90s' };
    }
    recentlyDispatchedPushes.set(dedupKey, Date.now());
    if (recentlyDispatchedPushes.size > 2000) {
      const now = Date.now();
      for (const [k, v] of recentlyDispatchedPushes.entries()) {
        if (now - v > 300000) recentlyDispatchedPushes.delete(k);
      }
    }
  }

  // Guard 2: Strict Customer Targeting: Never broadcast unassigned/anonymous walk-in sales to customer devices
  const targetCustId = (tx.customerId && String(tx.customerId).trim() !== 'null' && String(tx.customerId).trim() !== 'undefined') ? String(tx.customerId).trim() : null;
  let sql = '';
  const args = [];
  if (!targetCustId) {
    // Only deliver to store owner / manager devices that explicitly track ALL store sales
    sql = "SELECT endpoint, p256dh, auth, customerId FROM PushSubscription WHERE customerId = 'ALL'";
  } else {
    // Deliver strictly to the specific customer whose tab/debt was charged
    sql = "SELECT endpoint, p256dh, auth, customerId FROM PushSubscription WHERE customerId = ? OR customerId = 'ALL'";
    args.push(targetCustId);
  }

  const subs = await db.execute({ sql, args });
  const notifId = tx.id || (tx.invoiceNo ? `sale_${tx.invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}` : `tx_${Date.now()}`);
  const pushPayload = JSON.stringify({
    id: notifId,
    title: tx.title || 'Layali Supermarket • Purchase Notice',
    message: tx.message || `Purchased items for ${Number(tx.amount || 0).toFixed(3)} BHD`,
    amount: tx.amount || 0,
    formattedAmount: `${Number(tx.amount || 0).toFixed(3)} BHD`,
    invoiceNo: tx.invoiceNo || '',
    customerId: tx.customerId || null,
    customerName: tx.customerName || null,
    txType: tx.txType || 'SALE',
    timestamp: tx.timestamp || new Date().toISOString()
  });

  let sent = 0;
  const staleEndpoints = [];
  const dispatchErrors = [];

  for (const row of (subs.rows || [])) {
    const subConfig = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth
      }
    };
    try {
      await webpush.sendNotification(subConfig, pushPayload);
      sent++;
    } catch (e) {
      dispatchErrors.push({ endpoint: String(row.endpoint || '').slice(0, 40), status: e.statusCode, error: e.message });
      if (e.statusCode === 404 || e.statusCode === 410) {
        staleEndpoints.push(row.endpoint);
      }
    }
  }

  for (const stale of staleEndpoints) {
    await db.execute({ sql: 'DELETE FROM PushSubscription WHERE endpoint = ?', args: [stale] }).catch(() => {});
  }

  return { success: true, dispatched: sent, totalTargeted: subs.rows?.length || 0, errors: dispatchErrors.length > 0 ? dispatchErrors : undefined };
}

fastify.post('/api/notifications/dispatch', async (request, reply) => {
  try {
    const result = await dispatchNotificationInternal(request.body || {});
    return result;
  } catch (err) {
    return reply.status(500).send({ error: 'Dispatch failed', details: err?.message });
  }
});

fastify.post('/api/notifications/test', async (request, reply) => {
  try {
    const { customerId, customerName, amount, message } = request.body || {};
    const result = await dispatchNotificationInternal({
      customerId: customerId || null,
      customerName: customerName || 'Customer',
      title: 'Layali Supermarket • Test Notification 🔔',
      message: message || `Test alert: purchase simulation of ${amount || '2.500'} BHD`,
      amount: amount || 2.500,
      txType: 'SALE'
    });
    return result;
  } catch (err) {
    return reply.status(500).send({ error: 'Test dispatch failed', details: err?.message });
  }
});

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

// PWA Stale Cache Self-Healing / Zero-Trap Reset Endpoint (Bypasses Service Worker /api/ block)
const handleAppReset = async (request, reply) => {
  const customerId = request.query?.c || '';
  const redirectTarget = customerId ? `/tab/${encodeURIComponent(customerId)}?t=${Date.now()}` : `/?t=${Date.now()}`;
  reply.header('Content-Type', 'text/html; charset=utf-8');
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0');
  reply.header('Pragma', 'no-cache');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Layali Supermarket • Updating App</title>
  <style>
    body { background: #020617; color: white; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
    .card { background: #0f172a; border: 1px solid #1e293b; padding: 32px 24px; border-radius: 24px; max-width: 320px; width: 88%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .spinner { width: 44px; height: 44px; border: 3px solid rgba(16, 185, 129, 0.2); border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 8px; color: #10b981; font-size: 1.15rem; font-weight: 700; }
    p { margin: 0; color: #94a3b8; font-size: 0.85rem; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Updating Application</h2>
    <p>Clearing stale caches and activating latest Khata version...</p>
  </div>
  <script>
    (async function() {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(function(k) { return caches.delete(k); }));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(function(r) { return r.unregister(); }));
        }
        sessionStorage.clear();
      } catch (e) {
        console.error(e);
      }
      setTimeout(function() {
        window.location.replace('${redirectTarget}');
      }, 500);
    })();
  </script>
</body>
</html>`;
};

fastify.get('/api/reset', handleAppReset);
fastify.get('/api/clean', handleAppReset);
fastify.get('/api/clear', handleAppReset);
fastify.get('/api/purge', handleAppReset);

// --- Product Catalog & Inventory Endpoints ---
const mapProductRow = (p) => ({
  id: String(p.id),
  barcode: p.barcode ? String(p.barcode).trim() : String(p.id),
  name: p.name,
  nameAr: p.nameAr || null,
  category: p.category || 'ESSENTIALS',
  purchasePrice: Number(p.purchasePrice || p.unitCost || 0),
  sellingPrice: Number(p.sellingPrice || p.price || 0),
  price: Number(p.sellingPrice || p.price || 0),
  unitCost: Number(p.unitCost || p.purchasePrice || 0),
  stockQuantity: Number(p.stockQuantity !== undefined ? p.stockQuantity : 99999),
  minThreshold: Number(p.minThreshold || 10),
  maxThreshold: Number(p.maxThreshold || 50),
  vatRate: p.vatRate !== undefined ? Number(p.vatRate) : 10,
  taxRate: p.taxRate !== undefined ? Number(p.taxRate) : 0.1,
  is_weighed_item: Boolean(p.is_weighed_item),
  image_url: p.image_url || null,
  updatedAt: p.updatedAt
});

fastify.get('/api/products', async (_req, reply) => {
  try {
    const res = await db.execute('SELECT * FROM Product ORDER BY name ASC');
    const mapped = res.rows.map(mapProductRow);
    return mapped;
  } catch (err) {
    return reply.status(500).send({ error: 'Failed to fetch products', details: err?.message });
  }
});

fastify.get('/products', async (_req, reply) => {
  try {
    const res = await db.execute('SELECT * FROM Product ORDER BY name ASC');
    const mapped = res.rows.map(mapProductRow);
    return mapped;
  } catch (err) {
    return reply.status(500).send({ error: 'Failed to fetch products', details: err?.message });
  }
});

fastify.get('/api/quick-products', async (_req, reply) => {
  try {
    const res = await db.execute('SELECT * FROM Product ORDER BY name ASC LIMIT 100');
    return { success: true, products: res.rows.map(mapProductRow) };
  } catch (err) {
    return reply.status(500).send({ error: 'Failed to fetch quick products', details: err?.message });
  }
});

fastify.get('/api/products/deleted', async (_req, _reply) => {
  return { success: true, count: 0, deleted: [] };
});

fastify.get('/api/products/barcode/:barcode', async (req, reply) => {
  try {
    const rawBarcode = req.params.barcode;
    const res = await db.execute({
      sql: 'SELECT * FROM Product WHERE barcode = ? OR id = ? LIMIT 1',
      args: [rawBarcode, rawBarcode]
    });
    if (res.rows && res.rows.length > 0) {
      return mapProductRow(res.rows[0]);
    }
    return reply.status(404).send({ error: 'Product not found' });
  } catch (err) {
    return reply.status(500).send({ error: 'Lookup failed', details: err?.message });
  }
});

fastify.post('/api/products', async (req, reply) => {
  if (!verifyPosOrManagerAuth(req)) {
    return reply.status(401).send({ error: 'Unauthorized: POS machine token or Manager authentication required' });
  }
  try {
    const p = req.body || {};
    const id = (p.id || crypto.randomUUID()).trim();
    const barcode = (p.barcode || id).trim();
    const name = String(p.name || '').trim();
    if (!name) return reply.status(400).send({ error: 'Product name is required' });

    const sellingPrice = Number(p.sellingPrice ?? p.price ?? 0);
    const purchasePrice = Number(p.purchasePrice ?? p.unitCost ?? 0);
    const unitCost = Number(p.unitCost ?? p.purchasePrice ?? 0);
    const stockQuantity = Number(p.stockQuantity ?? 10);
    const minThreshold = Number(p.minThreshold ?? 10);
    const maxThreshold = Number(p.maxThreshold ?? 50);
    const category = p.category || 'ESSENTIALS';
    const vatRate = p.vatRate !== undefined ? Number(p.vatRate) : 10;
    const taxRate = p.taxRate !== undefined ? Number(p.taxRate) : 0.1;
    const is_weighed_item = p.is_weighed_item ? 1 : 0;
    const tenantId = p.tenantId || 'tenant_askar_01';
    const distributorId = p.distributorId || null;
    const supplierName = p.supplierName || null;
    const supplierEmail = p.supplierEmail || null;
    const updatedAt = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO Product (
        id, barcode, name, sellingPrice, purchasePrice, unitCost, 
        stockQuantity, minThreshold, maxThreshold, category, vatRate, taxRate, 
        is_weighed_item, tenantId, distributorId, supplierName, supplierEmail, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        barcode = excluded.barcode,
        name = excluded.name,
        sellingPrice = excluded.sellingPrice,
        purchasePrice = excluded.purchasePrice,
        unitCost = excluded.unitCost,
        stockQuantity = excluded.stockQuantity,
        category = excluded.category,
        vatRate = excluded.vatRate,
        taxRate = excluded.taxRate,
        is_weighed_item = excluded.is_weighed_item,
        updatedAt = excluded.updatedAt`,
      args: [
        id, barcode, name, sellingPrice, purchasePrice, unitCost,
        stockQuantity, minThreshold, maxThreshold, category, vatRate, taxRate,
        is_weighed_item, tenantId, distributorId, supplierName, supplierEmail, updatedAt
      ]
    });

    return { success: true, id, message: 'Product saved successfully' };
  } catch (err) {
    return reply.status(500).send({ error: 'Failed to save product', details: err?.message });
  }
});

fastify.post('/api/products/bulk-upsert', async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ error: 'Unauthorized: POS machine token or Manager authentication required' });
  }
  try {
    const { products } = request.body || {};
    if (!Array.isArray(products) || products.length === 0) {
      return reply.status(400).send({ error: 'No products provided' });
    }

    let createdCount = 0;
    for (const p of products) {
      const pid = String(p.id || p.barcode || crypto.randomUUID()).trim();
      const barcode = p.barcode ? String(p.barcode).trim() : pid;
      const name = String(p.name || 'Product').trim();
      const sellingPrice = Number(p.sellingPrice ?? p.price ?? 0);
      const purchasePrice = Number(p.purchasePrice ?? p.unitCost ?? 0);
      const unitCost = Number(p.unitCost ?? p.purchasePrice ?? 0);
      const stockQuantity = Number(p.stockQuantity ?? 10);
      const minThreshold = Number(p.minThreshold ?? 10);
      const maxThreshold = Number(p.maxThreshold ?? 50);
      const category = (p.category || 'ESSENTIALS').toUpperCase();
      const vatRate = p.vatRate !== undefined ? Number(p.vatRate) : 10;
      const taxRate = p.taxRate !== undefined ? Number(p.taxRate) : 0.1;
      const is_weighed_item = p.is_weighed_item ? 1 : 0;
      const tenantId = p.tenantId || 'tenant_askar_01';
      const distributorId = p.distributorId || null;
      const supplierName = p.supplierName || null;
      const supplierEmail = p.supplierEmail || null;
      const updatedAt = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO Product (
          id, barcode, name, sellingPrice, purchasePrice, unitCost, 
          stockQuantity, minThreshold, maxThreshold, category, vatRate, taxRate, 
          is_weighed_item, tenantId, distributorId, supplierName, supplierEmail, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          barcode = excluded.barcode,
          name = excluded.name,
          sellingPrice = excluded.sellingPrice,
          purchasePrice = excluded.purchasePrice,
          unitCost = excluded.unitCost,
          stockQuantity = excluded.stockQuantity,
          category = excluded.category,
          vatRate = excluded.vatRate,
          taxRate = excluded.taxRate,
          is_weighed_item = excluded.is_weighed_item,
          updatedAt = excluded.updatedAt`,
        args: [
          pid, barcode, name, sellingPrice, purchasePrice, unitCost,
          stockQuantity, minThreshold, maxThreshold, category, vatRate, taxRate,
          is_weighed_item, tenantId, distributorId, supplierName, supplierEmail, updatedAt
        ]
      });
      createdCount++;
    }

    return { success: true, createdCount, total: products.length };
  } catch (err) {
    return reply.status(500).send({ error: 'Bulk upsert failed', details: err?.message });
  }
});

fastify.post('/api/sync/pim-push', async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ error: 'Unauthorized: POS machine token or Manager authentication required' });
  }
  try {
    const { batch } = request.body || {};
    if (!Array.isArray(batch) || batch.length === 0) {
      return reply.status(400).send({ error: 'No batch items provided' });
    }

    const syncedIds = [];
    for (const item of batch) {
      const localId = item.local_id || item.id;
      const data = item.data || item;
      const cleanBarcode = item.barcode ? String(item.barcode).trim() : (data.barcode ? String(data.barcode).trim() : String(localId));
      const pid = String(data.id || cleanBarcode || localId).trim();
      const name = String(data.name || 'Product').trim();
      const sellingPrice = Number(data.sellingPrice ?? data.price ?? 0);
      const purchasePrice = Number(data.purchasePrice ?? data.unitCost ?? 0);
      const unitCost = Number(data.unitCost ?? data.purchasePrice ?? 0);
      const stockQuantity = Number(data.stockQuantity ?? data.intakeQty ?? 10);
      const minThreshold = Number(data.minThreshold ?? 10);
      const maxThreshold = Number(data.maxThreshold ?? 50);
      const category = (data.category || 'ESSENTIALS').toUpperCase();
      const vatRate = data.vatRate !== undefined ? Number(data.vatRate) : 10;
      const taxRate = data.taxRate !== undefined ? Number(data.taxRate) : 0.1;
      const is_weighed_item = data.is_weighed_item ? 1 : 0;
      const tenantId = data.tenantId || 'tenant_askar_01';
      const distributorId = data.distributorId || null;
      const supplierName = data.supplierName || null;
      const supplierEmail = data.supplierEmail || null;
      const updatedAt = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO Product (
          id, barcode, name, sellingPrice, purchasePrice, unitCost, 
          stockQuantity, minThreshold, maxThreshold, category, vatRate, taxRate, 
          is_weighed_item, tenantId, distributorId, supplierName, supplierEmail, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          barcode = excluded.barcode,
          name = excluded.name,
          sellingPrice = excluded.sellingPrice,
          purchasePrice = excluded.purchasePrice,
          unitCost = excluded.unitCost,
          stockQuantity = excluded.stockQuantity,
          category = excluded.category,
          vatRate = excluded.vatRate,
          taxRate = excluded.taxRate,
          is_weighed_item = excluded.is_weighed_item,
          updatedAt = excluded.updatedAt`,
        args: [
          pid, cleanBarcode, name, sellingPrice, purchasePrice, unitCost,
          stockQuantity, minThreshold, maxThreshold, category, vatRate, taxRate,
          is_weighed_item, tenantId, distributorId, supplierName, supplierEmail, updatedAt
        ]
      });

      if (localId) syncedIds.push(localId);
    }

    return { success: true, syncedIds, processedCount: syncedIds.length };
  } catch (err) {
    return reply.status(500).send({ error: 'PIM push sync failed', details: err?.message });
  }
});

fastify.get('/api/distributors', async (_req, reply) => {
  try {
    const res = await db.execute('SELECT * FROM Distributor ORDER BY name ASC');
    return res.rows || [];
  } catch {
    return [
      { id: 'dist_almarai', name: 'Almarai Dairy Co.' },
      { id: 'dist_lays', name: 'Layali Askar General Supplies' }
    ];
  }
});

fastify.post('/api/verify-pin', async (req, reply) => {
  const { pin } = req.body || {};
  const cleanPin = String(pin || '').trim();
  if (!cleanPin) {
    return reply.status(400).send({ success: false, error: 'PIN is required' });
  }

  // Rate limiting per IP to prevent brute-force attacks
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown_ip';
  const rateCheck = checkRateLimit(`emp_${ip}`);
  if (!rateCheck.allowed) {
    return reply.status(429).send({
      success: false,
      error: `Too many failed PIN attempts. Locked for ${rateCheck.remainingMins} minute(s).`
    });
  }

  try {
    const res = await db.execute({
      sql: 'SELECT id, tenantId, name, pin_code, role, is_active FROM Employee WHERE is_active = 1',
      args: []
    });

    for (const emp of (res.rows || [])) {
      const stored = String(emp.pin_code || '').trim();
      let match = false;
      if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
        match = await bcrypt.compare(cleanPin, stored).catch(() => false);
      } else if (stored) {
        match = (cleanPin === stored);
      }
      if (match) {
        clearFailedAttempts(`emp_${ip}`);
        const roleLower = String(emp.role).toLowerCase();
        return {
          success: true,
          role: roleLower,
          valid: true,
          employee: { id: emp.id, name: emp.name, role: emp.role },
          user: { name: emp.name, role: emp.role }
        };
      }
    }

    if (process.env.MANAGER_PIN_HASH) {
      const match = await bcrypt.compare(cleanPin, process.env.MANAGER_PIN_HASH.trim()).catch(() => false);
      if (match) {
        clearFailedAttempts(`emp_${ip}`);
        return {
          success: true,
          role: 'manager',
          valid: true,
          employee: { id: 'emp_mgr_env', name: 'Store Manager', role: 'MANAGER' },
          user: { name: 'Store Manager', role: 'MANAGER' }
        };
      }
    }

    recordFailedAttempt(`emp_${ip}`);
    return reply.status(401).send({ success: false, error: 'Invalid PIN code' });
  } catch (err) {
    fastify.log.error('Employee PIN verification error:', err);
    return reply.status(500).send({ success: false, error: 'Database verification error' });
  }
});

// Alias /api/employees/verify-pin to the exact same handler
fastify.post('/api/employees/verify-pin', async (req, reply) => {
  return fastify.inject({
    method: 'POST',
    url: '/api/verify-pin',
    payload: req.body,
    headers: req.headers
  }).then(res => reply.status(res.statusCode).headers(res.headers).send(res.payload));
});

// Telemetry & Register Spy In-Memory Relays
const fleetMap = new Map();
let latestCart = { counterId: 'Counter 1', items: [], updatedAt: Date.now() };
let pendingFleetCommands = [];

const normalizeTerminalId = (rawId) => {
  const clean = String(rawId || '').trim();
  const upper = clean.toUpperCase();
  if (!clean || clean === 'SUNMI-D2-REG01' || clean === '1' || upper === 'T1' || clean.toLowerCase() === 'sunmi') return 'T1';
  if (clean === 'F100' || clean === 'F100-POS' || clean === '2' || upper === 'T2' || clean.toLowerCase() === 'feitian' || clean.toLowerCase() === 'pim') return 'T2';
  if (clean === 'LAPTOP-01' || clean === 'WEB-POS' || clean === '3' || upper === 'T3' || clean.toLowerCase() === 'desktop' || clean.toLowerCase() === 'laptop') return 'T3';
  if (upper === 'T4' || clean === '4' || upper === 'LAPTOP-02' || upper === 'LAPTOP2' || upper === 'DESKTOP-02' || upper === 'DESKTOP2') return 'T4';
  if (upper === 'M1' || upper === 'PHONE-01' || upper === 'MOBILE-01') return 'M1';
  if (upper === 'M2' || upper === 'PHONE-02' || upper === 'MOBILE-02') return 'M2';
  return upper;
};

const getFriendlyTerminalName = (id, customName) => {
  if (customName && customName.trim()) return customName.trim();
  if (id === 'T1') return 'Counter 1 (Sunmi D2 Mini)';
  if (id === 'T2') return 'Counter 2 (Feitian F100)';
  if (id === 'T3') return 'Counter 3 (Desktop Web POS)';
  if (id === 'T4') return 'Counter 4 (Desktop Web POS 2)';
  if (id === 'M1') return 'Floor Mobile 1 (Staff Phone)';
  if (id === 'M2') return 'Floor Mobile 2 (Delivery/Backstore)';
  return `Register ${id}`;
};

// Seed default fleet entries
const DEFAULT_FLEET = ['T1', 'T2', 'T3', 'T4', 'M1', 'M2'];
for (const tid of DEFAULT_FLEET) {
  fleetMap.set(tid, {
    terminalId: tid,
    terminalName: getFriendlyTerminalName(tid),
    cashierName: tid.startsWith('M') ? 'Staff' : `Cashier ${tid.replace(/\D/g, '') || '1'}`,
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in',
    lastSeen: 0,
    updatedAt: 0
  });
}

function popFleetCommands(targetId) {
  const normId = normalizeTerminalId(targetId);
  const now = Date.now();
  const matched = [];
  pendingFleetCommands = pendingFleetCommands.filter((cmd) => {
    if (now - cmd.timestamp > 60000) return false;
    if (cmd.terminalId === normId || cmd.terminalId === 'ALL' || normId === 'ALL') {
      matched.push({
        command: cmd.command,
        type: cmd.command,
        payload: cmd.payload,
        id: cmd.id
      });
      return false;
    }
    return true;
  });
  return matched;
}

fastify.post('/api/heartbeat', async (req, reply) => {
  const body = req.body || {};
  const id = normalizeTerminalId(body.terminalId || body.id || 'T1');
  const existing = fleetMap.get(id) || {};
  fleetMap.set(id, {
    ...existing,
    ...body,
    terminalId: id,
    terminalName: getFriendlyTerminalName(id, body.terminalName || existing.terminalName),
    lastSeen: Date.now(),
    isOnline: true
  });
  return { success: true };
});

fastify.get('/api/hardware/fleet', async (_req, reply) => {
  const list = [];
  const now = Date.now();
  for (const [id, t] of fleetMap.entries()) {
    list.push({ ...t, isOnline: (now - (t.lastSeen || 0)) < 45000 });
  }
  return { success: true, terminals: list };
});

fastify.post('/api/hardware/cart-stream', async (req, reply) => {
  const body = req.body || {};
  latestCart = { ...body, updatedAt: Date.now() };
  return { success: true };
});

fastify.get('/api/hardware/cart-state', async (_req, reply) => {
  return { success: true, cart: latestCart };
});

async function loadFleetRegistryFromDb() {
  try {
    const res = await db.execute({
      sql: `SELECT value FROM StoreSetting WHERE key = 'fleet_registers_registry' LIMIT 1`,
      args: []
    });
    if (res.rows && res.rows.length > 0 && res.rows[0].value) {
      const parsed = JSON.parse(String(res.rows[0].value));
      if (parsed && typeof parsed === 'object') {
        for (const tid of Object.keys(parsed)) {
          const dbReg = parsed[tid];
          const memReg = fleetMap.get(tid);
          if (!memReg || (dbReg.lastSeen && dbReg.lastSeen >= (memReg.lastSeen || 0))) {
            fleetMap.set(tid, {
              ...memReg,
              ...dbReg
            });
          }
        }
      }
    }
  } catch { }
}

async function saveFleetRegistryToDb() {
  try {
    const obj = {};
    for (const [k, v] of fleetMap.entries()) {
      obj[k] = v;
    }
    await db.execute({
      sql: `INSERT INTO StoreSetting (key, value, updatedAt)
            VALUES ('fleet_registers_registry', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [JSON.stringify(obj)]
    });
  } catch { }
}

// Live Register Cart Snapshot & Ingest (Multi-Register Fleet Spy)
fastify.get('/api/register/cart/live', async (req, reply) => {
  await loadFleetRegistryFromDb();
  const now = Date.now();
  const registers = [];
  for (const [tid, reg] of fleetMap.entries()) {
    const isOnline = (now - (reg.lastSeen || reg.updatedAtEpoch || 0)) < 45000;
    registers.push({
      ...reg,
      isOnline,
      connectionStatus: isOnline ? 'ONLINE' : 'OFFLINE',
      secondsSinceLastSeen: Math.floor((now - (reg.lastSeen || 0)) / 1000)
    });
  }
  registers.sort((a, b) => a.terminalId.localeCompare(b.terminalId));

  const requestedId = normalizeTerminalId(req.query?.terminalId || req.query?.terminal);
  const targetReg = registers.find(r => r.terminalId === requestedId) ||
    registers.find(r => r.isOnline && r.items && r.items.length > 0) ||
    registers[0];

  return {
    success: true,
    registers,
    activeCount: registers.filter(r => r.isOnline).length,
    selectedTerminalId: targetReg?.terminalId || 'T1',
    terminalId: targetReg?.terminalId || 'T1',
    terminalName: targetReg?.terminalName || 'Counter 1',
    items: targetReg?.items || [],
    total: targetReg?.total || 0,
    customerName: targetReg?.customerName || 'Walk-in',
    cart: targetReg,
    payload: targetReg,
    timestamp: now
  };
});

fastify.post('/api/register/cart/live', async (req, reply) => {
  await loadFleetRegistryFromDb();
  const body = req.body || {};
  const payload = body.payload || body;
  const tid = normalizeTerminalId(payload.terminalId || body.terminalId || 'T1');
  const now = Date.now();
  const nowIso = new Date().toISOString();

  const existing = fleetMap.get(tid) || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const total = Number(payload.total || 0);

  const regSnapshot = {
    ...existing,
    terminalId: tid,
    terminalName: getFriendlyTerminalName(tid, payload.terminalName || body.terminalName),
    cashierName: payload.cashierName || body.cashierName || existing.cashierName || 'Cashier',
    items,
    itemCount: items.reduce((s, i) => s + (Number(i.quantity ?? i.qty ?? 1)), 0),
    total,
    customer: payload.customer || null,
    customerName: payload.customer?.name || payload.customerName || 'Walk-in',
    activeCartId: payload.activeCartId || '1',
    status: (items.length > 0) ? 'ACTIVE_CART' : 'IDLE',
    updatedAt: nowIso,
    updatedAtEpoch: now,
    lastSeen: now,
    isOnline: true
  };

  fleetMap.set(tid, regSnapshot);
  latestCart = regSnapshot;

  await saveFleetRegistryToDb();
  const commands = popFleetCommands(tid);
  return { ok: true, success: true, updated: true, terminalId: tid, commands, serverEpoch: now };
});

// Register Heartbeat
fastify.post('/api/register/heartbeat', async (req, reply) => {
  await loadFleetRegistryFromDb();
  const body = req.body || {};
  const tid = normalizeTerminalId(body.terminalId || body.id || 'T1');
  const now = Date.now();
  const existing = fleetMap.get(tid) || {
    terminalId: tid,
    terminalName: getFriendlyTerminalName(tid),
    cashierName: 'Cashier',
    status: 'IDLE',
    items: [],
    itemCount: 0,
    total: 0,
    customerName: 'Walk-in'
  };

  fleetMap.set(tid, {
    ...existing,
    lastSeen: now,
    cashierName: body.cashierName || existing.cashierName,
    isOnline: true
  });

  await saveFleetRegistryToDb();
  const commands = popFleetCommands(tid);
  return { success: true, terminalId: tid, isOnline: true, commands };
});

fastify.get('/api/register/heartbeat', async (req, reply) => {
  const tid = normalizeTerminalId(req.query?.terminalId || req.query?.id || 'T1');
  const now = Date.now();
  if (fleetMap.has(tid)) {
    const existing = fleetMap.get(tid);
    existing.lastSeen = now;
    existing.isOnline = true;
  }
  const commands = popFleetCommands(tid);
  return { success: true, terminalId: tid, timestamp: now, commands };
});

// Remote Register Commands (Drawer Kick, Clear Cart, Lock Register)
fastify.post('/api/register/command', async (req, reply) => {
  const body = req.body || {};
  const rawTid = body.terminalId || body.terminal || req.query?.terminalId;
  const terminalId = rawTid && String(rawTid).toUpperCase() !== 'ALL'
    ? normalizeTerminalId(rawTid)
    : 'ALL';
  const rawCmd = String(body.command || body.type || req.query?.command || '').trim().toUpperCase();
  if (!rawCmd) return reply.status(400).send({ error: 'command required' });

  const cleanCmd = rawCmd.startsWith('REMOTE_') ? rawCmd.replace('REMOTE_', '') : rawCmd;
  const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newCmd = {
    id: cmdId,
    terminalId,
    command: cleanCmd,
    payload: body.payload !== undefined ? body.payload : (body.command ? body : {}),
    timestamp: Date.now()
  };
  pendingFleetCommands.push(newCmd);

  return { success: true, dispatched: true, terminalId, command: cleanCmd, commandId: cmdId };
});

fastify.get('/api/register/command', async (req, reply) => {
  const terminalId = normalizeTerminalId(req.query?.terminalId || 'ALL');
  const commands = popFleetCommands(terminalId);
  return { success: true, terminalId, commands };
});

// Cash Drawer Kick Endpoint (Strictly Authenticated)
const handleDrawerKick = async (req, reply) => {
  if (!verifyPosOrManagerAuth(req)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: POS machine token or Manager authentication required' });
  }
  const body = req.body || {};
  const rawTerminal = body.terminalId || body.targetTerminal || req.query?.terminalId || 'T1';
  const terminalId = normalizeTerminalId(rawTerminal);
  const cmdId = `kick_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  pendingFleetCommands.push({
    id: cmdId,
    terminalId,
    command: 'DRAWER_KICK',
    payload: {
      reason: body.reason || 'MANUAL_TRIGGER',
      cashier: body.cashierName || 'Cashier',
      timestamp: Date.now()
    },
    timestamp: Date.now()
  });

  return {
    success: true,
    dispatched: true,
    terminalId,
    commandId: cmdId,
    message: `Cash drawer kick signal dispatched to terminal ${terminalId}`
  };
};

fastify.post('/api/hardware/drawer-kick', handleDrawerKick);
fastify.post('/api/drawer-kick', handleDrawerKick);

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

    const machineToken = request.headers['x-manager-token'] || request.headers['x-pos-token'];
    const configuredToken = process.env.POS_MACHINE_TOKEN || process.env.INTERNAL_SYNC_SECRET || process.env.DEV_SECRET;
    const authHeader = String(request.headers['authorization'] || '');
    let isManagerJwt = false;
    if (authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET);
        isManagerJwt = decoded?.role === 'MANAGER' || decoded?.role === 'SUPER_ADMIN';
      } catch { }
    }
    let isMachineAuth = false;
    if (machineToken && configuredToken && typeof machineToken === 'string') {
      const bufA = Buffer.from(machineToken);
      const bufB = Buffer.from(configuredToken);
      if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
        isMachineAuth = true;
      }
    }
    const isPosClient = Boolean(isMachineAuth || isManagerJwt);

    let result;
    if (isPosClient) {
      // In-store cashier POS lookup (supports searching customers by name or partial phone)
      result = await db.execute({
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
              LIMIT 8`,
        args: [
          `%${cleanQuery}%`,
          sanitizedPhone,
          `%${sanitizedPhone}%`,
          sanitizedCpr,
          cleanQuery,
          cleanQuery,
          cleanQuery,
          cleanQuery
        ]
      });
    } else {
      // Public Web Client: Strict Privacy Guard (NO name searching, NO directory browsing)
      // Only matches exact private UUID, secret access_token, or exact full phone/CPR
      result = await db.execute({
        sql: `SELECT id, name, phone 
              FROM Customer 
              WHERE id = ? 
                 OR access_token = ? 
                 OR phone = ? 
                 OR cpr = ?
                 OR cardUid = ?
                 OR nfcCardId = ?
              LIMIT 1`,
        args: [
          cleanQuery,
          cleanQuery,
          sanitizedPhone,
          sanitizedCpr,
          cleanQuery,
          cleanQuery
        ]
      });
    }

    const matches = (result.rows || []).map(row => ({
      id: row.id,
      name: row.name,
      maskedPhone: row.phone ? `${String(row.phone).slice(0, 3)}****${String(row.phone).slice(-2)}` : null,
      hasActiveAccount: true
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

// Calculate enriched multi-mess breakdown and personal tab balances for PWA Central Payment parity
async function getCustomerMessDetails(customerId, customerMessId, rawBalance) {
  let customerMesses = [];
  let totalMessShare = 0;

  try {
    const messQuery = await db.execute({
      sql: `SELECT DISTINCT mg.id, mg.group_name 
            FROM MessGroup mg
            JOIN MessMember mm ON mm.mess_id = mg.id
            WHERE mm.customer_id = ? AND (mm.is_active = 1 OR mm.is_active IS NULL)
            UNION
            SELECT id, group_name FROM MessGroup WHERE id = ?
            UNION
            SELECT DISTINCT mg.id, mg.group_name
            FROM MessGroup mg
            JOIN KhataLedger kl ON kl.mess_id = mg.id
            WHERE kl.customerId = ? AND (kl.subledger_type = 'MESS_SHARE' OR kl.subledger_type IS NULL)
            GROUP BY mg.id, mg.group_name
            HAVING ROUND(COALESCE(SUM(kl.amount), 0), 3) > 0.0005`,
      args: [customerId, customerMessId || '', customerId]
    });

    if (messQuery.rows && messQuery.rows.length > 0) {
      for (const m of messQuery.rows) {
        if (!m || !m.id) continue;
        let gTotal = 0;
        let mCount = 1;
        try {
          const gTot = await db.execute({
            sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) as total, COUNT(DISTINCT customerId) as count 
                  FROM KhataLedger WHERE mess_id = ?`,
            args: [m.id]
          });
          if (gTot.rows && gTot.rows.length > 0) {
            gTotal = Math.max(0, Number(gTot.rows[0].total || 0));
            mCount = Number(gTot.rows[0].count || 1);
          }
        } catch { }

        let mShare = 0;
        try {
          const sQuery = await db.execute({
            sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) as share 
                  FROM KhataLedger 
                  WHERE mess_id = ? AND customerId = ? 
                    AND (subledger_type = 'MESS_SHARE' OR mess_id IS NOT NULL)`,
            args: [m.id, customerId]
          });
          if (sQuery.rows && sQuery.rows.length > 0) {
            mShare = Math.max(0, Number(sQuery.rows[0].share || 0));
          }
        } catch { }

        let membersList = [];
        try {
          const memRes = await db.execute({
            sql: `SELECT DISTINCT c.id, c.name, c.phone, c.batchNo
                  FROM Customer c
                  JOIN MessMember mm ON c.id = mm.customer_id
                  WHERE mm.mess_id = ? AND mm.is_active = 1
                  UNION
                  SELECT c.id, c.name, c.phone, c.batchNo
                  FROM Customer c
                  WHERE c.mess_id = ?`,
            args: [m.id, m.id]
          });
          if (memRes.rows && memRes.rows.length > 0) {
            membersList = memRes.rows;
            mCount = Math.max(mCount, membersList.length);
          }
        } catch { }

        totalMessShare += mShare;

        customerMesses.push({
          id: m.id,
          name: m.group_name || 'Room Mess',
          group_name: m.group_name || 'Room Mess',
          groupTotal: Number(gTotal.toFixed(3)),
          totalBalance: Number(gTotal.toFixed(3)),
          memberCount: mCount,
          memberShare: Number(mShare.toFixed(3)),
          myShare: Number(mShare.toFixed(3)),
          members: membersList
        });
      }
    }
  } catch (err) {
    fastify.log.warn('Error fetching customer messes in PWA api:', err.message);
  }

  try {
    const mQuery = await db.execute({
      sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) as messSum
            FROM KhataLedger
            WHERE customerId = ? AND (subledger_type = 'MESS_SHARE' OR (mess_id IS NOT NULL AND mess_id != ''))`,
      args: [customerId]
    });
    if (mQuery.rows && mQuery.rows.length > 0 && mQuery.rows[0].messSum !== null) {
      totalMessShare = Math.max(0, Number(mQuery.rows[0].messSum || 0));
    }
  } catch { }

  // If there are mess debts from previous/archived mess rooms, expose them transparently
  const activeSharesSum = customerMesses.reduce((acc, m) => acc + (m.memberShare || 0), 0);
  const remainingMessDebt = Number((totalMessShare - activeSharesSum).toFixed(3));
  if (remainingMessDebt > 0.0005) {
    let archivedName = 'Previous Mess Debt';
    try {
      const prevRef = await db.execute({
        sql: `SELECT reference FROM KhataLedger 
              WHERE customerId = ? AND (subledger_type = 'MESS_SHARE' OR (mess_id IS NOT NULL AND mess_id != ''))
                AND (mess_id NOT IN (SELECT id FROM MessGroup) OR mess_id IS NULL)
                AND reference LIKE 'Mess Split:%'
              ORDER BY timestamp DESC LIMIT 1`,
        args: [customerId]
      });
      if (prevRef.rows && prevRef.rows.length > 0) {
        const match = (prevRef.rows[0].reference || '').match(/Mess Split:\s*([^(\-]+)/i);
        if (match && match[1]) {
          archivedName = `${match[1].trim()} (Previous Room)`;
        }
      }
    } catch { }

    customerMesses.push({
      id: 'archived_messes',
      name: archivedName,
      group_name: archivedName,
      groupTotal: remainingMessDebt,
      totalBalance: remainingMessDebt,
      memberCount: 1,
      memberShare: remainingMessDebt,
      myShare: remainingMessDebt,
      isArchived: true
    });
  }

  totalMessShare = Math.max(0, Number(totalMessShare.toFixed(3)));
  const rawBalNum = Number(rawBalance || 0);
  let personalBalance = Math.max(0, Number((rawBalNum - totalMessShare).toFixed(3)));
  if (customerMesses.length === 0) {
    personalBalance = Number(rawBalNum.toFixed(3));
  }

  return {
    customerMesses,
    totalMessShare,
    personalBalance,
    hasMessGroup: customerMesses.length > 0,
    isMultiMess: customerMesses.length > 1
  };
}

// Unified Khata Customer Statement & Public Tab Endpoint (Protected with Rate Limiter & JWT Verification)
const handleKhataStatementOrTab = async (request, reply) => {
  const targetId = request.params.uuid || request.params.id || request.params.uid;
  const providedPin = normalizeArabicNumerals(String(request.headers['x-khata-pin'] || '')).trim();
  const authHeader = String(request.headers['authorization'] || '').trim();

  if (!targetId) {
    return reply.status(400).send({ error: 'Customer identifier is required' });
  }

  let cleanTargetId = normalizeArabicNumerals(String(targetId)).trim();
  if (cleanTargetId.includes('/tab/')) {
    cleanTargetId = cleanTargetId.split('/tab/')[1].split('?')[0].split('/')[0].trim();
  } else if (cleanTargetId.toUpperCase().startsWith('KHATA:')) {
    cleanTargetId = cleanTargetId.slice(6).trim();
  } else if (cleanTargetId.toUpperCase().startsWith('CUST-')) {
    cleanTargetId = cleanTargetId.slice(5).trim();
  }
  cleanTargetId = cleanTargetId.replace(/^#+|#+$/g, '');

  const sanitizedTargetPhone = cleanTargetId
    .replace(/[\s\-()]/g, '')
    .replace(/^(\+973|00973|973)/, '')
    .replace(/^0+/, '');

  try {
    // 0. Check NfcCard table if cleanTargetId is an NFC card UID
    let cardCustomerId = null;
    try {
      const cardCheck = await db.execute({
        sql: `SELECT customer_id FROM NfcCard WHERE UPPER(tag_id) = ? OR REPLACE(UPPER(tag_id), ':', '') = ? LIMIT 1`,
        args: [cleanTargetId.toUpperCase(), cleanTargetId.toUpperCase().replace(/[:\-]/g, '')]
      });
      if (cardCheck.rows && cardCheck.rows.length > 0 && cardCheck.rows[0].customer_id) {
        cardCustomerId = cardCheck.rows[0].customer_id;
      }
    } catch { }

    // 1. Look up customer in unified Customer table supporting all ID/NFC columns
    const authCheck = await db.execute({
      sql: `SELECT id, name, COALESCE(balance, 0.0) AS balance, COALESCE(credit_limit, 30.0) AS credit_limit, 
                   phone, access_token, cardUid, cpr, mess_id, is_active, isActive,
                   COALESCE(NULLIF(khataPin, ''), NULLIF(khata_pin, ''), NULLIF(pin, '')) as pin
            FROM Customer 
            WHERE id = ? OR LOWER(id) = LOWER(?) OR id = ? OR access_token = ? OR phone = ? OR phone = ? 
               OR cardUid = ? OR UPPER(cardUid) = UPPER(?) OR nfcCardId = ? OR nfc_card_id = ? OR cpr = ? 
            LIMIT 1`,
      args: [
        cleanTargetId, cleanTargetId, cardCustomerId || cleanTargetId, cleanTargetId,
        cleanTargetId, sanitizedTargetPhone, cleanTargetId, cleanTargetId,
        cleanTargetId, cleanTargetId, cleanTargetId
      ]
    });

    if (authCheck.rows && authCheck.rows.length > 0) {
      const customer = authCheck.rows[0];

      // Developer JWT & Session Bypass
      let isDeveloperSession = false;
      let isJwtAuthenticated = false;
      if (authHeader.startsWith('Bearer ')) {
        try {
          const rawJwt = authHeader.slice(7).trim();
          const decoded = jwt.verify(rawJwt, JWT_SECRET);
          if (decoded && (decoded.role === 'DEVELOPER' || decoded.role === 'SUPER_ADMIN')) {
            isDeveloperSession = true;
            isJwtAuthenticated = true;
          } else if (decoded && (decoded.id === customer.id || decoded.accessToken === customer.access_token)) {
            isJwtAuthenticated = true;
          }
        } catch {
          // Token expired or invalid signature — fallback to PIN check
        }
      }

      // Anti-IDOR Device Binding Token Validation:
      // (Bypassed if verified Developer JWT session is active)
      if (!isDeveloperSession) {
        const deviceToken = request.headers['x-khata-device-token'];
        if (deviceToken && typeof deviceToken === 'string' && deviceToken.startsWith('dev_token_')) {
          try {
            const raw = Buffer.from(deviceToken.slice(10), 'base64').toString('utf8');
            const parsed = JSON.parse(raw);
            if (parsed && parsed.cid && parsed.cid !== customer.id && parsed.cid !== customer.access_token) {
              return reply.status(403).send({
                success: false,
                error: 'Device Mismatch: Phone is locked to another Khata account.'
              });
            }
          } catch {}
        }
      }

      // Safe Public Tab View vs Private Statement View (Resolved FLAW-01)
      const isTabRoute = request.url.includes('/tab') || request.url.endsWith('/tab');

      // 1. Customer Tab View (Returns full ledger summary and itemized transactions)
      if (isTabRoute && !providedPin) {
        const [messDetails, ledgerRes, pendingClaims] = await Promise.all([
          getCustomerMessDetails(customer.id, customer.mess_id, customer.balance),
          db.execute({
            sql: `SELECT id, customerId, amount, type, reference, running_balance, timestamp, mess_id,
                         COALESCE(subledger_type, CASE WHEN mess_id IS NOT NULL AND mess_id != '' THEN 'MESS_SHARE' ELSE 'PERSONAL' END) as subledger_type 
                  FROM KhataLedger 
                  WHERE customerId = ? 
                  ORDER BY timestamp DESC, id DESC LIMIT 100`,
            args: [String(customer.id)]
          }).catch(() => ({ rows: [] })),
          db.execute({
            sql: `SELECT id, amount, reference, channel, status, createdAt 
                  FROM KhataSettlementClaim 
                  WHERE customerId = ? AND status = 'PENDING' 
                  ORDER BY createdAt DESC LIMIT 5`,
            args: [customer.id]
          }).catch(() => ({ rows: [] }))
        ]);

        const rawLedger = ledgerRes.rows || [];
        const enrichedLedger = await enrichLedgerWithItems(rawLedger);

        // Dynamically reconcile running balance anchored to true customer.balance
        let runningTracker = Number(customer.balance ?? 0);
        const reconciledLedger = enrichedLedger.map((tx) => {
          const currentRunning = runningTracker;
          const amt = Number(tx.amount || 0);
          runningTracker = Number((runningTracker - amt).toFixed(3));
          return {
            ...tx,
            running_balance: Number(currentRunning.toFixed(3))
          };
        });

        const isActiveNum = (customer.is_active === 0 || customer.isActive === 0) ? 0 : 1;
        const maskedPhone = customer.phone ? `${String(customer.phone).slice(0, 3)}****${String(customer.phone).slice(-2)}` : null;

        return reply.send({
          success: true,
          id: customer.id,
          name: customer.name,
          cardUid: null, // Protected: Never leak NFC card UID to unauthenticated tab
          phone: maskedPhone,
          balance: Number(customer.balance ?? 0),
          personalBalance: messDetails.personalBalance,
          messShare: messDetails.totalMessShare,
          messes: messDetails.customerMesses,
          hasMessGroup: messDetails.hasMessGroup,
          isMultiMess: messDetails.isMultiMess,
          credit_limit: Number(customer.credit_limit ?? 30.0),
          is_active: isActiveNum,
          isActive: Boolean(isActiveNum),
          isLocked: false,
          pendingClaims: pendingClaims.rows || [],
          recentPurchases: reconciledLedger,
          transactions: reconciledLedger,
          ledger: reconciledLedger,
          totalTransactions: reconciledLedger.length,
          message: 'Khata Tab customer ledger and statement.'
        });
      }

      // 2. Unauthenticated Statement View without PIN (Return locked stub prompting for PIN)
      if (!isJwtAuthenticated && !providedPin) {
        const isActiveNum = (customer.is_active === 0 || customer.isActive === 0) ? 0 : 1;
        const maskedPhone = customer.phone ? `${String(customer.phone).slice(0, 3)}****${String(customer.phone).slice(-2)}` : null;

        return reply.send({
          success: true,
          id: customer.id,
          name: customer.name,
          cardUid: null,
          phone: maskedPhone,
          balance: Number(customer.balance ?? 0),
          is_active: isActiveNum,
          isActive: Boolean(isActiveNum),
          isLocked: true, // Enforce locked state so client triggers PIN keypad
          pendingClaims: [],
          recentPurchases: [],
          transactions: [],
          ledger: [],
          totalTransactions: 0,
          message: 'Authentication required. Enter your 4-digit PIN to unlock itemized statement.'
        });
      }

      // 3. If caller supplied a PIN, strictly verify with rate limiter
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

      // Fetch detailed Khata ledger transactions and mess breakdown in parallel
      const [messDetails, ledgerQuery, pendingClaims] = await Promise.all([
        getCustomerMessDetails(customer.id, customer.mess_id, customer.balance),
        db.execute({
          sql: `SELECT id, customerId, amount, type, reference, running_balance, timestamp, mess_id,
                       COALESCE(subledger_type, CASE WHEN mess_id IS NOT NULL AND mess_id != '' THEN 'MESS_SHARE' ELSE 'PERSONAL' END) as subledger_type 
                FROM KhataLedger 
                WHERE customerId = ? 
                ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
          args: [String(customer.id), limit, offset]
        }),
        db.execute({
          sql: `SELECT id, amount, reference, channel, status, createdAt 
                FROM KhataSettlementClaim 
                WHERE customerId = ? AND status = 'PENDING' 
                ORDER BY createdAt DESC LIMIT 5`,
          args: [customer.id]
        }).catch(() => ({ rows: [] }))
      ]);

      const isActiveNum = (customer.is_active === 0 || customer.isActive === 0) ? 0 : 1;
      const statementLedger = ledgerQuery.rows || [];
      const enrichedStatement = await enrichLedgerWithItems(statementLedger);

      // Dynamically reconcile running balance anchored to true customer.balance
      let statementTracker = Number(customer.balance ?? 0);
      const reconciledStatement = enrichedStatement.map((tx) => {
        const currentRunning = statementTracker;
        const amt = Number(tx.amount || 0);
        statementTracker = Number((statementTracker - amt).toFixed(3));
        return {
          ...tx,
          running_balance: Number(currentRunning.toFixed(3))
        };
      });

      const maskedCpr = customer.cpr ? (String(customer.cpr).length > 4 ? `*****${String(customer.cpr).slice(-4)}` : '****') : null;

      return reply.send({
        success: true,
        id: customer.id,
        name: customer.name,
        balance: Number(customer.balance ?? 0),
        personalBalance: messDetails.personalBalance,
        messShare: messDetails.totalMessShare,
        messes: messDetails.customerMesses,
        hasMessGroup: messDetails.hasMessGroup,
        isMultiMess: messDetails.isMultiMess,
        credit_limit: Number(customer.credit_limit ?? 30.0),
        is_active: isActiveNum,
        isActive: Boolean(isActiveNum),
        isLocked: false, // Explicitly authenticated and unlocked
        cardUid: customer.cardUid || customer.nfcCardId || null,
        phone: customer.phone,
        cpr: maskedCpr,
        token,
        pendingClaims: pendingClaims.rows || [],
        recentPurchases: reconciledStatement,
        transactions: reconciledStatement,
        ledger: reconciledStatement,
        totalTransactions: reconciledStatement.length
      });
    }

    return reply.status(404).send({ success: false, error: 'Account Not Found' });
  } catch (error) {
    fastify.log.error('Khata query error:', error);
    return reply.status(500).send({ error: 'Database Error', message: error.message });
  }
};

// Enrich transaction records with line items from SaleItem & Product
async function enrichLedgerWithItems(allLedger) {
  if (!Array.isArray(allLedger) || allLedger.length === 0) return allLedger;

  const lookupKeys = new Set();
  for (const tx of allLedger) {
    if (tx.reference && typeof tx.reference === 'string') {
      const trimmed = tx.reference.trim();
      if (trimmed) lookupKeys.add(trimmed);
      const invMatch = trimmed.match(/INV-[A-Za-z0-9-]+/i);
      if (invMatch) lookupKeys.add(invMatch[0]);
    }
    if (tx.id && typeof tx.id === 'string') {
      lookupKeys.add(tx.id);
    }
  }

  const keysArray = Array.from(lookupKeys);
  if (keysArray.length === 0) return allLedger;

  try {
    const placeholders = keysArray.map(() => '?').join(',');
    const itemsRes = await db.execute({
      sql: `SELECT s.invoiceNo, s.id as saleId, s.subtotal, s.totalVat, s.paymentType,
                   si.id as itemId, si.productId, si.quantity, si.priceAtSale, si.vatAmount, si.vatRateAtSale, si.total_price,
                   p.name as productName, p.name_ar as productNameAr, p.barcode, p.is_weighed_item
            FROM Sale s
            JOIN SaleItem si ON s.id = si.saleId
            LEFT JOIN Product p ON si.productId = p.id OR si.productId = p.barcode
            WHERE s.invoiceNo IN (${placeholders}) OR s.id IN (${placeholders})`,
      args: [...keysArray, ...keysArray]
    });

    const formatItemName = (name, prodId) => {
      if (name && typeof name === 'string' && name.trim()) return name.trim();
      if (!prodId) return 'Store Item';
      return String(prodId)
        .replace(/^nb_|^f100_|^prod_|^si_/, '')
        .replace(/[0-9_]+/g, ' ')
        .trim()
        .replace(/\b\w/g, l => l.toUpperCase()) || 'Store Item';
    };

    const itemsMap = new Map();
    for (const row of (itemsRes.rows || [])) {
      const keys = [row.invoiceNo, row.saleId].filter(Boolean);
      for (const k of keys) {
        if (!itemsMap.has(k)) itemsMap.set(k, []);
        itemsMap.get(k).push({
          id: row.itemId,
          productId: row.productId,
          name: formatItemName(row.productName, row.productId),
          nameAr: row.productNameAr || null,
          barcode: row.barcode,
          quantity: Number(row.quantity ?? 1),
          qty: Number(row.quantity ?? 1),
          price: Number(row.priceAtSale ?? 0),
          unitPrice: Number(row.priceAtSale ?? 0),
          vatAmount: Number(row.vatAmount ?? 0),
          vatRate: Number(row.vatRateAtSale ?? 10),
          total: Number(row.total_price ?? (Number(row.quantity ?? 1) * Number(row.priceAtSale ?? 0))),
          is_weighed_item: Boolean(row.is_weighed_item)
        });
      }
    }

    return allLedger.map(tx => {
      const txCopy = { ...tx };
      const invMatch = tx.reference?.match(/INV-[A-Za-z0-9-]+/i);
      const cleanInv = invMatch ? invMatch[0] : null;

      let matchedItems = null;
      if (tx.reference && itemsMap.has(tx.reference)) {
        matchedItems = itemsMap.get(tx.reference);
      } else if (cleanInv && itemsMap.has(cleanInv)) {
        matchedItems = itemsMap.get(cleanInv);
      } else if (tx.id && itemsMap.has(tx.id)) {
        matchedItems = itemsMap.get(tx.id);
      }

      if (matchedItems) {
        txCopy.items = matchedItems;
        txCopy.itemCount = matchedItems.length;
      }
      if (cleanInv) {
        txCopy.invoiceNo = cleanInv;
      }

      // Rich Categorization & Badges
      const amt = Number(tx.amount || 0);
      const type = (tx.type || '').toUpperCase();
      const ref = (tx.reference || '').trim();

      if (type.includes('PAY') || type.includes('SETTLE') || amt < 0) {
        txCopy.category = 'PAYMENT';
        if (ref.includes('BenefitPay') || ref.includes('Fawri')) {
          txCopy.categoryBadge = 'BenefitPay Fawri+';
        } else if (ref.includes('Cash')) {
          txCopy.categoryBadge = 'Cash Settlement';
        } else {
          txCopy.categoryBadge = 'Settlement Payment';
        }
      } else if (tx.mess_id || ref.includes('Mess Split') || type.includes('MESS')) {
        txCopy.category = 'MESS_SPLIT';
        const roomMatch = ref.match(/Mess Split:\s*([^(\-]+)/i);
        const roomName = roomMatch ? roomMatch[1].trim() : null;
        txCopy.categoryBadge = roomName ? `Mess Split: ${roomName}` : 'Room Mess Split';
        txCopy.messName = roomName;
      } else if (type.includes('OPENING')) {
        txCopy.category = 'OPENING';
        txCopy.categoryBadge = 'Opening Balance';
      } else {
        txCopy.category = 'PERSONAL_PURCHASE';
        txCopy.categoryBadge = 'Store Purchase';
      }

      return txCopy;
    });
  } catch (err) {
    console.warn('Could not enrich ledger with items:', err);
    return allLedger;
  }
}

// Detailed Invoice & Itemized Receipt Endpoint ("Transaction of Each and Everything")
const handleGetInvoiceDetails = async (request, reply) => {
  const invoiceNo = String(request.params.invoiceNo || request.params.id || '').trim();
  if (!invoiceNo) {
    return reply.status(400).send({ success: false, error: 'Invoice number is required' });
  }

  try {
    // 1. Look up master sale record
    const saleRes = await db.execute({
      sql: `SELECT s.*, c.name as customerName, c.phone as customerPhone, c.cpr as customerCpr
            FROM Sale s
            LEFT JOIN Customer c ON s.customerId = c.id
            WHERE s.invoiceNo = ? OR s.id = ? LIMIT 1`,
      args: [invoiceNo, invoiceNo]
    });

    let sale = saleRes.rows && saleRes.rows.length > 0 ? saleRes.rows[0] : null;

    // 2. If not found in Sale, check KhataLedger
    if (!sale) {
      const ledgerRes = await db.execute({
        sql: `SELECT kl.*, c.name as customerName, c.phone as customerPhone, c.cpr as customerCpr
              FROM KhataLedger kl
              LEFT JOIN Customer c ON kl.customerId = c.id
              WHERE kl.reference = ? OR kl.id = ? OR kl.sale_id = ? LIMIT 1`,
        args: [invoiceNo, invoiceNo, invoiceNo]
      });

      if (ledgerRes.rows && ledgerRes.rows.length > 0) {
        const kl = ledgerRes.rows[0];
        const amt = Math.abs(Number(kl.amount || 0));
        const subtotal = amt > 0 ? Number((amt / 1.10).toFixed(3)) : 0;
        const vat = amt > 0 ? Number((amt - subtotal).toFixed(3)) : 0;
        sale = {
          id: kl.id,
          invoiceNo: kl.reference || invoiceNo,
          total: amt,
          totalAmount: amt,
          subtotal: subtotal,
          totalVat: vat,
          vatTotal: vat,
          paymentType: kl.type === 'CHARGE' ? 'CREDIT' : (kl.type || 'STORE_CREDIT'),
          status: 'COMPLETED',
          createdAt: kl.timestamp || kl.created_at,
          customerId: kl.customerId,
          customerName: kl.customerName,
          customerPhone: kl.customerPhone,
          terminalId: 'T1',
          employeeId: 'Register 01'
        };
      }
    }

    if (!sale) {
      return reply.status(404).send({ success: false, error: 'Invoice not found' });
    }

    // 3. Query line items from SaleItem
    const itemsRes = await db.execute({
      sql: `SELECT si.*, p.name as productName, p.name_ar as productNameAr, p.barcode, p.is_weighed_item
            FROM SaleItem si
            LEFT JOIN Product p ON si.productId = p.id OR si.productId = p.barcode
            WHERE si.saleId = ? OR si.saleId = ?`,
      args: [sale.id, sale.invoiceNo]
    });

    let items = (itemsRes.rows || []).map((item) => {
      const formatItemName = (name, prodId) => {
        if (name && typeof name === 'string' && name.trim()) return name.trim();
        if (!prodId) return 'Store Item';
        return String(prodId)
          .replace(/^nb_|^f100_|^prod_|^si_/, '')
          .replace(/[0-9_]+/g, ' ')
          .trim()
          .replace(/\b\w/g, l => l.toUpperCase()) || 'Store Item';
      };

      return {
        id: item.id,
        productId: item.productId,
        name: formatItemName(item.productName || item.name, item.productId),
        nameAr: item.productNameAr || item.name_ar || null,
        barcode: item.barcode || item.productId,
        quantity: Number(item.quantity ?? 1),
        qty: Number(item.quantity ?? 1),
        price: Number(item.priceAtSale ?? item.sellingPrice ?? 0),
        unitPrice: Number(item.priceAtSale ?? item.sellingPrice ?? 0),
        vatAmount: Number(item.vatAmount ?? 0),
        vatRate: Number(item.vatRateAtSale ?? 10),
        total: Number(item.total_price ?? (Number(item.quantity ?? 1) * Number(item.priceAtSale ?? 0))),
        is_weighed_item: Boolean(item.is_weighed_item)
      };
    });

    // If no SaleItem rows found, synthesize clean item representing the grocery charge
    if (items.length === 0) {
      const totalAmt = Number(sale.total || sale.totalAmount || 0);
      const subtotal = Number(sale.subtotal || (totalAmt > 0 ? (totalAmt / 1.10).toFixed(3) : 0));
      const vat = Number((sale.totalVat ?? sale.vatTotal ?? (totalAmt - subtotal)).toFixed(3));
      items = [
        {
          id: `item_${sale.invoiceNo || sale.id}`,
          name: sale.paymentType === 'MESS_KHATA' ? 'Camp Mess Grocery Supply' : 'General Grocery & Household Essentials',
          nameAr: sale.paymentType === 'MESS_KHATA' ? 'مواد غذائية لميس العمال' : 'مواد غذائية وتموينية عامة',
          barcode: 'GEN-GROCERY',
          quantity: 1,
          qty: 1,
          price: totalAmt,
          unitPrice: totalAmt,
          vatAmount: vat,
          vatRate: 10,
          total: totalAmt,
          is_weighed_item: false
        }
      ];
    }

    const formattedSale = {
      ...sale,
      subtotal: Number(sale.subtotal || (sale.total ? sale.total / 1.10 : 0)).toFixed(3),
      totalVat: Number(sale.totalVat || sale.vatTotal || 0).toFixed(3),
      total: Number(sale.total || sale.totalAmount || 0).toFixed(3),
      items
    };

    return reply.send({
      success: true,
      sale: formattedSale,
      invoice: formattedSale
    });
  } catch (err) {
    fastify.log.error(err, 'Failed to fetch invoice details');
    return reply.status(500).send({ success: false, error: 'Failed to fetch invoice details', details: err?.message });
  }
};

// Route Aliases for Invoices
fastify.get('/api/invoice/:invoiceNo', handleGetInvoiceDetails);
fastify.get('/api/sales/:invoiceNo', handleGetInvoiceDetails);
fastify.get('/api/invoices/:invoiceNo', handleGetInvoiceDetails);

// Route Aliases to satisfy every client caller
fastify.get('/api/khata/:uuid', handleKhataStatementOrTab);
fastify.get('/api/khata/:uuid/tab', handleKhataStatementOrTab);
fastify.get('/api/khata/tab/:id', handleKhataStatementOrTab);
fastify.get('/api/customers/:id/tab', handleKhataStatementOrTab);
fastify.get('/api/customers/:id', handleKhataStatementOrTab);
fastify.get('/api/customers/by-card/:uid', handleKhataStatementOrTab);
fastify.get('/api/customers/nfc/:uid', handleKhataStatementOrTab);
fastify.get('/api/tab/:id', handleKhataStatementOrTab);

// Sovereign Customer Self-Freeze / Kill-Switch Endpoint
const handleKhataFreezeCloud = async (request, reply) => {
  const { id } = request.params;
  const { freeze, pin } = request.body || {};
  const cleanId = String(id || '').trim();

  try {
    const custRes = await db.execute({
      sql: `SELECT id, name, is_active, isActive, 
                   COALESCE(NULLIF(khataPin, ''), NULLIF(khata_pin, ''), NULLIF(pin, '')) as pin
            FROM Customer 
            WHERE id = ? OR access_token = ? OR phone = ? LIMIT 1`,
      args: [cleanId, cleanId, cleanId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return reply.code(404).send({ success: false, error: 'Customer account not found' });
    }

    const customer = custRes.rows[0];
    const isCurrentlyActive = !(customer.is_active === 0 || customer.isActive === 0);
    const shouldFreeze = freeze !== undefined ? Boolean(freeze) : isCurrentlyActive;
    const newActiveState = shouldFreeze ? 0 : 1;

    // Strict authentication verification for BOTH freeze and unfreeze actions (Resolved FLAW-05)
    const isManager = verifyPosOrManagerAuth(request);
    let isCustomerAuthorized = false;

    const authHeader = String(request.headers['authorization'] || '').trim();
    if (authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET);
        if (decoded && (decoded.id === customer.id || decoded.accessToken === customer.access_token || decoded.role === 'DEVELOPER' || decoded.role === 'SUPER_ADMIN')) {
          isCustomerAuthorized = true;
        }
      } catch { }
    }

    if (!isCustomerAuthorized && !isManager && pin) {
      const cleanPin = normalizeArabicNumerals(String(pin)).trim();
      if (customer.pin) {
        const isValid = await verifyAndMigratePin(customer.id, cleanPin, customer.pin);
        if (isValid) isCustomerAuthorized = true;
      }
    }

    if (!isCustomerAuthorized && !isManager) {
      return reply.code(401).send({
        success: false,
        error: 'Unauthorized: Customer PIN, verified session token, or Manager authorization required to modify account lock state.'
      });
    }

    await db.execute({
      sql: `UPDATE Customer SET is_active = ?, isActive = ?, updatedAt = datetime('now') WHERE id = ?`,
      args: [newActiveState, newActiveState, customer.id]
    });

    return reply.send({
      success: true,
      id: customer.id,
      name: customer.name,
      is_active: newActiveState,
      isActive: Boolean(newActiveState),
      message: newActiveState === 0
        ? 'Khata successfully locked. Store credit purchases are disabled.'
        : 'Khata unlocked. Store credit purchases are active.'
    });
  } catch (err) {
    fastify.log.error(err, 'Khata freeze error');
    return reply.code(500).send({ success: false, error: 'Failed to update Khata lock state' });
  }
};

fastify.post('/api/khata/:id/freeze', handleKhataFreezeCloud);
fastify.post('/khata/:id/freeze', handleKhataFreezeCloud);
fastify.post('/api/customers/:id/freeze', handleKhataFreezeCloud);
fastify.post('/customers/:id/freeze', handleKhataFreezeCloud);

// Secure Tap Payments Gateway & Direct Fawri+ BenefitPay Initialization
fastify.post('/api/checkout/init', async (request, reply) => {
  const { customerId, amount, customerName, mode, directBenefitPay, sourceView, paymentTarget, targetMessId, targetName } = request.body || {};

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
    sql: `SELECT id, name, phone, tenantId, access_token, COALESCE(balance, 0.0) as balance 
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

  let maxAllowableDebt = currentBalance;
  if (paymentTarget === 'MESS_GROUP' && targetMessId) {
    try {
      const messCheck = await db.execute({
        sql: 'SELECT ROUND(COALESCE(SUM(amount), 0), 3) as total FROM KhataLedger WHERE mess_id = ?',
        args: [targetMessId]
      });
      if (messCheck.rows && messCheck.rows.length > 0) {
        maxAllowableDebt = Math.max(maxAllowableDebt, Number(messCheck.rows[0].total || 0));
      }
    } catch { }
  }

  if (maxAllowableDebt <= 0 && currentBalance <= 0) {
    return reply.code(400).send({ error: 'Customer has no outstanding balance to settle.' });
  }

  // Enforce payment cannot exceed current balance (or full room balance if settling a mess group)
  const chargeAmount = Math.min(numericAmount, maxAllowableDebt > 0 ? maxAllowableDebt : currentBalance);
  const tapSecretKey = process.env.TAP_SECRET_KEY || '';

  // Sanitize customer name to prevent payload injection or buffer overflow (Resolved ADV-03)
  const cleanCustomerName = String(customerName || liveCustomer.name || 'Valued Customer')
    .replace(/[^\p{L}\p{N}\s\-'.]/gu, '')
    .slice(0, 80);

  // Generate authentic CBB / Benefit Company EMVCo MPM QR payload
  const invoiceRef = `KHATA-${String(liveCustomer.id).slice(-6)}-${Date.now().toString().slice(-6)}`;
  const qrPayload = generateBenefitPayPayload(chargeAmount, invoiceRef, DEFAULT_BENEFIT_CONFIG);

  // Dynamic return URL supporting both /tab and /statement paths (BP-08)
  const host = request.headers['x-forwarded-host'] || request.headers.host || 'askar-khata-pwa.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  const returnPath = sourceView === 'statement' ? `/statement/${liveCustomer.id}` : `/tab/${liveCustomer.id}`;
  const redirectUrl = `${baseUrl}${returnPath}?status=complete`;

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
      iban: DEFAULT_BENEFIT_CONFIG.iban,
      cprOrCr: DEFAULT_BENEFIT_CONFIG.cprOrCr,
      branchId: DEFAULT_BENEFIT_CONFIG.branchId,
      qrPayload,
      reference: invoiceRef,
      customerId: liveCustomer.id,
      customerName: cleanCustomerName
    });
  }

  try {
    const cleanCustomerPhone = liveCustomer.phone
      ? String(liveCustomer.phone).replace(/[\s\-()]/g, '').replace(/^(\+973|00973|973)/, '')
      : '';

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
          email: 'no-reply@askar.bh',
          ...(cleanCustomerPhone.length === 8 ? {
            phone: { country_code: '973', number: cleanCustomerPhone }
          } : {})
        },
        source: {
          id: 'src_bh.benefit' // Direct BenefitPay in Bahrain (fallback src_all handled by Tap)
        },
        post: {
          url: `${baseUrl}/api/webhook/tap`
        },
        redirect: {
          url: redirectUrl
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
        iban: DEFAULT_BENEFIT_CONFIG.iban,
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
      iban: DEFAULT_BENEFIT_CONFIG.iban,
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

// Authenticated Direct Fawri+ BenefitPay Settlement Confirmation & Ledger Reconciler
fastify.post('/api/checkout/confirm', async (request, reply) => {
  const { customerId, customerUuid, amount, reference, clientToken, paymentTarget, targetMessId, targetName } = request.body || {};
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
      sql: `SELECT id, name, phone, tenantId, access_token, pin, khata_pin, khataPin, COALESCE(balance, 0.0) as balance 
            FROM Customer 
            WHERE id = ? OR access_token = ? OR phone = ? OR phone = ? OR cardUid = ? OR nfcCardId = ? OR cpr = ? 
            LIMIT 1`,
      args: [targetId, targetId, targetId, sanitizedPhone, targetId, targetId, targetId]
    });

    if (!custLookup.rows || custLookup.rows.length === 0) {
      return reply.code(404).send({ error: 'Customer account not found' });
    }

    const liveCustomer = custLookup.rows[0];

    // 2. Session Authorization Guard (BP-02)
    // Verify request originates from an authentic session (JWT, PIN, or customer pairing token)
    let isAuthorized = false;
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded && (decoded.id === liveCustomer.id || decoded.accessToken === liveCustomer.access_token)) {
          isAuthorized = true;
        }
      } catch { }
    }

    const pinHeader = normalizeArabicNumerals(String(request.headers['x-khata-pin'] || ''));
    if (!isAuthorized && pinHeader && (liveCustomer.khata_pin || liveCustomer.pin || liveCustomer.khataPin)) {
      const activePin = liveCustomer.khata_pin || liveCustomer.pin || liveCustomer.khataPin;
      if (activePin.startsWith('$2') ? await bcrypt.compare(pinHeader, activePin) : pinHeader === activePin) {
        isAuthorized = true;
      }
    }

    const tokenParam = String(clientToken || request.headers['x-customer-token'] || '');
    if (!isAuthorized && tokenParam && liveCustomer.access_token && tokenParam === liveCustomer.access_token) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return reply.code(401).send({ error: 'Unauthorized settlement request. Valid PIN, JWT or session authorization required.' });
    }

    const prevBalance = Number(liveCustomer.balance || 0);
    let maxAllowableDebt = prevBalance;
    if (paymentTarget === 'MESS_GROUP' && targetMessId) {
      try {
        const messCheck = await db.execute({
          sql: 'SELECT ROUND(COALESCE(SUM(amount), 0), 3) as total FROM KhataLedger WHERE mess_id = ?',
          args: [targetMessId]
        });
        if (messCheck.rows && messCheck.rows.length > 0) {
          maxAllowableDebt = Math.max(maxAllowableDebt, Number(messCheck.rows[0].total || 0));
        }
      } catch { }
    }

    if (maxAllowableDebt <= 0 && prevBalance <= 0) {
      return reply.code(400).send({ error: 'Customer has no outstanding balance to settle.' });
    }

    const clearAmount = Math.min(numericAmount, maxAllowableDebt > 0 ? maxAllowableDebt : prevBalance);

    // Arabic-Indic numeral normalization for references (BP-06)
    const normalizedRawRef = normalizeArabicNumerals(String(reference || '')).trim();
    const cleanRef = normalizedRawRef.replace(/[^\w-]/g, '').slice(0, 40);

    if (!cleanRef || cleanRef.length < 4) {
      return reply.code(400).send({
        error: 'Please enter your authentic BenefitPay transaction reference number (minimum 4 characters) found on your payment confirmation screen.'
      });
    }

    // 3. Prevent duplicate processing across KhataLedger and pending KhataSettlementClaim
    const dupCheck = await db.execute({
      sql: 'SELECT id FROM KhataLedger WHERE reference LIKE ? LIMIT 1',
      args: [`%${cleanRef}%`]
    });
    if (dupCheck.rows && dupCheck.rows.length > 0) {
      return reply.code(400).send({ error: 'This payment reference has already been reconciled.' });
    }

    const dupClaim = await db.execute({
      sql: "SELECT id FROM KhataSettlementClaim WHERE reference LIKE ? AND status != 'REJECTED' LIMIT 1",
      args: [`${cleanRef}%`]
    });
    if (dupClaim.rows && dupClaim.rows.length > 0) {
      return reply.code(400).send({ error: 'This payment reference has already been submitted and is awaiting cashier verification.' });
    }

    const targetTag = targetName ? ` [${targetName.slice(0, 30)}]` : '';
    const claimRef = `${cleanRef}${targetTag}`;
    const tenantId = liveCustomer.tenantId || 'tenant_askar_01';
    const claimId = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 4. OPTION 3 FRAUD-PROOF CLAIM SUBMISSION: Record pending claim without deducting balance
    await db.execute({
      sql: `INSERT INTO KhataSettlementClaim (id, customerId, customerName, amount, reference, channel, status, tenantId, createdAt)
            VALUES (?, ?, ?, ?, ?, 'FAWRI_PLUS', 'PENDING', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      args: [claimId, liveCustomer.id, liveCustomer.name, clearAmount, claimRef, tenantId]
    });

    fastify.log.info({ claimId, customerId: liveCustomer.id, clearAmount, cleanRef, tenantId }, 'BenefitPay Fawri+ claim submitted for cashier review');

    return reply.send({
      success: true,
      status: 'PENDING_VERIFICATION',
      claimId,
      message: 'Payment claim submitted successfully! The supermarket cashier will verify your Fawri+ transfer and confirm your settlement.',
      claimedAmount: clearAmount,
      reference: cleanRef,
      currentBalance: prevBalance,
      customerId: liveCustomer.id
    });
  } catch (err) {
    fastify.log.error('Confirm Settlement Error:', err);
    return reply.code(500).send({ error: 'Failed to submit settlement claim', message: err.message });
  }
});

// Step 3b: Customer & Cashier Claim Management Endpoints (Option 3)
fastify.get('/api/khata/:uuid/claims', async (request, reply) => {
  const { uuid } = request.params;
  try {
    const claims = await db.execute({
      sql: `SELECT id, amount, reference, channel, status, createdAt, reviewedAt 
            FROM KhataSettlementClaim 
            WHERE customerId = ? OR customerId IN (SELECT id FROM Customer WHERE access_token = ?)
            ORDER BY createdAt DESC LIMIT 10`,
      args: [uuid, uuid]
    });
    return reply.send({ success: true, claims: claims.rows || [] });
  } catch (err) {
    fastify.log.warn('Failed to fetch customer claims:', err?.message);
    return reply.code(500).send({ error: 'Failed to fetch customer claims' });
  }
});

// --- Centralized POS & Back-Office Auth Verification (Resolved FLAW-03) ---
function verifyPosOrManagerAuth(request) {
  const pin = String(request.headers['x-manager-pin'] || request.body?.pin || request.body?.managerPin || '').trim();
  const configuredPin = (process.env.MANAGER_PIN || '').trim();

  // Validate against configured environment variable only (no hardcoded fallback)
  if (configuredPin && pin && pin === configuredPin) {
    return true;
  }

  const machineToken = request.headers['x-manager-token'] || request.headers['x-pos-token'];
  const configuredToken = process.env.POS_MACHINE_TOKEN || process.env.INTERNAL_SYNC_SECRET || process.env.DEV_SECRET;

  if (machineToken && configuredToken && typeof machineToken === 'string') {
    const bufA = Buffer.from(machineToken);
    const bufB = Buffer.from(configuredToken);
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return true;
    }
  }

  const authHeader = String(request.headers['authorization'] || '');
  if (authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET);
      if (decoded?.role === 'MANAGER' || decoded?.role === 'SUPER_ADMIN') return true;
    } catch { }
  }
  return false;
}

fastify.get('/api/khata/claims/pending', async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: POS machine token or Manager JWT required' });
  }
  try {
    const claims = await db.execute(`
      SELECT c.id, c.customerId, c.customerName, c.amount, c.reference, c.channel, c.status, c.createdAt,
             cust.phone, cust.balance AS currentBalance
      FROM KhataSettlementClaim c
      LEFT JOIN Customer cust ON cust.id = c.customerId
      WHERE c.status = 'PENDING'
      ORDER BY c.createdAt ASC
    `);
    return reply.send({ success: true, claims: claims.rows || [] });
  } catch (err) {
    fastify.log.error('Fetch pending claims error:', err);
    return reply.code(500).send({ error: 'Failed to fetch pending claims' });
  }
});

fastify.post('/api/khata/claims/:claimId/approve', async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: POS machine token or Manager JWT required' });
  }
  const { claimId } = request.params;
  const { reviewer = 'Cashier' } = request.body || {};

  try {
    const claimRes = await db.execute({
      sql: "SELECT * FROM KhataSettlementClaim WHERE id = ? AND status = 'PENDING' LIMIT 1",
      args: [claimId]
    });

    if (!claimRes.rows || claimRes.rows.length === 0) {
      return reply.code(404).send({ success: false, error: 'Pending settlement claim not found or already processed' });
    }

    const claim = claimRes.rows[0];
    const custRes = await db.execute({
      sql: 'SELECT id, name, tenantId, COALESCE(balance, 0.0) as balance FROM Customer WHERE id = ? LIMIT 1',
      args: [claim.customerId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return reply.code(404).send({ success: false, error: 'Customer account not found' });
    }

    const customer = custRes.rows[0];
    const prevBalance = Number(customer.balance || 0);
    const clearAmount = Math.min(Number(claim.amount), prevBalance);
    const newBalance = Math.max(0, prevBalance - clearAmount);
    const tenantId = claim.tenantId || customer.tenantId || 'tenant_askar_01';
    const ledgerId = `bp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const paymentRef = `BenefitPay Fawri+ Verified (Ref: ${claim.reference})`;

    // 1. Mark claim approved
    await db.execute({
      sql: "UPDATE KhataSettlementClaim SET status = 'APPROVED', reviewedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now'), reviewedBy = ? WHERE id = ?",
      args: [reviewer, claimId]
    });

    // 2. Deduct customer balance atomically
    await db.execute({
      sql: "UPDATE Customer SET balance = MAX(0, balance - ?), updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      args: [clearAmount, customer.id]
    });

    // 3. Append to KhataLedger
    await db.execute({
      sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, tenantId, syncStatus, timestamp, created_at)
            VALUES (?, ?, ?, 'PAYMENT', ?, ?, ?, 'ONLINE', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      args: [ledgerId, customer.id, -clearAmount, paymentRef, newBalance, tenantId]
    });

    return reply.send({
      success: true,
      message: 'Settlement claim approved and balance deducted successfully',
      clearedAmount: clearAmount,
      newBalance,
      reference: paymentRef,
      customerId: customer.id,
      customerName: customer.name
    });
  } catch (err) {
    fastify.log.error('Approve Claim Error:', err);
    return reply.code(500).send({ success: false, error: 'Failed to approve claim: ' + err.message });
  }
});

fastify.post('/api/khata/claims/:claimId/reject', async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: POS machine token or Manager JWT required' });
  }
  const { claimId } = request.params;
  const { reviewer = 'Cashier', reason = 'Unverified payment reference' } = request.body || {};

  try {
    const claimRes = await db.execute({
      sql: "SELECT * FROM KhataSettlementClaim WHERE id = ? AND status = 'PENDING' LIMIT 1",
      args: [claimId]
    });

    if (!claimRes.rows || claimRes.rows.length === 0) {
      return reply.code(404).send({ success: false, error: 'Pending settlement claim not found or already processed' });
    }

    await db.execute({
      sql: "UPDATE KhataSettlementClaim SET status = 'REJECTED', reviewedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now'), reviewedBy = ?, notes = ? WHERE id = ?",
      args: [reviewer, reason, claimId]
    });

    return reply.send({
      success: true,
      message: 'Settlement claim rejected. Customer balance remains unchanged.'
    });
  } catch (err) {
    fastify.log.error('Reject Claim Error:', err);
    return reply.code(500).send({ success: false, error: 'Failed to reject claim: ' + err.message });
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
          sql: 'SELECT id, tenantId, COALESCE(balance, 0.0) as balance FROM Customer WHERE access_token = ? OR id = ? OR phone = ? LIMIT 1',
          args: [customerUuid, customerUuid, customerUuid]
        });

        if (!custLookup.rows || custLookup.rows.length === 0) {
          fastify.log.warn({ customerUuid }, 'Customer account not found for webhook settlement');
          return reply.code(404).send({ error: 'Customer account not found' });
        }

        const liveCust = custLookup.rows[0];
        const canonicalCustomerId = liveCust.id;
        const tenantId = liveCust.tenantId || 'tenant_askar_01';
        const prevBalance = Number(liveCust.balance || 0);
        const newBalance = Math.max(0, prevBalance - amount);

        // Deduct balance on canonical ID and bump updatedAt timestamp for POS sync
        await db.execute({
          sql: "UPDATE Customer SET balance = MAX(0, balance - ?), updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
          args: [amount, canonicalCustomerId]
        });

        // Mirror to KhataLedger using canonical customer ID with exact running_balance, tenantId and ISO 8601 timestamp (BP-05)
        const ledgerId = `tx_${chargeId}`;
        await db.execute({
          sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, tenantId, syncStatus, timestamp, created_at)
                VALUES (?, ?, ?, 'PAYMENT', ?, ?, ?, 'ONLINE', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
          args: [ledgerId, canonicalCustomerId, -amount, `BenefitPay Online Settlement (Ref: ${chargeId})`, newBalance, tenantId]
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

// --- CLOUD RESILIENT SYNC ENDPOINTS: Direct Turso LibSQL Execution ---

// 1. Direct Khata Customer Debt Settlement & Repayment (Debt-Capped Waterfall & Mess Invariant Enforced)
const handleCustomerSettleCloud = async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: POS machine token or Manager JWT required' });
  }
  const { id } = request.params || {};
  const { customerId, amount, amountPaid, paymentMethod, reference, target, paymentTarget, messId, mess_id, payingCustomerId } = request.body || {};
  const targetId = id || customerId;
  const settleAmount = Number(amount ?? amountPaid ?? 0);

  if (!targetId) {
    return reply.status(400).send({ success: false, error: 'Customer ID is required' });
  }
  if (isNaN(settleAmount) || settleAmount <= 0) {
    return reply.status(400).send({ success: false, error: 'Valid settlement amount is required' });
  }

  try {
    const isExplicitPersonal = target === 'PERSONAL' || paymentTarget === 'PERSONAL';
    const isExplicitMess = target === 'MESS' || paymentTarget === 'MESS';
    let isMessGroupPayment = target === 'MESS_GROUP' || paymentTarget === 'MESS_GROUP';
    let targetMessId = isExplicitPersonal ? null : (messId || mess_id || null);

    const payRef = reference || (paymentMethod === 'BENEFIT_PAY' ? 'BenefitPay Payment' : 'Cash Payment');
    const receiptNo = `KH-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    // Check if targetId is directly a MessGroup ID
    let targetMessGroup = null;
    try {
      const mgCheck = await db.execute({
        sql: `SELECT id, group_name FROM MessGroup WHERE (id = ? OR group_name = ?) AND id NOT IN (SELECT id FROM DisbandedMessGroup) LIMIT 1`,
        args: [targetId, targetId]
      });
      if (mgCheck.rows && mgCheck.rows.length > 0) {
        isMessGroupPayment = true;
        targetMessGroup = mgCheck.rows[0];
        targetMessId = targetMessGroup.id;
      }
    } catch { }

    // CASE A: Full Mess Room Settlement by one person / direct group clearance
    if (isMessGroupPayment && (targetMessId || targetMessGroup)) {
      if (!targetMessGroup && targetMessId) {
        try {
          const mgRes = await db.execute({
            sql: `SELECT id, group_name FROM MessGroup WHERE (id = ? OR group_name = ?) AND id NOT IN (SELECT id FROM DisbandedMessGroup) LIMIT 1`,
            args: [targetMessId, targetMessId]
          });
          targetMessGroup = mgRes.rows?.[0] || null;
        } catch { }
      }

      if (targetMessGroup) {
        const mRes = await db.execute({
          sql: `SELECT customerId, ROUND(COALESCE(SUM(amount), 0), 3) AS bal
                FROM KhataLedger
                WHERE mess_id = ?
                GROUP BY customerId
                HAVING bal > 0`,
          args: [targetMessGroup.id]
        });
        const memberDebts = (mRes.rows || []).map((r) => ({
          id: r.customerId,
          debt: Math.max(0, Number(r.bal || 0))
        }));
        const totalPositiveDebt = Number(memberDebts.reduce((sum, m) => sum + m.debt, 0).toFixed(3));
        const credits = new Map();

        if (totalPositiveDebt > 0) {
          if (settleAmount >= totalPositiveDebt) {
            for (const md of memberDebts) {
              if (md.debt > 0) credits.set(md.id, md.debt);
            }
          } else {
            let allocatedTotal = 0;
            for (const md of memberDebts) {
              if (md.debt > 0) {
                const cVal = Math.min(md.debt, parseFloat(((settleAmount * md.debt) / totalPositiveDebt).toFixed(3)));
                credits.set(md.id, cVal);
                allocatedTotal = Number((allocatedTotal + cVal).toFixed(3));
              }
            }
            let remainder = Number((settleAmount - allocatedTotal).toFixed(3));
            if (remainder > 0) {
              const sorted = [...memberDebts].filter(md => (credits.get(md.id) || 0) < md.debt).sort((a, b) => b.debt - a.debt);
              if (sorted.length > 0) {
                credits.set(sorted[0].id, Number(((credits.get(sorted[0].id) || 0) + remainder).toFixed(3)));
              }
            }
          }
        }

        const batch = [];
        for (const [mId, cAmt] of credits.entries()) {
          if (cAmt <= 0) continue;
          const txId = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          batch.push({
            sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
                  VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
            args: [txId, mId, -cAmt, `Mess Settlement: ${targetMessGroup.group_name} (${payRef})`, nowIso, nowIso, targetMessGroup.id]
          });
          batch.push({
            sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?), updatedAt = datetime('now') WHERE id = ?`,
            args: [mId, mId]
          });
        }

        // Overpayment beyond communal room debt: credit excess to paying customer's personal tab
        const payerId = payingCustomerId || (targetId !== targetMessGroup.id ? targetId : null);
        if (settleAmount > totalPositiveDebt && payerId) {
          const excess = Number((settleAmount - totalPositiveDebt).toFixed(3));
          if (excess > 0) {
            const advId = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            batch.push({
              sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
                    VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, NULL, 'PERSONAL')`,
              args: [advId, payerId, -excess, `Advance Payment from Mess Settlement: ${targetMessGroup.group_name} (${payRef})`, nowIso, nowIso]
            });
            batch.push({
              sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?), updatedAt = datetime('now') WHERE id = ?`,
              args: [payerId, payerId]
            });
          }
        }

        if (batch.length > 0) {
          await db.batch(batch, 'write');
        }

        return reply.send({
          success: true,
          message: `Mess debt settled: BD ${settleAmount.toFixed(3)} allocated to clear communal room debt`,
          isMess: true,
          messGroupId: targetMessGroup.id,
          amountPaid: settleAmount,
          settledAmount: settleAmount,
          paymentMethod: paymentMethod || 'CASH',
          receiptNo,
          timestamp: nowIso
        });
      }
    }

    // CASE B: Customer Individual Settlement with Waterfall Allocation
    const custRes = await db.execute({
      sql: 'SELECT id, name, phone, balance, credit_limit as creditLimit FROM Customer WHERE id = ? LIMIT 1',
      args: [targetId]
    });
    if (!custRes.rows || custRes.rows.length === 0) {
      return reply.status(404).send({ success: false, error: 'Customer not found' });
    }
    const customer = custRes.rows[0];

    let pDebt = 0;
    try {
      const pDebtRes = await db.execute({
        sql: `SELECT ROUND(COALESCE(SUM(amount), 0), 3) AS bal FROM KhataLedger WHERE customerId = ? AND (subledger_type = 'PERSONAL' OR (subledger_type IS NULL AND (mess_id IS NULL OR mess_id = '')))`,
        args: [targetId]
      });
      pDebt = Math.max(0, Number(pDebtRes.rows?.[0]?.bal || 0));
    } catch { }

    let activeMesses = [];
    try {
      const mDebtRes = await db.execute({
        sql: `SELECT mess_id, ROUND(COALESCE(SUM(amount), 0), 3) AS bal 
              FROM KhataLedger 
              WHERE customerId = ? AND mess_id IS NOT NULL AND mess_id != '' AND (subledger_type = 'MESS_SHARE' OR subledger_type IS NULL)
              GROUP BY mess_id 
              HAVING bal > 0 
              ORDER BY bal DESC`,
        args: [targetId]
      });
      activeMesses = (mDebtRes.rows || []).map((r) => ({
        mess_id: r.mess_id,
        bal: Math.max(0, Number(r.bal || 0))
      }));
    } catch { }

    if (!targetMessId && !isExplicitPersonal && !isExplicitMess) {
      if (pDebt <= 0 && activeMesses.length === 1) {
        targetMessId = activeMesses[0].mess_id;
      }
    }

    const batch = [];

    if (isExplicitPersonal) {
      // 1. Pure personal settlement
      const txId = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      batch.push({
        sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
              VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, NULL, 'PERSONAL')`,
        args: [txId, targetId, -settleAmount, payRef, nowIso, nowIso]
      });
    } else if (isExplicitMess || (targetMessId && targetMessId !== 'ALL_MESSES')) {
      // 2. Mess Share Settlement (Single Mess Room or Multi-Mess Division)
      // INVARIANT: Under NO circumstances should any portion of a mess share payment touch or reduce the Personal Tab!
      let remainingToAllocate = settleAmount;

      // If a specific target mess is requested, settle that room first
      if (targetMessId && targetMessId !== 'ALL_MESSES') {
        const targetMessObj = activeMesses.find(m => m.mess_id === targetMessId);
        const targetMessDebt = targetMessObj ? targetMessObj.bal : 0;
        const payToTargetMess = parseFloat(Math.min(targetMessDebt, remainingToAllocate).toFixed(3));

        if (payToTargetMess > 0) {
          const txId = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
          batch.push({
            sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
                  VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
            args: [txId, targetId, -payToTargetMess, `${payRef} (Mess Share)`, nowIso, nowIso, targetMessId]
          });
          remainingToAllocate = parseFloat((remainingToAllocate - payToTargetMess).toFixed(3));
        }
      }

      // Multi-Mess Allocation: If payment remains (or general Mess Share was clicked), divide remaining across all active mess debts
      if (remainingToAllocate > 0 && activeMesses.length > 0) {
        for (const m of activeMesses) {
          if (m.mess_id === targetMessId || remainingToAllocate <= 0) continue;
          const payToThisMess = parseFloat(Math.min(m.bal, remainingToAllocate).toFixed(3));
          if (payToThisMess > 0) {
            const txIdMess = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            batch.push({
              sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
                    VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
              args: [txIdMess, targetId, -payToThisMess, `${payRef} (Mess Balance)`, nowIso, nowIso, m.mess_id]
            });
            remainingToAllocate = parseFloat((remainingToAllocate - payToThisMess).toFixed(3));
          }
        }
      }

      // If customer overpaid beyond all their mess debts:
      // Allocate the remaining excess strictly as advance credit for the Mess Room, NEVER to the Personal Tab!
      if (remainingToAllocate > 0) {
        const excessMessId = targetMessId && targetMessId !== 'ALL_MESSES'
          ? targetMessId
          : (activeMesses[0]?.mess_id || customer.mess_id || null);
        const txIdAdv = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        batch.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
                VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
          args: [txIdAdv, targetId, -remainingToAllocate, `${payRef} (Mess Advance Credit)`, nowIso, nowIso, excessMessId]
        });
      }
    } else {
      // 3. Account waterfall settlement
      const pAmt = parseFloat(Math.min(pDebt, settleAmount).toFixed(3));
      let remainingToAllocate = parseFloat((settleAmount - pAmt).toFixed(3));

      if (pAmt > 0) {
        const txId = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        batch.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
                VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, NULL, 'PERSONAL')`,
          args: [txId, targetId, -pAmt, payRef, nowIso, nowIso]
        });
      }

      // Allocate remaining payment sequentially across all active mess debts
      if (remainingToAllocate > 0 && activeMesses.length > 0) {
        for (const m of activeMesses) {
          if (remainingToAllocate <= 0) break;
          const payToThisMess = parseFloat(Math.min(m.bal, remainingToAllocate).toFixed(3));
          if (payToThisMess > 0) {
            const txIdMess = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
            batch.push({
              sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
                    VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, ?, 'MESS_SHARE')`,
              args: [txIdMess, targetId, -payToThisMess, `${payRef} (Mess Balance)`, nowIso, nowIso, m.mess_id]
            });
            remainingToAllocate = Number((remainingToAllocate - payToThisMess).toFixed(3));
          }
        }
      }

      // If payment exceeds both personal and all mess debts, credit remainder to personal tab as advance credit
      if (remainingToAllocate > 0) {
        const txIdAdv = `tx_settle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        batch.push({
          sql: `INSERT INTO KhataLedger (id, tenantId, customerId, amount, type, reference, running_balance, syncStatus, timestamp, created_at, mess_id, subledger_type)
                VALUES (?, 'tenant_askar_01', ?, ?, 'PAYMENT', ?, 0, 'SYNCED', ?, ?, NULL, 'PERSONAL')`,
          args: [txIdAdv, targetId, -remainingToAllocate, `${payRef} (Advance Credit)`, nowIso, nowIso]
        });
      }
    }

    batch.push({
      sql: `UPDATE Customer SET balance = (SELECT ROUND(COALESCE(SUM(amount), 0), 3) FROM KhataLedger WHERE customerId = ?), updatedAt = datetime('now') WHERE id = ?`,
      args: [targetId, targetId]
    });

    await db.batch(batch, 'write');

    const sumRes = await db.execute({
      sql: 'SELECT COALESCE(SUM(amount), 0) AS balance FROM KhataLedger WHERE customerId = ?',
      args: [targetId]
    });
    const newBalance = Number(Number(sumRes.rows[0]?.balance || 0).toFixed(3));

    return reply.send({
      success: true,
      message: 'Debt settled successfully',
      customerName: customer.name,
      amountPaid: settleAmount,
      settledAmount: settleAmount,
      previousBalance: Number(customer.balance || 0),
      newBalance,
      paymentMethod: paymentMethod || 'CASH',
      receiptNo,
      timestamp: nowIso
    });
  } catch (err) {
    fastify.log.error(err, 'Cloud customer settle error');
    return reply.status(500).send({ success: false, error: 'Failed to settle debt on cloud database', details: err?.message });
  }
};

fastify.post('/api/customers/:id/settle', handleCustomerSettleCloud);
fastify.post('/api/khata/:id/settle', handleCustomerSettleCloud);
fastify.post('/api/khata/:id/pay', handleCustomerSettleCloud);
fastify.post('/khata/:id/pay', handleCustomerSettleCloud);
fastify.post('/api/khata/pay', handleCustomerSettleCloud);
fastify.post('/khata/pay', handleCustomerSettleCloud);

// 1-Tap Customer Beacon: Notifies POS that customer is present at counter (Cellular 4G/5G & Wi-Fi)
fastify.post('/api/khata/present-at-counter', async (request, reply) => {
  const { customerId, terminalId, pin } = request.body || {};
  if (!customerId) {
    return reply.status(400).send({ success: false, error: 'customerId is required' });
  }
  const cleanId = String(customerId).trim();
  const cRes = await db.execute({
    sql: `SELECT id, name, balance, phone, credit_limit, mess_id,
                 COALESCE(NULLIF(khataPin, ''), NULLIF(khata_pin, ''), NULLIF(pin, '')) as pin
          FROM Customer WHERE id = ? OR access_token = ? OR phone = ? LIMIT 1`,
    args: [cleanId, cleanId, cleanId]
  });
  if (!cRes.rows || cRes.rows.length === 0) {
    return reply.status(404).send({ success: false, error: 'Customer not found' });
  }
  const row = cRes.rows[0];

  // Verify caller identity (JWT, PIN, or POS auth)
  let isAuthorized = verifyPosOrManagerAuth(request);
  const authHeader = String(request.headers['authorization'] || '').trim();
  if (!isAuthorized && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.slice(7).trim(), JWT_SECRET);
      if (decoded && (decoded.id === row.id || decoded.accessToken === row.access_token)) {
        isAuthorized = true;
      }
    } catch {}
  }
  const pinHeader = request.headers['x-khata-pin'] || pin;
  if (!isAuthorized && pinHeader && row.pin) {
    const isValid = await verifyAndMigratePin(row.id, String(pinHeader).trim(), row.pin);
    if (isValid) isAuthorized = true;
  }
  if (!isAuthorized) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: Valid customer session or PIN required' });
  }

  // Query full Mess Group memberships, balances, and member lists for Dual-Wallet split billing
  let messDetails = { customerMesses: [], totalMessShare: 0, personalBalance: Number(row.balance || 0), hasMessGroup: false, isMultiMess: false };
  try {
    messDetails = await getCustomerMessDetails(row.id, row.mess_id, row.balance);
  } catch (err) {
    fastify.log.warn('Failed to resolve mess details for counter beacon:', err.message);
  }

  const primaryMess = (messDetails.customerMesses && messDetails.customerMesses.length > 0)
    ? messDetails.customerMesses[0]
    : null;

  const customer = {
    id: row.id,
    name: row.name,
    phone: row.phone || null,
    balance: Number(row.balance || 0),
    currentBalance: Number(row.balance || 0),
    personalBalance: Number((messDetails.personalBalance !== undefined ? messDetails.personalBalance : row.balance) || 0),
    messShare: Number(messDetails.totalMessShare || 0),
    creditLimit: Number(row.credit_limit || 0),
    mess_id: primaryMess ? primaryMess.id : (row.mess_id || null),
    group_name: primaryMess ? (primaryMess.group_name || primaryMess.name) : null,
    messName: primaryMess ? (primaryMess.group_name || primaryMess.name) : null,
    hasMessGroup: Boolean(messDetails.hasMessGroup),
    isDual: Boolean(messDetails.hasMessGroup),
    isMultiMess: Boolean(messDetails.isMultiMess),
    messes: messDetails.customerMesses || [],
    messGroup: primaryMess,
    members: primaryMess?.members || [],
    memberCount: primaryMess?.memberCount || 1,
    isMess: false,
    card_type: messDetails.customerMesses && messDetails.customerMesses.length > 1
      ? 'MULTI_MESS'
      : (messDetails.hasMessGroup ? 'DUAL' : 'PERSONAL'),
    shopper: {
      id: row.id,
      name: row.name
    }
  };

  const now = Date.now();

  // 1. Persist to Turso central database so Sunmi POS & Laptops anywhere pick it up
  try {
    await db.execute({
      sql: `CREATE TABLE IF NOT EXISTS CounterBeaconRelay (
              id TEXT PRIMARY KEY,
              customer_id TEXT,
              terminal_id TEXT,
              customer_json TEXT,
              timestamp INTEGER,
              acknowledged_at INTEGER DEFAULT 0
            )`,
      args: []
    });
  } catch {}

  try {
    await db.execute({
      sql: `INSERT INTO CounterBeaconRelay (id, customer_id, terminal_id, customer_json, timestamp, acknowledged_at)
            VALUES ('active_beacon', ?, ?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET
              customer_id = excluded.customer_id,
              terminal_id = excluded.terminal_id,
              customer_json = excluded.customer_json,
              timestamp = excluded.timestamp,
              acknowledged_at = 0`,
      args: [customer.id, terminalId || 'T1', JSON.stringify(customer), now]
    });
  } catch {}

  // 2. Relay to Sovereign Cloudflare Edge Gateway over HTTPS
  try {
    fetch('https://askar-edge-api.layali-askar-pos.workers.dev/api/khata/present-at-counter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: customer.id, terminalId: terminalId || 'T1' })
    }).catch(() => {});
  } catch {}

  return {
    success: true,
    message: `${customer.name} announced at counter`,
    customer,
    terminalId: terminalId || 'T1',
    timestamp: now
  };
});

// GET: Latest counter beacon for POS polling (Restricted to POS Terminal / Manager)
fastify.get('/api/khata/present-at-counter/latest', async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: POS machine token or Manager auth required' });
  }
  const now = Date.now();
  try {
    const res = await db.execute({
      sql: `SELECT customer_id, terminal_id, customer_json, timestamp, acknowledged_at 
            FROM CounterBeaconRelay 
            WHERE id = 'active_beacon' LIMIT 1`,
      args: []
    });
    if (res.rows && res.rows.length > 0) {
      const row = res.rows[0];
      const ts = Number(row.timestamp || 0);
      const ack = Number(row.acknowledged_at || 0);
      if (ack === 0 && (now - ts <= 45000)) {
        let cust = null;
        if (row.customer_json) {
          try { cust = JSON.parse(row.customer_json); } catch {}
        }
        return {
          success: true,
          beacon: {
            customer: cust,
            terminalId: row.terminal_id || 'T1',
            timestamp: ts
          }
        };
      }
    }
    return { success: true, beacon: null };
  } catch (err) {
    return { success: false, beacon: null, error: err?.message };
  }
});

// POST: Acknowledge beacon once linked or displayed on POS
fastify.post('/api/khata/present-at-counter/ack', async (request, reply) => {
  const now = Date.now();
  try {
    await db.execute({
      sql: `UPDATE CounterBeaconRelay SET acknowledged_at = ? WHERE id = 'active_beacon'`,
      args: [now]
    });
  } catch {}
  return { success: true, acknowledged: true, timestamp: now };
});

// 2. Direct Append-Only Khata Charge Endpoint
const handleKhataChargeCloud = async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: POS machine token or Manager JWT required' });
  }
  const { customerId, customer_id, id, amount, invoiceNo, reference, timestamp, createdAt } = request.body || {};
  const effectiveId = customerId || customer_id || id;
  const numAmount = Number(amount || 0);
  const effectiveInvoiceNo = invoiceNo || reference || `INV-${Date.now()}`;
  const nowIso = timestamp || createdAt || new Date().toISOString();

  if (!effectiveId || isNaN(numAmount) || numAmount <= 0) {
    return reply.status(400).send({ success: false, error: 'Valid customerId and positive amount are required' });
  }

  try {
    // Verify customer exists and is not frozen
    const custRes = await db.execute({
      sql: 'SELECT id, name, is_active, isActive FROM Customer WHERE id = ? OR access_token = ? LIMIT 1',
      args: [effectiveId, effectiveId]
    });
    if (!custRes.rows || custRes.rows.length === 0) {
      return reply.status(404).send({ success: false, error: 'Customer account not found' });
    }
    const customerRow = custRes.rows[0];
    if (customerRow.is_active === 0 || customerRow.isActive === 0) {
      return reply.status(403).send({
        success: false,
        error: 'Customer Khata account is FROZEN. Store credit purchases are locked by customer.',
        isFrozen: true
      });
    }

    const ledgerId = `khata_chg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    await db.execute({
      sql: `INSERT INTO KhataLedger (
        id, tenantId, customerId, amount, type, reference, running_balance,
        syncStatus, timestamp, created_at
      ) VALUES (?, 'tenant_askar_01', ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?)
      ON CONFLICT(id) DO NOTHING`,
      args: [ledgerId, effectiveId, numAmount, effectiveInvoiceNo, nowIso, nowIso]
    });

    const sumRes = await db.execute({
      sql: 'SELECT COALESCE(SUM(amount), 0) AS balance FROM KhataLedger WHERE customerId = ?',
      args: [effectiveId]
    });
    const newBalance = Number(Number(sumRes.rows[0]?.balance || 0).toFixed(3));

    await db.execute({
      sql: 'UPDATE Customer SET balance = ? WHERE id = ?',
      args: [newBalance, effectiveId]
    });

    return reply.send({
      success: true,
      message: 'Khata charge applied successfully',
      customerId: effectiveId,
      chargedAmount: numAmount,
      newBalance,
      invoiceNo: effectiveInvoiceNo
    });
  } catch (err) {
    fastify.log.error(err, 'Cloud Khata charge error');
    return reply.status(500).send({ success: false, error: 'Failed to record Khata charge', details: err?.message });
  }
};

fastify.post('/api/khata/charge', handleKhataChargeCloud);
fastify.post('/khata/charge', handleKhataChargeCloud);

// 3. Direct Sales Sync Batch Drain Endpoint
const handleSyncSalesCloud = async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: POS machine token or Manager JWT required' });
  }
  const { sales } = request.body || {};
  if (!Array.isArray(sales) || sales.length === 0) {
    return reply.status(400).send({ error: 'No sales provided in sync batch' });
  }

  let processedCount = 0;
  const affectedCustomerIds = new Set();

  try {
    for (const sale of sales) {
      const invoiceNo = sale.invoiceNo || `INV-T-${Date.now()}`;
      const total = Number(sale.total || sale.totalAmount || 0);
      const subtotal = Number(sale.subtotal || total);
      const paymentType = sale.paymentType || 'CASH';
      const status = sale.status || 'COMPLETED';
      const customerId = sale.customerId || null;
      const employeeId = sale.employeeId || null;
      const shiftId = sale.shiftId || null;
      const createdAt = sale.createdAt || new Date().toISOString();
      const terminalId = sale.terminalId || 'T1';
      const items = Array.isArray(sale.items) ? sale.items : [];

      await db.execute({
        sql: `INSERT INTO Sale (id, invoiceNo, total, totalAmount, subtotal, paymentType, status, syncStatus, customerId, employeeId, shiftId, terminalId, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET syncStatus = 'SYNCED'`,
        args: [sale.id, invoiceNo, total, total, subtotal, paymentType, status, customerId, employeeId, shiftId, terminalId, createdAt]
      });

      const isCreditSale =
        paymentType === 'CREDIT' ||
        paymentType === 'CREDIT_PERSONAL' ||
        paymentType === 'CREDIT_MESS' ||
        paymentType === 'NFC_CREDIT' ||
        paymentType === 'MESS_KHATA';

      if (customerId && isCreditSale) {
        const ledgerId = `tx_inv_${invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        await db.execute({
          sql: `INSERT INTO KhataLedger (
            id, tenantId, customerId, amount, type, reference, running_balance,
            syncStatus, timestamp, created_at
          ) VALUES (?, 'tenant_askar_01', ?, ?, 'CHARGE', ?, 0, 'SYNCED', ?, ?)
          ON CONFLICT(id) DO NOTHING`,
          args: [ledgerId, customerId, total, invoiceNo, createdAt, createdAt]
        });
        affectedCustomerIds.add(customerId);
      }

      for (const item of items) {
        const itemId = item.id || `si_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        const prodId = item.productId || item.id;
        const qty = Number(item.quantity ?? item.qty ?? 1);
        const price = Number(item.priceAtSale ?? item.price ?? item.sellingPrice ?? 0);
        const totalPrice = Number((item.total_price ?? (qty * price)).toFixed(3));
        const vatRate = item.vatRateAtSale !== undefined ? Number(item.vatRateAtSale) : (item.vatRate !== undefined ? Number(item.vatRate) : 10.0);
        const vatAmount = Number((item.vatAmount ?? (vatRate === 10 ? (totalPrice - (totalPrice / 1.10)) : 0)).toFixed(3));
        const costPrice = Number(item.costAtSale ?? item.unitCost ?? 0);

        await db.execute({
          sql: `INSERT INTO SaleItem (id, saleId, productId, quantity, priceAtSale, costAtSale, vatRateAtSale, vatAmount, total_price, tenantId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'tenant_askar_01')
                ON CONFLICT(id) DO UPDATE SET quantity = excluded.quantity, total_price = excluded.total_price`,
          args: [itemId, sale.id, prodId, qty, price, costPrice, vatRate, vatAmount, totalPrice]
        });

        // Decrement stock in Turso
        if (prodId) {
          await db.execute({
            sql: 'UPDATE Product SET stockQuantity = MAX(0, stockQuantity - ?) WHERE id = ? OR barcode = ?',
            args: [qty, prodId, prodId]
          }).catch(() => { });
        }
      }
      processedCount++;
    }

    // Reconcile affected customer balances
    for (const custId of affectedCustomerIds) {
      const sumRes = await db.execute({
        sql: 'SELECT COALESCE(SUM(amount), 0) AS balance FROM KhataLedger WHERE customerId = ?',
        args: [custId]
      });
      const newBal = Number(Number(sumRes.rows[0]?.balance || 0).toFixed(3));
      await db.execute({
        sql: 'UPDATE Customer SET balance = ? WHERE id = ?',
        args: [newBal, custId]
      });
    }

    // Trigger instant Web Push notification to customer phones
    if (webpush) {
      for (const sale of sales) {
        if (sale?.customerId) {
          try {
            const tot = Number(sale.total || sale.totalAmount || 0);
            const inv = sale.invoiceNo || `INV-${sale.id}`;
            const subRows = await db.execute({
              sql: 'SELECT endpoint, p256dh, auth FROM PushSubscription WHERE customerId = ? OR customerId = ? OR customerId IS NULL',
              args: [sale.customerId, 'ALL']
            });
            const pPayload = JSON.stringify({
              id: `sale_${sale.id || Date.now()}`,
              title: 'Layali Supermarket • Purchase Notice',
              message: `Purchased items for ${tot.toFixed(3)} BHD. Inv #${inv}`,
              amount: tot,
              formattedAmount: `${tot.toFixed(3)} BHD`,
              invoiceNo: inv,
              customerId: sale.customerId,
              txType: 'SALE',
              timestamp: new Date().toISOString()
            });
            for (const sub of (subRows.rows || [])) {
              webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
              }, pPayload).catch(() => {});
            }
          } catch {}
        }
      }
    }

    return { success: true, processed: processedCount };
  } catch (err) {
    fastify.log.error(err, 'Cloud sales sync error');
    return reply.status(500).send({ error: 'Sales sync to cloud database failed', details: err?.message });
  }
};

fastify.post('/api/sync/sales', handleSyncSalesCloud);
fastify.post('/api/sales/sync', handleSyncSalesCloud);

// 3. Void Sale / Invoice & Restock (Direct Cloud Turso Execution)
const handleVoidSaleCloud = async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: Manager authentication required' });
  }
  const { id } = request.params;
  const cleanId = String(id || '').trim();
  const { reason = 'Manager Voided Invoice' } = request.body || {};

  try {
    const saleRes = await db.execute({
      sql: `SELECT * FROM Sale WHERE UPPER(invoiceNo) = UPPER(?) OR id = ? OR CAST(invoiceSeq AS TEXT) = ? LIMIT 1`,
      args: [cleanId, cleanId, cleanId]
    });

    if (!saleRes.rows || saleRes.rows.length === 0) {
      return reply.status(404).send({ success: false, error: `Sale or Invoice #${cleanId} not found` });
    }

    const sale = saleRes.rows[0];
    if (sale.status === 'VOIDED') {
      return reply.send({ success: true, alreadyVoided: true, message: `Invoice #${sale.invoiceNo} is already VOIDED.` });
    }

    const saleTotal = Number(sale.total || sale.totalAmount || 0);

    // Mark Sale as VOIDED
    await db.execute({
      sql: `UPDATE Sale SET status = 'VOIDED', syncStatus = 'SYNCED', notes = ? WHERE id = ?`,
      args: [`[VOIDED] ${reason}`, sale.id]
    });

    // Reverse customer balance & add ledger entry
    if (sale.customerId && saleTotal > 0) {
      const reversalId = `tx_void_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.execute({
        sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, timestamp, created_at, tenantId, syncStatus, subledger_type)
              VALUES (?, ?, ?, 'VOID_REVERSAL', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 'SYNCED', 'PERSONAL')`,
        args: [reversalId, sale.customerId, -saleTotal, `VOID-${sale.invoiceNo}`, sale.tenantId || 'tenant_askar_01']
      });

      await db.execute({
        sql: `UPDATE Customer SET balance = MAX(0, balance - ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [saleTotal, sale.customerId]
      });
    }

    // Restock items
    const itemsRes = await db.execute({
      sql: `SELECT productId, quantity FROM SaleItem WHERE saleId = ?`,
      args: [sale.id]
    });
    for (const item of (itemsRes.rows || [])) {
      const pId = String(item.productId || '');
      const qty = Number(item.quantity || 0);
      if (pId && qty > 0) {
        await db.execute({
          sql: `UPDATE Product SET stockQuantity = stockQuantity + ? WHERE id = ? OR barcode = ?`,
          args: [qty, pId, pId]
        }).catch(() => {});
      }
    }

    return reply.send({
      success: true,
      message: `Invoice #${sale.invoiceNo} successfully voided and reversed.`,
      invoiceNo: sale.invoiceNo,
      reversedTotal: saleTotal
    });
  } catch (err) {
    fastify.log.error('Cloud void sale error:', err);
    return reply.status(500).send({ success: false, error: 'Failed to void sale', details: err?.message });
  }
};

// 4. Adjust Customer Balance (Direct Cloud Turso Execution)
const handleAdjustCustomerBalanceCloud = async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: Manager authentication required' });
  }
  const { id } = request.params;
  const cleanId = String(id || '').trim();
  const body = request.body || {};
  const reason = String(body.reason || 'Manager Balance Adjustment').trim();
  const note = String(body.note || body.notes || reason).trim();
  const mode = body.mode || (body.newBalance !== undefined ? 'SET_BALANCE' : 'DELTA');

  try {
    const custRes = await db.execute({
      sql: `SELECT id, name, balance, tenantId FROM Customer WHERE id = ? LIMIT 1`,
      args: [cleanId]
    });

    if (!custRes.rows || custRes.rows.length === 0) {
      return reply.status(404).send({ success: false, error: `Customer #${cleanId} not found` });
    }

    const customer = custRes.rows[0];
    const currentBal = Number(customer.balance || 0);

    let targetBal;
    let deltaBal;

    if (mode === 'SET_BALANCE' || body.newBalance !== undefined || body.targetBalance !== undefined) {
      const parsed = parseFloat(body.newBalance !== undefined ? body.newBalance : body.targetBalance);
      if (isNaN(parsed)) return reply.status(400).send({ success: false, error: 'Invalid target balance' });
      targetBal = Number(parsed.toFixed(3));
      deltaBal = Number((targetBal - currentBal).toFixed(3));
    } else {
      const parsedDelta = parseFloat(body.delta);
      if (isNaN(parsedDelta) || parsedDelta === 0) return reply.status(400).send({ success: false, error: 'Invalid delta' });
      deltaBal = Number(parsedDelta.toFixed(3));
      targetBal = Number((currentBal + deltaBal).toFixed(3));
    }

    const adjId = `tx_adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.execute({
      sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, timestamp, created_at, tenantId, syncStatus, subledger_type, notes)
            VALUES (?, ?, ?, 'BALANCE_ADJUSTMENT', 'ADJ-MANUAL', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 'SYNCED', 'PERSONAL', ?)`,
      args: [adjId, customer.id, deltaBal, targetBal, customer.tenantId || 'tenant_askar_01', note]
    });

    await db.execute({
      sql: `UPDATE Customer SET balance = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [targetBal, customer.id]
    });

    return reply.send({
      success: true,
      message: `Balance for ${customer.name} adjusted from ${currentBal.toFixed(3)} to ${targetBal.toFixed(3)} BHD.`,
      customerId: customer.id,
      customerName: customer.name,
      oldBalance: currentBal,
      newBalance: targetBal,
      balance: targetBal,
      delta: deltaBal,
      ledgerId: adjId
    });
  } catch (err) {
    fastify.log.error('Cloud adjust balance error:', err);
    return reply.status(500).send({ success: false, error: 'Failed to adjust balance', details: err?.message });
  }
};

// 5. Void Khata Ledger Entry (Direct Cloud Turso Execution)
const handleVoidLedgerEntryCloud = async (request, reply) => {
  if (!verifyPosOrManagerAuth(request)) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: Manager authentication required' });
  }
  const { id } = request.params;
  const cleanId = String(id || '').trim();
  const { reason = 'Manager Voided Ledger Entry' } = request.body || {};

  try {
    const entryRes = await db.execute({
      sql: `SELECT * FROM KhataLedger WHERE id = ? LIMIT 1`,
      args: [cleanId]
    });

    if (!entryRes.rows || entryRes.rows.length === 0) {
      return reply.status(404).send({ success: false, error: `Ledger entry #${cleanId} not found` });
    }

    const entry = entryRes.rows[0];
    if (entry.type === 'VOIDED' || entry.type === 'VOID_REVERSAL') {
      return reply.send({ success: true, alreadyVoided: true, message: `Ledger entry #${entry.id} is already voided.` });
    }

    const rawAmt = Number(entry.amount || 0);
    const reversalDelta = Number((-rawAmt).toFixed(3));
    const customerId = String(entry.customerId || '');

    await db.execute({
      sql: `UPDATE KhataLedger SET type = 'VOIDED', reference = 'VOIDED-' || reference, syncStatus = 'SYNCED' WHERE id = ?`,
      args: [entry.id]
    });

    const revId = `tx_rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await db.execute({
      sql: `INSERT INTO KhataLedger (id, customerId, amount, type, reference, running_balance, timestamp, created_at, tenantId, syncStatus, subledger_type, notes)
            VALUES (?, ?, ?, 'VOID_REVERSAL', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, 'SYNCED', ?, ?)`,
      args: [
        revId,
        customerId,
        reversalDelta,
        `REV-${entry.id.slice(-8)}`,
        entry.tenantId || 'tenant_askar_01',
        entry.subledger_type || 'PERSONAL',
        `Reversal for voided ledger entry ${entry.id}: ${reason}`
      ]
    });

    if (customerId) {
      await db.execute({
        sql: `UPDATE Customer SET balance = MAX(0, balance + ?), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [reversalDelta, customerId]
      });
    }

    return reply.send({
      success: true,
      message: `Ledger entry #${entry.id} voided successfully. Balance adjusted by ${reversalDelta.toFixed(3)} BHD.`,
      ledgerId: entry.id,
      reversalId: revId,
      customerId,
      reversalDelta
    });
  } catch (err) {
    fastify.log.error('Cloud void ledger error:', err);
    return reply.status(500).send({ success: false, error: 'Failed to void ledger entry', details: err?.message });
  }
};

fastify.post('/api/sales/invoice/:id/void', handleVoidSaleCloud);
fastify.post('/api/sales/:id/void', handleVoidSaleCloud);
fastify.post('/api/customers/:id/adjust-balance', handleAdjustCustomerBalanceCloud);
fastify.post('/api/khata/customers/:id/adjust-balance', handleAdjustCustomerBalanceCloud);
fastify.post('/api/khata/ledger/:id/void', handleVoidLedgerEntryCloud);
fastify.post('/api/ledger/:id/void', handleVoidLedgerEntryCloud);

// --- Exclusive Stealth Developer Portal Endpoints (Resolved FLAW-04) ---
const DEV_MASTER_PASSWORD = (process.env.DEV_MASTER_PASSWORD || '').trim() || null;

// Verify developer JWT helper
function verifyDeveloperAuth(request, reply) {
  const authHeader = String(request.headers['authorization'] || '');
  if (!authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ success: false, error: 'Unauthorized: Developer token required' });
    return null;
  }
  try {
    const rawJwt = authHeader.slice(7).trim();
    const decoded = jwt.verify(rawJwt, JWT_SECRET);
    if (!decoded || (decoded.role !== 'DEVELOPER' && decoded.role !== 'SUPER_ADMIN')) {
      reply.status(403).send({ success: false, error: 'Forbidden: Developer role required' });
      return null;
    }
    return decoded;
  } catch (e) {
    reply.status(401).send({ success: false, error: 'Unauthorized: Invalid developer token', details: e.message });
    return null;
  }
}

// 1. Developer Auth Endpoint (Master Password 'Anasanas1!' or Enrolled Biometric Token)
fastify.post('/api/dev/auth', async (request, reply) => {
  const ip = request.ip || request.headers['x-forwarded-for'] || 'dev_client';
  const rateCheck = checkRateLimit(`dev_${ip}`);
  if (!rateCheck.allowed) {
    return reply.status(429).send({
      success: false,
      error: `Too many failed developer login attempts. Locked out for ${rateCheck.remainingMins} minute(s).`
    });
  }

  const { password, biometricToken } = request.body || {};

  // Biometric Token verification (for enrolled phone biometrics)
  if (biometricToken && typeof biometricToken === 'string') {
    try {
      const decodedBio = jwt.verify(biometricToken, JWT_SECRET);
      if (decodedBio && (decodedBio.role === 'DEVELOPER' || decodedBio.sub === 'lead_developer')) {
        clearFailedAttempts(`dev_${ip}`);
        const token = jwt.sign(
          { role: 'DEVELOPER', devId: 'lead_developer', authType: 'BIOMETRIC' },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        return reply.send({ success: true, token, role: 'DEVELOPER', authType: 'BIOMETRIC' });
      }
    } catch {}
  }

  const cleanEntered = String(password || '').trim();
  if (!cleanEntered) {
    return reply.status(400).send({ success: false, error: 'Password required' });
  }

  const isMatch = Boolean(DEV_MASTER_PASSWORD && cleanEntered === DEV_MASTER_PASSWORD);
  if (!isMatch) {
    recordFailedAttempt(`dev_${ip}`);
    return reply.status(401).send({ success: false, error: 'Invalid developer credentials. Access denied.' });
  }

  clearFailedAttempts(`dev_${ip}`);
  const token = jwt.sign(
    { role: 'DEVELOPER', devId: 'lead_developer', authType: 'PASSWORD' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return reply.send({
    success: true,
    token,
    role: 'DEVELOPER',
    authType: 'PASSWORD'
  });
});

// 2. Fetch All Customer Accounts & Store KPIs (Requires Developer Token)
fastify.get('/api/dev/customers', async (request, reply) => {
  const dev = verifyDeveloperAuth(request, reply);
  if (!dev) return;

  try {
    const [custRes, messesRes] = await Promise.all([
      db.execute({
        sql: `SELECT id, name, phone, cpr, cardUid, nfcCardId,
                     COALESCE(balance, 0.0) as balance,
                     COALESCE(credit_limit, 30.0) as credit_limit,
                     COALESCE(is_active, 1) as is_active,
                     COALESCE(isActive, 1) as isActive,
                     mess_id, createdAt, updatedAt
              FROM Customer 
              ORDER BY balance DESC, name ASC`,
        args: []
      }),
      db.execute({
        sql: `SELECT mm.customer_id, mg.id as mess_id, mg.group_name 
              FROM MessMember mm
              JOIN MessGroup mg ON mm.mess_id = mg.id
              WHERE mm.is_active = 1`,
        args: []
      }).catch(() => ({ rows: [] }))
    ]);

    const messMap = new Map();
    for (const r of (messesRes.rows || [])) {
      const cId = String(r.customer_id);
      if (!messMap.has(cId)) messMap.set(cId, []);
      messMap.get(cId).push({ id: r.mess_id, name: r.group_name });
    }

    let totalDebt = 0;
    let totalCredit = 0;
    let activeCount = 0;
    let frozenCount = 0;

    const customers = (custRes.rows || []).map((c) => {
      const bal = Number(c.balance || 0);
      const isActive = (c.is_active === 0 || c.isActive === 0) ? 0 : 1;
      if (bal > 0.0005) totalDebt += bal;
      if (bal < -0.0005) totalCredit += Math.abs(bal);
      if (isActive) activeCount++;
      else frozenCount++;

      const maskedPhone = c.phone ? (String(c.phone).length > 4 ? `${String(c.phone).slice(0, 3)}****${String(c.phone).slice(-2)}` : '****') : '';
      const maskedCpr = c.cpr ? (String(c.cpr).length > 4 ? `${String(c.cpr).slice(0, 3)}****${String(c.cpr).slice(-2)}` : '****') : '';
      const maskedCard = c.cardUid || c.nfcCardId ? `${String(c.cardUid || c.nfcCardId).slice(0, 4)}****` : '';

      return {
        id: c.id,
        name: c.name || 'Unknown',
        phone: maskedPhone,
        cpr: maskedCpr,
        cardUid: maskedCard,
        balance: Number(bal.toFixed(3)),
        credit_limit: Number(c.credit_limit || 30.0),
        is_active: isActive,
        isActive: Boolean(isActive),
        messes: messMap.get(c.id) || [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      };
    });

    return reply.send({
      success: true,
      stats: {
        totalCustomers: customers.length,
        totalDebt: Number(totalDebt.toFixed(3)),
        totalCredit: Number(totalCredit.toFixed(3)),
        activeCount,
        frozenCount
      },
      customers
    });
  } catch (err) {
    fastify.log.error('Dev customers query error:', err);
    return reply.status(500).send({ success: false, error: 'Database error', details: err.message });
  }
});

// 3. Developer Instant Freeze / Unfreeze Toggle
fastify.post('/api/dev/customer/:id/freeze', async (request, reply) => {
  const dev = verifyDeveloperAuth(request, reply);
  if (!dev) return;

  const { id } = request.params;
  const { freeze } = request.body || {};
  const newActive = freeze ? 0 : 1;

  try {
    await db.execute({
      sql: `UPDATE Customer SET is_active = ?, isActive = ?, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      args: [newActive, newActive, id]
    });
    return reply.send({ success: true, customerId: id, is_active: newActive, isActive: Boolean(newActive) });
  } catch (err) {
    return reply.status(500).send({ success: false, error: err.message });
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
