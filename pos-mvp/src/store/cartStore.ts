// pos-mvp/src/store/cartStore.ts
import { create } from 'zustand';

export interface CartItem {
  id: string;
  barcode?: string;
  name: string;
  nameAr?: string;
  price: number;
  sellingPrice: number;
  qty: number;
  quantity: number;
  vatRate?: number; // 10% standard in Bahrain, 0% for zero-rated basic foods
  taxRate?: number;
  purchasePrice?: number;
  unitCost?: number;
  stockQuantity?: number;
  isScaleItem?: boolean;
  scaleWeight?: number;
  is_weighed_item?: boolean;
  originalPrice?: number;
  discountNote?: string;
  total_price?: number;
  category?: string;
}

export interface CartTab {
  id: string;
  name: string;
  items: CartItem[];
}

export interface CartTotals {
  subtotal: number;
  totalVat: number;
  finalTotal: number;
  totalSavings: number;
  subtotalStr: string;
  totalVatStr: string;
  finalTotalStr: string;
  totalSavingsStr: string;
}

export function calculateCartTotals(cartItems: CartItem[]): CartTotals {
  let subtotal = 0;
  let totalVat = 0;
  let finalTotal = 0;
  let totalSavings = 0;

  cartItems.forEach((item) => {
    const qty = Number(item.qty ?? (item as any).quantity ?? 1);
    const unitPrice = Number(item.price ?? (item as any).sellingPrice ?? 0);
    const origPrice = Number(item.originalPrice ?? unitPrice);
    if (origPrice > unitPrice) {
      totalSavings += (origPrice - unitPrice) * qty;
    }
    const lineTotal = Number((unitPrice * qty).toFixed(3));
    finalTotal += lineTotal;

    // Bahrain NBR Tax Rules: 10% standard, basic food items are 0% (Zero-Rated)
    const rate = item.vatRate !== undefined
      ? Number(item.vatRate)
      : ((item as any).taxRate !== undefined && (item as any).taxRate === 0 ? 0 : 10);

    if (rate === 10) {
      const lineTax = lineTotal - (lineTotal / 1.10);
      totalVat += lineTax;
      subtotal += (lineTotal - lineTax);
    } else {
      subtotal += lineTotal;
    }
  });

  return {
    subtotal: Number(subtotal.toFixed(3)),
    totalVat: Number(totalVat.toFixed(3)),
    finalTotal: Number(finalTotal.toFixed(3)),
    totalSavings: Number(totalSavings.toFixed(3)),
    subtotalStr: subtotal.toFixed(3),
    totalVatStr: totalVat.toFixed(3),
    finalTotalStr: finalTotal.toFixed(3),
    totalSavingsStr: totalSavings.toFixed(3)
  };
}

export interface CartState {
  // Active Tab State
  activeCartId: string;
  carts: CartTab[];
  items: CartItem[]; // Items in currently active cart
  lastScannedProductId: string | null;

  // Actions
  addItem: (product: Partial<CartItem> & { id: string; name: string }, quantity?: number, isReturnMode?: boolean) => boolean;
  updateQuantity: (idOrIndex: string | number, newQty: number) => void;
  adjustItemQtyByIndex: (index: number, delta: number, isReturnMode?: boolean) => void;
  removeItem: (idOrIndex: string | number) => void;
  applyPriceOverride: (idOrIndex: string | number, newUnitPrice: number, discountLabel?: string) => void;
  resetCart: () => void;
  clearActiveCart: () => void;
  setCartItems: (items: CartItem[]) => void;

  // Parked Cart Tabs Management
  addNewTab: () => void;
  closeTab: (idToClose: string) => void;
  setActiveCartId: (id: string) => void;

  // Selectors / Computed
  getCartTotals: () => CartTotals;
  getCartTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  activeCartId: '1',
  carts: [{ id: '1', name: 'Cart 1', items: [] }],
  items: [],
  lastScannedProductId: null,

