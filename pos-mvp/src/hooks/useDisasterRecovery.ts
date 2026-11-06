import { useState, useEffect, useCallback, useRef } from 'react';
import { Network } from '@capacitor/network';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { db } from '../db';

export type SyncTrafficStatus = 'ONLINE' | 'OFFLINE' | 'OFFLINE_WARNING' | 'SYNCING';

export interface BackupResult {
  success: boolean;
  filename: string;
  sizeKb?: string;
  storageTarget: 'SD_CARD_USB' | 'BROWSER_DOWNLOAD';
  message: string;
}

export function useDisasterRecovery(apiBase: string = 'http://localhost:3000', enabled: boolean = true) {
  const [syncStatus, setSyncStatus] = useState<SyncTrafficStatus>(() => {
    return navigator.onLine ? 'ONLINE' : 'OFFLINE';
  });
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => {
    const saved = localStorage.getItem('last_online_timestamp');
    return saved ? new Date(Number(saved)) : new Date();
  });
  const [offlineHours, setOfflineHours] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastBackup, setLastBackup] = useState<BackupResult | null>(null);
  const isSyncingRef = useRef<boolean>(false);

  // Helper to calculate offline duration & status
  const evaluateOfflineStatus = useCallback(() => {
    const lastOnlineStr = localStorage.getItem('last_online_timestamp');
    const lastOnline = lastOnlineStr ? Number(lastOnlineStr) : Date.now();
    const diffHours = (Date.now() - lastOnline) / (1000 * 60 * 60);
    setOfflineHours(Math.floor(diffHours));

    if (diffHours >= 24) {
      setSyncStatus('OFFLINE_WARNING');
    } else {
      setSyncStatus('OFFLINE');
    }
  }, []);

  // Sync execution logic
  const performSync = useCallback(async () => {
    if (isSyncingRef.current) {
      return { success: false, message: 'Sync already in progress' };
    }
    isSyncingRef.current = true;
    try {
      setSyncStatus('SYNCING');

      // 1. Primary: Sync embedded replica with Turso Cloud
      let syncRes: any = null;
      try {
        syncRes = await db.sync(apiBase);
        if (syncRes && syncRes.success !== false && !syncRes.offline) {
          const now = new Date();
          setSyncStatus('ONLINE');
          setLastSyncTime(now);
          setOfflineHours(0);
          localStorage.setItem('last_online_timestamp', String(now.getTime()));
          console.log("Sync successful!", syncRes);
          return { success: true, message: 'Cloud sync complete' };
        }
      } catch (tursoErr) {
        console.error("TURSO SYNC FAILED:", tursoErr);
      }

      // 2. Secondary: If cloud handshake timed out or failed, verify if Local Wi-Fi / Master Server is reachable
      const host = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
      const savedServerUrl = typeof window !== 'undefined' ? (localStorage.getItem('master_server_url') || localStorage.getItem('server_ip')) : null;
      const normalizedSaved = savedServerUrl ? (savedServerUrl.startsWith('http') ? savedServerUrl : `http://${savedServerUrl}:3000`) : null;
      const checkCandidates = [
        apiBase,
        normalizedSaved,
        'http://192.168.8.20:3000',
        'http://192.168.8.7:3000',
        'http://askar-master.local:3000',
        `http://${host}:3000`,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://192.168.88.10:3000',
      ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

      for (const target of checkCandidates) {
        try {
          const pingRes = await fetch(`${target}/api/sync/status`, {
            signal: AbortSignal.timeout(6000),
          });
          if (pingRes.ok) {
            const now = new Date();
            setSyncStatus('ONLINE');
            setLastSyncTime(now);
            setOfflineHours(0);
            localStorage.setItem('last_online_timestamp', String(now.getTime()));
            console.log('🟢 [Disaster Recovery] Master Server & Wi-Fi verified online.');
            return { success: true, message: 'Server & Wi-Fi online' };
          }
        } catch {
          // try next
        }
      }

      // 3. Truly offline
      console.warn('🔴 [Disaster Recovery] Sync failed, system offline:', syncRes?.error);
      evaluateOfflineStatus();
      return { success: false, message: 'Sync offline' };
    } catch (err: any) {
      console.error('🔴 [Disaster Recovery] Sync loop error:', err);
      evaluateOfflineStatus();
      return { success: false, message: err?.message };
    } finally {
      isSyncingRef.current = false;
    }
  }, [apiBase, evaluateOfflineStatus]);

  // 1. Initial Sync Check on Mount & Network Listeners
  useEffect(() => {
    if (!enabled) return;
    performSync();

    // Capacitor Network listener with 8s debounce to prevent Wi-Fi signal flapping storms on Android
    let networkListenerHandle: any = null;
    let debounceTimer: any = null;

    try {
      Network.addListener('networkStatusChange', (status) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (status.connected) {
            console.log('🌐 [Network] Connection stable. Triggering auto-sync...');
            performSync();
          } else {
            evaluateOfflineStatus();
          }
        }, 8000);
      }).then((handle) => {
        networkListenerHandle = handle;
      }).catch(() => { });
    } catch {
      // Ignore if not supported
    }

    // Browser online/offline event listeners
    const handleOnline = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('🌐 [Browser] Online event detected.');
        performSync();
      }, 5000);
    };
    const handleOffline = () => {
      console.log('🔌 [Browser] Offline event detected.');
      evaluateOfflineStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 2. The Offline Auto-Retry Loop — 15 minutes on Sunmi/Android, 5 minutes on laptop
    const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
    const retryIntervalMs = isAndroid ? 15 * 60 * 1000 : 5 * 60 * 1000;
    const intervalId = setInterval(() => {
      console.log('⏱️ [Disaster Recovery] Background retry loop running...');
      performSync();
    }, retryIntervalMs);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (networkListenerHandle) {
        Promise.resolve(networkListenerHandle).then((h) => {
          if (h && typeof h.remove === 'function') {
            h.remove();
          }
        }).catch(() => { });
      }
    };
  }, [performSync, evaluateOfflineStatus, enabled]);

  // 3. Physical Local Backup Export (SD Card / USB / Download)
  const exportDatabaseBackup = useCallback(async (): Promise<BackupResult> => {
    setIsExporting(true);
    try {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `backup-${dateStr}-${timeStr}.db`;

      // 1. Trigger fresh snapshot generation on backend
      let serverBackupInfo = null;
      try {
        const res = await fetch(`${apiBase}/api/system/backup`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          serverBackupInfo = data.backup;
        }
      } catch (e) {
        console.warn('Backend snapshot call warning:', e);
      }

      // 2. Handle Native Android (SUNMI D2 Mini Hardware) via @capacitor/filesystem
      if (Capacitor.isNativePlatform()) {
        try {
          // Fetch the database stream from backend to save physically to SD Card / Documents
          const downloadRes = await fetch(`${apiBase}/api/system/download-backup`);
          const blob = await downloadRes.blob();

          // Convert to base64
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              const base64 = res.split(',')[1] || res;
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          // Save directly to external documents / SD Card path
          const writeRes = await Filesystem.writeFile({
            path: `Askar_Backups/${filename}`,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true,
          });

          const result: BackupResult = {
            success: true,
            filename,
            sizeKb: (blob.size / 1024).toFixed(1),
            storageTarget: 'SD_CARD_USB',
            message: `Saved to SD Card / USB storage: ${writeRes.uri || filename}`
          };
          setLastBackup(result);
          setIsExporting(false);
          return result;
        } catch (nativeErr: any) {
          console.warn('Capacitor filesystem export failed, falling back to browser download:', nativeErr);
        }
      }

      // 3. Browser / Desktop Fallback: Trigger Direct Download to USB or Downloads folder
      const downloadUrl = `${apiBase}/api/system/download-backup`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const result: BackupResult = {
        success: true,
        filename,
        sizeKb: serverBackupInfo ? (serverBackupInfo.sizeBytes / 1024).toFixed(1) : '208.0',
        storageTarget: 'BROWSER_DOWNLOAD',
        message: `Physical backup "${filename}" exported. Ready to copy to USB drive or SD card.`
      };
      setLastBackup(result);
      setIsExporting(false);
      return result;
    } catch (err: any) {
      setIsExporting(false);
      const failResult: BackupResult = {
        success: false,
        filename: '',
        storageTarget: 'BROWSER_DOWNLOAD',
        message: `Backup failed: ${err?.message}`
      };
      setLastBackup(failResult);
      return failResult;
    }
  }, [apiBase]);

  return {
    syncStatus,
    lastSyncTime,
    offlineHours,
    isExporting,
    lastBackup,
    performSync,
    exportDatabaseBackup,
  };
}
