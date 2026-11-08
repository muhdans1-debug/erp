// ====================================================================
// ASKAR SUPERMARKET ERP - SINGLETON LIBSQL CLIENT & STORAGE ENGINE
// Replaces Prisma & Dev.db with a Single Unified Embedded Replica (local.db)
// ====================================================================

import { createClient } from '@libsql/client';
import path from 'path';
import fs from 'fs';
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
    } catch {}
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

if (!url || !authToken) {
  console.error("❌ CRITICAL: Turso credentials missing from .env file.");
  process.exit(1); // Kill the server if secrets are missing
}

// Safe Initialization: Allow LibSQL and SQLite WAL engine to handle recovery natively without deleting local.db
// Compute relative file URL path for Windows/Unix cross-platform compatibility
let relPath = path.relative(process.cwd(), localDbPath).replace(/\\/g, '/');
if (!relPath.startsWith('.') && !relPath.startsWith('/')) relPath = './' + relPath;
const localDbUrl = `file:${relPath}`;

// 1. Initialize the Singleton LibSQL Embedded Replica Client
export const client = createClient({
  url: localDbUrl,
  syncUrl: url,
  authToken: authToken,
  syncInterval: 0, // Keep at 0 to prevent WAL collisions during schema migrations
});

console.log("🔒 Database client initialized securely via environment variables.");

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

// Atomic transaction support with .orm attached
const nativeTransaction = client.transaction.bind(client);
db.transaction = async (callbackOrMode = 'write') => {
  if (typeof callbackOrMode === 'function') {
    const tx = await nativeTransaction('write');
    tx.orm = ormHandler(tx);
    try {
      const result = await callbackOrMode(tx);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } else {
    const tx = await nativeTransaction(callbackOrMode);
    tx.orm = ormHandler(tx);
    return tx;
  }
};

// Auto-run schema initialization
export async function initDatabase() {
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
    if (!colNames.has('is_weighed_item')) {
      await client.execute("ALTER TABLE Product ADD COLUMN is_weighed_item INTEGER DEFAULT 0");
      console.log('✅ [Migration] Added missing is_weighed_item column to Product');
    }
  } catch (migErr) {
    console.warn('⚠️ [Migration] Column check notice:', migErr.message);
  }
}

export default db;
