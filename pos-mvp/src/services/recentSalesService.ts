// pos-mvp/src/services/recentSalesService.ts
/**
 * Durable Recent Sales History Service
 * Caches recent completed transactions in localStorage with instant O(1) reads
 * and provides fallback hydration from SQLite/LibSQL embedded database.
 */

import { db } from '../db';
import { getRegionalIsoString } from '../utils/time';

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

export const RECENT_SALES_STORAGE_KEY = 'askar_recent_sales_history_v1';
export const MAX_RECENT_SALES = 50;

/**
 * Persist a completed sale to durable localStorage cache
 * Capped at MAX_RECENT_SALES (50) and sorted latest-first
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
      cashierName: sale.cashierName || 'Register 01'
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
 * Fallback Database Hydration:
 * Queries local embedded SQLite (`local.db`) for recent sales
 * and backfills `localStorage` if cache is empty or incomplete.
 */
export async function fetchRecentSalesFromDb(limit: number = 30): Promise<RecentSale[]> {
  try {
    const saleResult = await db.execute({
      sql: `SELECT id, invoiceNo, totalAmount, paymentType, subtotal, totalVat, createdAt, customerId 
            FROM Sale 
            ORDER BY createdAt DESC 
            LIMIT ?`,
      args: [limit]
    });

    const rows = saleResult.rows || [];
    if (rows.length === 0) return getRecentSales();

    const saleIds = rows.map((r: any) => `'${r.id}'`).join(',');
    let itemsBySaleId: Record<string, RecentSaleItem[]> = {};

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

    // If local cache is currently empty, backfill with DB rows
    const currentCached = getRecentSales();
    if (currentCached.length === 0 && reconstructed.length > 0) {
      localStorage.setItem(
        RECENT_SALES_STORAGE_KEY,
        JSON.stringify(reconstructed.slice(0, MAX_RECENT_SALES))
      );
    }

    return reconstructed;
  } catch (err) {
    console.warn('fetchRecentSalesFromDb error:', err);
    return getRecentSales();
  }
}
