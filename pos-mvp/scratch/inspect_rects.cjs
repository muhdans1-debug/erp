// @ts-nocheck
/* eslint-disable */
async function check() {
  const pages = await (await fetch('http://localhost:9222/json')).json();
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `
          Array.from(document.querySelectorAll("button")).map(b => {
            const r = b.getBoundingClientRect();
            return {
              text: b.innerText.trim().replace(/\\n/g, ' '),
              rect: { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
              parentRect: { left: b.parentElement.getBoundingClientRect().left, right: b.parentElement.getBoundingClientRect().right }
            };
          }).filter(x => x.text.includes('Back-Office') || x.text.includes('Sync') || x.text.includes('Products') || x.text.includes('Khata'))
        `,
        returnByValue: true
      }
    }));
  };
  ws.onmessage = (event) => {
    const res = JSON.parse(event.data);
    if (res.id === 1) {
      console.log('Button rects:', JSON.stringify(res.result?.result?.value, null, 2));
      process.exit(0);
    }
  };
}

check().catch(console.error);
