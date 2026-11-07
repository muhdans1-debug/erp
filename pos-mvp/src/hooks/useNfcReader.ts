import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorNfc } from '@capgo/capacitor-nfc';
import { playNfcChime } from '../utils/sound';

/**
 * Unified Hardware & Web NFC Reader Hook
 * - Native Sunmi hardware antenna support via @capgo/capacitor-nfc
 * - Browser Web NFC (NDEFReader) support with safe permission error handling
 * - Hardware broadcast bridge (sunmi-nfc-scan / sunmi-nfc-broadcast)
 * - Safe fallback for desktop laptops without blocking red permission errors
 */
export const useNfcReader = (
  onCardScanned: (uid: string) => void,
  onNfcUnavailable?: () => void
) => {
  const [isScanning, setIsScanning] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const capacitorListenerRef = useRef<any>(null);
  const onCardScannedRef = useRef(onCardScanned);
  const onNfcUnavailableRef = useRef(onNfcUnavailable);
  const lastScanRef = useRef<{ uid: string; time: number }>({ uid: '', time: 0 });
  const ndefRef = useRef<any>(null);
  const listenerAttached = useRef(false);

  useEffect(() => {
    onCardScannedRef.current = onCardScanned;
  }, [onCardScanned]);

  useEffect(() => {
    onNfcUnavailableRef.current = onNfcUnavailable;
  }, [onNfcUnavailable]);

  // Suppress duplicate continuous RF antenna triggers within 800ms
  const handleScannedUid = useCallback((cleanUid: string) => {
    const now = Date.now();
    if (lastScanRef.current.uid === cleanUid && (now - lastScanRef.current.time) < 800) {
      return;
    }
    lastScanRef.current = { uid: cleanUid, time: now };
    if (onCardScannedRef.current) {
      onCardScannedRef.current(cleanUid);
    }
  }, []);

  const stopScan = useCallback(() => {
    // 1. Release Web NFC AbortController
    if (controllerRef.current) {
      try {
        controllerRef.current.abort();
      } catch { }
      controllerRef.current = null;
    }

    // 2. Release native Capacitor NFC listener & hardware antenna
    if (capacitorListenerRef.current) {
      try {
        if (typeof capacitorListenerRef.current.remove === 'function') {
          capacitorListenerRef.current.remove();
        }
      } catch { }
      capacitorListenerRef.current = null;
    }

    if (Capacitor.isNativePlatform()) {
      CapacitorNfc.stopScanning().catch(() => {});
    }

    setIsScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    setNfcError(null);

    // Guard: Clean up any existing scan session
    stopScan();

    // PATH 1: Native Sunmi / Android Hardware Platform (via CapacitorNfc)
    if (Capacitor.isNativePlatform()) {
      try {
        const { supported } = await CapacitorNfc.isSupported();
        if (supported) {
          await CapacitorNfc.startScanning({ invalidateAfterFirstRead: false });

          capacitorListenerRef.current = await CapacitorNfc.addListener('nfcEvent', (event: any) => {
            let hexString = '';
            if (event?.tag?.id) {
              if (Array.isArray(event.tag.id)) {
                hexString = event.tag.id
                  .map((byte: number) => (byte & 0xff).toString(16).padStart(2, '0').toUpperCase())
                  .join('');
              } else if (typeof event.tag.id === 'string') {
                hexString = event.tag.id.replace(/[:\-]/g, '').toUpperCase();
              }
            }

            if (hexString) {
              console.log('📡 [Native NFC Tag Scanned]:', hexString);
              try {
                playNfcChime();
              } catch { }
              handleScannedUid(hexString);
            }
          });

          setIsScanning(true);
          return;
        } else {
          console.warn('Capacitor NFC reports hardware not supported on this device.');
        }
      } catch (nativeErr) {
        console.warn('Capacitor NFC initialization error:', nativeErr);
      }
    }

    // PATH 2: Browser Web NFC (NDEFReader)
    // Only attempt on non-native environments if NDEFReader exists in window
    if (!Capacitor.isNativePlatform() && 'NDEFReader' in window) {
      try {
        if (!ndefRef.current) {
          ndefRef.current = new (window as any).NDEFReader();
        }

        controllerRef.current = new AbortController();
        await ndefRef.current.scan({ signal: controllerRef.current.signal });
        setIsScanning(true);
        setNfcError(null);

        if (!listenerAttached.current) {
          ndefRef.current.addEventListener('reading', (event: any) => {
            const rawUid = event.serialNumber || '';
            const cleanUid = rawUid.replace(/[:\-]/g, '').toUpperCase();
            if (cleanUid) {
              try {
                playNfcChime();
              } catch { }
              handleScannedUid(cleanUid);
            }
          });

          ndefRef.current.addEventListener('readingerror', () => {
            setNfcError('Card read failed. Please tap again.');
          });
          listenerAttached.current = true;
        }
        return;
      } catch (error: any) {
        if (error.name === 'AbortError') return;

        console.info('Web NFC not permitted or unsupported on this platform (Desktop/HTTP):', error.message);

        // On desktop/laptop browsers or non-secure contexts, NDEFReader throws NotAllowedError: NFC permission denied.
        // We gracefully suppress this from blocking the cashier and invoke the fallback customer picker.
        if (
          error.name === 'NotAllowedError' || 
          error.name === 'SecurityError' || 
          (typeof error.message === 'string' && error.message.toLowerCase().includes('permission denied'))
        ) {
          setIsScanning(false);
          setNfcError(null);
          if (onNfcUnavailableRef.current) {
            onNfcUnavailableRef.current();
          }
          return;
        }

        setNfcError(`NFC: ${error.message || 'Antenna unavailable'}`);
        setIsScanning(false);
        return;
      }
    }

    // PATH 3: Desktop / Wedge / LAN Relay Fallback
    // When no physical Web NFC is present (e.g. desktop Chrome), mark as listening for wedge/relay
    setIsScanning(true);
    setNfcError(null);
    if (onNfcUnavailableRef.current) {
      onNfcUnavailableRef.current();
    }
  }, [handleScannedUid, stopScan]);

  // PATH 4: Hardware event bridge: Capture Sunmi native hardware broadcasts & WebSocket relays
  useEffect(() => {
    const handleSunmiScan = (e: any) => {
      const rawId = e?.detail?.nfcId || e?.detail?.tag_id || e?.detail;
      if (typeof rawId === 'string' && rawId.trim()) {
        const cleanUid = rawId.replace(/[:\-]/g, '').toUpperCase();
        try {
          playNfcChime();
        } catch { }
        handleScannedUid(cleanUid);
      }
    };

    window.addEventListener('sunmi-nfc-scan', handleSunmiScan);
    window.addEventListener('sunmi-nfc-broadcast', handleSunmiScan);

    return () => {
      window.removeEventListener('sunmi-nfc-scan', handleSunmiScan);
      window.removeEventListener('sunmi-nfc-broadcast', handleSunmiScan);
    };
  }, [handleScannedUid]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, [stopScan]);

  return { startScan, stopScan, isScanning, nfcError };
};
