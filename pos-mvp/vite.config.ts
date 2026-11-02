import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // NOTE: @vitejs/plugin-legacy REMOVED — Sunmi D2 Mini runs Android 10 (Chrome 80+).
    // Legacy polyfills for Android >= 7 added ~120KB dead weight. Not needed.
  ],
  build: {
    // ES2020 — fully supported on Android 10 / Chrome 80+ (Sunmi D2 Mini)
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        // Strip all console.* from production — removes ~200+ debug logs shipped to Sunmi
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
    },
    rollupOptions: {
      output: {
        // Manual chunk splitting: POS core boots fast; back-office lazy-loads on demand
        manualChunks: (id) => {
          // Recharts + D3 are heavy — isolate so they never block POS startup
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          // React runtime — shared base
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react';
          // Lucide icons
          if (id.includes('lucide-react')) return 'vendor-icons';
          // Barcode / QR libs — only needed in BarcodeGenerator page
          if (id.includes('react-barcode') || id.includes('qrcode')) return 'vendor-barcode';
          // LibSQL / Turso client
          if (id.includes('@libsql') || id.includes('libsql')) return 'vendor-libsql';
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    allowedHosts: [
      'topics-tab-scenarios-permits.trycloudflare.com',
      '.trycloudflare.com',
      'trycloudflare.com',
      'askar-khata.pages.dev',
      'localhost',
      '127.0.0.1'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/archives/**', '**/*.db*'],
    },
  },
})
