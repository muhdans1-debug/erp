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
const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

// Safe Initialization: Allow LibSQL and SQLite WAL engine to handle recovery natively without deleting local.db
// Compute relative file URL path for Windows/Unix cross-platform compatibility
let relPath = path.relative(process.cwd(), localDbPath).replace(/\\/g, '/');
if (!relPath.startsWith('.') && !relPath.startsWith('/')) relPath = './' + relPath;
const localDbUrl = `file:${relPath}`;

// 1. Initialize the Singleton LibSQL Embedded Replica Client
export const client = createClient({
  url: localDbUrl,
  syncUrl: TURSO_URL,
  authToken: TURSO_AUTH_TOKEN,
  syncInterval: 60, // Automatic background sync every 60 seconds
});

console.log('✅ LibSQL Database Initialized Safely');

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

// Model query builder for seamless backward compatibility without Prisma
function createModelHelper(clientInstance, tableName) {
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
            const whereClause = keys.map(k => `"${k}" = ?`).join(' AND ');
            const args = keys.map(k => formatArg(conditions[k]));
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
          const whereClause = keys.map(k => `"${k}" = ?`).join(' AND ');
          const args = keys.map(k => formatArg(conditions[k]));
          const res = await clientInstance.execute({
            sql: `SELECT * FROM "${tableName}" WHERE ${whereClause} LIMIT 1`,
            args
          });
          return (res.rows && res.rows.length > 0) ? res.rows[0] : null;
        },
        async update(data) {
          const setKeys = Object.keys(data).filter(k => data[k] !== undefined);
          if (setKeys.length === 0) return { rowsAffected: 0 };
          const setClause = setKeys.map(k => `"${k}" = ?`).join(', ');
          const condKeys = Object.keys(conditions).filter(k => conditions[k] !== undefined);
          const whereClause = condKeys.length > 0 ? condKeys.map(k => `"${k}" = ?`).join(' AND ') : '1=1';
          const args = [
            ...setKeys.map(k => formatArg(data[k])),
            ...condKeys.map(k => formatArg(conditions[k]))
          ];
          return await clientInstance.execute({
            sql: `UPDATE "${tableName}" SET ${setClause} WHERE ${whereClause}`,
            args
          });
        },
        async delete() {
          const condKeys = Object.keys(conditions).filter(k => conditions[k] !== undefined);
          const whereClause = condKeys.length > 0 ? condKeys.map(k => `"${k}" = ?`).join(' AND ') : '1=1';
          const args = condKeys.map(k => formatArg(conditions[k]));
          return await clientInstance.execute({
            sql: `DELETE FROM "${tableName}" WHERE ${whereClause}`,
            args
          });
        }
      };
    },
    async create(data) {
      const keys = Object.keys(data).filter(k => data[k] !== undefined);
      const cols = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const args = keys.map(k => formatArg(data[k]));
      await clientInstance.execute({
        sql: `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`,
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
}

export default db;
