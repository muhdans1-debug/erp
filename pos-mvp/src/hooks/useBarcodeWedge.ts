// pos-mvp/src/hooks/useBarcodeWedge.ts
import { useEffect, useRef } from 'react';
import { useCartStore } from '../store/cartStore';
import { fetchProductByBarcode } from '../services/localDb';

/**
 * Headless Hardware Barcode Scanner Wedge Hook
 * Intercepts high-speed laser hardware scanner keystrokes (< 50ms buffer)
 * completely outside the React render cycle, resolving against local SQLite
 * and injecting into Zustand with ZERO top-level re-renders.
 */
export function useBarcodeWedge() {
  const buffer = useRef<string>('');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // 1. Ignore keystrokes if the cashier is actively typing in a search bar, modal input, or CPR field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 2. Intercept the hardware carriage return (Enter key)
      if (e.key === 'Enter') {
        if (timeout.current) clearTimeout(timeout.current);
        const scannedCode = buffer.current.trim();
        buffer.current = '';

        if (scannedCode) {
          e.preventDefault();
          console.log(`📠 Hardware Scan Intercepted: ${scannedCode}`);

          // Broadcast raw hardware scan event for drawers or modals (e.g. barcode binding, receiving)
          window.dispatchEvent(new CustomEvent('hardware-barcode-scan', { detail: scannedCode }));

          // Check if cashier scanned a Return / Refund NBR invoice barcode
          if (scannedCode.toUpperCase().startsWith('INV-') || scannedCode.toUpperCase().startsWith('REF-')) {
            window.dispatchEvent(new CustomEvent('receipt-barcode-scanned', { detail: scannedCode }));
            return;
          }

          try {
            const product = await fetchProductByBarcode(scannedCode);
            if (product) {
              // ⚡ THE MAGIC: We interact with Zustand's state directly, bypassing React
              useCartStore.getState().addItem(product);
              window.dispatchEvent(new CustomEvent('barcode-scan-success', { detail: { product, scannedCode } }));
            } else {
              console.warn(`Item not found in local catalog: ${scannedCode}`);
              window.dispatchEvent(new CustomEvent('barcode-scan-miss', { detail: { scannedCode } }));
            }
          } catch (err) {
            console.error('Barcode lookup failed', err);
          }
        }
        return;
      }

      // 3. Accumulate hardware keystrokes (ignoring Shift/Ctrl/Alt modifiers)
      if (e.key.length === 1) {
        buffer.current += e.key;
      }

      // 4. Reset the buffer if typing pauses (Scanners fire characters < 20ms apart)
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        buffer.current = '';
      }, 50);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);
}

