// pos-mvp/src/services/localDb.ts
import { CartItem } from '../store/cartStore';
import { parseScaleBarcode, findProductByPLU } from '../utils/scaleBarcodeParser';

/**
 * Resolves the POS API base URL from runtime configuration or network defaults
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('master_server_url') || localStorage.getItem('ASKAR_FALLBACK_IP');
    if (custom) return custom.replace(/\/+$/, '');
    const isNative = Boolean((window as any).Capacitor?.isNativePlatform?.());
    if (isNative) return 'http://askar-master.local:3000';
    const host = window.location.hostname || 'localhost';
    return `http://${host}:3000`;
  }
  return 'http://askar-master.local:3000';
}

/**
 * Reads local cached products from localStorage (0ms cold start cache)
 */
function getCachedCatalog(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const posCache = localStorage.getItem('askar_pos_catalog_cache');
    if (posCache) {
      const parsed = JSON.parse(posCache);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  try {
    const dbCache = localStorage.getItem('askar_local_db_cache_Product');
    if (dbCache) {
      const parsed = JSON.parse(dbCache);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Headless 0ms product lookup for high-speed hardware laser barcode wedges
 * Resolves against:
 * 1. Deli / Supermarket Weighing Scale embedded barcodes (Prefixes 20, 21, 22)
 * 2. 0ms in-memory and localStorage replica cache
 * 3. Local Fastify HTTP API fallback (/api/products/barcode/:barcode)
 */
export async function fetchProductByBarcode(scannedCode: string): Promise<CartItem | null> {
  const cleanCode = String(scannedCode || '').trim();
  if (!cleanCode) return null;

  const catalog = getCachedCatalog();

  // 1. Check for Scale/Deli Variable Measure Barcode (Prefixes 20, 21, 22)
  const scaleParsed = parseScaleBarcode(cleanCode, 3);
  if (scaleParsed.isScaleBarcode) {
    const matchedProduct = findProductByPLU(catalog, scaleParsed);
    if (matchedProduct) {
      let unitSellingPrice = Number(matchedProduct.sellingPrice || matchedProduct.price || 0);
      let displayName = matchedProduct.name;
      let weightKg: number | undefined;

      if (scaleParsed.type === 'WEIGHT') {
        weightKg = scaleParsed.extractedValue || 0;
        unitSellingPrice = Number((weightKg * (unitSellingPrice || 1)).toFixed(3));
        displayName = `${matchedProduct.name} (${weightKg.toFixed(3)} kg)`;
      } else {
        unitSellingPrice = scaleParsed.extractedValue || unitSellingPrice;
        displayName = `${matchedProduct.name} (Scale Pack BD ${unitSellingPrice.toFixed(3)})`;
      }

      return {
        id: `${matchedProduct.id}_scale_${cleanCode}`,
        barcode: cleanCode,
        name: displayName,
        nameAr: (matchedProduct as any).nameAr,
        price: unitSellingPrice,
        sellingPrice: unitSellingPrice,
        qty: 1,
        quantity: 1,
        vatRate: (matchedProduct as any).vatRate,
        taxRate: (matchedProduct as any).taxRate,
        purchasePrice: (matchedProduct as any).purchasePrice,
        unitCost: (matchedProduct as any).unitCost,
        isScaleItem: true,
        scaleWeight: weightKg,
        is_weighed_item: true,
        category: (matchedProduct as any).category,
      };
    }
  }

  // 2. Fast 0ms cache match (Standard EAN-13, UPC, Code128)
  const cachedMatch = catalog.find((p: any) =>
    (p.barcode && String(p.barcode).trim().toLowerCase() === cleanCode.toLowerCase()) ||
    (p.id && String(p.id).trim().toLowerCase() === cleanCode.toLowerCase()) ||
    (p.name && String(p.name).trim().toLowerCase() === cleanCode.toLowerCase())
  );

  if (cachedMatch) {
    const price = Number(cachedMatch.sellingPrice ?? cachedMatch.price ?? 0);
    return {
      id: String(cachedMatch.id),
      barcode: cachedMatch.barcode || cleanCode,
      name: cachedMatch.name,
      nameAr: cachedMatch.nameAr,
      price: price,
      sellingPrice: price,
      qty: 1,
      quantity: 1,
      vatRate: cachedMatch.vatRate,
      taxRate: cachedMatch.taxRate,
      purchasePrice: cachedMatch.purchasePrice,
      unitCost: cachedMatch.unitCost,
      stockQuantity: cachedMatch.stockQuantity,
      is_weighed_item: Boolean(cachedMatch.is_weighed_item),
      category: cachedMatch.category,
    };
  }

  // 3. Fallback to Local Fastify / LibSQL HTTP endpoint
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/api/products/barcode/${encodeURIComponent(cleanCode)}`, {
      signal: AbortSignal.timeout(1500),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.id) {
        const price = Number(data.sellingPrice ?? data.price ?? 0);
        return {
          id: String(data.id),
          barcode: data.barcode || cleanCode,
          name: data.name,
          nameAr: data.nameAr,
          price: price,
          sellingPrice: price,
          qty: 1,
          quantity: 1,
          vatRate: data.vatRate,
          taxRate: data.taxRate,
          purchasePrice: data.purchasePrice,
          unitCost: data.unitCost,
          stockQuantity: data.stockQuantity,
          is_weighed_item: Boolean(data.is_weighed_item),
          category: data.category,
        };
      }
    }
  } catch (err) {
    console.warn('[localDb] Barcode lookup request error:', err);
  }

  return null;
}

