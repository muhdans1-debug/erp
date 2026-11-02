import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { app, BrowserWindow } = require('electron');
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Writable Storage Safeguard: In production, route all SQLite & file writes to AppData
const userDataDir = app.getPath('userData');
if (app.isPackaged) {
  try {
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    process.env.ASKAR_DATA_PATH = userDataDir;
    console.log('Production database directory set to AppData:', userDataDir);
  } catch (err) {
    console.error('Failed to set userData database directory:', err);
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Askar POS',
    autoHideMenuBar: true,
    show: false, // Hide until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.maximize();
  mainWindow.show();
  mainWindow.webContents.openDevTools();

  // Retry loading Fastify on port 3000
  let attempts = 0;
  const maxAttempts = 15;
  const pollServer = () => {
    attempts++;
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      if (attempts < maxAttempts) {
        setTimeout(pollServer, 500);
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

