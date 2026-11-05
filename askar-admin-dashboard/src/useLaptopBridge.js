import { useState, useEffect, useRef, useCallback } from 'react';
import { adminDb } from './db';

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
        return 'ws://localhost:8080';
      }
      return `ws://${host}:8080`;
    }
    return 'ws://192.168.88.10:8080';
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

              // Query Turso cloud to check NfcCard registry
              try {
                // 1. Check NfcCard table
                let nfcCardResult = await adminDb.execute({
                  sql: `SELECT * FROM NfcCard WHERE tag_id = ? LIMIT 1;`,
                  args: [scannedId]
                });

                if (nfcCardResult.rows.length > 0) {
                  const card = nfcCardResult.rows[0];
                  if (card.card_type === 'MESS') {
                    // Fetch mess group
                    const messRes = await adminDb.execute({
                      sql: `SELECT m.id, m.group_name, COUNT(c.id) as memberCount 
                            FROM MessGroup m 
                            LEFT JOIN Customer c ON c.mess_id = m.id 
                            WHERE m.id = ? 
                            GROUP BY m.id LIMIT 1;`,
                      args: [card.mess_id]
                    });
                    const mess = messRes.rows[0];
                    const gName = mess?.group_name || 'Mess Group';
                    setBridgeStatusMessage(`⚡ Mess Card scanned on Sunmi: "${gName}" (${mess?.memberCount || 0} members)`);
                    return;
                  } else if (card.customer_id) {
                    // Fetch personal customer
                    const custRes = await adminDb.execute({
                      sql: `SELECT * FROM Customer WHERE id = ? LIMIT 1;`,
                      args: [card.customer_id]
                    });
                    if (custRes.rows.length > 0) {
                      const cust = custRes.rows[0];
                      setBridgeStatusMessage(`⚡ Personal Card scanned: ${cust.name}`);
                      if (callbacksRef.current.onCustomerDetected) {
                        callbacksRef.current.onCustomerDetected(cust);
                      }
                      return;
                    }
                  }
                }

                // 2. Lookup Customer by cardUid, access_token, phone, or id
                let result = await adminDb.execute({
                  sql: `SELECT * FROM Customer WHERE cardUid = ? OR access_token = ? OR phone = ? OR id = ? LIMIT 1;`,
                  args: [scannedId, scannedId, scannedId, scannedId]
                });

                if (result.rows.length > 0) {
                  const customer = result.rows[0];
                  console.log(`🎯 [Laptop RJ45 Bridge] Customer matched: ${customer.name}`);
                  setBridgeStatusMessage(`⚡ Card scanned on Sunmi: ${customer.name}`);
                  if (callbacksRef.current.onCustomerDetected) {
                    callbacksRef.current.onCustomerDetected(customer);
                  }
                } else {
                  console.log(`⚠️ Unregistered Card scanned on Sunmi: ${scannedId} - prompting assignment`);
                  setBridgeStatusMessage(`⚡ Unregistered Card scanned on Sunmi: ID ${scannedId}`);
                  if (callbacksRef.current.onUnknownNfcScanned) {
                    callbacksRef.current.onUnknownNfcScanned(scannedId);
                  }
                }
              } catch (dbErr) {
                console.warn('⚠️ [Laptop RJ45 Bridge] Turso customer lookup error:', dbErr);
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
    lockCustomerForEditing,
    releaseCustomerLock,
    broadcastNfcAssigned,
    remoteDrawerKick,
    remoteClearCart,
    remoteLockRegister
  };
}

