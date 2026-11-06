const path = require('path');

async function main() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: __dirname,
    server: {
      port: 5173,
      host: '0.0.0.0',
      strictPort: true
    }
  });
  await server.listen();
  server.printUrls();
  console.log('✅ Askar POS Web UI is live on http://0.0.0.0:5173');
}

main().catch((err) => {
  console.error('❌ Failed to start POS Vite server:', err);
  process.exit(1);
});

