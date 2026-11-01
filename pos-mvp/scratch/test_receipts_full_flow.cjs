async function evaluateInPage(expression) {
  const pages = await (await fetch('http://localhost:9222/json')).json();
  const page = pages.find(p => p.type === 'page');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true }
      }));
    };
    ws.onmessage = (event) => {
      const res = JSON.parse(event.data);
      if (res.id === 1) {
        ws.close();
        if (res.result?.exceptionDetails) reject(new Error(JSON.stringify(res.result.exceptionDetails)));
        else resolve(res.result?.result?.value);
      }
    };
    ws.onerror = reject;
  });
}

async function run() {
  console.log('1. Clicking Refresh button in Order History Drawer...');
  const res = await evaluateInPage(`
    (() => {
      const drawer = Array.from(document.querySelectorAll('.fixed.inset-y-0.right-0')).find(d => d.innerText.includes("TODAY'S TRANSACTIONS"));
      if (!drawer) return 'DRAWER_NOT_FOUND';
      const refreshBtn = Array.from(drawer.querySelectorAll('button')).find(b => b.innerText.includes('Refresh'));
      if (refreshBtn) {
        refreshBtn.click();
        return 'CLICKED_REFRESH';
      }
      return 'REFRESH_NOT_FOUND';
    })()
  `);
  console.log('Refresh click:', res);

  await new Promise(r => setTimeout(r, 1200));

  console.log('2. Inspecting updated card for INV-005006...');
  const cardInfo = await evaluateInPage(`
    (() => {
      const drawer = Array.from(document.querySelectorAll('.fixed.inset-y-0.right-0')).find(d => d.innerText.includes("TODAY'S TRANSACTIONS"));
      if (!drawer) return 'NO_DRAWER';
      const cards = Array.from(drawer.querySelectorAll('.rounded-xl')).map(c => c.innerText.trim().replace(/\\n+/g, ' | '));
      const invCard = cards.find(c => c.includes('INV-005006'));
      return invCard || 'INV-005006_NOT_FOUND';
    })()
  `);
  console.log('INV-005006 Card status:', cardInfo);
}

run().catch(console.error);