  addItem: (product, quantity = 1, isReturnMode = false) => {
    const state = get();
    const unitPrice = Number((product.sellingPrice ?? product.price ?? 0).toFixed(3));
    const qtyModifier = isReturnMode ? -Math.abs(quantity) : quantity;

    const existingIndex = state.items.findIndex((p) => p.id === product.id);

    let updatedItems: CartItem[];
    if (existingIndex !== -1) {
      const existing = state.items[existingIndex];
      const newQty = Number(((existing.quantity ?? 1) + qtyModifier).toFixed(3));

      if (newQty <= 0) {
        updatedItems = state.items.filter((_, idx) => idx !== existingIndex);
      } else {
        updatedItems = state.items.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                qty: newQty,
                quantity: newQty,
                total_price: Number((unitPrice * newQty).toFixed(3))
              }
            : item
        );
      }
    } else {
      const newItem: CartItem = {
        id: product.id,
        barcode: product.barcode || '',
        name: product.name,
        nameAr: product.nameAr,
        price: unitPrice,
        sellingPrice: unitPrice,
        qty: qtyModifier,
        quantity: qtyModifier,
        vatRate: product.vatRate,
        taxRate: product.taxRate,
        purchasePrice: product.purchasePrice,
        unitCost: product.unitCost,
        stockQuantity: product.stockQuantity,
        isScaleItem: product.isScaleItem,
        scaleWeight: product.scaleWeight,
        is_weighed_item: product.is_weighed_item,
        originalPrice: product.originalPrice ?? unitPrice,
        discountNote: product.discountNote,
        total_price: Number((unitPrice * qtyModifier).toFixed(3)),
        category: product.category
      };
      updatedItems = [...state.items, newItem];
    }

    const updatedCarts = state.carts.map((c) =>
      c.id === state.activeCartId ? { ...c, items: updatedItems } : c
    );

    set({
      items: updatedItems,
      carts: updatedCarts,
      lastScannedProductId: product.id
    });

    return true;
  },

  updateQuantity: (idOrIndex, newQty) => {
    const state = get();
    const clampedQty = Math.max(0.001, Number(newQty.toFixed(3)));

    const updatedItems = state.items.map((item, idx) => {
      const match = typeof idOrIndex === 'number' ? idx === idOrIndex : item.id === idOrIndex;
      if (!match) return item;
      return {
        ...item,
        qty: clampedQty,
        quantity: clampedQty,
        total_price: Number(((item.sellingPrice ?? item.price) * clampedQty).toFixed(3))
      };
    });

    const updatedCarts = state.carts.map((c) =>
      c.id === state.activeCartId ? { ...c, items: updatedItems } : c
    );

    set({ items: updatedItems, carts: updatedCarts });
  },

  adjustItemQtyByIndex: (index, delta) => {
    const state = get();
    const targetItem = state.items[index];
    if (!targetItem) return;

    const currentQty = targetItem.quantity ?? targetItem.qty ?? 1;
    const isWeighed = Boolean(targetItem.is_weighed_item);
    const step = isWeighed ? 0.250 : 1;
    const newQty = Number((currentQty + delta * step).toFixed(3));

    let updatedItems: CartItem[];
    if (newQty <= 0.001) {
      updatedItems = state.items.filter((_, idx) => idx !== index);
    } else {
      updatedItems = state.items.map((item, idx) =>
        idx === index
          ? {
              ...item,
              qty: newQty,
              quantity: newQty,
              total_price: Number(((item.sellingPrice ?? item.price) * newQty).toFixed(3))
            }
          : item
      );
    }

    const updatedCarts = state.carts.map((c) =>
      c.id === state.activeCartId ? { ...c, items: updatedItems } : c
    );

    set({ items: updatedItems, carts: updatedCarts });
  },

  removeItem: (idOrIndex) => {
    const state = get();
    const updatedItems = state.items.filter((item, idx) => {
      if (typeof idOrIndex === 'number') return idx !== idOrIndex;
      return item.id !== idOrIndex;
    });

    const updatedCarts = state.carts.map((c) =>
      c.id === state.activeCartId ? { ...c, items: updatedItems } : c
    );

    set({ items: updatedItems, carts: updatedCarts });
  },

  applyPriceOverride: (idOrIndex, newUnitPrice, discountLabel) => {
    const state = get();
    const cleanPrice = Math.max(0, Number(newUnitPrice.toFixed(3)));

    const updatedItems = state.items.map((item, idx) => {
      const isMatch = typeof idOrIndex === 'number' ? idx === idOrIndex : item.id === idOrIndex;
      if (!isMatch) return item;
      const qty = Number(item.quantity ?? item.qty ?? 1);
      const currentOrig = Number(item.originalPrice ?? item.sellingPrice ?? item.price ?? cleanPrice);
      const preservedOrig = currentOrig > 0 ? currentOrig : cleanPrice;
      const effectiveNote = cleanPrice >= preservedOrig && !discountLabel ? undefined : discountLabel;

      return {
        ...item,
        price: cleanPrice,
        sellingPrice: cleanPrice,
        originalPrice: preservedOrig,
        discountNote: effectiveNote,
        total_price: Number((cleanPrice * qty).toFixed(3))
      };
    });

    const updatedCarts = state.carts.map((c) =>
      c.id === state.activeCartId ? { ...c, items: updatedItems } : c
    );

    set({ items: updatedItems, carts: updatedCarts });
  },

  resetCart: () => {
    const state = get();
    const updatedCarts = state.carts.map((c) =>
      c.id === state.activeCartId ? { ...c, items: [] } : c
    );
    set({ items: [], carts: updatedCarts, lastScannedProductId: null });
  },

  clearActiveCart: () => {
    const state = get();
    const updatedCarts = state.carts.map((c) =>
      c.id === state.activeCartId ? { ...c, items: [] } : c
    );
    set({ items: [], carts: updatedCarts, lastScannedProductId: null });
  },

  setCartItems: (items) => {
    const state = get();
    const updatedCarts = state.carts.map((c) =>
      c.id === state.activeCartId ? { ...c, items } : c
    );
    set({ items, carts: updatedCarts });
  },

  addNewTab: () => {
    const state = get();
    if (state.carts.length >= 4) return;
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const newTab: CartTab = {
      id: newId,
      name: `Cart ${state.carts.length + 1}`,
      items: []
    };
    set({
      carts: [...state.carts, newTab],
      activeCartId: newId,
      items: []
    });
  },

  closeTab: (idToClose) => {
    const state = get();
    if (state.carts.length <= 1) {
      set({
        carts: [{ id: state.activeCartId, name: 'Cart 1', items: [] }],
        items: []
      });
      return;
    }
    const filtered = state.carts.filter((c) => c.id !== idToClose);
    const newActiveId = state.activeCartId === idToClose ? filtered[0].id : state.activeCartId;
    const newActiveTab = filtered.find((c) => c.id === newActiveId) || filtered[0];

    set({
      carts: filtered,
      activeCartId: newActiveId,
      items: newActiveTab.items
    });
  },

  setActiveCartId: (id) => {
    const state = get();
    const targetCart = state.carts.find((c) => c.id === id);
    if (!targetCart) return;
    set({
      activeCartId: id,
      items: targetCart.items
    });
  },

  getCartTotals: () => {
    return calculateCartTotals(get().items);
  },

  getCartTotal: () => {
    return calculateCartTotals(get().items).finalTotal;
  }
}));

// Specialized fine-grained hooks for components to subscribe only to their slice
export const useCartItems = () => useCartStore((s) => s.items);
export const useCartTotal = () => useCartStore((s) => calculateCartTotals(s.items).finalTotal);
export const useCartTotals = () => useCartStore((s) => calculateCartTotals(s.items));

