// ====================================================================
// ASKAR SUPERMARKET ERP - SINGLETON LIBSQL CLIENT & STORAGE ENGINE
// Replaces Prisma & Dev.db with a Single Unified Embedded Replica (local.db)
// ====================================================================

import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatic Environment Configuration Loader (.env) before LibSQL initialization
const envCandidatePaths = [
  path.resolve(__dirname, '.env'),
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
    } catch { }
  }
}

export const dataDir = process.env.ASKAR_DATA_PATH || __dirname;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const localDbPath = path.resolve(dataDir, 'local.db');

// Resolve cloud credentials
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

// Safe Initialization: Allow LibSQL and SQLite WAL engine to handle recovery natively without deleting local.db
// Compute relative file URL path for Windows/Unix cross-platform compatibility
let relPath = path.relative(process.cwd(), localDbPath).replace(/\\/g, '/');
if (!relPath.startsWith('.') && !relPath.startsWith('/')) relPath = './' + relPath;
const localDbUrl = `file:${relPath}`;

// 1. Initialize the Singleton LibSQL Client (Embedded Replica if valid credentials present & enabled, pure local SQLite by default)
let clientConfig = {
  url: localDbUrl,
  syncInterval: 0,
};

const isWellFormedJwt = typeof authToken === 'string' && authToken.split('.').length === 3;
if (url && isWellFormedJwt && process.env.ENABLE_TURSO_REPLICA === 'true') {
  clientConfig.syncUrl = url;
  clientConfig.authToken = authToken;
  console.log("🔒 Database client initialized with Turso Cloud replica.");
} else {
  console.log("⚡ Database client running in high-performance standalone local SQLite mode (local.db).");
}

export const client = createClient(clientConfig);
// Immediately set SQLite busy timeout to 10s to eliminate SQLITE_BUSY lockouts under concurrent traffic
client.execute('PRAGMA busy_timeout = 10000;').catch(() => { });

/**
 * Resilient HTTPS fetch adapter for LibSQL client on Windows.
 * Explicitly provides SNI (servername) to prevent AWS ALB/Turso TLS handshake resets.
 */
export async function resilientHttpsFetch(input, init = {}) {
  let urlStr = typeof input === 'string' ? input : (input?.url || '');
  let method = init.method || input?.method || 'GET';
  let headers = {};
  if (input?.headers) {
    if (typeof input.headers.forEach === 'function') {
      input.headers.forEach((v, k) => { headers[k] = v; });
    } else {
      headers = { ...input.headers };
    }
  }
  if (init.headers) {
    headers = { ...headers, ...init.headers };
  }
  let body = init.body;
  if (body === undefined && input && typeof input.text === 'function') {
    body = await input.text();
  }

  let bodyBuffer = null;
  if (body !== undefined && body !== null) {
    bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    headers['content-length'] = Buffer.byteLength(bodyBuffer);
  }

  const maxRetries = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const req = https.request({
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method,
          servername: u.hostname,
          headers: {
            ...headers,
            'host': u.hostname,
            'user-agent': '@libsql/client-resilient',
            'connection': 'close'
          },
          timeout: 30000
        }, (res) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const bodyText = Buffer.concat(chunks).toString();
            resolve({
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: new Headers(res.headers),
              text: async () => bodyText,
              json: async () => JSON.parse(bodyText)
            });
          });
        });

        req.on('timeout', () => {
          req.destroy(new Error('HTTPS request timed out after 30s'));
        });
        req.on('error', reject);

        if (bodyBuffer) {
          req.write(bodyBuffer);
        }
        req.end();
      });

      return response;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }
  }

  throw lastErr;
}

