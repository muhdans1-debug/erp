import { useEffect, useState } from 'react';
import { CapacitorNfc } from '@capgo/capacitor-nfc';
import { playNfcChime } from '../utils/sound';

// Shared singleton state across components to prevent premature hardware shutdown
let activeSubscribers = 0;
let globalListener: any = null;
let isHardwareScanning = false;
let globalHardwareSupported: boolean | null = null;
let globalLastDetectedUid: string | null = null;
let isCooldown = false;

export const startHardwareScanning = async () => {
  if (isHardwareScanning) return;
  try {
    const { supported } = await CapacitorNfc.isSupported();
    globalHardwareSupported = supported;
    if (!supported) {
      console.warn('NFC hardware not detected on this device');
      return;
    }

    await CapacitorNfc.startScanning({ invalidateAfterFirstRead: false });
    isHardwareScanning = true;

    globalListener = await CapacitorNfc.addListener('nfcEvent', (event: any) => {
      if (isCooldown) return;

      let hexString = '';
      if (event?.tag?.id) {
        if (Array.isArray(event.tag.id)) {
          hexString = event.tag.id
            .map((byte: number) => (byte & 0xff).toString(16).padStart(2, '0').toUpperCase())
            .join(':');
        } else if (typeof event.tag.id === 'string') {
          hexString = event.tag.id.toUpperCase();
        }
      }

      if (hexString) {
        console.log('📡 [Hardware NFC Scanned]:', hexString);
        isCooldown = true;
        globalLastDetectedUid = hexString;

        // Play instant audible NFC detection chime on Sunmi hardware
        playNfcChime();

        // Broadcast to all active listeners and components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sunmi-nfc-scan', { detail: { nfcId: hexString } }));
          window.dispatchEvent(new CustomEvent('sunmi-nfc-broadcast', { detail: { nfcId: hexString } }));
        }

        setTimeout(() => {
          isCooldown = false;
        }, 600);
      }
    });
  } catch (err) {
    console.warn('NFC Scanner hardware init error:', err);
  }
};

export const stopHardwareScanning = () => {
  if (!isHardwareScanning) return;
  try {
    if (globalListener && typeof globalListener.remove === 'function') {
      globalListener.remove();
      globalListener = null;
    }
    CapacitorNfc.stopScanning().catch(() => {});
    isHardwareScanning = false;
  } catch (err) {
    console.warn('Error stopping NFC hardware scan:', err);
  }
};

export const getActiveSubscribers = () => activeSubscribers;

export const useNfcScanner = () => {
  const [scannedUid, setScannedUid] = useState<string | null>(null);
  const [lastDetectedUid, setLastDetectedUid] = useState<string | null>(globalLastDetectedUid);
  const [isScanning, setIsScanning] = useState(isHardwareScanning);
  const [hardwareSupported, setHardwareSupported] = useState<boolean | null>(globalHardwareSupported);

  useEffect(() => {
    activeSubscribers++;
    if (activeSubscribers === 1) {
      startHardwareScanning().then(() => {
        setIsScanning(isHardwareScanning);
        setHardwareSupported(globalHardwareSupported);
      });
    } else {
      setIsScanning(isHardwareScanning);
      setHardwareSupported(globalHardwareSupported);
    }

    const handleScanEvent = (e: Event) => {
      const custom = e as CustomEvent<{ nfcId: string }>;
      const uid = custom.detail?.nfcId;
      if (uid) {
        setLastDetectedUid(uid);
        setScannedUid(uid);
      }
    };

    window.addEventListener('sunmi-nfc-scan', handleScanEvent);

    return () => {
      window.removeEventListener('sunmi-nfc-scan', handleScanEvent);
      activeSubscribers--;
      if (activeSubscribers <= 0) {
        activeSubscribers = 0;
        stopHardwareScanning();
      }
    };
  }, []);

  const clearScan = async () => {
    setScannedUid(null);
  };

  const simulateScan = (uid: string) => {
    if (isCooldown) return;
    const formatted = uid.trim().toUpperCase();
    isCooldown = true;
    globalLastDetectedUid = formatted;
    setLastDetectedUid(formatted);
    setScannedUid(formatted);

    // Play instant audible NFC detection chime
    playNfcChime();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sunmi-nfc-scan', { detail: { nfcId: formatted } }));
      window.dispatchEvent(new CustomEvent('sunmi-nfc-broadcast', { detail: { nfcId: formatted } }));
    }

    setTimeout(() => {
      isCooldown = false;
    }, 1000);
  };

  return { scannedUid, lastDetectedUid, clearScan, isScanning, hardwareSupported, simulateScan };
};


