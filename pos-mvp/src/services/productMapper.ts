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

  return {
    id: String(row.id || ''),
    barcode: String(row.barcode || ''),
    name: String(row.name || ''),
    // Safely fall back to aliases if the new column is null during migration
    price: Number(row.price ?? row.sellingPrice ?? 0),
    unitCost: Number(row.unitCost ?? row.purchasePrice ?? 0),
    vatRate: Number(row.vatRate ?? row.taxRate ?? 0),
    isScaleItem: Boolean(row.isScaleItem ?? row.is_weighed_item ?? false),
    stockQuantity: Number(row.stockQuantity ?? row.quantity ?? 0),
    category: row.category,
    isQuickProduct: Boolean(row.isQuickProduct),
    scaleWeight: row.scaleWeight ? Number(row.scaleWeight) : undefined,
    originalPrice: row.originalPrice ? Number(row.originalPrice) : undefined,
    discountNote: row.discountNote,
    productId: row.productId,
    total_price: row.total_price ? Number(row.total_price) : undefined,
    nameAr: row.nameAr
  };
};

