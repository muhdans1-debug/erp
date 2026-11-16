const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function checkUi() {
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
    const expr = `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const qBtn = btns.find(b => b.textContent && b.textContent.includes('Queued'));
      return {
        hasQueuedButton: !!qBtn,
        queuedButtonText: qBtn ? qBtn.textContent : null,
        allHeaderButtons: btns.map(b => b.textContent?.trim()).filter(Boolean)
      };
    })()`;
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id === 1) {
      console.log('UI STATE ON SUNMI POS:');
      console.log(JSON.stringify(msg.result?.result?.value, null, 2));
      process.exit(0);
    }
  });
}

checkUi().catch(console.error);

