import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { ASKAR_OFFLINE_SALES_KEY, ASKAR_OFFLINE_KHATA_KEY } from '../constants/storage';

let sqliteConnection: SQLiteConnection | null = null;
let dbInstance: SQLiteDBConnection | null = null;
let initPromise: Promise<SQLiteDBConnection | null> | null = null;

/**
 * ⚡ Native Android SQLite Initialization
 * Binds directly to Android internal flash storage (/data/data/com.retail.pos/databases)
 * Immunizes offline retail transactions against WebView cache evictions and memory sweeps.
 */
export const initNativeOfflineStorage = async (): Promise<SQLiteDBConnection | null> => {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      if (!sqliteConnection) {
        sqliteConnection = new SQLiteConnection(CapacitorSQLite);
      }

      const dbName = 'askar_offline';
      const isConn = await sqliteConnection.isConnection(dbName, false);
      if (isConn.result) {
        dbInstance = await sqliteConnection.retrieveConnection(dbName, false);
      } else {
        dbInstance = await sqliteConnection.createConnection(dbName, false, 'no-encryption', 1, false);
      }

      const isOpen = await dbInstance.isDBOpen();
      if (!isOpen.result) {
        await dbInstance.open();
      }

      // 1. Create durable offline sales queue table in Android SQLite
      await dbInstance.execute(`
        CREATE TABLE IF NOT EXISTS offline_sales (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS offline_inventory_scans (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS offline_khata (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced INTEGER DEFAULT 0
        );
      `);

      console.log('⚡ [Native SQLite] Native Android SQLite initialized successfully on flash storage.');
      return dbInstance;
    } catch (err) {
      console.warn('⚠️ [Native SQLite] Failed to initialize SQLite storage:', err);
      dbInstance = null;
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};

/**
 * Retrieve the active Native SQLite database instance
 */
export const getNativeDb = async (): Promise<SQLiteDBConnection | null> => {
  if (dbInstance) return dbInstance;
  return await initNativeOfflineStorage();
};

/**
 * ⚡ Save Sale Offline (Durable Flash Memory with LocalStorage Fallback)
 * Writes directly to the Android SQLite database file when on device.
 */
export const saveSaleOffline = async (salePayload: any, providedDb?: SQLiteDBConnection | null): Promise<void> => {
  const db = providedDb || dbInstance || (await getNativeDb());

  // Guarantee unique primary key
  const saleId = salePayload.id || salePayload.invoiceNo || `sale_off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const normalizedPayload = {
    ...salePayload,
    id: saleId,
    offlineTimestamp: salePayload.offlineTimestamp || new Date().toISOString()
  };

  if (db && Capacitor.isNativePlatform()) {
    try {
      const sql = `INSERT OR REPLACE INTO offline_sales (id, payload, synced) VALUES (?, ?, 0);`;
      await db.run(sql, [saleId, JSON.stringify(normalizedPayload)]);
      console.log(`⚡ [Native SQLite] Sale ${saleId} durably saved to Android flash memory.`);
      return;
    } catch (sqliteErr) {
      console.warn('⚠️ [Native SQLite] Error saving to SQLite, falling back to localStorage:', sqliteErr);
    }
  }

  // Web fallback (used on Master PC browser or if SQLite encounters an error)
  try {
    const queue = JSON.parse(localStorage.getItem(ASKAR_OFFLINE_SALES_KEY) || '[]');
    // Avoid duplicate IDs in queue
    const filtered = queue.filter((s: any) => s.id !== saleId);
    filtered.push(normalizedPayload);
    localStorage.setItem(ASKAR_OFFLINE_SALES_KEY, JSON.stringify(filtered));
    console.log(`💾 [LocalStorage Fallback] Sale ${saleId} saved to browser storage queue.`);
  } catch (storageErr) {
    console.error('❌ CRITICAL: Failed to save sale to both SQLite and localStorage:', storageErr);
  }
};

/**
 * Fetch all pending offline sales across Native SQLite and localStorage
 */
export const getOfflineSales = async (providedDb?: SQLiteDBConnection | null): Promise<any[]> => {
  const db = providedDb || dbInstance || (await getNativeDb());
  const combined: any[] = [];
  const seenIds = new Set<string>();

  // 1. Read from Native SQLite if on device
  if (db && Capacitor.isNativePlatform()) {
    try {
      const res = await db.query('SELECT id, payload, timestamp FROM offline_sales WHERE synced = 0 ORDER BY timestamp ASC;');
      if (res.values && Array.isArray(res.values)) {
        for (const row of res.values) {
          try {
            const item = JSON.parse(row.payload);
            if (item && item.id) {
              combined.push(item);
              seenIds.add(item.id);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('⚠️ [Native SQLite] Error querying offline sales:', err);
    }
  }

  // 2. Read from localStorage fallback
  try {
    const rawLocal = localStorage.getItem(ASKAR_OFFLINE_SALES_KEY);
    if (rawLocal) {
      const localQueue = JSON.parse(rawLocal);
      if (Array.isArray(localQueue)) {
        for (const item of localQueue) {
          if (item && item.id && !seenIds.has(item.id)) {
            combined.push(item);
            seenIds.add(item.id);
          }
        }
      }
    }
  } catch {}

  return combined;
};

/**
 * Mark or remove synced sales from storage
 */
export const markOfflineSalesSynced = async (saleIds: string[], providedDb?: SQLiteDBConnection | null): Promise<void> => {
  if (!saleIds || saleIds.length === 0) return;
  const db = providedDb || dbInstance || (await getNativeDb());

  // 1. Delete synced rows from Native SQLite
  if (db && Capacitor.isNativePlatform()) {
    try {
      for (const id of saleIds) {
        await db.run('DELETE FROM offline_sales WHERE id = ?;', [id]);
      }
      console.log(`⚡ [Native SQLite] Purged ${saleIds.length} synced sales from SQLite.`);
    } catch (err) {
      console.warn('⚠️ [Native SQLite] Error purging synced sales:', err);
    }
  }

  // 2. Clean from localStorage
  try {
    const rawLocal = localStorage.getItem(ASKAR_OFFLINE_SALES_KEY);
    if (rawLocal) {
      const localQueue = JSON.parse(rawLocal);
      if (Array.isArray(localQueue)) {
        const idSet = new Set(saleIds);
        const remaining = localQueue.filter((item: any) => !idSet.has(item.id));
        localStorage.setItem(ASKAR_OFFLINE_SALES_KEY, JSON.stringify(remaining));
      }
    }
  } catch {}
};

/**
 * Get count of pending unsynced offline transactions
 */
export const getOfflineSalesCount = async (providedDb?: SQLiteDBConnection | null): Promise<number> => {
  const sales = await getOfflineSales(providedDb);
  return sales.length;
};

/**
 * ⚡ Save Offline Khata Charge Event (Append-Only CRDT Delta)
 */
export const saveOfflineKhataCharge = async (
  chargePayload: { id?: string; customerId: string; amount: number; invoiceNo?: string; timestamp?: string },
  providedDb?: SQLiteDBConnection | null
): Promise<string> => {
  const db = providedDb || dbInstance || (await getNativeDb());
  const eventId = chargePayload.id || `khata_off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const normalizedPayload = {
    ...chargePayload,
    id: eventId,
    timestamp: chargePayload.timestamp || new Date().toISOString()
  };

  if (db && Capacitor.isNativePlatform()) {
    try {
      const sql = `INSERT OR REPLACE INTO offline_khata (id, payload, synced) VALUES (?, ?, 0);`;
      await db.run(sql, [eventId, JSON.stringify(normalizedPayload)]);
      console.log(`⚡ [Native SQLite] Khata charge event ${eventId} saved to Android flash memory.`);
      return eventId;
    } catch (sqliteErr) {
      console.warn('⚠️ [Native SQLite] Error saving Khata event, falling back to localStorage:', sqliteErr);
    }
  }

  // Web fallback (used on Master PC browser)
  try {
    const queue = JSON.parse(localStorage.getItem(ASKAR_OFFLINE_KHATA_KEY) || '[]');
    const filtered = queue.filter((item: any) => item.id !== eventId);
    filtered.push(normalizedPayload);
    localStorage.setItem(ASKAR_OFFLINE_KHATA_KEY, JSON.stringify(filtered));
    console.log(`💾 [LocalStorage Fallback] Khata charge ${eventId} saved to browser queue.`);
  } catch (storageErr) {
    console.error('❌ CRITICAL: Failed to save Khata charge to offline queue:', storageErr);
  }

  return eventId;
};

