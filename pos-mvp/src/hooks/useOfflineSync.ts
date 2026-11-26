import { useState, useEffect, useCallback, useRef } from 'react';
import { getOfflineSales, markOfflineSalesSynced, getOfflineSalesCount, getOfflineKhataSettlementsCount } from '../utils/nativeDb';
import { syncOfflineKhataEvents, syncOfflineKhataSettlements } from '../utils/offlineSync';
import { generateCompliantInvoiceNumber } from '../utils/nbrInvoice';
import { getManagerPin } from '../utils/authUtils';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL, CLOUD_GATEWAY_URL, LAN_SERVER_URL, getResilientApiCandidates } from '../utils/apiConfig';
import { ensureRegionalIso } from '../utils/time';

export function useOfflineSync(apiBaseUrl?: string) {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isDraining, setIsDraining] = useState<boolean>(false);
  const [lastDrainTime, setLastDrainTime] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const isDrainingRef = useRef(false);

  // Helper to read and normalize the queue across Native SQLite and LocalStorage
  const getQueue = useCallback(async (): Promise<any[]> => {
    try {
      return await getOfflineSales();
    } catch {
      return [];
    }
  }, []);

  // Helper to read pending offline products
  const getPendingProducts = useCallback((): any[] => {
    try {
      if (typeof localStorage === 'undefined') return [];
      const raw = localStorage.getItem('askar_pending_products');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const updatePendingCount = useCallback(async () => {
    try {
      const salesCount = await getOfflineSalesCount();
      const settlementsCount = await getOfflineKhataSettlementsCount();
      const prods = getPendingProducts();
      setPendingCount(salesCount + settlementsCount + prods.length);
    } catch {
      setPendingCount(0);
    }
  }, [getPendingProducts]);

  // Drain offline sales & products queue to Master Server
  const drainQueue = useCallback(async () => {
    if (isDrainingRef.current) return;
    const queue = await getQueue();
    const pendingProds = getPendingProducts();

    if (queue.length === 0 && pendingProds.length === 0) {
      setPendingCount(0);
      return { success: true, processed: 0 };
    }

    isDrainingRef.current = true;
    setIsDraining(true);
    setLastError(null);

    const targetCandidates = [
      apiBaseUrl,
      ...getResilientApiCandidates(),
      getApiBaseUrl(),
      CLOUD_GATEWAY_URL,
      LAN_SERVER_URL,
      DEFAULT_EDGE_API_URL
    ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

    let success = false;
    let processedCount = 0;

    // 1. DRAIN OFFLINE SALES (if any)
    if (queue.length > 0) {
      // Normalize sales payloads for /api/sync/sales
      const normalizedSales = queue.map((sale: any) => ({
        id: sale.id || `sale_off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        invoiceNo: sale.invoiceNo || sale.invoice_number || generateCompliantInvoiceNumber(),
        total: Number(sale.total || sale.totalAmount || 0),
        subtotal: Number(sale.subtotal || sale.total || 0),
        paymentType: sale.paymentType || sale.payment_type || 'CASH',
        status: sale.status || 'COMPLETED',
        customerId: sale.customerId || sale.khata_id || null,
        messId: sale.messId || sale.mess_id || null,
        shopperId: sale.shopperId || sale.shopper_id || null,
        shopperName: sale.shopperName || null,
        cardUid: sale.cardUid || sale.tag_id || null,
        employeeId: sale.employeeId || null,
        shiftId: sale.shiftId || null,
        createdAt: ensureRegionalIso(sale.offlineTimestamp || sale.createdAt),
        items: (Array.isArray(sale.items) && sale.items.length > 0 ? sale.items : (Array.isArray(sale.cart) ? sale.cart : [])).map((c: any) => {
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
        })
      }));

      for (const base of targetCandidates) {
        try {
          const response = await fetch(`${base}/api/sync/sales`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sales: normalizedSales }),
            signal: AbortSignal.timeout(6000)
          });

          if (response.ok) {
            const resData = await response.json();
            // Purge synced sales from both Native SQLite and LocalStorage
            const syncedIds = normalizedSales.map(s => s.id);
            await markOfflineSalesSynced(syncedIds);
            setLastDrainTime(new Date());
            processedCount = resData.processed || normalizedSales.length;
            console.log(`🟢 [useOfflineSync] Successfully drained offline queue (${processedCount} sales) to ${base}`);
            success = true;
            break;
          }
        } catch (err: any) {
          setLastError(err?.message || 'Sync network error');
        }
      }
    }

    // 2. DRAIN PENDING OFFLINE PRODUCTS (if any)
    if (pendingProds.length > 0) {
      const remaining: any[] = [];
      for (const item of pendingProds) {
        let sent = false;
        for (const base of targetCandidates) {
          try {
            const pRes = await fetch(`${base}/api/products`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-manager-pin': getManagerPin(),
                'x-pos-client': 'store-pos',
                'x-pos-key': '457738d4f57ef4ccdd606b4cbf78aa7de5c5e27327ce32b53e0a5fc4bf7f9d06'
              },
              body: JSON.stringify(item.payload || item),
              signal: AbortSignal.timeout(4000)
            });
            if (pRes.ok) {
              sent = true;
              console.log('✅ [useOfflineSync] Drained pending offline product:', item.payload?.name || item.name);
              break;
            }
          } catch {}
        }
        if (!sent) remaining.push(item);
      }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('askar_pending_products', JSON.stringify(remaining));
        }
      } catch {}
    }

    await updatePendingCount();

    // Also trigger asynchronous CRDT Khata offline queue synchronization (charges & settlements)
    syncOfflineKhataEvents().catch((err) => {
      console.warn('⚠️ [useOfflineSync] Background Khata sync error:', err);
    });
    syncOfflineKhataSettlements().catch((err) => {
      console.warn('⚠️ [useOfflineSync] Background Khata settlements sync error:', err);
    });

    isDrainingRef.current = false;
    setIsDraining(false);

    return { success, processed: processedCount };
  }, [apiBaseUrl, getQueue, getPendingProducts, updatePendingCount]);

  // Initial count & event listeners
  useEffect(() => {
    updatePendingCount();

    const handleOnline = () => {
      console.log('🌐 [useOfflineSync] Network online event detected, draining queue...');
      drainQueue();
    };

    window.addEventListener('online', handleOnline);

    // Periodic check every 15 seconds to drain any queued sales, products, or settlements
    const interval = setInterval(async () => {
      const q = await getQueue();
      const p = getPendingProducts();
      const s = await getOfflineKhataSettlementsCount();
      if (q.length > 0 || p.length > 0 || s > 0) {
        drainQueue();
      } else {
        updatePendingCount();
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [drainQueue, getQueue, getPendingProducts, updatePendingCount]);

  return {
    pendingCount,
    isDraining,
    lastDrainTime,
    lastError,
    drainQueue,
    updatePendingCount
  };
}

export default useOfflineSync;

