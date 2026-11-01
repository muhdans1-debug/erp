import { useEffect, useRef } from 'react';

export const useBarcodeScanner = (onScan: (barcode: string) => void) => {
  const buffer = useRef('');
  const lastKeyTime = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();

      // If more than 50ms has passed since the last keystroke, 
      // it's human manual typing, not the hardware scanner speed. Clear the buffer.
      if (currentTime - lastKeyTime.current > 50) {
        buffer.current = '';
      }

      lastKeyTime.current = currentTime;

      // If the scanner hits Enter (the standard suffix), the barcode is complete
      if (e.key === 'Enter' && buffer.current.length > 0) {
        e.preventDefault(); // Stop the Enter key from submitting forms or activating focused elements
        const scannedCode = buffer.current.trim();
        buffer.current = ''; // Reset for the next item
        if (scannedCode) {
          onScan(scannedCode);
        }
        return;
      }

      // Ignore special modifier keys, only capture printable characters
      if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);
};
