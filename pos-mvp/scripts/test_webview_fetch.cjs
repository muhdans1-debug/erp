const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function testFromWebView() {
  const rawSockets = execSync(`"${ADB}" shell "cat /proc/net/unix"`).toString();
  const match = rawSockets.match(/@webview_devtools_remote_(\d+)/);
  if (!match) return console.error('No devtools socket');
  const socketName = match[0].substring(1);
  execSync(`"${ADB}" forward tcp:9222 localabstract:${socketName}`);

  const res = await fetch('http://127.0.0.1:9222/json');
  const list = await res.json();
  const main = list.find(t => t.url && !t.url.includes('customer') && t.type === 'page');
  if (!main) return console.error('No main page');

  const ws = new WebSocket(main.webSocketDebuggerUrl);
  ws.on('open', () => {
    // Test fetch directly to master server from inside Sunmi WebView
    const expr = `(async () => {
      try {
        const testRes = await fetch('http://192.168.8.7:3000/api/health');
        const testData = await testRes.json();
        return { ok: testRes.ok, status: testRes.status, data: testData };
      } catch (err) {
        return { error: err.message, stack: err.stack };
      }
    })()`;
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id === 1) {
      console.log('WebView fetch test:', JSON.stringify(msg.result?.result?.value, null, 2));
      process.exit(0);
    }
  });
}

testFromWebView().catch(console.error);