// 2. Direct Cloud Client for background non-blocking mirroring & cloud health
export let tursoCloudClient = null;
if (url && authToken) {
  try {
    const cloudHttpsUrl = url.replace(/^libsql:\/\//, 'https://');
    tursoCloudClient = createClient({
      url: cloudHttpsUrl,
      authToken,
      fetch: resilientHttpsFetch
    });
    console.log("☁️ [Turso] Direct Cloud client initialized with resilient HTTPS SNI adapter.");
  } catch (cloudErr) {
    console.warn("⚠️ [Turso] Could not initialize direct cloud client:", cloudErr.message);
  }
}

const IDENTIFIER_REGEX = /^[a-zA-Z0-9_]+$/;
function validateIdentifier(ident) {
  if (typeof ident !== 'string' || !IDENTIFIER_REGEX.test(ident)) {
    throw new Error(`Invalid SQL identifier: ${ident}`);
  }
  return ident;
}

function formatArg(val) {
  if (val === undefined || val === null) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
}

function createChainablePromise(fn) {
  const p = fn();
  p.first = async () => {
    const rows = await p;
    return (rows && rows.length > 0) ? rows[0] : null;
  };
  return p;
}

/**
 * Strict Parameterized ORM Helper
 * Guarantees that ALL values are safely isolated in the LibSQL engine args array
 * and never concatenated into raw SQL strings.
 */
export const orm = {
  /**
   * SECURE SELECT
   * Generates: SELECT * FROM table WHERE col1 = ? AND col2 = ?
   */
  where: async (table, conditions = {}) => {
    validateIdentifier(table);
    const keys = Object.keys(conditions).filter(k => conditions[k] !== undefined);
    const args = [];

    const whereClauses = keys.map((key) => {
      validateIdentifier(key);
      args.push(formatArg(conditions[key])); // Push actual value into secure args array
      return `"${key}" = ?`;                 // Use strict placeholder
    });

    const sql = whereClauses.length > 0
      ? `SELECT * FROM "${table}" WHERE ${whereClauses.join(' AND ')}`
      : `SELECT * FROM "${table}"`;

    const result = await client.execute({ sql, args });
    return result.rows || [];
  },

  /**
   * SECURE INSERT
   * Generates: INSERT INTO table (col1, col2) VALUES (?, ?)
   */
  insert: async (table, data) => {
    validateIdentifier(table);
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    const args = [];
    const cols = keys.map(k => {
      validateIdentifier(k);
      args.push(formatArg(data[k]));
      return `"${k}"`;
    });
    const placeholders = keys.map(() => '?').join(', ');

    const sql = `INSERT INTO "${table}" (${cols.join(', ')}) VALUES (${placeholders})`;

    const result = await client.execute({ sql, args });
    return result;
  },

  /**
   * SECURE UPDATE
   * Generates: UPDATE table SET col1 = ?, col2 = ? WHERE id = ?
   */
  update: async (table, id, data) => {
    validateIdentifier(table);
    const keys = Object.keys(data).filter(k => data[k] !== undefined);
    const args = [];

    const setClauses = keys.map((key) => {
      validateIdentifier(key);
      args.push(formatArg(data[key]));
      return `"${key}" = ?`;
    });

    // Add the ID for the WHERE clause at the end of the args array
    args.push(formatArg(id));

    const sql = `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE id = ?`;

    const result = await client.execute({ sql, args });
    return result;
  }
};

// Model query builder for seamless backward compatibility without Prisma
function createModelHelper(clientInstance, tableName) {
  validateIdentifier(tableName);
  return {
    all() {
      return createChainablePromise(async () => {
        const res = await clientInstance.execute(`SELECT * FROM "${tableName}"`);
        const rows = res.rows || [];
        rows.first = () => (rows.length > 0 ? rows[0] : null);
        return rows;
      });
    },
    async first() {
      const res = await clientInstance.execute(`SELECT * FROM "${tableName}" LIMIT 1`);
      return (res.rows && res.rows.length > 0) ? res.rows[0] : null;
    },
    where(conditions = {}) {
      return {
        all() {
          return createChainablePromise(async () => {
            const keys = Object.keys(conditions).filter(k => conditions[k] !== undefined);
            if (keys.length === 0) {
              const res = await clientInstance.execute(`SELECT * FROM "${tableName}"`);
              const rows = res.rows || [];
              rows.first = () => (rows.length > 0 ? rows[0] : null);
              return rows;
            }
            const args = [];
            const whereClause = keys.map(k => {
              validateIdentifier(k);
              args.push(formatArg(conditions[k]));
              return `"${k}" = ?`;
            }).join(' AND ');
            const res = await clientInstance.execute({
              sql: `SELECT * FROM "${tableName}" WHERE ${whereClause}`,
              args
            });
            const rows = res.rows || [];
            rows.first = () => (rows.length > 0 ? rows[0] : null);
            return rows;
          });
        },
        async first() {
          const keys = Object.keys(conditions).filter(k => conditions[k] !== undefined);
          if (keys.length === 0) {
            const res = await clientInstance.execute(`SELECT * FROM "${tableName}" LIMIT 1`);
            return (res.rows && res.rows.length > 0) ? res.rows[0] : null;
          }
          const args = [];
          const whereClause = keys.map(k => {
            validateIdentifier(k);
            args.push(formatArg(conditions[k]));
            return `"${k}" = ?`;
          }).join(' AND ');
          const res = await clientInstance.execute({
            sql: `SELECT * FROM "${tableName}" WHERE ${whereClause} LIMIT 1`,
            args
          });
          return (res.rows && res.rows.length > 0) ? res.rows[0] : null;
        },
        async update(data) {
          const setKeys = Object.keys(data).filter(k => data[k] !== undefined);
          if (setKeys.length === 0) return { rowsAffected: 0 };
          const args = [];
          const setClause = setKeys.map(k => {
            validateIdentifier(k);
            args.push(formatArg(data[k]));
            return `"${k}" = ?`;
          }).join(', ');
          const condKeys = Object.keys(conditions).filter(k => conditions[k] !== undefined);
          const whereClause = condKeys.length > 0
            ? condKeys.map(k => {
              validateIdentifier(k);
              args.push(formatArg(conditions[k]));
              return `"${k}" = ?`;
            }).join(' AND ')
            : '1=1';
          return await clientInstance.execute({
            sql: `UPDATE "${tableName}" SET ${setClause} WHERE ${whereClause}`,
            args
          });
        },
        async delete() {
          const condKeys = Object.keys(conditions).filter(k => conditions[k] !== undefined);
          const args = [];
          const whereClause = condKeys.length > 0
            ? condKeys.map(k => {
              validateIdentifier(k);
              args.push(formatArg(conditions[k]));
              return `"${k}" = ?`;
            }).join(' AND ')
            : '1=1';
          return await clientInstance.execute({
            sql: `DELETE FROM "${tableName}" WHERE ${whereClause}`,
            args
          });
        }
      };
    },
    async create(data) {
      const keys = Object.keys(data).filter(k => data[k] !== undefined);
      const args = [];
      const cols = keys.map(k => {
        validateIdentifier(k);
        args.push(formatArg(data[k]));
        return `"${k}"`;
      });
      const placeholders = keys.map(() => '?').join(', ');
      await clientInstance.execute({
        sql: `INSERT INTO "${tableName}" (${cols.join(', ')}) VALUES (${placeholders})`,
        args
      });
      return data;
    }
  };
}

export const ormHandler = (clientInstance) => new Proxy({}, {
  get(target, prop) {
    if (typeof prop === 'string') {
      return createModelHelper(clientInstance, prop);
    }
    return target[prop];
  }
});

// Unified db object
export const db = client;
db.orm = ormHandler(client);

// Atomic transaction support with .orm attached & SQLite busy retry resilience
const nativeTransaction = client.transaction.bind(client);
const getTxWithRetry = async (mode) => {
  let retries = 5;
  while (retries > 0) {
    try {
      return await nativeTransaction(mode);
    } catch (err) {
      if (err.message && err.message.includes('SQLITE_BUSY') && retries > 1) {
        retries--;
        await new Promise(res => setTimeout(res, 150));
        continue;
      }
      throw err;
    }
  }
};

db.transaction = async (callbackOrMode = 'write') => {
  if (typeof callbackOrMode === 'function') {
    const tx = await getTxWithRetry('write');
    tx.orm = ormHandler(tx);
    try {
      const result = await callbackOrMode(tx);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback().catch(() => { });
      throw err;
    }
  } else {
    const tx = await getTxWithRetry(callbackOrMode);
    tx.orm = ormHandler(tx);
    return tx;
  }
};

// Auto-run schema initialization
export async function initDatabase() {
  // Pure standalone local SQLite mode / replica safety checks
  try {
    await client.execute('PRAGMA busy_timeout = 10000;');
    await client.execute('PRAGMA foreign_keys = ON;');
    await client.execute('PRAGMA journal_mode = WAL;');
    console.log('🔒 [LibSQL] PRAGMA busy_timeout = 10000, foreign_keys = ON & WAL mode activated.');
  } catch (pragmaErr) {
    console.warn('⚠️ [LibSQL] PRAGMA setup notice:', pragmaErr.message);
  }

  const isReplica = Boolean(clientConfig.syncUrl);
  if (!isReplica) {
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      try {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.executeMultiple(schemaSql);
        console.log('✅ [LibSQL] Embedded database schema verified on local.db');
      } catch (err) {
        console.warn('⚠️ [LibSQL] Schema verification warning:', err.message);
      }
    }
  }

  // Schema migrations for Product table
  try {
    const info = await client.execute('PRAGMA table_info(Product)');
    const colNames = new Set((info.rows || []).map(r => r.name));
    if (!colNames.has('category')) {
      await client.execute("ALTER TABLE Product ADD COLUMN category TEXT DEFAULT 'GROCERY'");
      console.log('✅ [Migration] Added missing category column to Product');
    }
    if (!colNames.has('image_url')) {
      await client.execute("ALTER TABLE Product ADD COLUMN image_url TEXT");
      console.log('✅ [Migration] Added missing image_url column to Product');
    }
    if (!colNames.has('image_url_thumb')) {
      await client.execute("ALTER TABLE Product ADD COLUMN image_url_thumb TEXT");
      console.log('✅ [Migration] Added missing image_url_thumb column to Product');
    }
    if (!colNames.has('is_weighed_item')) {
      await client.execute("ALTER TABLE Product ADD COLUMN is_weighed_item INTEGER DEFAULT 0");
      console.log('✅ [Migration] Added missing is_weighed_item column to Product');
    }
    // High-speed search performance indexes
    await client.execute("CREATE INDEX IF NOT EXISTS idx_product_barcode ON Product(barcode);");
    await client.execute("CREATE INDEX IF NOT EXISTS idx_product_name ON Product(name);");
    await client.execute("CREATE INDEX IF NOT EXISTS idx_product_distributorId ON Product(distributorId);");
    console.log('✅ [Indexes] Product search indexes verified (barcode, name, distributorId).');

    // Schema migrations for Customer table (Card Deposit & Payday Cash Advance)
    const custInfo = await client.execute('PRAGMA table_info(Customer)');
    const custCols = new Set((custInfo.rows || []).map(r => r.name));
    if (!custCols.has('card_deposit_amount')) {
      await client.execute("ALTER TABLE Customer ADD COLUMN card_deposit_amount REAL DEFAULT 0.000");
      console.log('✅ [Migration] Added card_deposit_amount to Customer');
    }
    if (!custCols.has('card_deposit_status')) {
      await client.execute("ALTER TABLE Customer ADD COLUMN card_deposit_status TEXT DEFAULT 'NONE'");
      console.log('✅ [Migration] Added card_deposit_status to Customer');
    }
    if (!custCols.has('card_deposit_receipt_no')) {
      await client.execute("ALTER TABLE Customer ADD COLUMN card_deposit_receipt_no TEXT");
      console.log('✅ [Migration] Added card_deposit_receipt_no to Customer');
    }
    if (!custCols.has('card_deposit_date')) {
      await client.execute("ALTER TABLE Customer ADD COLUMN card_deposit_date TEXT");
      console.log('✅ [Migration] Added card_deposit_date to Customer');
    }
    if (!custCols.has('card_type')) {
      await client.execute("ALTER TABLE Customer ADD COLUMN card_type TEXT DEFAULT 'PHYSICAL_NFC'");
      console.log('✅ [Migration] Added card_type to Customer');
    }
    if (!custCols.has('payday_day_of_month')) {
      await client.execute("ALTER TABLE Customer ADD COLUMN payday_day_of_month INTEGER DEFAULT 28");
      console.log('✅ [Migration] Added payday_day_of_month to Customer');
    }
    if (!custCols.has('cash_advance_balance')) {
      await client.execute("ALTER TABLE Customer ADD COLUMN cash_advance_balance REAL DEFAULT 0.000");
      console.log('✅ [Migration] Added cash_advance_balance to Customer');
    }

    // Ensure DeletedProduct tombstone table exists
    await client.execute(`CREATE TABLE IF NOT EXISTS DeletedProduct (
      id TEXT PRIMARY KEY,
      barcode TEXT,
      tenantId TEXT,
      name TEXT,
      deletedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Retail & Operational Analytics Tables
    await client.execute(`CREATE TABLE IF NOT EXISTS CheckoutVelocityLog (
      id TEXT PRIMARY KEY,
      shiftId TEXT,
      cashierId TEXT,
      cashierName TEXT,
      terminalId TEXT,
      invoiceNo TEXT,
      itemCount INTEGER,
      totalAmount REAL,
      scanDurationSec INTEGER,
      tenderDurationSec INTEGER,
      tenderType TEXT,
      itemsPerMinute REAL,
      hadVoidItems INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS DrawerActuationLog (
      id TEXT PRIMARY KEY,
      shiftId TEXT,
      cashierId TEXT,
      cashierName TEXT,
      terminalId TEXT,
      reason TEXT,
      authorizedBy TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS PostTenderVoidAlert (
      id TEXT PRIMARY KEY,
      saleId TEXT,
      invoiceNo TEXT,
      totalAmount REAL,
      paymentType TEXT,
      cashierId TEXT,
      cashierName TEXT,
      saleCreatedAt DATETIME,
      voidedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      timeDeltaSeconds INTEGER,
      reason TEXT,
      status TEXT DEFAULT 'FLAGGED'
    )`);

    // Time-Travel Mutation CDC & Surgical Rollback Table
    await client.execute(`CREATE TABLE IF NOT EXISTS SystemMutationSnapshot (
      snapshotId TEXT PRIMARY KEY,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      mutationType TEXT NOT NULL,
      beforeState TEXT NOT NULL,
      afterState TEXT NOT NULL,
      authorPin TEXT NOT NULL,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      isReverted INTEGER DEFAULT 0,
      revertedAt DATETIME
    )`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_snapshot_entity ON SystemMutationSnapshot(entityType, entityId);`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_snapshot_created ON SystemMutationSnapshot(createdAt);`);

    // System Health & Downtime Analytics Tables
    await client.execute(`CREATE TABLE IF NOT EXISTS SystemHourlyHealth (
      id TEXT PRIMARY KEY,
      hourTimestamp DATETIME NOT NULL,
      hourLabel TEXT NOT NULL,
      totalTransactions INTEGER DEFAULT 0,
      totalScans INTEGER DEFAULT 0,
      totalItemsRung INTEGER DEFAULT 0,
      totalSalesBhd REAL DEFAULT 0.0,
      p50LatencyMs REAL DEFAULT 0.0,
      p95LatencyMs REAL DEFAULT 0.0,
      p99LatencyMs REAL DEFAULT 0.0,
      avgSqliteLockMs REAL DEFAULT 0.0,
      maxSqliteLockMs REAL DEFAULT 0.0,
      walSizeKb REAL DEFAULT 0.0,
      cloudSyncLatencyMs REAL DEFAULT 0.0,
      errorCount INTEGER DEFAULT 0,
      downtimeSeconds INTEGER DEFAULT 0,
      uptimePercentage REAL DEFAULT 100.0,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_hourly_health_ts ON SystemHourlyHealth(hourTimestamp);`);

    await client.execute(`CREATE TABLE IF NOT EXISTS SystemDowntimeIncident (
      id TEXT PRIMARY KEY,
      startTime DATETIME NOT NULL,
      endTime DATETIME,
      durationSeconds INTEGER,
      component TEXT NOT NULL,
      severity TEXT NOT NULL,
      triggerSource TEXT NOT NULL,
      rootCauseReason TEXT NOT NULL,
      technicalDetails TEXT,
      autoHealed INTEGER DEFAULT 1,
      recoveryAction TEXT,
      salesImpactSummary TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_incident_start ON SystemDowntimeIncident(startTime);`);
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_incident_comp ON SystemDowntimeIncident(component);`);
  } catch (migErr) {
    console.warn('⚠️ [Migration] Column check notice:', migErr.message);
  }
}

export default db;
