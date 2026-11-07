// pos-mvp/src/hooks/useNetworkSync.ts
import { useEffect, useState, useRef } from 'react';
import { pushOfflineSales } from '../services/syncService';

/**
 * Headless Network & Offline Synchronization Hook (Lifecycle Management)
 * Decouples WebSocket connections, heartbeat auto-reconnects, and background
 * offline sales synchronization from the React UI render tree.
 */
export const useNetworkSync = (masterIp: string, onMessage?: (data: any) => void) => {
  const [isServerOnline, setIsServerOnline] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let isMounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    const cleanIp = (masterIp || '192.168.8.7').replace(/^https?:\/\//, '').replace(/:[0-9]+.*$/, '').trim() || '192.168.8.7';

    // 1. Establish WebSocket Connection
    const connectWs = () => {
      if (!isMounted) return;

      try {
        const ws = new WebSocket(`ws://${cleanIp}:3000/ws`);

        ws.onopen = () => {
          if (isMounted) setIsServerOnline(true);
        };

        ws.onclose = () => {
          if (isMounted) {
            setIsServerOnline(false);
            // Auto-reconnect after 5 seconds without freezing the UI
            reconnectTimeout = setTimeout(connectWs, 5000);
          }
        };

        ws.onerror = () => {
          if (isMounted) setIsServerOnline(false);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'SALE_COMPLETED') {
              console.log('Remote sale synced:', data.payload);
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('master-ws-message', { detail: data }));
            }
            onMessageRef.current?.(data);
          } catch {}
        };

        wsRef.current = ws;
      } catch {
        if (isMounted) {
          setIsServerOnline(false);
          reconnectTimeout = setTimeout(connectWs, 5000);
        }
      }
    };

    connectWs();

    // 2. Background Offline Sync Polling (10 seconds)
    const syncInterval = setInterval(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine && wsRef.current?.readyState === WebSocket.OPEN) {
        const syncedCount = await pushOfflineSales(cleanIp);
        if (syncedCount > 0) {
          console.log(`Synced ${syncedCount} offline sales to master.`);
        }
      }
    }, 10000);

    // 3. Cleanup on unmount: safely closes connection and clears intervals to prevent memory leaks
    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      clearInterval(syncInterval);
    };
  }, [masterIp]);

  return { isServerOnline };
};

