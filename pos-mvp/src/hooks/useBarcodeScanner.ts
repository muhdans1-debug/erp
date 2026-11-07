import { useEffect, useRef } from 'react';

/**
 * Headless Hardware Barcode Scanner Hook
 * Intercepts high-speed USB HID / laser barcode scanner keyboard events,
 * buffers characters within a 100ms sliding window, and emits onScan on Enter.
 * Decouples hardware input from the React render tree.
 */
export const useBarcodeScanner = (onScan: (barcode: string) => void) => {
  const buffer = useRef('');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Never capture keystrokes if the cashier is actively typing in an input field
      const activeEl = document.activeElement;
      const isInputActive =
        activeEl &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (isInputActive) {
        return;
      }

      // 2. Hardware Enter (carriage return) terminates the barcode string
      if (e.key === 'Enter') {
        const scanned = buffer.current.trim();
        buffer.current = '';
        if (timeout.current) clearTimeout(timeout.current);

        if (scanned.length >= 2) {
          e.preventDefault();
          onScanRef.current(scanned);
        }
        return;
      }

      // 3. Capture printable characters (alphanumeric, hyphens, colons for barcodes & NBR invoice numbers)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer.current += e.key;

        // Reset buffer if typing pauses beyond 100ms (human typing threshold vs laser burst <20ms)
        if (timeout.current) clearTimeout(timeout.current);
        timeout.current = setTimeout(() => {
          buffer.current = '';
        }, 100);
      }
    };

    // 4. Also listen for custom Sunmi Android Broadcast Receiver events
    const handleHardwareCustomScan = (e: any) => {
      const code = e?.detail;
      if (typeof code === 'string' && code.trim().length >= 2) {
        onScanRef.current(code.trim());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('hardware-barcode-scan', handleHardwareCustomScan);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('hardware-barcode-scan', handleHardwareCustomScan);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);
};
