// pos-mvp/src/services/recentSalesService.ts
/**
 * Durable Recent Sales History Service
 * Caches recent completed transactions in localStorage with instant O(1) reads
 * and provides fallback hydration from SQLite/LibSQL embedded database.
 */

import { db } from '../db';
import { getRegionalIsoString, getRegionalParts } from '../utils/time';
import { getResilientApiCandidates } from '../utils/apiConfig';

export interface RecentSaleItem {
  name: string;
  nameAr?: string;
  qty: number;
  price: number;
  vatRate?: number;
  total_price?: number;
  is_weighed_item?: boolean;
  scaleWeight?: number;
}

export interface RecentSale {
  id?: string;
  invoiceNo: string;
  total: number;
  subtotal: number;
  vat: number;
  items: RecentSaleItem[];
  paymentMode: string;
  timestamp: string; // ISO format or localized string
  customerName?: string;
  customerPhone?: string;
  customerCardUid?: string;
  customerId?: string;
  cashTendered?: number;
  changeDue?: number;
  cashierName?: string;
  transactionRef?: string;
  isReprint?: boolean;
  previousBalance?: number;
  newBalance?: number;
}

export interface FetchRecentSalesOptions {
  limit?: number;
  date?: string; // YYYY-MM-DD in Asia/Bahrain time
  forceRefresh?: boolean;
}

export const RECENT_SALES_STORAGE_KEY = 'askar_recent_sales_history_v1';
export const MAX_RECENT_SALES = 1000;

/**
 * Persist a completed sale to durable localStorage cache
 * Capped at MAX_RECENT_SALES (200) and sorted latest-first
 */
export function saveRecentSale(sale: RecentSale): RecentSale[] {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') {
    return [sale];
  }

  try {
    const raw = localStorage.getItem(RECENT_SALES_STORAGE_KEY);
    let history: RecentSale[] = [];
    if (raw) {
      try {
        history = JSON.parse(raw);
        if (!Array.isArray(history)) history = [];
      } catch {
        history = [];
      }
    }

    const cleanInvoice = String(sale.invoiceNo || '').trim();
    const normalizedSale: RecentSale = {
      ...sale,
      invoiceNo: cleanInvoice,
      total: Number(sale.total || 0),
      subtotal: Number(sale.subtotal || 0),
      vat: Number(sale.vat || 0),
      items: Array.isArray(sale.items) ? sale.items : [],
      paymentMode: sale.paymentMode || 'CASH',
      timestamp: sale.timestamp || getRegionalIsoString(),
      cashierName: sale.cashierName || 'Register 01',
      previousBalance: sale.previousBalance !== undefined ? Number(sale.previousBalance) : undefined,
      newBalance: sale.newBalance !== undefined ? Number(sale.newBalance) : undefined,
      customerCardUid: sale.customerCardUid || undefined
    };

    // Filter out any existing item with the same invoiceNo to avoid duplicates
    const filtered = history.filter((item) => item && item.invoiceNo !== cleanInvoice);

    // Add new sale to the very beginning
    const updated = [normalizedSale, ...filtered].slice(0, MAX_RECENT_SALES);

    localStorage.setItem(RECENT_SALES_STORAGE_KEY, JSON.stringify(updated));

    // Dispatch a non-blocking notification event for reactive UI updates
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(
          new CustomEvent('askar-recent-sales-updated', { detail: normalizedSale })
        );
      } catch {
        // Ignore custom event error in headless environments
      }
    }

    return updated;
  } catch (err) {
    console.warn('Failed to save recent sale to localStorage:', err);
    return [sale];
  }
}

/**
 * Retrieve recent sales history from durable local cache (instant sync read)
 */
export function getRecentSales(): RecentSale[] {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(RECENT_SALES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to read recent sales history:', err);
    return [];
  }
}

/**
 * Filter cached sales by calendar date (YYYY-MM-DD)
 */
export function getSalesForDate(dateOnly: string, sourceSales?: RecentSale[]): RecentSale[] {
  const list = sourceSales || getRecentSales();
  if (!dateOnly) return list;
  return list.filter((s) => {
    if (!s.timestamp) return false;
    try {
      return getRegionalParts(s.timestamp).dateOnly === dateOnly;
    } catch {
      return s.timestamp.startsWith(dateOnly);
    }
  });
}

/**
 * Retrieve the most recent completed sale (instant 1-tap target)
 */
export function getLastSale(): RecentSale | null {
  const sales = getRecentSales();
  return sales.length > 0 ? sales[0] : null;
}

/**
 * Clears local recent sales cache (useful for testing or cache reset)
 */
export function clearRecentSales(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(RECENT_SALES_STORAGE_KEY);
  }
}

/**
 * Merge newly fetched sales into durable local cache without losing existing sales
 */
function mergeIntoLocalSalesCache(newSales: RecentSale[]): void {
  if (!newSales || newSales.length === 0 || typeof localStorage === 'undefined') return;
  try {
    const existing = getRecentSales();
    const existingMap = new Map<string, RecentSale>();
    for (const s of existing) {
      if (s && s.invoiceNo) existingMap.set(s.invoiceNo, s);
    }
    for (const ns of newSales) {
      if (ns && ns.invoiceNo) existingMap.set(ns.invoiceNo, ns);
    }
    const merged = Array.from(existingMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_RECENT_SALES);
    localStorage.setItem(RECENT_SALES_STORAGE_KEY, JSON.stringify(merged));
  } catch {}
}

/**
 * Robust Sales History Hydration:
 * 1. Checks API server endpoints for target date or recent sales with 2.5s fast timeout.
 * 2. Falls back to local embedded SQLite (`local.db`) with date-indexed query.
 * 3. Reconciles and backfills `localStorage` cache for instant offline reads.
 */
