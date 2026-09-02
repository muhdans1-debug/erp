const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure a dedicated backup directory exists in the user's Documents folder
const backupDirectory = path.join(app.getPath('documents'), 'LayaliPOS_Backups');
if (!fs.existsSync(backupDirectory)) {
  fs.mkdirSync(backupDirectory, { recursive: true });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 768,
    autoHideMenuBar: true,
    title: 'Layali Cold Store POS Suite',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.maximize();

  // Resolve path to index.html across dev and packaged modes
  const productionPath = path.join(__dirname, '../apps/pos/dist/index.html');
  const packagedPath = path.join(__dirname, 'apps/pos/dist/index.html');
  const fallbackPath = path.join(__dirname, '../dist/index.html');

  let targetPath = fallbackPath;
  if (fs.existsSync(productionPath)) {
    targetPath = productionPath;
  } else if (fs.existsSync(packagedPath)) {
    targetPath = packagedPath;
  }

  mainWindow.loadFile(targetPath).catch((err) => {
    console.error('Failed to load file:', err);
  });

  // Comment out before sending to cash counter
  mainWindow.webContents.openDevTools();
}

// ---------------------------------------------------------------------------
// IPC Handlers: Daily Ledger Backups
// ---------------------------------------------------------------------------

ipcMain.handle('save-daily-backup', async (_event, { dateKey, payload }) => {
  try {
    const fileName = `ledger_backup_${dateKey}.json`;
    const targetFile = path.join(backupDirectory, fileName);

    fs.writeFileSync(targetFile, JSON.stringify(payload, null, 2), 'utf-8');
    return { success: true, filePath: targetFile };
  } catch (error) {
    console.error('[Backup Error]:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-backup-folder', async () => {
  try {
    await shell.openPath(backupDirectory);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});