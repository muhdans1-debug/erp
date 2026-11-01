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
    // 1. Close F12 Search Modal if open by clicking its backdrop or X button
    // 2. Open Khata Modal
    const expr = `(() => {
      // Find all close buttons or backdrop
      const closeButtons = Array.from(document.querySelectorAll('button')).filter(b => b.querySelector('svg.lucide-x') || b.querySelector('svg'));
      
      // Look for the Search Modal backdrop and click it, or hit escape
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));

      // Find Khata (F3) button
      const allButtons = Array.from(document.querySelectorAll('button'));
      const khataBtn = allButtons.find(b => b.textContent && b.textContent.includes('Khata (F3)'));
      if (khataBtn) {
        khataBtn.click();
        return 'CLICKED_KHATA';
      }
      return 'BUTTONS: ' + allButtons.map(b => b.textContent.trim()).join(' | ');
    })()`;

    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expr, returnByValue: true }
    }));
  });

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.id === 1) {
      console.log('Runtime.evaluate result:', data.result);
      ws.close();
    }
  });
}

run().catch(console.error);
