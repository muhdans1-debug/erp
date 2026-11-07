import { db } from './db.js';

// Base URL for Master Server (Windows back-office PC)
let masterBaseUrl = process.env.MASTER_SERVER_URL || 'http://localhost:3000';
const SYNC_INTERVAL_MS = 30000; // 30 seconds

export const setMasterBaseUrl = (url) => {
  if (url && typeof url === 'string') {
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    // Remove trailing slash if present
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    masterBaseUrl = clean;
    console.log(`[SyncEngine] Master Base URL updated to: ${masterBaseUrl}`);
  }
};

export const getMasterBaseUrl = () => masterBaseUrl;

let isSyncing = false;
let lastProductSyncTime = null;

export const syncNow = async () => {
  if (isSyncing) return { status: 'already_syncing' };
  isSyncing = true;

  const result = {
    salesPushed: 0,
    productsPulled: 0,
    status: 'success'
  };

  try {
    // ==========================================
    // PART 1: PUSH SALES UP TO WINDOWS PC (OUTBOX)
    // ==========================================
    // 🟢 SAFE LIB-SQL JSON AGGREGATION: Native SQLite query pulls ONLY pending sales
    const pendingResult = await db.execute({
      sql: `
        SELECT 
          s.*, 
          json_group_array(
            json_object(
              'id', i.id, 
              'productId', i.productId, 
              'qty', i.quantity,
              'quantity', i.quantity,
              'price', i.priceAtSale,
              'priceAtSale', i.priceAtSale,
              'total_price', i.total_price
            )
          ) FILTER (WHERE i.id IS NOT NULL) AS items
        FROM Sale s
        LEFT JOIN SaleItem i ON s.id = i.saleId
        WHERE s.syncStatus = 'PENDING'
        GROUP BY s.id
      `,
      args: []
    });

    const payload = (pendingResult.rows || []).map(row => ({
      ...row,
      items: JSON.parse(row.items || '[]')
    }));

    if (payload.length > 0) {
      const pushRes = await fetch(`${masterBaseUrl}/api/sync/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (pushRes.ok) {
        await db.transaction(async (tx) => {
          for (const sale of payload) {
            await tx.orm.Sale.where({ id: sale.id }).update({ syncStatus: 'SYNCED' });
          }
        });
        result.salesPushed = payload.length;
        console.log(`[SyncEngine] Successfully synced ${payload.length} sales to master.`);
      }
    }

    // ==========================================
    // PART 2: PULL PRODUCT UPDATES DOWN TO SUNMI (DELTA SYNC)
    // ==========================================
    // 1. Find the most recently updated product in the local SQLite database
    const maxResult = await db.execute({
      sql: `SELECT MAX(updatedAt) as latestUpdate FROM Product`,
      args: []
    });
    const latestRaw = maxResult.rows?.[0]?.latestUpdate;
    const latestUpdate = latestRaw ? new Date(latestRaw) : new Date(0);

    // 2. Ask Master PC for anything newer than that timestamp
    const pullUrl = `${masterBaseUrl}/api/sync/products?lastSyncDate=${encodeURIComponent(latestUpdate.toISOString())}`;
    const pullRes = await fetch(pullUrl);

    if (pullRes.ok) {
      const data = await pullRes.json();
      const incomingProducts = data.products || [];

      if (incomingProducts.length > 0) {
        await db.transaction(async (tx) => {
          for (const prod of incomingProducts) {
            const existing = await tx.orm.Product.where({ id: prod.id }).all().first();
            const record = {
              ...prod,
              updatedAt: prod.updatedAt ? new Date(prod.updatedAt) : new Date()
            };
            if (existing) {
              await tx.orm.Product.where({ id: prod.id }).update(record);
            } else {
              await tx.orm.Product.create(record);
            }
          }
        });
        result.productsPulled = incomingProducts.length;
        lastProductSyncTime = new Date().toISOString();
        console.log(`[SyncEngine] Successfully pulled ${incomingProducts.length} product updates from master.`);
      }
    }

    // ==========================================
    // PART 3: PUSH & PULL KHATA LEDGER (APPEND-ONLY EVENT SOURCING)
    // ==========================================
    // 🟢 SAFE LIB-SQL QUERY: Fetch only pending ledger entries (bounded to avoid V8 memory exhaustion)
    const pendingLedgerRes = await db.execute({
      sql: `SELECT * FROM KhataLedger WHERE syncStatus = 'PENDING' LIMIT 500`,
      args: []
    });
    const pendingLedger = pendingLedgerRes.rows || [];

    if (pendingLedger.length > 0) {
      const pushLedgerRes = await fetch(`${masterBaseUrl}/api/sync/khata-ledger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingLedger),
      });

      if (pushLedgerRes.ok) {
        await db.transaction(async (tx) => {
          for (const entry of pendingLedger) {
            await tx.orm.KhataLedger.where({ id: entry.id }).update({ syncStatus: 'SYNCED' });
          }
        });
        result.ledgerPushed = pendingLedger.length;
        console.log(`[SyncEngine] Successfully pushed ${pendingLedger.length} ledger events to master.`);
      }
    }

    // Pull append-only ledger entries from master using native SQLite MAX aggregation
    const maxLedgerRes = await db.execute({
      sql: `SELECT MAX(COALESCE(timestamp, created_at)) as latestTime FROM KhataLedger`,
      args: []
    });
    const latestLedgerRaw = maxLedgerRes.rows?.[0]?.latestTime;
    const latestLedgerTime = latestLedgerRaw ? new Date(latestLedgerRaw) : new Date(0);

    const pullLedgerUrl = `${masterBaseUrl}/api/sync/khata-ledger?lastSyncDate=${encodeURIComponent(latestLedgerTime.toISOString())}`;
    const pullLedgerRes = await fetch(pullLedgerUrl);

    if (pullLedgerRes.ok) {
      const data = await pullLedgerRes.json();
      const incomingLedger = data.entries || [];

      if (incomingLedger.length > 0) {
        await db.transaction(async (tx) => {
          for (const entry of incomingLedger) {
            const existing = await tx.orm.KhataLedger.where({ id: entry.id }).all().first();
            if (!existing) {
              await tx.orm.KhataLedger.create({
                ...entry,
                timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
                syncStatus: 'SYNCED',
              });
            }
          }
        });
        result.ledgerPulled = incomingLedger.length;
        console.log(`[SyncEngine] Successfully pulled ${incomingLedger.length} ledger events from master.`);
      }
    }

    return result;
  } catch (error) {
    console.log('[SyncEngine] Sync skipped: Master PC unreachable (Wi-Fi down?). Will retry in 30s.');
    return { status: 'offline', error: error.message };
  } finally {
    isSyncing = false;
  }
};

