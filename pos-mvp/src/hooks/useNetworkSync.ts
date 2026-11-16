// pos-mvp/src/hooks/useNetworkSync.ts
import { useEffect, useState, useRef } from 'react';
import { pushOfflineSales } from '../services/syncService';
import { getApiBaseUrl, DEFAULT_EDGE_API_URL, CLOUD_GATEWAY_URL, LAN_SERVER_URL } from '../utils/apiConfig';
import { syncClockWithMasterServer, updateClockOffsetFromHeartbeat } from '../utils/time';

/**
 * Robust network probe that never crashes on older Android WebViews
 */
const fetchWithTimeout = async (url: string, timeoutMs: number = 2500): Promise<Response> => {
  let timer: any;
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    const res = await Promise.race([fetch(url), timeoutPromise]);
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
    return false;
  };

  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    // Check if connecting directly to Cloudflare Edge Gateway
    const isEdgeGateway = cleanIp.includes('.workers.dev') || cleanIp.includes('layali-askar-pos');

    // 1. Establish WebSocket Connection (Only when connecting to local Master POS with dedicated WS daemon)
    const connectWs = () => {
      if (!isMounted || isEdgeGateway) return;

      try {
        const isDomain = cleanIp.includes('.workers.dev') || cleanIp.includes('.app') || cleanIp.includes('.com');
        const wsUrl = isDomain ? `wss://${cleanIp}/ws` : `ws://${cleanIp}:3000/ws`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (typeof window !== 'undefined') {
            (window as any).__posWebSocket = ws;
          }
          syncClockWithMasterServer().catch(() => {});
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

    if (!isEdgeGateway) {
      connectWs();
    }

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
