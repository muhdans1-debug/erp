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

      if (offlineSales && offlineSales.rows && offlineSales.rows.length > 0) {
        for (const rawSale of offlineSales.rows as any[]) {
          // SQLite returns the grouped items as a JSON string, so we must parse it back to an array
          let parsedItems = [];
          try {
            parsedItems = typeof rawSale.items === 'string'
              ? JSON.parse(rawSale.items).filter((it: any) => it && it.id !== null)
              : (Array.isArray(rawSale.items) ? rawSale.items : []);
          } catch {
            parsedItems = [];
          }

          const sale = { 
            ...rawSale, 
            items: parsedItems
          };

          const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(sale) // Now correctly includes the full line item array!
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
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
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
