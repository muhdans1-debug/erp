const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function verify() {
  const rawSockets = execSync(`"${ADB}" shell "cat /proc/net/unix | grep devtools"`).toString();
  const match = rawSockets.match(/@webview_devtools_remote_(\d+)/);
  const socketName = match[0].substring(1);
  execSync(`"${ADB}" forward tcp:9222 localabstract:${socketName}`);

  const res = await fetch('http://127.0.0.1:9222/json');
  const list = await res.json();
  const main = list.find(t => t.url && !t.url.includes('customer') && t.type === 'page');
  const cust = list.find(t => t.url && t.url.includes('customer') && t.type === 'page');

  console.log('Main target:', main.id);
  console.log('Customer target:', cust.id);

  // 1. Connect to Customer Screen to monitor its DOM state
  const wsCust = new WebSocket(cust.webSocketDebuggerUrl);
  await new Promise(r => wsCust.on('open', r));

  // 2. Connect to Main Screen to dispatch a broadcast test event
  const wsMain = new WebSocket(main.webSocketDebuggerUrl);
  await new Promise(r => wsMain.on('open', r));

  console.log('Simulating cart scan from Main Cashier Screen...');
  const testPayload = {
    cart: [
      { name: 'Fresh Australian Mutton 1kg', price: 3.800, qty: 2 },
      { name: 'Almarai Fresh Milk 2L', price: 1.100, qty: 1 }
    ],
    total: 8.700,
    totalSavings: 0.500,
    customer: { name: 'Ali Ahmed Hasan' }
  };

  const dispatchExpr = `
    const ch = new BroadcastChannel('sunmi_dual_screen');
    ch.postMessage({
      type: 'STATE_UPDATE',
      payload: ${JSON.stringify(testPayload)}
    });
    'DISPATCHED';
  `;

  wsMain.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: dispatchExpr, returnByValue: true } }));

  // Wait 100ms for BroadcastChannel message delivery and DOM render on customer display
  await new Promise(r => setTimeout(r, 200));

  // Inspect Customer Screen DOM to verify it received and rendered the items!
  const checkExpr = `({
    activeView: document.querySelector('.view-pane.active')?.id,
    heroTotal: document.getElementById('hero-total-val')?.textContent,
    itemsRendered: document.querySelectorAll('.cart-item-row').length,
    customerName: document.getElementById('customer-name-display')?.textContent,
    firstItemName: document.querySelector('.cart-item-row .item-name')?.textContent
  })`;

  wsCust.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: checkExpr, returnByValue: true } }));
  wsCust.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id === 2) {
      console.log('\n🌟 CUSTOMER DISPLAY LIVE DOM VERIFICATION:');
      console.log(JSON.stringify(msg.result?.result?.value, null, 2));

      // Reset back to idle for real store use
      const resetExpr = `
        const ch = new BroadcastChannel('sunmi_dual_screen');
        ch.postMessage({ type: 'STATE_UPDATE', payload: { cart: [], total: 0 } });
      `;
      wsMain.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: resetExpr } }));
      setTimeout(() => process.exit(0), 300);
    }
  });
}

verify().catch(console.error);
