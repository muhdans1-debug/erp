const http = require('http');
const WebSocket = require('ws');

// Runs on the Laptop at 192.168.88.10 / 192.168.8.7 (0.0.0.0)
const PORT = process.env.BRIDGE_PORT || 8080;

let activeLock = null; // Stores { customerId, lockedBy, timestamp }
let lastRelayedNfc = null; // Cache last scanned NFC event

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // HTTP NFC Relay Fallback (POST /api/nfc/relay)
  if (req.method === 'POST' && req.url === '/api/nfc/relay') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const tagId = (payload.tag_id || payload.id || '').trim().toUpperCase();
        console.log(`📡 [HTTP NFC Relay] Received NFC card from Sunmi: ${tagId}`);
        lastRelayedNfc = { tag_id: tagId, timestamp: Date.now() };

        // Broadcast to all connected WebSocket clients (laptop dashboards)
        const event = {
          type: 'NFC_SCANNED',
          payload: { tag_id: tagId, id: tagId, scannedAt: new Date().toISOString() }
        };
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(event));
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tag_id: tagId }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Health check / status
  if (req.url === '/api/bridge/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      activeLock,
      lastRelayedNfc,
      connectedClients: wss.clients.size
    }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Askar Local Bridge WebSocket Hub (Port 8080)');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const remoteIp = req.socket.remoteAddress || 'unknown';
  console.log(`⚡ [Bridge] New device connected from ${remoteIp} (Total clients: ${wss.clients.size})`);

  // Send current lock state to newly connected client
  if (activeLock) {
    ws.send(JSON.stringify({ type: 'LOCK_STATE_SYNC', payload: activeLock }));
  }

  ws.on('message', (message) => {
    try {
      const event = JSON.parse(message);
      console.log(`📡 [Bridge] Event '${event.type}' received from ${remoteIp}:`, JSON.stringify(event.payload || {}));

      // Handle server-side coordination for the "Write Lock" rule
      if (event.type === 'KHATA_EDIT_LOCK') {
        activeLock = event.payload;
      } else if (event.type === 'KHATA_EDIT_RELEASE') {
        activeLock = null;
      } else if (event.type === 'NFC_SCANNED' || event.type === 'UNKNOWN_NFC_SCANNED') {
        const tagId = (event.payload?.tag_id || event.payload?.id || '').trim().toUpperCase();
        lastRelayedNfc = { tag_id: tagId, timestamp: Date.now() };
      }

      // Broadcast the event to all other connected screens instantly
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(event));
        }
      });
    } catch (err) {
      console.error('⚠️ [Bridge] Malformed message received:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 [Bridge] Device disconnected (${remoteIp}) (Remaining: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.warn(`⚠️ [Bridge] Socket error (${remoteIp}):`, err.message);
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`  LOCAL RJ45 / WI-FI WEBSOCKET UI BRIDGE ACTIVE`);
  console.log(`  Listening on: ws://0.0.0.0:${PORT}`);
  console.log(`  Static RJ45 Subnet: Laptop 192.168.88.10 | Sunmi 192.168.88.11`);
  console.log(`  Wi-Fi Subnet: Laptop 192.168.8.7 | Sunmi 192.168.8.12`);
  console.log(`=======================================================`);
});