export const getSyncStatus = async () => {
  try {
    const allSales = await db.orm.Sale.all();
    const pendingSales = allSales.filter(sale => sale.syncStatus === 'PENDING');
    const syncedSales = allSales.filter(sale => sale.syncStatus === 'SYNCED');
    const products = await db.orm.Product.all();
    const allLedger = await db.orm.KhataLedger.all();
    const pendingLedger = allLedger.filter(l => l.syncStatus === 'PENDING');

    return {
      totalSales: allSales.length,
      pendingCount: pendingSales.length,
      syncedCount: syncedSales.length,
      totalProducts: products.length,
      totalLedgerEntries: allLedger.length,
      pendingLedgerCount: pendingLedger.length,
      lastProductSyncTime,
      isSyncing,
      masterUrl: masterBaseUrl
    };
  } catch (e) {
    return { error: e.message };
  }
};


export const startSyncEngine = () => {
  const isLocalhost = masterBaseUrl.includes('localhost') || masterBaseUrl.includes('127.0.0.1');
  if (isLocalhost && process.env.IS_SPOKE !== 'true') {
    console.log('⚡ [SyncEngine] Operating as Master POS Server. Self-sync loop bypassed for 0% CPU overhead.');
    return;
  }
  console.log('[SyncEngine] Bidirectional Sync Engine Started (Push Sales / Pull Products every 30s)...');
  setTimeout(() => {
    syncNow().catch(() => {});
  }, 3000);

  setInterval(() => {
    syncNow().catch(() => {});
  }, SYNC_INTERVAL_MS);
};
