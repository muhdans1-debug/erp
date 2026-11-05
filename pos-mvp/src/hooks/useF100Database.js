import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'f100_offline_db';
const TABLE_NAME = 'local_pim_intake';

// Singleton connection reference across component re-renders
let sqliteConnection = null;
let activeDb = null;

// IndexedDB Fallback for Browser/Dev environments
const openIndexedDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(TABLE_NAME)) {
        const store = idb.createObjectStore(TABLE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('sync_status', 'sync_status', { unique: false });
        store.createIndex('barcode', 'barcode', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export function useF100Database() {
  const [isReady, setIsReady] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const isInitializingRef = useRef(false);

  // Initialize Native SQLite or IndexedDB Fallback
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      if (isInitializingRef.current || activeDb) {
        if (isMounted) setIsReady(true);
        return;
      }
      isInitializingRef.current = true;

      const native = Capacitor.isNativePlatform();
      setIsNative(native);

      try {
        if (native) {
          // Native Capacitor SQLite Engine
          if (!sqliteConnection) {
            sqliteConnection = new SQLiteConnection(CapacitorSQLite);
          }

          // Check consistency to avoid stale connection leaks
          try {
            await sqliteConnection.checkConnectionsConsistency();
          } catch {}

          const isConn = await sqliteConnection.isConnection(DB_NAME, false);
          let connection;
          if (isConn.result) {
            connection = await sqliteConnection.retrieveConnection(DB_NAME, false);
          } else {
            connection = await sqliteConnection.createConnection(DB_NAME, false, 'no-encryption', 1, false);
          }

          const isOpen = await connection.isDBOpen();
          if (!isOpen.result) {
            await connection.open();
          }

          // Create the persistent local intake table
          const createTableQuery = `
            CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              local_uuid TEXT,
              barcode TEXT NOT NULL,
              name TEXT,
              payload TEXT NOT NULL,
              image_base64 TEXT,
              sync_status INTEGER DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              synced_at DATETIME
            );
          `;
          await connection.execute(createTableQuery);

          activeDb = {
            type: 'sqlite',
            raw: connection,
            run: async (statement, values = []) => connection.run(statement, values),
            query: async (statement, values = []) => connection.query(statement, values),
            execute: async (statement) => connection.execute(statement)
          };
        } else {
          // Browser / Dev fallback using IndexedDB
          const idb = await openIndexedDB();
          activeDb = {
            type: 'indexeddb',
            raw: idb,
            run: async (query, values = []) => {
              // Parse basic INSERT into IndexedDB
              return new Promise((resolve, reject) => {
                const tx = idb.transaction(TABLE_NAME, 'readwrite');
                const store = tx.objectStore(TABLE_NAME);
                const req = store.add({
                  barcode: values[0] || '',
                  name: values[1] || '',
                  payload: values[2] || '{}',
                  image_base64: values[3] || null,
                  sync_status: values[4] !== undefined ? values[4] : 0,
                  created_at: new Date().toISOString()
                });
                req.onsuccess = () => resolve({ changes: { changes: 1, lastId: req.result } });
                req.onerror = () => reject(req.error);
              });
            },
            query: async (statement) => {
              return new Promise((resolve, reject) => {
                const tx = idb.transaction(TABLE_NAME, 'readonly');
                const store = tx.objectStore(TABLE_NAME);
                const req = store.getAll();
                req.onsuccess = () => {
                  const items = req.result || [];
                  if (statement.includes('sync_status = 0')) {
                    resolve({ values: items.filter((i) => i.sync_status === 0) });
                  } else {
                    resolve({ values: items });
                  }
                };
                req.onerror = () => reject(req.error);
              });
            },
            execute: async () => true
          };
        }

        if (isMounted) {
          setIsReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize local F100 database:', err);
      } finally {
        isInitializingRef.current = false;
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  // Refresh unsynced count from local DB
  const refreshUnsyncedCount = useCallback(async () => {
    if (!activeDb) return 0;
    try {
      if (activeDb.type === 'sqlite') {
        const res = await activeDb.query(
          `SELECT COUNT(*) as count FROM ${TABLE_NAME} WHERE sync_status = 0;`
        );
        const count = res?.values?.[0]?.count ?? res?.values?.[0]?.['COUNT(*)'] ?? 0;
        setUnsyncedCount(Number(count));
        return Number(count);
      } else {
        const res = await activeDb.query(`SELECT * FROM ${TABLE_NAME} WHERE sync_status = 0;`);
        const count = (res?.values || []).length;
        setUnsyncedCount(count);
        return count;
      }
    } catch (e) {
      console.warn('Error reading unsynced count:', e);
      return 0;
    }
  }, []);

  // Update count whenever DB becomes ready
  useEffect(() => {
    if (isReady) {
      refreshUnsyncedCount();
    }
  }, [isReady, refreshUnsyncedCount]);

  // Insert item into local SQLite / IndexedDB
  const saveIntakeItem = useCallback(
    async ({ barcode, name, payload, imageBase64 }) => {
      if (!activeDb) throw new Error('Local database not ready');

      const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const cleanBarcode = (barcode || '').trim();
      const cleanName = (name || '').trim();

      if (activeDb.type === 'sqlite') {
        const query = `
          INSERT INTO ${TABLE_NAME} (barcode, name, payload, image_base64, sync_status, created_at)
          VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP);
        `;
        const res = await activeDb.run(query, [cleanBarcode, cleanName, serializedPayload, imageBase64 || null]);
        await refreshUnsyncedCount();
        return res;
      } else {
        const res = await activeDb.run('', [cleanBarcode, cleanName, serializedPayload, imageBase64 || null, 0]);
        await refreshUnsyncedCount();
        return res;
      }
    },
    [refreshUnsyncedCount]
  );

  // Fetch pending records that need syncing
  const getPendingItems = useCallback(async () => {
    if (!activeDb) return [];
    try {
      if (activeDb.type === 'sqlite') {
        const res = await activeDb.query(
          `SELECT * FROM ${TABLE_NAME} WHERE sync_status = 0 ORDER BY id ASC LIMIT 100;`
        );
        return res?.values || [];
      } else {
        const res = await activeDb.query(`SELECT * FROM ${TABLE_NAME} WHERE sync_status = 0;`);
        return res?.values || [];
      }
    } catch (err) {
      console.error('Error fetching pending items from local DB:', err);
      return [];
    }
  }, []);

  // Mark items as synced in the local database
  const markItemsSynced = useCallback(
    async (ids = []) => {
      if (!activeDb || ids.length === 0) return;
      try {
        if (activeDb.type === 'sqlite') {
          const idList = ids.map((id) => Number(id)).filter((id) => !isNaN(id)).join(',');
          if (!idList) return;
          const query = `
            UPDATE ${TABLE_NAME} 
            SET sync_status = 1, synced_at = CURRENT_TIMESTAMP 
            WHERE id IN (${idList});
          `;
          await activeDb.execute(query);
        } else {
          const tx = activeDb.raw.transaction(TABLE_NAME, 'readwrite');
          const store = tx.objectStore(TABLE_NAME);
          for (const id of ids) {
            const getReq = store.get(id);
            getReq.onsuccess = () => {
              if (getReq.result) {
                const updated = { ...getReq.result, sync_status: 1, synced_at: new Date().toISOString() };
                store.put(updated);
              }
            };
          }
        }
        await refreshUnsyncedCount();
      } catch (err) {
        console.error('Error marking items as synced:', err);
      }
    },
    [refreshUnsyncedCount]
  );

  // Get scan history for audit
  const getRecentHistory = useCallback(async (limit = 20) => {
    if (!activeDb) return [];
    try {
      if (activeDb.type === 'sqlite') {
        const res = await activeDb.query(
          `SELECT * FROM ${TABLE_NAME} ORDER BY id DESC LIMIT ${limit};`
        );
        return res?.values || [];
      } else {
        const res = await activeDb.query(`SELECT * FROM ${TABLE_NAME};`);
        const items = res?.values || [];
        return items.reverse().slice(0, limit);
      }
    } catch {
      return [];
    }
  }, []);

  return {
    isReady,
    isNative,
    unsyncedCount,
    saveIntakeItem,
    getPendingItems,
    markItemsSynced,
    refreshUnsyncedCount,
    getRecentHistory,
    db: activeDb
  };
}