export async function fetchRecentSalesFromDb(
  optionsOrLimit: number | FetchRecentSalesOptions = 500
): Promise<RecentSale[]> {
  const options: FetchRecentSalesOptions =
    typeof optionsOrLimit === 'number' ? { limit: optionsOrLimit } : (optionsOrLimit || {});
  const limit = options.limit || 500;
  const targetDate = options.date;
  const isAll = !targetDate || targetDate === 'ALL' || targetDate === 'all';

  // 1. Try resilient API network fetch first
  const candidates = getResilientApiCandidates();
  for (const base of candidates) {
    try {
      const url = targetDate && !isAll
        ? `${base}/api/sales/history?date=${encodeURIComponent(targetDate)}&limit=${limit}`
        : `${base}/api/sales/history?all=true&limit=${limit}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        const rawSales = Array.isArray(data?.sales) ? data.sales : (Array.isArray(data) ? data : []);
        if (rawSales.length > 0) {
          const apiReconstructed: RecentSale[] = rawSales.map((r: any) => ({
            id: r.id,
            invoiceNo: r.invoiceNo || r.id,
            total: Number(r.totalAmount || r.total || 0),
            subtotal: Number(r.subtotal || ((r.totalAmount || r.total || 0) / 1.1)),
            vat: Number(r.totalVat || r.vat || 0),
            items: Array.isArray(r.items) ? r.items.map((it: any) => ({
              name: it.productName || it.name || 'Item',
              nameAr: it.nameAr || it.productNameAr,
              qty: Number(it.quantity || it.qty || 1),
              price: Number(it.priceAtSale || it.price || 0),
              vatRate: it.vatAmount > 0 ? 10 : 0,
              total_price: Number(it.total_price || ((it.priceAtSale || it.price || 0) * (it.quantity || it.qty || 1))),
              is_weighed_item: Boolean(it.is_weighed_item)
            })) : [],
            paymentMode: r.paymentType || r.paymentMode || 'CASH',
            timestamp: r.createdAt || r.timestamp || getRegionalIsoString(),
            customerName: r.customerName || undefined,
            customerId: r.customerId || undefined,
            cashierName: r.cashierName || 'Register 01'
          }));

          mergeIntoLocalSalesCache(apiReconstructed);
          return apiReconstructed;
        }
      }
    } catch {
      // Try next candidate
    }
  }

  // 2. Fallback to Local Embedded SQLite Database
  try {
    let sql = `SELECT id, invoiceNo, totalAmount, paymentType, subtotal, totalVat, createdAt, customerId 
               FROM Sale `;
    const args: any[] = [];

    if (targetDate && !isAll) {
      sql += `WHERE (createdAt LIKE ? OR date(createdAt) = ?) `;
      args.push(`${targetDate}%`, targetDate);
    }

    sql += `ORDER BY createdAt DESC LIMIT ?`;
    args.push(limit);

    const saleResult = await db.execute({ sql, args });
    const rows = saleResult.rows || [];

    if (rows.length === 0) {
      return targetDate ? getSalesForDate(targetDate) : getRecentSales();
    }

    const saleIds = rows.map((r: any) => `'${r.id}'`).join(',');
    const itemsBySaleId: Record<string, RecentSaleItem[]> = {};

    if (saleIds.length > 0) {
      try {
        const itemResult = await db.execute({
          sql: `SELECT si.saleId, si.productId, si.quantity, si.priceAtSale, si.vatAmount, si.total_price, 
                       p.name as productName, p.name_ar as productNameAr, p.is_weighed_item
                FROM SaleItem si
                LEFT JOIN Product p ON si.productId = p.id
                WHERE si.saleId IN (${saleIds})`,
          args: []
        });

        for (const itemRow of itemResult.rows || []) {
          const sId = itemRow.saleId;
          if (!itemsBySaleId[sId]) itemsBySaleId[sId] = [];
          itemsBySaleId[sId].push({
            name: itemRow.productName || itemRow.productId || 'Item',
            nameAr: itemRow.productNameAr || undefined,
            qty: Number(itemRow.quantity || 1),
            price: Number(itemRow.priceAtSale || 0),
            vatRate: itemRow.vatAmount > 0 ? 10 : 0,
            total_price: Number(itemRow.total_price || (itemRow.priceAtSale * itemRow.quantity)),
            is_weighed_item: Boolean(itemRow.is_weighed_item)
          });
        }
      } catch (itemErr) {
        console.warn('Could not fetch items for sales from DB:', itemErr);
      }
    }

    const reconstructed: RecentSale[] = rows.map((r: any) => ({
      id: r.id,
      invoiceNo: r.invoiceNo || r.id,
      total: Number(r.totalAmount || 0),
      subtotal: Number(r.subtotal || (r.totalAmount / 1.1)),
      vat: Number(r.totalVat || (r.totalAmount - (r.totalAmount / 1.1))),
      items: itemsBySaleId[r.id] || [],
      paymentMode: r.paymentType || 'CASH',
      timestamp: r.createdAt || getRegionalIsoString(),
      cashierName: 'Register 01'
    }));

    mergeIntoLocalSalesCache(reconstructed);
    return reconstructed;
  } catch (err) {
    console.warn('fetchRecentSalesFromDb error:', err);
    return targetDate ? getSalesForDate(targetDate) : getRecentSales();
  }
}

/**
 * Fetch sales specifically for a given date (YYYY-MM-DD)
 */
export async function fetchSalesByDate(targetDate: string): Promise<RecentSale[]> {
  return fetchRecentSalesFromDb({ date: targetDate, limit: 300 });
}

