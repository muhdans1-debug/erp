import { useState, useEffect, useCallback, useRef } from 'react';
import { getOfflineSales, markOfflineSalesSynced, getOfflineSalesCount } from '../utils/nativeDb';
import { syncOfflineKhataEvents } from '../utils/offlineSync';
import { generateCompliantInvoiceNumber } from '../utils/nbrInvoice';

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

  const updatePendingCount = useCallback(async () => {
    try {
      const count = await getOfflineSalesCount();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  }, []);

  // Drain offline sales queue to Master Server
  const drainQueue = useCallback(async () => {
    if (isDrainingRef.current) return;
    const queue = await getQueue();
    if (queue.length === 0) {
      setPendingCount(0);
      return { success: true, processed: 0 };
    }

    isDrainingRef.current = true;
    setIsDraining(true);
    setLastError(null);

    const host = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
    const targetCandidates = [
      apiBaseUrl,
      typeof window !== 'undefined' ? localStorage.getItem('master_server_url') : null,
      `http://${host}:3000`,
      'http://192.168.8.7:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ].filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i);

    let success = false;
    let processedCount = 0;

    // Normalize sales payloads for /api/sync/sales
    const normalizedSales = queue.map((sale: any) => ({
      id: sale.id || `sale_off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      invoiceNo: sale.invoiceNo || sale.invoice_number || generateCompliantInvoiceNumber(),
      total: Number(sale.total || sale.totalAmount || 0),
      subtotal: Number(sale.subtotal || sale.total || 0),
      paymentType: sale.paymentType || sale.payment_type || 'CASH',
      status: sale.status || 'COMPLETED',
      customerId: sale.customerId || sale.khata_id || null,
      employeeId: sale.employeeId || null,
      shiftId: sale.shiftId || null,
      createdAt: sale.offlineTimestamp || sale.createdAt || new Date().toISOString(),
      items: Array.isArray(sale.items) ? sale.items : (Array.isArray(sale.cart) ? sale.cart.map((c: any) => ({
        id: c.id || `si_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        productId: c.productId || c.id,
        qty: c.quantity || 1,
        price: c.sellingPrice || 0,
        total_price: (c.sellingPrice || 0) * (c.quantity || 1)
      })) : [])
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
          await updatePendingCount();
          setLastDrainTime(new Date());
          processedCount = resData.processed || normalizedSales.length;
          console.log(`🟢 [useOfflineSync] Successfully drained offline queue (${processedCount} sales) to ${base}`);
          success = true;
          break;
        }
      } catch (err: any) {
        // Try next candidate
        setLastError(err?.message || 'Sync network error');
      }
    }

    // Drain any pending products added while offline
    try {
      const rawPending = typeof localStorage !== 'undefined' ? localStorage.getItem('askar_pending_products') : null;
      if (rawPending) {
        const pendingProds = JSON.parse(rawPending);
        if (Array.isArray(pendingProds) && pendingProds.length > 0) {
          const remaining = [];
          for (const item of pendingProds) {
            let sent = false;
            for (const base of targetCandidates) {
              try {
                const pRes = await fetch(`${base}/api/products`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-manager-pin': '9999',
                    'x-pos-client': 'store-pos'
                  },
                  body: JSON.stringify(item.payload),
                  signal: AbortSignal.timeout(3000)
                });
                if (pRes.ok) { sent = true; break; }
              } catch {}
            }
            if (!sent) remaining.push(item);
          }
          localStorage.setItem('askar_pending_products', JSON.stringify(remaining));
        }
      }
    } catch {}

    // Also trigger asynchronous CRDT Khata offline queue synchronization
    syncOfflineKhataEvents().catch((err) => {
      console.warn('⚠️ [useOfflineSync] Background Khata sync error:', err);
    });

    isDrainingRef.current = false;
    setIsDraining(false);

    return { success, processed: processedCount };
  }, [apiBaseUrl, getQueue, updatePendingCount]);

  // Initial count & event listeners
  useEffect(() => {
    updatePendingCount();

    const handleOnline = () => {
      console.log('🌐 [useOfflineSync] Network online event detected, draining queue...');
      drainQueue();
    };

    window.addEventListener('online', handleOnline);

    // Periodic check every 30 seconds
    const interval = setInterval(async () => {
      const q = await getQueue();
      if (q.length > 0) {
        drainQueue();
      } else {
        setPendingCount(0);
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [drainQueue, getQueue, updatePendingCount]);

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

