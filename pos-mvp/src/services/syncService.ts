// pos-mvp/src/services/syncService.ts
import { db } from '../db';
import { getOfflineSales, markOfflineSalesSynced } from '../utils/nativeDb';

/**
 * Isolated Background Sales Sync Service (Data Access Layer)
 * Reads pending offline sales from local embedded database / native storage
 * and pushes them to either the master laptop or Cloudflare Emergency DR API,
 * updating sync status on success.
 * Completely decoupled from React render loops and UI state.
 */
export const pushOfflineSales = async (masterIp: string): Promise<number> => {
  try {
    const isCloud = masterIp === 'cloud-dr';
    const cloudUrl = typeof window !== 'undefined'
      ? (localStorage.getItem('DR_CLOUD_URL') || 'https://askar-emergency-api.yourdomain.workers.dev')
      : 'https://askar-emergency-api.yourdomain.workers.dev';
    const drSecret = typeof window !== 'undefined'
      ? (localStorage.getItem('DR_SECRET') || 'askar-dr-secret-2026')
      : 'askar-dr-secret-2026';

    const cleanIp = (masterIp || '192.168.8.7').replace(/^https?:\/\//, '').replace(/:[0-9]+.*$/, '').trim() || '192.168.8.7';
    const targetUrl = isCloud ? `${cloudUrl}/api/sales/sync` : `http://${cleanIp}:3000/api/sales/sync`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (isCloud) {
      headers['x-dr-secret'] = drSecret;
    }

    let totalSynced = 0;

    // 1. Check local embedded database via db.execute with bundled line items
    try {
      const offlineSales = await db.execute(`
        SELECT s.*, json_group_array(json_object(
          'id', i.id, 'productId', i.productId, 'quantity', i.quantity,
          'priceAtSale', i.priceAtSale, 'total_price', i.total_price
        )) as items
        FROM Sale s
        LEFT JOIN SaleItem i ON s.id = i.saleId
        WHERE s.status = 'OFFLINE_PENDING'
        GROUP BY s.id
      `);

      // NEW: Batched Offline Sync
      if (offlineSales && offlineSales.rows && offlineSales.rows.length > 0) {
        // 1. Format all offline sales into a single array payload
        const allSalesArray = (offlineSales.rows as any[]).map((rawSale) => {
          let parsedItems = [];
          try {
            parsedItems = typeof rawSale.items === 'string'
              ? JSON.parse(rawSale.items).filter((it: any) => it && it.id !== null)
              : (Array.isArray(rawSale.items) ? rawSale.items : []);
          } catch {
            parsedItems = [];
          }
          return {
            ...rawSale,
            items: parsedItems
          };
        });

        try {
          // 2. Dispatch a single HTTP POST request containing all offline sales
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(allSalesArray) // The backend handleSyncSales natively accepts arrays
          });

          if (response.ok) {
            // 3. If the batch sync is successful, mark them all as SYNCED locally in one query
            const syncedInvoiceNos = allSalesArray.map((s) => s.invoiceNo).filter(Boolean);
            
            if (syncedInvoiceNos.length > 0) {
              // Generate placeholders for the SQL IN clause (e.g., "?,?,?")
              const placeholders = syncedInvoiceNos.map(() => '?').join(',');
              
              await db.execute({
                sql: `UPDATE Sale SET status = 'SYNCED' WHERE invoiceNo IN (${placeholders})`,
                args: syncedInvoiceNos
              });
            }
            
            console.log(`Successfully batch-synced ${syncedInvoiceNos.length} offline sales.`);
            totalSynced += syncedInvoiceNos.length;
          }
        } catch (error) {
          console.error('Batch sync failed. Will retry on next interval:', error);
        }
      }
    } catch {
      // Silently continue if table schema is handled via native storage
    }

    // 2. Check Native SQLite durable flash storage and localStorage queue (batched)
    try {
      const nativeQueue = await getOfflineSales();
      if (nativeQueue && nativeQueue.length > 0) {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(nativeQueue)
        });

        if (response.ok) {
          const ids = nativeQueue.map((s: any) => s.id).filter(Boolean);
          if (ids.length > 0) {
            await markOfflineSalesSynced(ids);
          }
          totalSynced += nativeQueue.length;
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
