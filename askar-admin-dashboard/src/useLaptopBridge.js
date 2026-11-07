import { useState, useEffect, useRef, useCallback } from 'react';

export function useLaptopBridge(onCustomerDetected, onUnknownNfcScanned) {
  const ws = useRef(null);
  const callbacksRef = useRef({ onCustomerDetected, onUnknownNfcScanned });
  callbacksRef.current = { onCustomerDetected, onUnknownNfcScanned };
  const [isBridgeConnected, setIsBridgeConnected] = useState(false);
  const [lastScannedId, setLastScannedId] = useState(null);
  const [bridgeStatusMessage, setBridgeStatusMessage] = useState('');
  const [liveCounterCart, setLiveCounterCart] = useState({
    items: [],
    itemCount: 0,
    total: 0,
    customer: null,
    activeCartId: '1',
    terminalId: 'SUNMI-D2-REG01',
    updatedAt: null,
  });

  const getBridgeUrl = () => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return 'ws://localhost:3000/ws';
      }
      return `ws://${host}:3000/ws`;
    }
    return 'ws://askar-master.local:3000/ws';
  };

  useEffect(() => {
    let unmounted = false;
    let retryTimer = null;

    const initSocket = () => {
      if (unmounted) return;
      const url = getBridgeUrl();

      try {
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
          console.log(`⚡ [Laptop RJ45 Bridge] Connected to WebSocket Hub at ${url}`);
          setIsBridgeConnected(true);
        };

        socket.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            // Handle Live Sunmi Counter Cart Updates (Register Spy)
            if (data.type === 'CART_UPDATED') {
              console.log('🛒 [Laptop RJ45 Bridge] Received live counter cart:', data.payload);
              setLiveCounterCart({
                items: data.payload.items || [],
                itemCount: data.payload.itemCount || 0,
                total: data.payload.total || 0,
                customer: data.payload.customer || null,
                activeCartId: data.payload.activeCartId || '1',
                terminalId: data.payload.terminalId || 'SUNMI-D2-REG01',
                updatedAt: data.payload.updatedAt || new Date().toISOString(),
              });
              return;
            }

            // Handle Unregistered NFC Card Event
            if (data.type === 'UNKNOWN_NFC_SCANNED') {
              const tagId = (data.payload?.tag_id || data.payload?.id || '').trim().toUpperCase();
              console.log(`📡 [Laptop RJ45 Bridge] Received UNKNOWN_NFC_SCANNED from Sunmi: ${tagId}`);
              setLastScannedId(tagId);
              setBridgeStatusMessage(`⚡ Unregistered NFC Card tapped on Sunmi: ${tagId}`);
              if (callbacksRef.current.onUnknownNfcScanned && tagId) {
                callbacksRef.current.onUnknownNfcScanned(tagId);
              }
              return;
            }

            if (data.type === 'NFC_SCANNED') {
              const scannedId = (data.payload?.id || data.payload?.tag_id || '').trim().toUpperCase();
              console.log(`📱 [Laptop RJ45 Bridge] Received NFC scan from Sunmi: ${scannedId}`);
              setLastScannedId(scannedId);

              // Query backend NFC endpoint directly (Safe REST API)
              try {
                const backendUrl = import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? `http://${window.location.hostname}:3000` : 'http://localhost:3000');
                const res = await fetch(`${backendUrl}/api/customers/nfc/${encodeURIComponent(scannedId)}`);
                if (res.ok) {
                  const data = await res.json();
                  if (data && data.success && data.customer) {
                    const cust = data.customer;
                    if (data.isMess && data.messGroup) {
                      setBridgeStatusMessage(`⚡ Mess Card scanned on Sunmi: "${data.messGroup.group_name}" (${data.messGroup.memberCount || 0} members)`);
                      return;
                    }
                    setBridgeStatusMessage(`⚡ Personal Card scanned: ${cust.name}`);
                    if (callbacksRef.current.onCustomerDetected) {
                      callbacksRef.current.onCustomerDetected(cust);
                    }
                    return;
                  }
                }

                console.log(`⚠️ Unregistered Card scanned on Sunmi: ${scannedId} - prompting assignment`);
                setBridgeStatusMessage(`⚡ Unregistered Card scanned on Sunmi: ID ${scannedId}`);
                if (callbacksRef.current.onUnknownNfcScanned) {
                  callbacksRef.current.onUnknownNfcScanned(scannedId);
                }
              } catch (nfcErr) {
                console.warn('NFC lookup notice:', nfcErr?.message || nfcErr);
              }
            }
          } catch (parseErr) {
            console.warn('⚠️ [Laptop RJ45 Bridge] Error parsing message:', parseErr);
          }
        };

        socket.onclose = () => {
          setIsBridgeConnected(false);
          ws.current = null;
          if (!unmounted) {
            retryTimer = setTimeout(initSocket, 3000);
          }
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        if (!unmounted) {
          retryTimer = setTimeout(initSocket, 3000);
        }
      }
    };

    initSocket();

    return () => {
      unmounted = true;
      clearTimeout(retryTimer);
      ws.current?.close();
    };
  }, []);

  // Command: Remote Print on Sunmi
  const sendPrintRequest = useCallback((receiptPayload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('🖨️ [Laptop RJ45 Bridge] Beaming print payload to Sunmi hardware...');
      ws.current.send(JSON.stringify({
        type: 'PRINT_REQUEST',
        payload: receiptPayload,
        sentAt: new Date().toISOString()
      }));
      return true;
    }
    return false;
  }, []);

  // Command: Remote Print Khata Statement on Sunmi built-in 58mm thermal printer
  const sendStatementPrintRequest = useCallback((statementPayload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('🖨️ [Laptop RJ45 Bridge] Beaming 58mm Khata statement print payload to Sunmi hardware...', statementPayload);
      ws.current.send(JSON.stringify({
        type: 'PRINT_KHATA_STATEMENT',
        payload: statementPayload,
        sentAt: new Date().toISOString()
      }));
      return true;
    }
    return false;
  }, []);

  // Command: Lock customer on Sunmi while editing on Laptop
  const lockCustomerForEditing = useCallback((customerId, customerName) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log(`🔒 [Laptop RJ45 Bridge] Locking customer ${customerName || customerId} on Sunmi`);
      ws.current.send(JSON.stringify({
        type: 'KHATA_EDIT_LOCK',
        payload: {
          customerId,
          customerName,
          lockedBy: 'Manager Laptop',
          timestamp: Date.now()
        }
      }));
    }
  }, []);

  // Command: Release customer lock after saving
  const releaseCustomerLock = useCallback((customerId) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log(`🔓 [Laptop RJ45 Bridge] Releasing lock for customer ${customerId}`);
      ws.current.send(JSON.stringify({
        type: 'KHATA_EDIT_RELEASE',
        payload: { customerId }
      }));
    }
  }, []);

  // Command: Notify Sunmi that card assignment succeeded
  const broadcastNfcAssigned = useCallback((tagId, cardType, targetName) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log(`🎉 [Laptop RJ45 Bridge] Broadcasting NFC_ASSIGNED: ${tagId} -> ${targetName} (${cardType})`);
      ws.current.send(JSON.stringify({
        type: 'NFC_ASSIGNED',
        payload: {
          tag_id: tagId,
          card_type: cardType,
          target_name: targetName,
          assignedAt: new Date().toISOString()
        }
      }));
      return true;
    }
    return false;
  }, []);

  // Command: Remote Cash Drawer Kick on Sunmi Hardware
  const remoteDrawerKick = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('⚡ [Laptop RJ45 Bridge] Sending REMOTE_DRAWER_KICK to Sunmi hardware...');
      ws.current.send(JSON.stringify({
        type: 'REMOTE_DRAWER_KICK',
        sentAt: new Date().toISOString()
      }));
      return true;
    }
    return false;
  }, []);

  // Command: Remote Clear Cart on Sunmi Register
  const remoteClearCart = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('🗑️ [Laptop RJ45 Bridge] Sending REMOTE_CLEAR_CART to Sunmi register...');
      ws.current.send(JSON.stringify({
        type: 'REMOTE_CLEAR_CART',
        sentAt: new Date().toISOString()
      }));
      return true;
    }
    return false;
  }, []);

  // Command: Remote Lock Sunmi Register
  const remoteLockRegister = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('🔒 [Laptop RJ45 Bridge] Sending REMOTE_LOCK_REGISTER to Sunmi register...');
      ws.current.send(JSON.stringify({
        type: 'REMOTE_LOCK_REGISTER',
        sentAt: new Date().toISOString()
      }));
      return true;
    }
    return false;
  }, []);

  return {
    isBridgeConnected,
    lastScannedId,
    bridgeStatusMessage,
    liveCounterCart,
    sendPrintRequest,
    sendStatementPrintRequest,
    lockCustomerForEditing,
    releaseCustomerLock,
    broadcastNfcAssigned,
    remoteDrawerKick,
    remoteClearCart,
    remoteLockRegister
  };
}

