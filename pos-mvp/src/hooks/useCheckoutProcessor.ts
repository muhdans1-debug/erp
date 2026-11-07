import { useMemo } from 'react';
import { useCartStore, CartItem } from '../store/cartStore';
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

  // Memoized Bahrain NBR Tax Calculations using canonical .price, .qty, and .vatRate exclusively
  const cartTotals = useMemo(() => {
    let subtotal = 0;
    let totalVat = 0;
    let totalSavings = 0;

    cart.forEach((item) => {
      const lineTotal = Number(((item.price || 0) * (item.qty || 1)).toFixed(3));
      const origPrice = Number(item.originalPrice ?? item.price ?? 0);
      if (origPrice > (item.price || 0)) {
        totalSavings += (origPrice - (item.price || 0)) * (item.qty || 1);
      }
      const rate = Number(item.vatRate ?? 0);
      if (rate === 10) {
        const lineTax = lineTotal - (lineTotal / 1.10);
        totalVat += lineTax;
        subtotal += (lineTotal - lineTax);
      } else {
        subtotal += lineTotal;
      }
    });

    const finalTotal = subtotal + totalVat;

    return {
      subtotal: Number(subtotal.toFixed(3)),
      totalVat: Number(totalVat.toFixed(3)),
      vat: Number(totalVat.toFixed(3)),
      finalTotal: Number(finalTotal.toFixed(3)),
      total: Number(finalTotal.toFixed(3)),
      totalSavings: Number(totalSavings.toFixed(3)),
      subtotalStr: subtotal.toFixed(3),
      totalVatStr: totalVat.toFixed(3),
      finalTotalStr: finalTotal.toFixed(3),
      totalSavingsStr: totalSavings.toFixed(3)
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

