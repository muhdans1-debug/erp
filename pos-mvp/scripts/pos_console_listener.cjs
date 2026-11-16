const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function listenAndDrain() {
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
    ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Network.enable' }));

    setTimeout(() => {
      // Find button and click
      const expr = `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const qBtn = btns.find(b => b.textContent && b.textContent.includes('Queued'));
        if (qBtn) {
          qBtn.click();
          return 'Clicked button: ' + qBtn.textContent;
        }
        return 'Button not found. Buttons: ' + btns.map(b => b.textContent).join(' | ');
      })()`;
      ws.send(JSON.stringify({ id: 4, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
    }, 500);

    setTimeout(() => {
      process.exit(0);
    }, 6000);
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.method === 'Console.messageAdded') {
      console.log('[POS CONSOLE]', msg.params.message.text);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[POS LOG]', msg.params.type, msg.params.args?.map(a => a.value || a.description).join(' '));
    } else if (msg.method === 'Network.requestWillBeSent') {
      console.log('[POS REQUEST]', msg.params.request.method, msg.params.request.url);
    } else if (msg.method === 'Network.responseReceived') {
      console.log('[POS RESPONSE]', msg.params.response.status, msg.params.response.url);
    } else if (msg.id === 4) {
      console.log('[EVAL RESULT]', msg.result?.result?.value);
    }
  });
}

listenAndDrain().catch(console.error);

