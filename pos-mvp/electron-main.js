import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File logging for packaged startup diagnosis
const logPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'askar-startup.log');
const log = (msg) => {
  try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
  console.log(msg);
};
log(`=== Askar POS Boot Init (pid: ${process.pid}) ===`);

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err?.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${reason?.stack || reason}`);
});

const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog } = require('electron');

// Performance Optimizations for Retail Hardware (Intel Celeron / Core i3 / Low-spec Laptops)
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// Writable Storage Safeguard: In production, route all SQLite & file writes to AppData
const appDataRoot = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '.', 'Library', 'Application Support') : '/var/local');
const userDataDir = path.join(appDataRoot, 'Askar POS');

if (app.isPackaged) {
  try {
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    process.env.ASKAR_DATA_PATH = userDataDir;
    log(`Production database directory set to: ${userDataDir}`);

    // Seed production config files if missing
    const dbFiles = ['quick_products_config.json', 'khata_config.json'];
    for (const file of dbFiles) {
      const unpackedSrc = path.join(process.resourcesPath || __dirname, 'app.asar.unpacked', file);
      const standardSrc = path.join(__dirname, file);
      const src = fs.existsSync(unpackedSrc) ? unpackedSrc : standardSrc;
      const dest = path.join(userDataDir, file);
      const isDb = file.endsWith('.db');
      const needsCopy = !fs.existsSync(dest) || (isDb && fs.statSync(dest).size < 10000);
      if (needsCopy && fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, dest);
          log(`Initialized ${file} into ${userDataDir} from ${src}`);
        } catch (copyErr) {
          log(`Failed to copy ${file}: ${copyErr?.message}`);
        }
      }
    }

    // Safe Initialization: Allow LibSQL native WAL recovery to handle replication state without deleting local.db
    log('Safe initialization: local.db preserved for native LibSQL / SQLite WAL crash recovery');
  } catch (err) {
    log(`Warning setting database directory: ${err?.message}`);
  }
} else {
  process.env.ASKAR_DATA_PATH = __dirname;
}

// 1. Boot Fastify backend in background without blocking window creation
import('./server.js')
  .then(() => {
    console.log('Fastify backend booted successfully');
  })
  .catch((err) => {
    if (err?.code === 'EADDRINUSE' || err?.message?.includes('EADDRINUSE')) {
      console.log('Fastify backend already active on port 3000');
    } else {
      console.error('BACKEND CRASH REASON:', err);
      try {
        const { dialog } = require('electron');
        dialog.showErrorBox(
          'Fastify Backend Startup Error',
          `Fastify backend failed to start:\n${err?.message || err}\n\nStack:\n${err?.stack || ''}`
        );
      } catch {}
    }
  });

let mainWindow;

function createWindow() {
  log('createWindow() invoked');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Askar POS',
    autoHideMenuBar: true,
    show: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false
    }
  });
  log('BrowserWindow instance created');

  try {
    mainWindow.maximize();
    // Only open DevTools in explicit debug mode or unpacked dev environment
    if (process.env.ASKAR_DEV === 'true') {
      mainWindow.webContents.openDevTools();
    }
  } catch (e) {
    log(`Warning on window maximize: ${e?.message}`);
  }

  // Allow technicians to toggle DevTools on demand via F12 without bogging down daily POS operations
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Fast retry loading Fastify on port 3000 (250ms polling for sub-second visual launch)
  let attempts = 0;
  const maxAttempts = 30;
  const pollServer = () => {
    attempts++;
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      if (attempts < maxAttempts) {
        setTimeout(pollServer, 250);
      } else {
        console.warn('Fastify not responding on port 3000 after retries, falling back to local files');
        const distIndex = path.join(__dirname, 'dist', 'index.html');
        mainWindow.loadFile(distIndex).catch((e) => console.error('Fallback failed:', e));
      }
    });
  };

  pollServer();

  mainWindow.webContents.on('did-fail-load', () => {
    const distIndex = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(distIndex).catch(() => {});
  });
}

log('Waiting for app.whenReady()...');
app.whenReady()
  .then(() => {
    log('app.whenReady() resolved successfully');
    createWindow();
  })
  .catch((err) => {
    log(`FATAL: app.whenReady() rejected: ${err?.stack || err}`);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

