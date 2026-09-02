// apps/pos/src/hooks/useAutoBackup.ts
import { useEffect, useRef, useState, useCallback } from 'react';

export interface AutoBackupState {
  isBackingUp: boolean;
  lastBackupDate: string | null;
  backupPath: string | null;
  error: string | null;
  triggerManualBackup: () => Promise<boolean>;
  openBackupDir: () => Promise<void>;
}

export function useAutoBackup(parties: any[], activities: any[]): AutoBackupState {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(() =>
    localStorage.getItem('last_ledger_backup_date')
  );
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasExecutedRef = useRef(false);

  const executeBackup = useCallback(
    async (force: boolean = false): Promise<boolean> => {
      if (!parties?.length && !activities?.length) return false;

      const today = new Date().toISOString().split('T')[0];
      const savedDate = localStorage.getItem('last_ledger_backup_date');

      if (!force && savedDate === today) {
        return true;
      }

      setIsBackingUp(true);
      setError(null);

      try {
        const payload = {
          exportedAt: new Date().toISOString(),
          partiesLedger: parties,
          recentActivities: activities,
        };

        if (window.backupAPI) {
          const res = await window.backupAPI.saveDailyBackup({
            dateKey: today,
            payload,
          });

          if (res.success && res.filePath) {
            localStorage.setItem('last_ledger_backup_date', today);
            setLastBackupDate(today);
            setBackupPath(res.filePath);
            hasExecutedRef.current = true;
            return true;
          } else {
            throw new Error(res.error || 'Backup operation failed');
          }
        } else {
          // Web fallback if running inside standard browser during development
          console.warn('[useAutoBackup] window.backupAPI not detected (running outside Electron)');
          localStorage.setItem('last_ledger_backup_date', today);
          setLastBackupDate(today);
          return true;
        }
      } catch (err: any) {
        setError(err.message || 'Unknown backup error');
        hasExecutedRef.current = false; // Reset to allow retry
        return false;
      } finally {
        setIsBackingUp(false);
      }
    },
    [parties, activities]
  );

  // Automatic daily trigger when datasets are populated
  useEffect(() => {
    if (!parties?.length && !activities?.length) return;
    if (hasExecutedRef.current) return;

    const today = new Date().toISOString().split('T')[0];
    const savedDate = localStorage.getItem('last_ledger_backup_date');

    if (savedDate !== today) {
      executeBackup(false);
    }
  }, [parties, activities, executeBackup]);

  const openBackupDir = useCallback(async () => {
    if (window.backupAPI) {
      await window.backupAPI.openBackupFolder();
    }
  }, []);

  const triggerManualBackup = useCallback(async () => {
    return executeBackup(true);
  }, [executeBackup]);

  return {
    isBackingUp,
    lastBackupDate,
    backupPath,
    error,
    triggerManualBackup,
    openBackupDir,
  };
}