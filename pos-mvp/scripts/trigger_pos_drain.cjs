const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function triggerDrain() {
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
    // Find the queued button or trigger sync
    const expr = `(async () => {
      // Look for the "Queued" button in the DOM
      const buttons = Array.from(document.querySelectorAll('button'));
      const queuedBtn = buttons.find(b => b.textContent && b.textContent.includes('Queued'));
      if (queuedBtn) {
        console.log('Found Queued button:', queuedBtn.textContent);
        queuedBtn.click();
        return { clicked: true, text: queuedBtn.textContent };
      }
      return { clicked: false, buttons: buttons.map(b => b.textContent?.trim()).filter(Boolean).slice(0, 10) };
    })()`;
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id === 1) {
      console.log('TRIGGER RESULT:', JSON.stringify(msg.result?.result?.value, null, 2));
      setTimeout(() => process.exit(0), 1000);
    }
  });
}

triggerDrain().catch(console.error);

