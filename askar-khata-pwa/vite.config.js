import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Injects Vite production asset hashes directly into dist/sw.js for cold offline PWA launches (Resolved PWA-OFF-01)
const pwaPrecachePlugin = () => ({
  name: 'pwa-precache-injector',
  apply: 'build',
  writeBundle(_options, bundle) {
    const assetFiles = Object.keys(bundle)
      .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
      .map((file) => `/${file}`);

    const swPath = path.resolve(__dirname, 'dist/sw.js');
    if (fs.existsSync(swPath)) {
      let swContent = fs.readFileSync(swPath, 'utf8');
      const assetsJson = JSON.stringify(assetFiles, null, 2);
      swContent = swContent.replace(
        '/* __BUILD_ASSETS_PLACEHOLDER__ */',
        `...${assetsJson},`
      );
      fs.writeFileSync(swPath, swContent, 'utf8');
    }
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pwaPrecachePlugin()],
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
        }
      }
    }
  }
});
