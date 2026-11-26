// pos-mvp/src/services/productMapper.ts
import { Product } from '../types/pos';

/**
 * Database Anti-Corruption Layer (ACL)
 * Maps raw database rows from Turso / SQLite into canonical Product domain models,
 * isolating domain logic from legacy database schema column aliases.
 */
export const mapDbRowToProduct = (row: any): Product => {
  if (!row) {
    return {
      id: '',
      barcode: '',
      name: '',
      price: 0,
      unitCost: 0,
      vatRate: 0,
      isScaleItem: false,
      stockQuantity: 0
    };
  }

  const price = Math.max(0, Math.abs(Number(row.price ?? row.sellingPrice ?? 0)));
  const unitCost = Math.max(0, Math.abs(Number(row.unitCost ?? row.purchasePrice ?? 0)));
  const vatRate = Number(row.vatRate ?? row.taxRate ?? 0);
  const isScale = Boolean(
    row.isScaleItem ??
    (row.is_weighed_item === 1 ||
    row.is_weighed_item === true ||
    row.is_weighed_item === '1' ||
    row.is_weighed_item === 'true')
  );
  const plu = (row.plu_code !== undefined && row.plu_code !== null && String(row.plu_code).trim() !== '')
    ? String(row.plu_code).trim()
    : ((row.pluCode !== undefined && row.pluCode !== null && String(row.pluCode).trim() !== '') ? String(row.pluCode).trim() : null);
  const img = row.image_url || row.imageUrl || null;
  const imgThumb = row.image_url_thumb || row.imageUrlThumb || null;
  const arName = row.name_ar || row.nameAr || undefined;

  return {
    id: String(row.id || ''),
    barcode: String(row.barcode || ''),
    name: String(row.name || ''),
    nameAr: arName,
    name_ar: arName,
    plu_code: plu,
    pluCode: plu,
    image_url: img,
    imageUrl: img,
    image_url_thumb: imgThumb,
    imageUrlThumb: imgThumb,
    price,
    sellingPrice: price,
    unitCost,
    purchasePrice: unitCost,
    vatRate,
    isScaleItem: isScale,
    is_weighed_item: row.is_weighed_item !== undefined ? row.is_weighed_item : (isScale ? 1 : 0),
    stockQuantity: Number(row.stockQuantity ?? row.quantity) > 0 ? Number(row.stockQuantity ?? row.quantity) : 99999,
    category: row.category,
    isQuickProduct: Boolean(row.isQuickProduct),
    scaleWeight: row.scaleWeight ? Number(row.scaleWeight) : undefined,
    originalPrice: row.originalPrice ? Number(row.originalPrice) : undefined,
    discountNote: row.discountNote,
    productId: row.productId || row.id,
    total_price: row.total_price ? Number(row.total_price) : undefined,
  };
};

