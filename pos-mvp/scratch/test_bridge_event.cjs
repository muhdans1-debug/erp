const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  console.log('Connected to Local RJ45 WebSocket Bridge');
  const payload = {
    type: 'UNKNOWN_NFC_SCANNED',
    payload: {
      tag_id: '04:6A:B2:91:2A',
      terminal_id: 'SUNMI-D2-TEST',
      timestamp: new Date().toISOString()
    }
  };
  console.log('Emitting test event:', payload);
  ws.send(JSON.stringify(payload));
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1000);
});

ws.on('error', (err) => {
  console.error('Socket error:', err.message);
  process.exit(1);
});

