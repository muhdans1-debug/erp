import sqlite from '@prisma/orm-sqlite/runtime';
import contractJson from './prisma/contract.json' with { type: 'json' };

const db = sqlite({ contractJson, path: './dev.db' });

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
    const allSales = await db.orm.Sale.all();
    const pendingSales = allSales.filter(sale => sale.syncStatus === 'PENDING');

    if (pendingSales.length > 0) {
      const allItems = await db.orm.SaleItem.all();
      const payload = pendingSales.map(sale => ({
        ...sale,
        items: allItems.filter(item => item.saleId === sale.id)
      }));

      const pushRes = await fetch(`${masterBaseUrl}/api/sync/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (pushRes.ok) {
        await db.transaction(async (tx) => {
          for (const sale of pendingSales) {
            await tx.orm.Sale.where({ id: sale.id }).update({ syncStatus: 'SYNCED' });
          }
        });
        result.salesPushed = pendingSales.length;
        console.log(`[SyncEngine] Successfully synced ${pendingSales.length} sales to master.`);
      }
    }

    // ==========================================
    // PART 2: PULL PRODUCT UPDATES DOWN TO SUNMI (DELTA SYNC)
    // ==========================================
    // 1. Find the most recently updated product in the local SQLite database
    const localProducts = await db.orm.Product.all();
    let latestUpdate = new Date(0); // Beginning of time

    localProducts.forEach(p => {
      const pDate = p.updatedAt ? new Date(p.updatedAt) : new Date(0);
      if (pDate > latestUpdate) latestUpdate = pDate;
    });

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
    const allLedger = await db.orm.KhataLedger.all();
    const pendingLedger = allLedger.filter((l) => l.syncStatus === 'PENDING');

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

    // Pull append-only ledger entries from master
    let latestLedgerTime = new Date(0);
    allLedger.forEach((l) => {
      const lDate = l.timestamp ? new Date(l.timestamp) : new Date(0);
      if (lDate > latestLedgerTime) latestLedgerTime = lDate;
    });

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
  console.log('[SyncEngine] Bidirectional Sync Engine Started (Push Sales / Pull Products every 30s)...');
  setTimeout(() => {
    syncNow().catch(() => {});
  }, 3000);

  setInterval(() => {
    syncNow().catch(() => {});
  }, SYNC_INTERVAL_MS);
};
