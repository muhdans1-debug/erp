// pos-mvp/src/hooks/useNetworkSync.ts
import { useEffect, useState, useRef } from 'react';
import { pushOfflineSales } from '../services/syncService';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL, CLOUD_GATEWAY_URL, LAN_SERVER_URL, discoverMasterServerIp } from '../utils/apiConfig';
import { syncClockWithMasterServer, updateClockOffsetFromHeartbeat } from '../utils/time';
import { showTransactionNotification } from '../utils/pushNotification';

/**
 * Robust network probe that never crashes on older Android WebViews
 */
const fetchWithTimeout = async (url: string, timeoutMs: number = 2500, options?: RequestInit): Promise<Response> => {
  let timer: any;
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    const res = await Promise.race([fetch(url, options), timeoutPromise]);
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
};

/**
 * Headless Network & Offline Synchronization Hook with Cloud DR Fallback
 * Decouples WebSocket connections, heartbeat auto-reconnects, and background
 * offline sales synchronization from the React UI render tree.
 * Automatically initiates a 60-second outage watchdog to offer Cloudflare Emergency Mode.
 */
export const useNetworkSync = (masterIp: string, onMessage?: (data: any) => void) => {
  const [isServerOnline, setIsServerOnline] = useState(true);
  const [isCloudModeActive, setIsCloudModeActive] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('IS_CLOUD_DR_ACTIVE') === 'true';
    }
    return false;
  });
  const [showDrPrompt, setShowDrPrompt] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  let cleanIp = (masterIp || '').replace(/^https?:\/\//, '').replace(/:[0-9]+.*$/, '').replace(/\/.*$/, '').trim();
  if (!cleanIp || (isAndroid && (cleanIp === 'localhost' || cleanIp === '127.0.0.1'))) {
    cleanIp = 'askar-edge-api.layali-askar-pos.workers.dev';
  }

  const getProbeCandidates = () => {
    return [
      getApiBaseUrl(),
      CLOUD_GATEWAY_URL,
      DEFAULT_EDGE_API_URL,
      LAN_SERVER_URL
    ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
  };

  const checkServerHealth = async (): Promise<boolean> => {
    const bases = getProbeCandidates();
    for (const base of bases) {
      try {
        const probe = await fetchWithTimeout(`${base}/api/health`, 2000);
        if (probe.ok) return true;
      } catch {}
    }
    // If all configured candidates fail, attempt autonomous subnet / mDNS discovery
    try {
      const discovered = await discoverMasterServerIp();
      if (discovered) return true;
    } catch {}

    return false;
  };

  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    // Check if connecting directly to Cloudflare Edge Gateway
    const isEdgeGateway = cleanIp.includes('.workers.dev') || cleanIp.includes('layali-askar-pos');

    // 1. Establish WebSocket Connection (Connecting to local Master POS or LAN IP with dedicated WS daemon)
    const connectWs = () => {
      if (!isMounted) return;

      try {
        let wsTarget = cleanIp;
        if (isEdgeGateway) {
          // If host is Cloudflare Edge, connect WS to current browser host or LAN Master POS
          if (typeof window !== 'undefined' && window.location.hostname && !window.location.hostname.includes('workers.dev')) {
            wsTarget = window.location.port === '3000' ? window.location.host : `${window.location.hostname}:3000`;
          } else {
            wsTarget = '192.168.8.7:3000';
          }
        } else if (!wsTarget.includes(':')) {
          wsTarget = `${wsTarget}:3000`;
        }

        const isSecureWs = typeof window !== 'undefined' && window.location.protocol === 'https:' && !wsTarget.startsWith('192.168.') && !wsTarget.startsWith('localhost');
        const wsUrl = `${isSecureWs ? 'wss:' : 'ws:'}//${wsTarget.replace(/^wss?:\/\//, '')}/ws`;
        console.log(`🔌 [WS NetworkSync] Connecting to: ${wsUrl}`);
        const ws = new WebSocket(wsUrl);

        let heartbeatInterval: any = null;
        const sendHeartbeat = () => {
          if (ws.readyState === WebSocket.OPEN) {
            const currentTerm = localStorage.getItem('terminal_id') || (isAndroid ? 'REG-01-SUNMI' : 'REG-01-COUNTER');
            const pendingSales = Number(localStorage.getItem('pending_sales_count') || 0);
            try {
              ws.send(JSON.stringify({
                type: 'TERMINAL_HEARTBEAT',
                terminalId: currentTerm,
                timestamp: Date.now(),
                pendingOfflineSales: pendingSales,
                appVersion: '1.4.2',
                peripherals: {
                  printer: (window as any).__printerOffline ? 'OFFLINE' : 'READY',
                  scanner: 'READY',
                  drawer: 'CLOSED',
                  customerScreen: 'SYNCHRONIZED'
                }
              }));
            } catch (_) {}
          }
        };

        ws.onopen = () => {
          if (typeof window !== 'undefined') {
            (window as any).__posWebSocket = ws;
          }
          syncClockWithMasterServer().catch(() => {});
          sendHeartbeat();
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          heartbeatInterval = setInterval(sendHeartbeat, 10000);

          if (isMounted) {
            setIsServerOnline(true);
            setShowDrPrompt(false);
            if (disconnectTimer.current) {
              clearTimeout(disconnectTimer.current);
              disconnectTimer.current = null;
            }
          }
        };

        ws.onclose = async () => {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (typeof window !== 'undefined' && (window as any).__posWebSocket === ws) {
            (window as any).__posWebSocket = null;
          }
          if (!isMounted) return;

          // Before declaring server offline, probe local HTTP health across candidates
          const httpHealthy = await checkServerHealth();

          if (httpHealthy) {
            setIsServerOnline(true);
            setShowDrPrompt(false);
            if (disconnectTimer.current) {
              clearTimeout(disconnectTimer.current);
              disconnectTimer.current = null;
            }
          } else {
            setIsServerOnline(false);

            // If disconnected for 60 seconds without reconnection AND HTTP is down, trigger DR prompt
            if (!disconnectTimer.current) {
              disconnectTimer.current = setTimeout(async () => {
                if (!isMounted) return;
                const checkHealthy = await checkServerHealth();
                if (checkHealthy) {
                  setIsServerOnline(true);
                  setShowDrPrompt(false);
                  return;
                }
                setShowDrPrompt(true);
              }, 60000);
            }
          }

          // Auto-reconnect after 5 seconds without freezing the UI
          reconnectTimeout = setTimeout(connectWs, 5000);
        };

        ws.onerror = async () => {
          if (!isMounted) return;
          const isHealthy = await checkServerHealth();
          if (isHealthy) {
            setIsServerOnline(true);
            setShowDrPrompt(false);
            return;
          }
          setIsServerOnline(false);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data?.serverEpoch) {
              updateClockOffsetFromHeartbeat(data.serverEpoch);
            }
            if (data.type === 'PING') {
              try {
                ws.send(JSON.stringify({ type: 'PONG', clientEpoch: Date.now() }));
              } catch {}
              return;
            }
            if (data.type === 'SALE_COMPLETED') {
              console.log('Remote sale synced:', data.payload);
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('master-ws-message', { detail: data }));

              const currentTerm = localStorage.getItem('terminal_id') || 'T1';
              const targetTerm = data.terminalId || data.payload?.terminalId || 'ALL';
              const isTargetedToUs = targetTerm === 'ALL' || targetTerm === currentTerm;

              if (data.type === 'PRINT_REQUEST') {
                window.dispatchEvent(new CustomEvent('sunmi-remote-print', { detail: data.payload }));
              } else if (data.type === 'TRANSACTION_NOTIFICATION' && data.payload) {
                // Centralized Push Notification for all transactions across the retail network
                showTransactionNotification(data.payload).catch(() => {});
                window.dispatchEvent(new CustomEvent('pwa-transaction-notification', { detail: data.payload }));
              } else if (data.type === 'PRINT_KHATA_STATEMENT') {
                window.dispatchEvent(new CustomEvent('sunmi-remote-print-statement', { detail: data.payload }));
              } else if (data.type === 'NFC_ASSIGNED') {
                window.dispatchEvent(new CustomEvent('sunmi-nfc-assigned', { detail: data.payload }));
              } else if (isTargetedToUs && (data.type === 'REMOTE_DRAWER_KICK' || data.type === 'DRAWER_KICK' || data.command === 'DRAWER_KICK')) {
                window.dispatchEvent(new CustomEvent('sunmi-remote-drawer-kick', { detail: data.payload || data }));
              } else if (isTargetedToUs && data.type === 'REMOTE_CLEAR_CART') {
                window.dispatchEvent(new CustomEvent('sunmi-remote-clear-cart'));
              } else if (isTargetedToUs && data.type === 'REMOTE_LOCK_REGISTER') {
                window.dispatchEvent(new CustomEvent('sunmi-remote-lock'));
              } else if (data.type === 'BENEFIT_PAY_SUCCESS' || data.type === 'REMOTE_BENEFIT_PAY_SUCCESS') {
                window.dispatchEvent(new CustomEvent('sunmi-remote-benefit-success', { detail: data.payload || data }));
              } else if (data.type === 'SYSTEM_ALERT_EVENT' && data.payload) {
                window.dispatchEvent(new CustomEvent('system-alert-event', { detail: data.payload }));
              } else if (data.type === 'TERMINAL_RESYNC_REQUEST') {
                console.log('🔄 [WS NetworkSync] Received fleet re-sync request from Master POS, flushing offline queues...');
                pushOfflineSales(isCloudModeActive ? 'cloud-dr' : cleanIp).catch(() => {});
              } else if (isTargetedToUs && (data.type === 'FLEET_RELOAD_COMMAND' || data.type === 'CLIENT_RELOAD' || data.type === 'FLEET_RELOAD' || data.type === 'RELOAD')) {
                console.log('🔄 [WS NetworkSync] Received remote reload trigger via Unified WS Bus, refreshing...');
                window.location.reload();
              }
            }
            onMessageRef.current?.(data);
          } catch {}
        };

        wsRef.current = ws;
      } catch {
        if (isMounted) {
          setIsServerOnline(false);
          if (!disconnectTimer.current) {
            disconnectTimer.current = setTimeout(() => {
              if (isMounted) setShowDrPrompt(true);
            }, 60000);
          }
          reconnectTimeout = setTimeout(connectWs, 5000);
        }
      }
    };

    // 1b. Initiate WebSocket bus connection (auto-routes to local LAN master 192.168.8.7:3000 if edge gateway is configured)
    connectWs();

    // 2. Background Offline Sync Polling (10 seconds)
    const syncInterval = setInterval(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const canSync = isCloudModeActive || isServerOnline || (typeof navigator !== 'undefined' && navigator.onLine);
        if (canSync) {
          const syncedCount = await pushOfflineSales(isCloudModeActive ? 'cloud-dr' : cleanIp);
          if (syncedCount > 0) {
            console.log(`Synced ${syncedCount} offline sales to ${isCloudModeActive ? 'Cloudflare DR' : 'master'}.`);
          }
        }
      }
    }, 10000);

    // 2b. Background HTTP Heartbeat (30s) to keep status accurate without burning cloud request quotas
    const checkHealth = async () => {
      if (!isMounted) return;
      const isHealthy = await checkServerHealth();
      if (isHealthy) {
        setIsServerOnline(true);
        setShowDrPrompt(false);
        if (disconnectTimer.current) {
          clearTimeout(disconnectTimer.current);
          disconnectTimer.current = null;
        }
      } else {
        setIsServerOnline(false);
      }
    };
    checkHealth();
    const httpHealthInterval = setInterval(checkHealth, 30000);

    // 2c. Background Customer At Counter Beacon Poller (2.5 seconds)
    // Listens for mobile 4G/5G customers announcing presence at counter
    let lastCounterBeaconTs = 0;
    const pollCounterBeacon = async () => {
      if (!isMounted || (typeof document !== 'undefined' && document.hidden)) return;
      const candidates = getProbeCandidates();
      for (const base of candidates) {
        try {
          const res = await fetchWithTimeout(`${base}/api/khata/present-at-counter/latest?t=${Date.now()}`, 2000);
          if (res.ok) {
            const data = await res.json();
            const beacon = data?.beacon;
            if (beacon && beacon.customer && Number(beacon.timestamp || 0) > lastCounterBeaconTs) {
              lastCounterBeaconTs = Number(beacon.timestamp);
              // Acknowledge beacon on cloud/master edge
              fetchWithTimeout(`${base}/api/khata/present-at-counter/ack`, 2000, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: 'active_beacon' })
              }).catch(() => {});

              let resolvedCustomer = beacon.customer;
              // Dual-Wallet Resilience: If cloud beacon customer lacks mess details, enrich locally via POS registry
              if (resolvedCustomer.id && (!resolvedCustomer.messes || resolvedCustomer.messes.length === 0)) {
                try {
                  const localRes = await fetchWithTimeout(`${getApiBaseUrl()}/api/customers/by-card/${encodeURIComponent(resolvedCustomer.id)}`, 1500);
                  if (localRes.ok) {
                    const localData = await localRes.json();
                    const localCust = localData?.customer || localData;
                    if (localCust && (localCust.hasMessGroup || (localCust.messes && localCust.messes.length > 0))) {
                      resolvedCustomer = {
                        ...localCust,
                        ...resolvedCustomer,
                        messes: localCust.messes || resolvedCustomer.messes,
                        hasMessGroup: localCust.hasMessGroup !== undefined ? localCust.hasMessGroup : resolvedCustomer.hasMessGroup,
                        isDual: localCust.isDual !== undefined ? localCust.isDual : resolvedCustomer.isDual,
                        isMultiMess: localCust.isMultiMess !== undefined ? localCust.isMultiMess : resolvedCustomer.isMultiMess,
                        messGroup: localCust.messGroup || resolvedCustomer.messGroup,
                        group_name: localCust.group_name || resolvedCustomer.group_name,
                        messName: localCust.messName || resolvedCustomer.messName,
                        mess_id: localCust.mess_id || resolvedCustomer.mess_id,
                        members: localCust.members || resolvedCustomer.members,
                        memberCount: localCust.memberCount || resolvedCustomer.memberCount,
                        messShare: localCust.messShare !== undefined ? localCust.messShare : resolvedCustomer.messShare,
                        personalBalance: localCust.personalBalance !== undefined ? localCust.personalBalance : resolvedCustomer.personalBalance
                      };
                    }
                  }
                } catch {}
              }

              const eventData = {
                type: 'CUSTOMER_AT_COUNTER',
                customer: resolvedCustomer,
                terminalId: beacon.terminalId || 'T1',
                timestamp: beacon.timestamp
              };

              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('master-ws-message', { detail: eventData }));
              }
              onMessageRef.current?.(eventData);
            }
            // Candidate successfully responded: break immediately to avoid redundant requests across secondary candidates
            break;
          }
        } catch {}
      }
    };
    const counterBeaconInterval = setInterval(pollCounterBeacon, 4000);

    // 3. Cleanup on unmount
    return () => {
      isMounted = false;
      if (disconnectTimer.current) {
        clearTimeout(disconnectTimer.current);
        disconnectTimer.current = null;
      }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      clearInterval(syncInterval);
      clearInterval(httpHealthInterval);
      clearInterval(counterBeaconInterval);
    };
  }, [cleanIp, isCloudModeActive]);

  // Determine active API base dynamically from unified config
  const activeApiBase = getApiBaseUrl();

  const toggleCloudMode = (active: boolean) => {
    setIsCloudModeActive(active);
    if (typeof window !== 'undefined') {
      localStorage.setItem('IS_CLOUD_DR_ACTIVE', active ? 'true' : 'false');
    }
  };

  return {
    isServerOnline,
    showDrPrompt,
    setShowDrPrompt,
    isCloudModeActive,
    setIsCloudModeActive: toggleCloudMode,
    activeApiBase
  };
};
