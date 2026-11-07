// pos-mvp/src/services/syncService.ts
import { db } from '../db';
import { getOfflineSales, markOfflineSalesSynced } from '../utils/nativeDb';

/**
 * Isolated Background Sales Sync Service (Data Access Layer)
 * Reads pending offline sales from local embedded database / native storage
 * and pushes them to the master server via HTTP, updating sync status on success.
 * Completely decoupled from React render loops and UI state.
 */
export const pushOfflineSales = async (masterIp: string): Promise<number> => {
  try {
    const cleanIp = (masterIp || '192.168.8.7').replace(/^https?:\/\//, '').replace(/:[0-9]+.*$/, '').trim() || '192.168.8.7';
    let totalSynced = 0;

    // 1. Check local embedded database via db.execute
    try {
      const offlineSales = await db.execute("SELECT * FROM Sale WHERE status = 'OFFLINE_PENDING'");
      if (offlineSales && offlineSales.rows && offlineSales.rows.length > 0) {
        for (const sale of offlineSales.rows) {
          const response = await fetch(`http://${cleanIp}:3000/api/sales/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sale)
          });
          
          if (response.ok) {
            await db.execute({
              sql: "UPDATE Sale SET status = 'SYNCED' WHERE invoiceNo = ?",
              args: [sale.invoiceNo]
            });
            totalSynced++;
          }
        }
      }
    } catch {
      // Silently continue if table schema is handled via native storage
    }

    // 2. Check Native SQLite durable flash storage and localStorage queue
    try {
      const nativeQueue = await getOfflineSales();
      if (nativeQueue && nativeQueue.length > 0) {
        for (const sale of nativeQueue) {
          const response = await fetch(`http://${cleanIp}:3000/api/sales/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sale)
          });

          if (response.ok) {
            if (sale.id) {
              await markOfflineSalesSynced([sale.id]);
            }
            totalSynced++;
          }
        }
      }
    } catch {
      // Silently continue
    }

    return totalSynced;
  } catch (error) {
    console.error("Background sync failed:", error);
    return 0; // Silently fail and try again next loop
  }
};
