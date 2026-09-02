export interface BackupPayload {
  exportedAt: string;
  partiesLedger: any[];
  recentActivities: any[];
}

export interface BackupResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

declare global {
  interface Window {
    backupAPI?: {
      saveDailyBackup: (params: { dateKey: string; payload: BackupPayload }) => Promise<BackupResult>;
      openBackupFolder: () => Promise<{ success: boolean; error?: string }>;
    };
  }
}