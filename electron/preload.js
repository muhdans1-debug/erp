const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backupAPI', {
  saveDailyBackup: (data) => ipcRenderer.invoke('save-daily-backup', data),
  openBackupFolder: () => ipcRenderer.invoke('open-backup-folder'),
});