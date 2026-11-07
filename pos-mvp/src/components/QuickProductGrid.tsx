import React from 'react';
import { Plus } from 'lucide-react';
import { Product } from '../types/pos';

export interface QuickProductGridProps {
  products: Product[];
  catalog: Product[];
  onProductClick: (product: Product) => void;
  isEditMode?: boolean;
  isPositionSwapActive?: boolean;
  swapSourceProduct?: Product | null;
  onAddQuickProduct?: () => void;
  onSelectAllCategory?: () => void;
  getCategoryTheme?: (cat?: string) => { card: string; badge: string; label: string };
}

const defaultGetCategoryTheme = (cat?: string) => {
  const raw = (cat || 'ESSENTIALS').toUpperCase();
  const label = cat ? cat.charAt(0) + cat.slice(1).toLowerCase() : 'Essentials';
  switch (raw) {
    case 'PRODUCE':
      return { card: 'bg-emerald-50/90 hover:bg-emerald-100 border-emerald-200 text-emerald-950', badge: 'bg-emerald-200/80 text-emerald-800', label };
    case 'BAKERY':
      return { card: 'bg-amber-50/90 hover:bg-amber-100 border-amber-200 text-amber-950', badge: 'bg-amber-200/80 text-amber-800', label };
    case 'DAIRY':
      return { card: 'bg-sky-50/90 hover:bg-sky-100 border-sky-200 text-sky-950', badge: 'bg-sky-200/80 text-sky-800', label };
    case 'MEAT':
      return { card: 'bg-rose-50/90 hover:bg-rose-100 border-rose-200 text-rose-950', badge: 'bg-rose-200/80 text-rose-800', label };
    case 'PROMO':
      return { card: 'bg-purple-50/90 hover:bg-purple-100 border-purple-200 text-purple-950', badge: 'bg-purple-200/80 text-purple-800', label };
    default:
      return { card: 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900', badge: 'bg-slate-200 text-slate-700', label };
  }
};

/**
 * High-Performance Memoized Quick Product Grid
 * Wrapped with React.memo so hardware barcode scans, cart mutations,
 * and cashier typing do NOT trigger re-renders of the product catalog.
 */
export const QuickProductGrid = React.memo<QuickProductGridProps>(({
  products,
  catalog,
  onProductClick,
  isEditMode = false,
  isPositionSwapActive = false,
  swapSourceProduct = null,
  onAddQuickProduct,
  onSelectAllCategory,
  getCategoryTheme = defaultGetCategoryTheme
}) => {
  return (
    <div className="grid grid-cols-3 xl:grid-cols-4 gap-2.5">
      {products.map((prod) => {
        const theme = getCategoryTheme(prod.category);
        const catalogItem = catalog.find(
          (p) => p.id === prod.id || (p.barcode && prod.barcode && p.barcode === prod.barcode)
        );
        const currentStock = catalogItem?.stockQuantity !== undefined
          ? Number(catalogItem.stockQuantity)
          : (prod.stockQuantity !== undefined ? Number(prod.stockQuantity) : null);
        const isOutOfStock = currentStock !== null && currentStock <= 0;
        const isLowStock = currentStock !== null && currentStock > 0 && currentStock <= ((prod as any).minThreshold ?? (prod as any).min_stock ?? 5);
        const isSelectedForSwap = swapSourceProduct?.id === prod.id;

        return (
          <button
            key={prod.id}
            type="button"
            onClick={() => onProductClick(prod)}
            className={`min-h-[85px] p-3 rounded-2xl flex flex-col justify-between border cursor-pointer active:scale-95 transition-all shadow-xs text-left relative ${
              isSelectedForSwap
                ? 'border-2 border-blue-600 ring-4 ring-blue-400 bg-blue-100 text-blue-950 shadow-lg scale-102 animate-pulse'
                : isEditMode
                ? 'border-2 border-dashed border-amber-500 ring-2 ring-amber-300/60 bg-amber-50/80 hover:bg-amber-100 text-amber-950 shadow-md'
                : isOutOfStock
                ? 'bg-slate-100 border-slate-200 text-slate-400 opacity-60'
                : theme.card
            }`}
          >
            {isEditMode && (
              <span className={`absolute -top-2 -right-1.5 px-2 py-0.5 text-white text-[9px] rounded-full font-black uppercase shadow-xs tracking-wider border border-white ${
                isSelectedForSwap
                  ? 'bg-blue-600 animate-bounce'
                  : isPositionSwapActive
                  ? (swapSourceProduct ? 'bg-emerald-600' : 'bg-blue-600')
                  : 'bg-amber-600'
              }`}>
                {isSelectedForSwap
                  ? '1️⃣ SOURCE'
                  : isPositionSwapActive
                  ? (swapSourceProduct ? 'SWAP HERE ↵' : '⇄ SWAP')
                  : '✏️ EDIT'}
              </span>
            )}
            <div className="flex items-center justify-between gap-1 w-full">
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md uppercase tracking-wider ${theme.badge}`}>
                {theme.label}
              </span>
              {isOutOfStock ? (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white tracking-wider">
                  OUT OF STOCK
                </span>
              ) : isLowStock ? (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-white tracking-wider">
                  {currentStock} LEFT
                </span>
              ) : prod.vatRate === 0 ? (
                <span className="text-[9px] font-mono font-semibold opacity-75 text-emerald-800">
                  0% VAT
                </span>
              ) : null}
            </div>
            <div className="my-1">
              <h4 className={`font-bold text-xs sm:text-sm leading-tight line-clamp-2 ${isOutOfStock && !isEditMode ? 'line-through text-slate-400' : ''}`}>
                {prod.name}
              </h4>
            </div>
            <div className="flex items-center justify-between w-full pt-1 border-t border-black/5">
              <span className="font-black text-xs sm:text-sm font-mono tabular-nums">
                BD {Number(prod.sellingPrice).toFixed(3)}
              </span>
              <span className={`text-[10px] font-bold ${
                isEditMode
                  ? 'text-amber-800 underline'
                  : isOutOfStock
                  ? 'text-red-600 font-extrabold'
                  : isLowStock
                  ? 'text-amber-700 font-bold'
                  : 'opacity-60'
              }`}>
                {isEditMode ? 'Customize ⚙️' : isOutOfStock ? '0 in Stock' : currentStock !== null ? `${currentStock} in stock` : '+ Tap'}
              </span>
            </div>
          </button>
        );
      })}

      {/* Add Quick Product Slot in Edit Mode */}
      {isEditMode && onAddQuickProduct && (
        <button
          type="button"
          onClick={onAddQuickProduct}
          className="min-h-[85px] p-3 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-blue-400 bg-blue-50/60 hover:bg-blue-100/80 text-blue-700 cursor-pointer active:scale-95 transition-all shadow-xs"
        >
          <Plus size={22} className="stroke-[3] mb-0.5" />
          <span className="text-xs font-bold">Add Item to Grid</span>
        </button>
      )}

      {products.length === 0 && (
        <div className="col-span-full text-center py-12 text-slate-400">
          <p className="font-bold text-sm">No items in this category</p>
          {onSelectAllCategory && (
            <button
              type="button"
              onClick={onSelectAllCategory}
              className="mt-2 text-xs font-bold text-blue-600 underline cursor-pointer"
            >
              View All Quick Items
            </button>
          )}
        </div>
      )}
    </div>
  );
});

QuickProductGrid.displayName = 'QuickProductGrid';
