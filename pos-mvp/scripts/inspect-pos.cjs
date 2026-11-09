const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function run() {
  try {
    const rawSockets = execSync(`"${ADB}" shell "cat /proc/net/unix | grep devtools"`).toString();
    const match = rawSockets.match(/@webview_devtools_remote_(\d+)/);
    if (!match) {
      console.error('No webview devtools socket found');
      return;
    }
    const socketName = match[0].substring(1); // remove @
    console.log('Connecting to socket:', socketName);
    execSync(`"${ADB}" forward tcp:9222 localabstract:${socketName}`);
    console.log('Port 9222 forwarded.');
  } catch (err) {
    console.error('ADB forward error:', err.message);
  }

  const res = await fetch('http://127.0.0.1:9222/json');
  const list = await res.json();

  console.log('\n--- Active DevTools Targets on Sunmi Terminal ---');
  list.forEach(t => console.log(`[${t.type}] ${t.title || '(no title)'} -> ${t.url} (${t.id})`));

  async function inspectTarget(target, label) {
    if (!target) return;
    console.log(`\n=== Inspecting ${label} (${target.url}) ===`);
    const ws = new WebSocket(target.webSocketDebuggerUrl);

    await new Promise((resolve) => {
      ws.on('open', () => {
        const expr = `({
          memory: window.performance && window.performance.memory ? {
            totalJSHeapSizeMB: +(window.performance.memory.totalJSHeapSize / 1048576).toFixed(2),
            usedJSHeapSizeMB: +(window.performance.memory.usedJSHeapSize / 1048576).toFixed(2),
            jsHeapSizeLimitMB: +(window.performance.memory.jsHeapSizeLimit / 1048576).toFixed(2),
          } : 'N/A',
          domNodeCount: document.querySelectorAll('*').length,
          url: window.location.href,
          title: document.title
        })`;

        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.id === 1) {
          console.log(JSON.stringify(msg.result?.result?.value, null, 2));
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        console.error('WS error:', err.message);
        resolve();
      });

      setTimeout(resolve, 3000);
    });
  }

  const main = list.find(t => t.url && !t.url.includes('customer') && t.type === 'page');
  const cust = list.find(t => t.url && t.url.includes('customer') && t.type === 'page');

  await inspectTarget(main, 'MAIN CASHIER DISPLAY');
  await inspectTarget(cust, 'SECONDARY CUSTOMER DISPLAY');
}

run().catch(console.error);
