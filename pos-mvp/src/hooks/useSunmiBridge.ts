import { useEffect, useRef, useState, useCallback } from 'react';
import { startHardwareScanning, stopHardwareScanning, getActiveSubscribers } from './useNfcScanner';

export interface LockState {
  customerId: string;
  lockedBy: string;
  customerName?: string;
  timestamp: number;
}

export function useSunmiBridge() {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeLock, setActiveLock] = useState<LockState | null>(null);
  const [managerScanLocked, setManagerScanLocked] = useState(false);
  const [managerScanMessage, setManagerScanMessage] = useState("");
  const activeNfcListenerRef = useRef<any>(null);

  // Determine candidate bridge hosts for automatic rotation
  // On native Sunmi Android: Connect to the laptop over Wi-Fi (192.168.8.7) or RJ45 (192.168.88.10)
  const getCandidateBridgeUrls = useCallback((): string[] => {
    const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
    const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
    const custom = typeof window !== 'undefined' ? localStorage.getItem('master_server_url') : null;
    let customWs: string | null = null;
    if (custom) {
      try {
        const u = new URL(custom);
        customWs = `ws://${u.hostname}:8080`;
      } catch {}
    }

    if (isNative) {
      return [
        customWs,
        'ws://192.168.8.7:8080',
        'ws://192.168.88.10:8080',
        'ws://10.0.2.2:8080'
      ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i) as string[];
    }

    return [
      'ws://localhost:8080',
      `ws://${host}:8080`,
      'ws://192.168.8.7:8080',
      'ws://192.168.88.10:8080'
    ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i) as string[];
  }, []);

  useEffect(() => {
    let reconnectTimeout: any = null;
    let isUnmounted = false;
    let candidateIdx = 0;
    const candidates = getCandidateBridgeUrls();

    const connect = () => {
      if (isUnmounted) return;
      const url = candidates[candidateIdx % candidates.length];

      try {
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
          console.log(`🔌 [Sunmi Bridge] Connected to Laptop Bridge Hub at ${url}`);
          setIsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'KHATA_EDIT_LOCK' || data.type === 'LOCK_STATE_SYNC') {
              console.log('🔒 [Sunmi Bridge] Received Khata Edit Lock from Laptop:', data.payload);
              setActiveLock(data.payload);
              if (typeof window !== 'undefined') {
                (window as any).__sunmiActiveLock = data.payload;
              }
            } else if (data.type === 'KHATA_EDIT_RELEASE') {
              console.log('🔓 [Sunmi Bridge] Received Khata Edit Release from Laptop');
              setActiveLock(null);
              if (typeof window !== 'undefined') {
                (window as any).__sunmiActiveLock = null;
              }
            } else if (data.type === 'PRINT_REQUEST') {
              console.log('🖨️ [Sunmi Bridge] Received Remote Print Request from Laptop:', data.payload);
              window.dispatchEvent(new CustomEvent('sunmi-remote-print', { detail: data.payload }));
            } else if (data.type === 'NFC_ASSIGNED') {
              console.log('🎉 [Sunmi Bridge] Card assigned notification from Laptop:', data.payload);
              window.dispatchEvent(new CustomEvent('sunmi-nfc-assigned', { detail: data.payload }));
            } else if (data.type === 'REMOTE_DRAWER_KICK') {
              console.log('⚡ [Sunmi Bridge] Received Remote Drawer Kick command from Manager Laptop');
              window.dispatchEvent(new CustomEvent('sunmi-remote-drawer-kick'));
            } else if (data.type === 'REMOTE_CLEAR_CART') {
              console.log('🗑️ [Sunmi Bridge] Received Remote Clear Cart command from Manager Laptop');
              window.dispatchEvent(new CustomEvent('sunmi-remote-clear-cart'));
            } else if (data.type === 'REMOTE_LOCK_REGISTER') {
              console.log('🔒 [Sunmi Bridge] Received Remote Lock Register command from Manager Laptop');
              window.dispatchEvent(new CustomEvent('sunmi-remote-lock'));
            } else if (data.type === 'SHIFT_CLOSED') {
              console.log('⚡ [Sunmi Bridge] Received SHIFT_CLOSED broadcast from Sunmi POS terminal:', data.payload);
              window.dispatchEvent(new CustomEvent('sunmi-shift-closed', { detail: data.payload }));
            } else if (data.type === 'REQUEST_MANAGER_SCAN') {
              // ON-DEMAND REMOTE NFC ARCHITECTURE:
              // Laptop commanded terminal to power on hardware antenna
              console.log('⚡ [Sunmi On-Demand NFC] Manager initiated remote scan. Powering up NFC transceiver...');
              setManagerScanLocked(true);
              setManagerScanMessage("Manager is scanning a card. Please hold card to back of terminal.");

              // Ensure hardware scanner is active via unified scanner service
              startHardwareScanning();

              // Clean up any previous listener if present
              if (activeNfcListenerRef.current) {
                window.removeEventListener('sunmi-nfc-scan', activeNfcListenerRef.current);
                activeNfcListenerRef.current = null;
              }

              const handleManagerTap = (e: any) => {
                const hexString = e.detail?.nfcId;
                if (!hexString) return;

                console.log('📡 [Sunmi On-Demand NFC] Card captured for Manager:', hexString);

                // Send result back to Laptop
                if (ws.current?.readyState === WebSocket.OPEN) {
                  ws.current.send(JSON.stringify({
                    type: 'MANAGER_SCAN_RESULT',
                    payload: { tag_id: hexString, id: hexString }
                  }));
                }

                // HTTP relay fallback
                fetch('http://192.168.8.7:3000/api/nfc/relay', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tag_id: hexString, id: hexString })
                }).catch(() => {});

                setManagerScanMessage("Scan successful! Waiting for Manager to finish...");

                // Detach one-shot listener
                window.removeEventListener('sunmi-nfc-scan', handleManagerTap);
                activeNfcListenerRef.current = null;
              };

              activeNfcListenerRef.current = handleManagerTap;
              window.addEventListener('sunmi-nfc-scan', handleManagerTap);
            } else if (data.type === 'MANAGER_SCAN_COMPLETE' || data.type === 'CANCEL_MANAGER_SCAN') {
              console.log('🔓 [Sunmi On-Demand NFC] Manager scan complete. Unlocking screen...');
              setManagerScanLocked(false);
              setManagerScanMessage("");
              if (activeNfcListenerRef.current) {
                window.removeEventListener('sunmi-nfc-scan', activeNfcListenerRef.current);
                activeNfcListenerRef.current = null;
              }
              // ONLY shut down hardware antenna if no active cashier/modal is currently subscribed!
              if (getActiveSubscribers() <= 0) {
                stopHardwareScanning();
              }
            }
          } catch (err) {
            console.warn('⚠️ [Sunmi Bridge] Invalid message frame:', err);
          }
        };

        socket.onclose = () => {
          setIsConnected(false);
          ws.current = null;
          if (!isUnmounted) {
            // Rotate to next candidate endpoint and retry
            candidateIdx = (candidateIdx + 1) % candidates.length;
            reconnectTimeout = setTimeout(connect, 2500);
          }
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        if (!isUnmounted) {
          candidateIdx = (candidateIdx + 1) % candidates.length;
          reconnectTimeout = setTimeout(connect, 2500);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimeout);
      if (activeNfcListenerRef.current) {
        window.removeEventListener('sunmi-nfc-scan', activeNfcListenerRef.current);
        activeNfcListenerRef.current = null;
      }
      ws.current?.close();
    };
  }, [getCandidateBridgeUrls]);

  // Broadcast NFC scan to laptop over WebSocket and HTTP relay
  const broadcastNfcScan = useCallback((nfcId: string, customerData?: any) => {
    const cleanId = (nfcId || '').trim().toUpperCase();
    if (!cleanId) return;

    console.log(`📡 [Sunmi NFC Relay] Beaming NFC card: ${cleanId} to Laptop`);

    const nfcPayload = {
      tag_id: cleanId,
      id: cleanId,
      customer: customerData || null,
      scannedAt: new Date().toISOString()
    };

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'NFC_SCANNED',
        payload: nfcPayload
      }));

      // If customer is not attached, also fire UNKNOWN_NFC_SCANNED to trigger Laptop Assignment Modal
      if (!customerData) {
        ws.current.send(JSON.stringify({
          type: 'UNKNOWN_NFC_SCANNED',
          payload: {
            tag_id: cleanId,
            id: cleanId,
            terminal_id: 'SUNMI-D2-REG01',
            scannedAt: new Date().toISOString()
          }
        }));
      }
    } else {
      console.log('ℹ️ [Sunmi Bridge] WebSocket not open; relaying via HTTP fallback...');
    }

    // Dual-channel fallback: Always POST to laptop HTTP relay endpoints
    const candidateBases = [
      'http://192.168.8.7:3000',
      'http://192.168.88.10:3000',
      'http://192.168.8.7:8080',
      'http://192.168.88.10:8080'
    ];
    for (const base of candidateBases) {
      fetch(`${base}/api/nfc/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: cleanId, id: cleanId, customer: customerData || null })
      }).catch(() => {});
    }
  }, []);

  // Broadcast active counter cart to Manager's Laptop (Register Spy)
  const broadcastCartState = useCallback((cart: any[], total: number, customer?: any, activeCartId: string = '1') => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'CART_UPDATED',
        payload: {
          items: cart.map((item) => ({
            id: item.id,
            name: item.name,
            price: item.price ?? item.sellingPrice ?? 0,
            quantity: item.quantity,
            total: (item.price ?? item.sellingPrice ?? 0) * (item.quantity ?? 1),
            is_weighed_item: !!item.is_weighed_item
          })),
          itemCount: cart.reduce((sum, item) => sum + (item.quantity || 1), 0),
          total: Number(total || 0),
          customer: customer ? {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            balance: customer.balance,
            card_type: customer.card_type,
            mess_id: customer.mess_id
          } : null,
          activeCartId,
          terminalId: 'SUNMI-D2-REG01',
          updatedAt: new Date().toISOString()
        }
      }));
    }
  }, []);

  // Broadcast Shift Closed event to Manager Laptop across RJ45 cable
  const broadcastShiftClosed = useCallback((shiftPayload?: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('📡 [Sunmi Bridge] Broadcasting SHIFT_CLOSED to Back-Office Laptop:', shiftPayload);
      ws.current.send(JSON.stringify({
        type: 'SHIFT_CLOSED',
        payload: shiftPayload || {},
        timestamp: new Date().toISOString()
      }));
    } else {
      console.log('ℹ️ [Sunmi Bridge] WebSocket not open; fallback will synchronize via API / Turso sync.');
    }
  }, []);

  // Check if a customer is currently locked by the laptop
  const isCustomerLocked = useCallback((customerId: string) => {
    return activeLock !== null && activeLock.customerId === customerId;
  }, [activeLock]);

  return {
    isConnected,
    ws,
    broadcastNfcScan,
    broadcastCartState,
    broadcastShiftClosed,
    activeLock,
    isCustomerLocked,
    managerScanLocked,
    managerScanMessage
  };
}
