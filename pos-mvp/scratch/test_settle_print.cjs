const WebSocket = require('ws');

async function run() {
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
      // 1. Click on Ashraf
      const customerCards = Array.from(document.querySelectorAll('div, button')).filter(el => 
        el.textContent && el.textContent.includes('Ashraf') && el.textContent.includes('BD 0.300')
      );
      if (customerCards.length > 0) {
        customerCards[customerCards.length - 1].click();
      }

      await new Promise(r => setTimeout(r, 600));

      // 2. Click Full Balance or type 0.100
      const fullBalBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Full'));
      if (fullBalBtn) {
        fullBalBtn.click();
      } else {
        const input = document.querySelector('input[type="number"], input[placeholder="0.000"]');
        if (input) {
          input.value = '0.100';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      await new Promise(r => setTimeout(r, 600));

      // 3. Find Cash button
      const cashBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.textContent && b.textContent.includes('Cash') && b.className && b.className.includes('bg-emerald')
      );

      if (cashBtn) {
        cashBtn.click();
        return 'SETTLEMENT_CLICKED_CASH';
      }

      return 'CASH_BUTTON_NOT_FOUND';
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
      console.log('Result:', data.result);
      ws.close();
    }
  });
}

run().catch(console.error);
