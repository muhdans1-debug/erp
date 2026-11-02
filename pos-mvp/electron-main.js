import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Boot Fastify backend in background thread
try {
  await import('./server.js');
  console.log('Fastify backend started by Electron shell');
} catch (err) {
  if (err?.code === 'EADDRINUSE' || err?.message?.includes('EADDRINUSE')) {
    console.log('Fastify backend already active on port 3000');
  } else {
    console.error('Fastify startup error:', err);
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Askar POS',
    autoHideMenuBar: true,
    show: false, // Hide until loaded
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const loadApp = () => {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.maximize();
    mainWindow.show();
  };

  // 2. Wait 2 seconds for Fastify/SQLite to initialize, then load the UI
  setTimeout(loadApp, 2000);

  mainWindow.webContents.on('did-fail-load', () => {
    // Direct disk fallback
    const distIndex = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(distIndex).catch(() => {});
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
