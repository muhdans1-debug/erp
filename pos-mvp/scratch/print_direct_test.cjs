const WebSocket = require('ws');

async function testPrint() {
  const targetsRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await targetsRes.json();
  const page = targets.find(t => t.type === 'page');
  if (!page || !page.webSocketDebuggerUrl) {
    console.error('No page target found');
    return;
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.on('open', () => {
    const expr = `(async () => {
      if (typeof window.printKhataPaymentReceipt !== 'function') {
        return 'WINDOW_PRINT_METHOD_NOT_FOUND';
      }
      const res = await window.printKhataPaymentReceipt({
        shopName: "ASKAR SUPERMARKET",
        customerName: "Ashraf",
        customerPhone: "+973 3311 2233",
        previousBalance: 0.550,
        amountPaid: 0.250,
        newBalance: 0.300,
        paymentMethod: "CASH",
        receiptNo: "KH-077204",
        cashierName: "Cashier 01",
        timestamp: new Date()
      });
      return { success: true, printResult: res };
    })()`;

    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true }
    }));
  });

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.id === 1) {
      console.log('Sunmi Print Job Trigger Result:', JSON.stringify(data.result, null, 2));
      ws.close();
    }
  });
}

testPrint().catch(console.error);