/**
 * Fetch all pending offline Khata charge events
 */
export const getOfflineKhataEvents = async (providedDb?: SQLiteDBConnection | null): Promise<any[]> => {
  const db = providedDb || dbInstance || (await getNativeDb());
  const combined: any[] = [];
  const seenIds = new Set<string>();

  // 1. Native SQLite
  if (db && Capacitor.isNativePlatform()) {
    try {
      const res = await db.query('SELECT id, payload, timestamp FROM offline_khata WHERE synced = 0 ORDER BY timestamp ASC;');
      if (res.values && Array.isArray(res.values)) {
        for (const row of res.values) {
          try {
            const item = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
            const eventId = item.id || row.id;
            if (eventId && !seenIds.has(eventId)) {
              combined.push({ ...item, id: eventId, dbId: row.id });
              seenIds.add(eventId);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.warn('⚠️ [Native SQLite] Error reading offline Khata events:', err);
    }
  }

  // 2. LocalStorage Fallback
  try {
    const rawLocal = localStorage.getItem(ASKAR_OFFLINE_KHATA_KEY);
    if (rawLocal) {
      const localQueue = JSON.parse(rawLocal);
      if (Array.isArray(localQueue)) {
        for (const item of localQueue) {
          if (item && item.id && !seenIds.has(item.id)) {
            combined.push(item);
            seenIds.add(item.id);
          }
        }
      }
    }
  } catch {}

  return combined;
};

/**
 * Mark offline Khata event as synced
 */
export const markOfflineKhataSynced = async (eventId: string, providedDb?: SQLiteDBConnection | null): Promise<void> => {
  if (!eventId) return;
  const db = providedDb || dbInstance || (await getNativeDb());

  // 1. Native SQLite
  if (db && Capacitor.isNativePlatform()) {
    try {
      await db.run('UPDATE offline_khata SET synced = 1 WHERE id = ?;', [eventId]);
      console.log(`⚡ [Native SQLite] Khata charge ${eventId} marked as synced.`);
    } catch (err) {
      console.warn('⚠️ [Native SQLite] Error updating synced status:', err);
    }
  }

  // 2. LocalStorage Fallback
  try {
    const rawLocal = localStorage.getItem(ASKAR_OFFLINE_KHATA_KEY);
    if (rawLocal) {
      const localQueue = JSON.parse(rawLocal);
      if (Array.isArray(localQueue)) {
        const remaining = localQueue.filter((item: any) => item.id !== eventId);
        localStorage.setItem(ASKAR_OFFLINE_KHATA_KEY, JSON.stringify(remaining));
      }
    }
  } catch {}
};


