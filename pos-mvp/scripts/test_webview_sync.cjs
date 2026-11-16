const WebSocket = require('ws');
const { execSync } = require('child_process');

const ADB = 'C:\\Users\\ACER\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

async function testSyncFromWebView() {
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
    // 1. Fetch pending offline sales via CapacitorSQLite or DOM
    // In Capacitor, CapacitorSQLite is available on window.Capacitor.Plugins.CapacitorSQLite
    const expr = `(async () => {
      try {
        const sqlite = window.Capacitor?.Plugins?.CapacitorSQLite;
        if (!sqlite) return { error: 'No CapacitorSQLite plugin found on window' };

        const queryRes = await sqlite.query({
          database: 'askar_offline',
          statement: 'SELECT id, payload, timestamp FROM offline_sales WHERE synced = 0;',
          values: []
        });

        const pendingRows = queryRes.values || [];
        if (pendingRows.length === 0) {
          return { message: 'No pending offline sales found in SQLite', count: 0 };
        }

        const normalizedSales = pendingRows.map(row => {
          const s = JSON.parse(row.payload);
          return {
            id: s.id,
            invoiceNo: s.invoiceNo,
            total: Number(s.total || s.totalAmount || 0),
            subtotal: Number(s.subtotal || s.total || 0),
            paymentType: s.paymentType || 'CASH',
            status: s.status || 'COMPLETED',
            customerId: s.customerId || null,
            employeeId: s.employeeId || null,
            shiftId: s.shiftId || null,
            createdAt: s.offlineTimestamp || s.createdAt || new Date().toISOString(),
            items: Array.isArray(s.items) ? s.items : []
          };
        });

        // Send to master server
        const syncResponse = await fetch('http://192.168.8.7:3000/api/sync/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sales: normalizedSales })
        });

        const syncResult = await syncResponse.json();

        if (syncResponse.ok && syncResult.success) {
          // Mark synced in SQLite
          for (const s of normalizedSales) {
            await sqlite.run({
              database: 'askar_offline',
              statement: 'DELETE FROM offline_sales WHERE id = ?;',
              values: [s.id]
            });
          }
          return { success: true, count: normalizedSales.length, syncResult };
        } else {
          return { success: false, status: syncResponse.status, syncResult };
        }
      } catch (err) {
        return { error: err.message, stack: err.stack };
      }
    })()`;

    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id === 1) {
      console.log('SYNC FROM WEBVIEW RESULT:');
      console.log(JSON.stringify(msg.result?.result?.value, null, 2));
      process.exit(0);
    }
  });
}

testSyncFromWebView().catch(console.error);

