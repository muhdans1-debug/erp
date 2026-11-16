// pos-mvp/src/services/syncService.ts
import { db } from '../db';
import { getOfflineSales, markOfflineSalesSynced } from '../utils/nativeDb';
import { getApiBaseUrl } from '../utils/apiConfig';

/**
 * Isolated Background Sales Sync Service (Data Access Layer)
 * Reads pending offline sales from local embedded database / native storage
 * and pushes them to the Sovereign Cloudflare Edge API Gateway,
 * updating sync status on success.
 * Completely decoupled from React render loops and UI state.
 */
export const pushOfflineSales = async (_masterIp?: string): Promise<number> => {
  try {
    const base = getApiBaseUrl();
    const targetUrl = `${base}/api/sales/sync`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-pos-client': 'store-pos'
    };

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
        WHERE s.status = 'OFFLINE_PENDING' OR s.syncStatus = 'OFFLINE_PENDING' OR s.syncStatus = 'PENDING'
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
                sql: `UPDATE Sale SET status = 'COMPLETED', syncStatus = 'SYNCED' WHERE invoiceNo IN (${placeholders})`,
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
        const normalizedSales = nativeQueue.map((sale: any) => {
          const rawItems = Array.isArray(sale.items) && sale.items.length > 0
            ? sale.items
            : (Array.isArray(sale.cart) && sale.cart.length > 0 ? sale.cart : []);
          const normalizedItems = rawItems.map((c: any) => {
            const qty = Number(c.qty ?? c.quantity ?? 1);
            const unitPrice = Number(c.priceAtSale ?? c.sellingPrice ?? c.price ?? c.unitPrice ?? 0);
            const lineTotal = Number((c.total_price ?? (unitPrice * qty)).toFixed(3));
            return {
              id: c.id || `si_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              productId: c.productId || c.id,
              name: c.name || c.productName || 'Item',
              productName: c.name || c.productName || 'Item',
              barcode: c.barcode || c.productId || c.id,
              quantity: qty,
              qty,
              price: unitPrice,
              sellingPrice: unitPrice,
              priceAtSale: unitPrice,
              unitPrice: unitPrice,
              total_price: lineTotal,
              costAtSale: Number(c.costAtSale ?? c.unitCost ?? c.purchasePrice ?? 0),
              vatRateAtSale: c.vatRateAtSale !== undefined ? Number(c.vatRateAtSale) : (c.vatRate !== undefined ? Number(c.vatRate) : 10.0),
              vatAmount: Number(c.vatAmount || 0)
            };
          });

          return {
            ...sale,
            items: normalizedItems,
            cart: normalizedItems
          };
        });

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(normalizedSales)
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
