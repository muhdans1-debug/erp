import { useMemo } from 'react';
import { useCartStore, CartItem, calculateCartTotals } from '../store/cartStore';
import { Product } from '../types/pos';

/**
 * Business Logic Hook: useCheckoutProcessor
 * Decouples cart mutations, multi-cart tab management, and Bahrain NBR VAT calculations
 * from the React UI render tree.
 */
export const useCheckoutProcessor = () => {
  const carts = useCartStore((s) => s.carts);
  const activeCartId = useCartStore((s) => s.activeCartId);
  const cart = useCartStore((s) => s.items as unknown as (CartItem & Product)[]);
  const activeCart = useCartStore((s) => s.carts.find((c) => c.id === s.activeCartId) || s.carts[0]);

  // Memoized Bahrain NBR Tax Calculations
  const cartTotals = useMemo(() => {
    const totals = calculateCartTotals(cart as any);
    return {
      subtotal: totals.subtotal,
      totalVat: totals.totalVat,
      vat: totals.totalVat,
      finalTotal: totals.finalTotal,
      total: totals.finalTotal,
      totalSavings: totals.totalSavings,
      subtotalStr: totals.subtotalStr,
      totalVatStr: totals.totalVatStr,
      finalTotalStr: totals.finalTotalStr,
      totalSavingsStr: totals.totalSavingsStr
    };
  }, [cart]);

  const addItem = (product: Product | CartItem, quantity: number = 1, isReturn: boolean = false) => {
    useCartStore.getState().addItem(product as any, quantity, isReturn);
  };

  const updateQuantity = (id: string, qty: number) => {
    useCartStore.getState().updateQuantity(id, qty);
  };

  const adjustItemQtyByIndex = (index: number, delta: number, isReturn: boolean = false) => {
    useCartStore.getState().adjustItemQtyByIndex(index, delta, isReturn);
  };

  const removeItem = (idOrIndex: string | number) => {
    useCartStore.getState().removeItem(idOrIndex);
  };

  const clearCart = () => {
    useCartStore.getState().clearActiveCart();
  };

  const addNewTab = () => {
    useCartStore.getState().addNewTab();
  };

  const closeTab = (tabId: string) => {
    useCartStore.getState().closeTab(tabId);
  };

  const setActiveCartId = (tabId: string) => {
    useCartStore.getState().setActiveCartId(tabId);
  };

  const applyPriceOverride = (indexOrId: string | number, newUnitPrice: number, discountLabel?: string) => {
    useCartStore.getState().applyPriceOverride(indexOrId as any, newUnitPrice, discountLabel);
  };

  return {
    cart,
    carts,
    activeCartId,
    activeCart,
    cartTotals,
    addItem,
    updateQuantity,
    adjustItemQtyByIndex,
    removeItem,
    clearCart,
    addNewTab,
    closeTab,
    setActiveCartId,
    applyPriceOverride
  };
};
