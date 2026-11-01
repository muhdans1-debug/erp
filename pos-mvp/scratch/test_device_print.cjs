const WebSocket = require('ws');

async function testDevicePrint() {
  const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
  const wsUrl = pages[0].webSocketDebuggerUrl;
  console.log('Connecting to WebSocket:', wsUrl);

  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('WebSocket open, evaluating checkout with sequential invoice on physical printer...');
    // We can evaluate tapping an item, then tapping CASH, or invoking the print helper directly
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `
          (async () => {
            // 1. Click first product card
            const productCard = Array.from(document.querySelectorAll('div, button')).find(el => el.innerText && el.innerText.includes('Red Onions'));
            if (productCard) productCard.click();

            await new Promise(r => setTimeout(r, 400));

            // 2. Click CASH button
            const cashBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('CASH'));
            if (cashBtn) {
              cashBtn.click();
              return 'CLICKED_CASH_SUCCESSFULLY';
            }
            return 'CASH_BTN_NOT_FOUND';
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      }
    }));
  });

  ws.on('message', (data) => {
    const res = JSON.parse(data.toString());
    console.log('Evaluation result:', JSON.stringify(res, null, 2));
    setTimeout(() => process.exit(0), 1000);
  });
}

testDevicePrint().catch(console.error);
