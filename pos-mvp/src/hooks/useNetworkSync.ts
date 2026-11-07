// pos-mvp/src/hooks/useNetworkSync.ts
import { useEffect, useState, useRef } from 'react';
import { pushOfflineSales } from '../services/syncService';

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

  const cleanIp = (masterIp || '192.168.8.7').replace(/^https?:\/\//, '').replace(/:[0-9]+.*$/, '').trim() || '192.168.8.7';

  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    // 1. Establish WebSocket Connection
    const connectWs = () => {
      if (!isMounted) return;

      try {
        const ws = new WebSocket(`ws://${cleanIp}:3000/ws`);

        ws.onopen = () => {
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
          if (!isMounted) return;

          // Before declaring server offline, probe local HTTP health
          let httpHealthy = false;
          try {
            const probe = await fetch(`http://${cleanIp}:3000/api/health`, {
              signal: AbortSignal.timeout(2000),
            });
            if (probe.ok) httpHealthy = true;
          } catch {}

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
                try {
                  const check = await fetch(`http://${cleanIp}:3000/api/health`, {
                    signal: AbortSignal.timeout(2000),
                  });
                  if (check.ok) {
                    setIsServerOnline(true);
                    setShowDrPrompt(false);
                    return;
                  }
                } catch {}
                setShowDrPrompt(true);
              }, 60000);
            }
          }

          // Auto-reconnect after 5 seconds without freezing the UI
          reconnectTimeout = setTimeout(connectWs, 5000);
        };

        ws.onerror = async () => {
          if (!isMounted) return;
          try {
            const probe = await fetch(`http://${cleanIp}:3000/api/health`, {
              signal: AbortSignal.timeout(2000),
            });
            if (probe.ok) {
              setIsServerOnline(true);
              setShowDrPrompt(false);
              return;
            }
          } catch {}
          setIsServerOnline(false);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'PING') {
              try {
                ws.send(JSON.stringify({ type: 'PONG' }));
              } catch {}
              return;
            }
            if (data.type === 'SALE_COMPLETED') {
              console.log('Remote sale synced:', data.payload);
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('master-ws-message', { detail: data }));

              if (data.type === 'PRINT_REQUEST') {
                window.dispatchEvent(new CustomEvent('sunmi-remote-print', { detail: data.payload }));
              } else if (data.type === 'PRINT_KHATA_STATEMENT') {
                window.dispatchEvent(new CustomEvent('sunmi-remote-print-statement', { detail: data.payload }));
              } else if (data.type === 'NFC_ASSIGNED') {
                window.dispatchEvent(new CustomEvent('sunmi-nfc-assigned', { detail: data.payload }));
              } else if (data.type === 'REMOTE_LOCK_REGISTER') {
                window.dispatchEvent(new CustomEvent('sunmi-remote-lock'));
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

    connectWs();

    // 2. Background Offline Sync Polling (10 seconds)
    const syncInterval = setInterval(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const canSync = isCloudModeActive || wsRef.current?.readyState === WebSocket.OPEN;
        if (canSync) {
          const syncedCount = await pushOfflineSales(isCloudModeActive ? 'cloud-dr' : cleanIp);
          if (syncedCount > 0) {
            console.log(`Synced ${syncedCount} offline sales to ${isCloudModeActive ? 'Cloudflare DR' : 'master'}.`);
          }
        }
      }
    }, 10000);

    // 2b. Background HTTP Heartbeat (15 seconds) to ensure POS never shows false offline alerts
    const httpHealthInterval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const probe = await fetch(`http://${cleanIp}:3000/api/health`, {
          signal: AbortSignal.timeout(2500)
        });
        if (probe.ok) {
          setIsServerOnline(true);
          setShowDrPrompt(false);
          if (disconnectTimer.current) {
            clearTimeout(disconnectTimer.current);
            disconnectTimer.current = null;
          }
        }
      } catch {}
    }, 15000);

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

  // Determine active API base dynamically
  const cloudUrl = typeof window !== 'undefined'
    ? (localStorage.getItem('DR_CLOUD_URL') || 'https://askar-emergency-api.yourdomain.workers.dev')
    : 'https://askar-emergency-api.yourdomain.workers.dev';

  const activeApiBase = isCloudModeActive
    ? cloudUrl
    : `http://${cleanIp}:3000`;

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
