const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function checkQueue() {
  const rawSockets = execSync(`"${ADB}" shell "cat /proc/net/unix"`).toString();
  const match = rawSockets.match(/@webview_devtools_remote_(\d+)/);
  if (!match) {
    console.error('No devtools socket found');
    return;
  }
  const socketName = match[0].substring(1);
  execSync(`"${ADB}" forward tcp:9222 localabstract:${socketName}`);

  const res = await fetch('http://127.0.0.1:9222/json');
  const list = await res.json();
  const main = list.find(t => t.url && !t.url.includes('customer') && t.type === 'page');

  if (!main) {
    console.error('Main page not found');
    return;
  }

  const ws = new WebSocket(main.webSocketDebuggerUrl);
  ws.on('open', () => {
    const expr = `({
      offlineSalesQueue: localStorage.getItem('ASKAR_OFFLINE_SALES_QUEUE'),
      serverIp: localStorage.getItem('server_ip'),
      masterServerUrl: localStorage.getItem('master_server_url'),
      isCloudDrActive: localStorage.getItem('IS_CLOUD_DR_ACTIVE'),
      navigatorOnLine: navigator.onLine,
      currentUrl: window.location.href,
      syncErrors: window.__LAST_SYNC_ERROR || null,
      wsState: window.__POS_WS_STATE || null
    })`;
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id === 1) {
      console.log('LIVE QUEUE STATE IN POS:');
      console.log(JSON.stringify(msg.result?.result?.value, null, 2));
      process.exit(0);
    }
  });
}

checkQueue().catch(console.error);

