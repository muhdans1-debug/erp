import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Headless Hardware NFC Reader Hook
 * Manages NDEFReader (Web NFC API) and native Sunmi hardware NFC antenna lifecycles.
 * Uses AbortController to properly release the hardware antenna on stopScan or unmount,
 * preventing hardware lockups and eliminating UI thread freezes.
 */
export const useNfcReader = (onCardScanned: (uid: string) => void) => {
  const [isScanning, setIsScanning] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const onCardScannedRef = useRef(onCardScanned);
  const lastScanRef = useRef<{ uid: string; time: number }>({ uid: '', time: 0 });

  useEffect(() => {
    onCardScannedRef.current = onCardScanned;
  }, [onCardScanned]);

  // Safe handler that suppresses duplicate continuous RF antenna triggers within 800ms
  const handleScannedUid = useCallback((cleanUid: string) => {
    const now = Date.now();
    if (lastScanRef.current.uid === cleanUid && (now - lastScanRef.current.time) < 800) {
      return;
    }
    lastScanRef.current = { uid: cleanUid, time: now };
    onCardScannedRef.current(cleanUid);
  }, []);

  const stopScan = useCallback(() => {
    if (controllerRef.current) {
      try {
        controllerRef.current.abort(); // Safely release the hardware antenna
      } catch { }
      controllerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    setNfcError(null);

    // Guard: Abort existing controller before creating a new scan session
    if (controllerRef.current) {
      try {
        controllerRef.current.abort();
      } catch { }
      controllerRef.current = null;
    }

    // 1. Web NFC (NDEFReader) path with AbortController lifecycle guard
    if ('NDEFReader' in window) {
      try {
        const ndef = new (window as any).NDEFReader();
        controllerRef.current = new AbortController();

        await ndef.scan({ signal: controllerRef.current.signal });
        setIsScanning(true);
        setNfcError(null);

        ndef.addEventListener('reading', (event: any) => {
          // Mifare cards return a serialNumber (UID) formatted like "04:A1:B2:C3"
          // We strip colons to match canonical nfcCardId in the database
          const rawUid = event.serialNumber || '';
          const cleanUid = rawUid.replace(/[:\-]/g, '').toUpperCase();
          if (cleanUid) {
            handleScannedUid(cleanUid);
          }
        });

        ndef.addEventListener('readingerror', () => {
          setNfcError('Card read failed. Please tap again.');
        });
        return;
      } catch (error: any) {
        // If aborted by user, don't show as error
        if (error.name === 'AbortError') return;
        setNfcError(`NFC Error: ${error.message || 'Permission denied or antenna busy'}`);
        setIsScanning(false);
      }
    } else {
      // In environments without Web NFC (e.g. standard Chrome on desktop or native Capacitor fallback)
      setIsScanning(true);
    }
  }, []);

  // 2. Hardware event bridge: Also capture Sunmi native hardware antenna broadcasts
  useEffect(() => {
    const handleSunmiScan = (e: any) => {
      const rawId = e?.detail?.nfcId || e?.detail?.tag_id || e?.detail;
      if (typeof rawId === 'string' && rawId.trim()) {
        const cleanUid = rawId.replace(/[:\-]/g, '').toUpperCase();
        handleScannedUid(cleanUid);
      }
    };

    window.addEventListener('sunmi-nfc-scan', handleSunmiScan);
    window.addEventListener('sunmi-nfc-broadcast', handleSunmiScan);

    return () => {
      window.removeEventListener('sunmi-nfc-scan', handleSunmiScan);
      window.removeEventListener('sunmi-nfc-broadcast', handleSunmiScan);
    };
  }, []);

  // 3. Auto-cleanup: Safely release the hardware antenna when the component unmounts
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  return { startScan, stopScan, isScanning, nfcError };
};

