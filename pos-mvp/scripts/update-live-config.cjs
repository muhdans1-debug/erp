const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function updateLiveConfig() {
  try {
    execSync(`"${ADB}" forward tcp:9222 localabstract:webview_devtools_remote_27312`);
  } catch (err) {
    console.error('ADB forward error:', err.message);
  }

  const res = await fetch('http://127.0.0.1:9222/json');
  const list = await res.json();
  const main = list.find(t => t.url && !t.url.includes('customer-display') && t.type === 'page');

  if (!main) {
    console.log('Main page target not found');
    return;
  }

  const ws = new WebSocket(main.webSocketDebuggerUrl);
  ws.on('open', () => {
    const expr = `
      localStorage.setItem('master_server_url', 'http://192.168.8.7:3000');
      localStorage.setItem('server_ip', '192.168.8.7');
      ({
        master_server_url: localStorage.getItem('master_server_url'),
        server_ip: localStorage.getItem('server_ip'),
        pendingOfflineCount: localStorage.getItem('ASKAR_OFFLINE_SALES_QUEUE')?.length || 0
      })
    `;
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id === 1) {
      console.log('Result from live POS:', msg.result?.result?.value);
      process.exit(0);
    }
  });
}

updateLiveConfig().catch(console.error);

