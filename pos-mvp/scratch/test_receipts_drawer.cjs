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
  console.log('1. Entering PIN 9999 inside drawer keypad...');
  for (let i = 0; i < 4; i++) {
    const res = await evaluateInPage(`
      (() => {
        const drawer = document.querySelector('.fixed.inset-y-0.right-0');
        if (!drawer) return 'DRAWER_NOT_FOUND';
        const btn9 = Array.from(drawer.querySelectorAll('button')).find(b => b.innerText.trim() === '9');
        if (btn9) {
          btn9.click();
          return 'CLICKED_9';
        }
        return 'BTN_9_NOT_FOUND';
      })()
    `);
    console.log('Press 9 (' + (i + 1) + '):', res);
    await new Promise(r => setTimeout(r, 200));
  }

  // Wait 1200ms for fetch to complete
  await new Promise(r => setTimeout(r, 1200));

  console.log('2. Checking if Drawer is unlocked...');
  const drawerState = await evaluateInPage(`
    (() => {
      const drawer = document.querySelector('.fixed.inset-y-0.right-0');
      if (!drawer) return { error: 'No drawer' };
      const unlockedBadge = drawer.innerText.includes('MANAGER VERIFIED');
      const receiptsHeader = drawer.innerText.includes("Today's Receipts");
      const voidButtons = Array.from(drawer.querySelectorAll('button')).filter(b => b.innerText.includes('Void Bill'));
      const invoices = Array.from(drawer.querySelectorAll('p, span, div')).filter(e => e.innerText && e.innerText.startsWith('INV-')).map(e => e.innerText);

      return {
        unlockedBadge,
        receiptsHeader,
        voidButtonsCount: voidButtons.length,
        invoices: [...new Set(invoices)],
        fullTextSnippet: drawer.innerText.slice(0, 300)
      };
    })()
  `);
  console.log('Drawer State after PIN 9999:', JSON.stringify(drawerState, null, 2));
}

run().catch(console.error);
