import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = process.env.BRIDGE_PORT || 8080;

let activeLock = null;
let lastRelayedNfc = null;
let serverInstance = null;
let wssInstance = null;

export function startBridgeServer(port = PORT, host = '0.0.0.0') {
  if (serverInstance) return;

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/nfc/relay') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const tagId = (payload.tag_id || payload.id || '').trim().toUpperCase();
          lastRelayedNfc = { tag_id: tagId, timestamp: Date.now() };

          const event = {
            type: 'NFC_SCANNED',
            payload: { tag_id: tagId, id: tagId, scannedAt: new Date().toISOString() }
          };
          if (wssInstance) {
            wssInstance.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(event));
              }
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, tag_id: tagId }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (req.url === '/api/bridge/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        activeLock,
        lastRelayedNfc,
        connectedClients: wssInstance ? wssInstance.clients.size : 0
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Askar Local Bridge WebSocket Hub (Port 8080)');
  });

  const wss = new WebSocketServer({ server });
  serverInstance = server;
  wssInstance = wss;

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const remoteIp = req.socket.remoteAddress || 'unknown';
    console.log(`🔌 New hardware connected from IP: ${remoteIp}`);

    if (activeLock) {
      ws.send(JSON.stringify({ type: 'LOCK_STATE_SYNC', payload: activeLock }));
    }

    ws.on('message', (message) => {
      const msgString = message.toString();
      try {
        const event = JSON.parse(msgString);
        if (event.type === 'KHATA_EDIT_LOCK') {
          activeLock = event.payload;
        } else if (event.type === 'KHATA_EDIT_RELEASE') {
          activeLock = null;
        } else if (event.type === 'NFC_SCANNED' || event.type === 'UNKNOWN_NFC_SCANNED') {
          const tagId = (event.payload?.tag_id || event.payload?.id || '').trim().toUpperCase();
          lastRelayedNfc = { tag_id: tagId, timestamp: Date.now() };
        }
      } catch (err) {
        // Non-JSON or raw payload
      }

      // Broadcast the incoming cart payload to all OTHER connected clients (the Master Laptop)
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) { // 1 = WebSocket.OPEN
          client.send(msgString);
        }
      });
    });

    ws.on('close', () => {
      console.log(`❌ Hardware disconnected: ${remoteIp}`);
    });

    ws.on('error', (err) => {
      console.warn(`⚠️ [Bridge] Socket warning (${remoteIp}):`, err.message);
    });
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  server.on('close', () => clearInterval(heartbeatInterval));

  server.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      console.log(`ℹ️ Bridge Port ${port} is already active by another instance.`);
    } else {
      console.warn(`⚠️ Bridge server error:`, err?.message || err);
    }
  });

  server.listen(port, host, () => {
    console.log(`📡 Hardware LAN Bridge running on ws://${host}:${port}`);
  });
}

// Standalone execution support
if (process.argv[1] && (process.argv[1].endsWith('bridgeServer.js') || process.argv[1].endsWith('bridgeServer.cjs'))) {
  startBridgeServer();
}

