import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorNfc } from '@capgo/capacitor-nfc';
import { playNfcChime } from '../utils/sound';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL } from '../utils/apiConfig';

const NFC_SESSION_TIMEOUT_SECONDS = 300; // 5 minutes auto-off

/**
 * On-Demand Hardware & Web NFC Reader Hook
 * - Strict On-Demand: Zero background polling or antenna battery draw when idle.
 * - Auto-Off Timer: Turns off NFC tap/polling after 5 minutes of inactivity.
 * - Single-Tap Completion: Automatically turns off upon successful card read.
 * - Only turns on when cashier taps "Pay with Khata (NFC)" or invokes startScan().
 */
export const useNfcReader = (
  onCardScanned: (uid: string) => void,
  onNfcUnavailable?: () => void
) => {
  const [isScanning, setIsScanning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [nfcError, setNfcError] = useState<string | null>(null);

  const isScanningRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const capacitorListenerRef = useRef<any>(null);
  const onCardScannedRef = useRef(onCardScanned);
  const onNfcUnavailableRef = useRef(onNfcUnavailable);
  const lastScanRef = useRef<{ uid: string; time: number }>({ uid: '', time: 0 });
  const ndefRef = useRef<any>(null);
  const listenerAttached = useRef(false);
  const countdownTimerRef = useRef<any>(null);
  const pollIntervalRef = useRef<any>(null);
  const lastRelayTsRef = useRef<number>(Date.now() - 3000);

  useEffect(() => {
    onCardScannedRef.current = onCardScanned;
  }, [onCardScanned]);

  useEffect(() => {
    onNfcUnavailableRef.current = onNfcUnavailable;
  }, [onNfcUnavailable]);

  const stopScan = useCallback(() => {
    isScanningRef.current = false;
    setIsScanning(false);
    setSecondsLeft(0);

    // 1. Clear 5-minute countdown timer
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    // 2. Clear cloud relay poller
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // 3. Release Web NFC AbortController
    if (controllerRef.current) {
      try {
        controllerRef.current.abort();
      } catch { }
      controllerRef.current = null;
    }

    // 4. Release native Capacitor NFC listener & hardware antenna
    if (capacitorListenerRef.current) {
      try {
        if (typeof capacitorListenerRef.current.remove === 'function') {
          capacitorListenerRef.current.remove();
        }
      } catch { }
      capacitorListenerRef.current = null;
    }

    if (Capacitor.isNativePlatform()) {
      CapacitorNfc.stopScanning().catch(() => { });
    }
  }, []);

  // Suppress duplicate continuous RF antenna triggers within 800ms
  // Automatically turns off NFC tap upon successful card scan
  const handleScannedUid = useCallback((cleanUid: string) => {
    if (!isScanningRef.current) return;

    const now = Date.now();
    if (lastScanRef.current.uid === cleanUid && (now - lastScanRef.current.time) < 800) {
      return;
    }
    lastScanRef.current = { uid: cleanUid, time: now };

    // Turn off NFC tap immediately upon successful read (user request)
    stopScan();

    if (onCardScannedRef.current) {
      onCardScannedRef.current(cleanUid);
    }
  }, [stopScan]);

  const startScan = useCallback(async () => {
    setNfcError(null);

    // Clean up any existing scan session
    stopScan();

    isScanningRef.current = true;
    setIsScanning(true);
    setSecondsLeft(NFC_SESSION_TIMEOUT_SECONDS);

    // 1. Start 5-Minute Inactivity Auto-Off Countdown
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          console.log('⏱️ [NFC Reader]: 5-minute inactivity timeout reached. Turning off NFC tap.');
          stopScan();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    countdownTimerRef.current = interval;

    // PATH 1: Native Sunmi / Android Hardware Platform (via CapacitorNfc)
    if (Capacitor.isNativePlatform()) {
      try {
        const { supported } = await CapacitorNfc.isSupported();
        if (supported) {
          await CapacitorNfc.startScanning({ invalidateAfterFirstRead: false });

          const parseTagId = (event: any) => {
            if (!isScanningRef.current) return;
            let hexString = '';
            const rawId = event?.tag?.id || event?.id || event?.tagId;
            if (rawId) {
              if (Array.isArray(rawId)) {
                hexString = rawId
                  .map((byte: number) => (byte & 0xff).toString(16).padStart(2, '0').toUpperCase())
                  .join('');
              } else if (typeof rawId === 'string') {
                hexString = rawId.replace(/[:\-]/g, '').toUpperCase();
              }
            }

            if (hexString) {
              console.log('📡 [Native NFC Tag Scanned]:', hexString);
              try { playNfcChime(); } catch { }
              window.dispatchEvent(new CustomEvent('sunmi-nfc-scan', { detail: { nfcId: hexString, tag_id: hexString } }));
              handleScannedUid(hexString);

              // Auto-relay to Cloud Edge so laptops can pick up this tap instantly over the web
              try {
                const bases = [getApiBaseUrl(), DEFAULT_EDGE_API_URL].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
                for (const base of bases) {
                  fetch(`${base}/api/nfc/relay`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
                    body: JSON.stringify({ tag_id: hexString, terminalId: 'Sunmi/F100' }),
                    signal: AbortSignal.timeout(2000)
                  }).catch(() => { });
                }
              } catch { }
            }
          };

          const l1 = await CapacitorNfc.addListener('nfcEvent', parseTagId);
          const l2 = await CapacitorNfc.addListener('tagDiscovered', parseTagId);
          capacitorListenerRef.current = {
            remove: () => {
              try { l1.remove?.(); } catch { }
              try { l2.remove?.(); } catch { }
            }
          };
          return;
        }
      } catch (nativeErr) {
        console.warn('Capacitor NFC initialization error:', nativeErr);
      }
    }

    // PATH 2: Browser Web NFC (NDEFReader)
    if (!Capacitor.isNativePlatform() && 'NDEFReader' in window) {
      try {
        if (!ndefRef.current) {
          ndefRef.current = new (window as any).NDEFReader();
        }

        controllerRef.current = new AbortController();
        await ndefRef.current.scan({ signal: controllerRef.current.signal });

        if (!listenerAttached.current) {
          ndefRef.current.addEventListener('reading', (event: any) => {
            if (!isScanningRef.current) return;
            const rawUid = event.serialNumber || '';
            const cleanUid = rawUid.replace(/[:\-]/g, '').toUpperCase();
            if (cleanUid) {
              try { playNfcChime(); } catch { }
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
        if (
          error.name === 'NotAllowedError' ||
          error.name === 'SecurityError' ||
          (typeof error.message === 'string' && error.message.toLowerCase().includes('permission denied'))
        ) {
          if (onNfcUnavailableRef.current) onNfcUnavailableRef.current();
          return;
        }
        setNfcError(`NFC: ${error.message || 'Antenna unavailable'}`);
        return;
      }
    }

    // PATH 3: Laptop / Desktop Cloud Edge Relay Poller (ONLY active during 5-minute scan window)
    if (!Capacitor.isNativePlatform()) {
      const pollRelay = async () => {
        if (!isScanningRef.current || (typeof document !== 'undefined' && document.hidden)) return;
        try {
          const apiBase = getApiBaseUrl();
          const res = await fetch(`${apiBase}/api/nfc/latest?t=${Date.now()}`, {
            headers: { 'x-pos-client': 'store-pos' },
            signal: AbortSignal.timeout(2000)
          });
          if (res.ok && isScanningRef.current) {
            const data = await res.json();
            const tag = data?.tag_id || data?.tagId || data?.latest?.tag_id || data?.latest?.tagId;
            const ts = Number(data?.timestamp || data?.latest?.timestamp || 0);
            const cust = data?.customer || data?.latest?.customer;

            if (tag && ts > lastRelayTsRef.current) {
              lastRelayTsRef.current = ts;
              console.log('📡 [Laptop Cloud NFC Relay Received]:', tag, cust?.name);
              try { playNfcChime(); } catch { }

              fetch(`${apiBase}/api/nfc/latest/clear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' }
              }).catch(() => { });

              window.dispatchEvent(new CustomEvent('sunmi-nfc-scan', { detail: { nfcId: tag, tag_id: tag, customer: cust, isRelayed: true } }));
              handleScannedUid(tag);
            }
          }
        } catch { }
      };

      pollRelay();
      pollIntervalRef.current = setInterval(pollRelay, 4000);
    }
  }, [handleScannedUid, stopScan]);

  // PATH 4: Hardware broadcast receiver for Sunmi native broadcasts (Only active when isScanning is true)
  useEffect(() => {
    const handleSunmiScan = (e: any) => {
      if (!isScanningRef.current) return;
      if (e?.detail?.isRelayed || e?.detail?.fromRelay) return;
      if (!Capacitor.isNativePlatform()) return;

      const rawId = e?.detail?.nfcId || e?.detail?.tag_id || e?.detail;
      if (typeof rawId === 'string' && rawId.trim()) {
        const cleanUid = rawId.replace(/[:\-]/g, '').toUpperCase();
        try { playNfcChime(); } catch { }
        handleScannedUid(cleanUid);

        try {
          const bases = [getApiBaseUrl(), DEFAULT_EDGE_API_URL].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
          for (const base of bases) {
            fetch(`${base}/api/nfc/relay`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-pos-client': 'store-pos' },
              body: JSON.stringify({ tag_id: cleanUid, terminalId: 'Sunmi POS' })
            }).catch(() => { });
          }
        } catch { }
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

  return { startScan, stopScan, isScanning, nfcError, secondsLeft };
};
