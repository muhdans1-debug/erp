// @ts-nocheck
/* eslint-disable */
async function clickDashboard() {
  const pages = await (await fetch('http://localhost:9222/json')).json();
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Back-Office'));
          if (btn) {
            btn.click();
            'CLICKED';
          } else {
            'NOT_FOUND';
          }
        `,
        returnByValue: true
      }
    }));
  };
  ws.onmessage = (event) => {
    const res = JSON.parse(event.data);
    if (res.id === 1) {
      console.log('Result:', res.result?.result?.value);
      process.exit(0);
    }
  };
}

clickDashboard().catch(console.error);
