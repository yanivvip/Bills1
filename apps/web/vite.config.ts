import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// Stamp of this build: UTC time and the commit (Cloudflare gives the commit in its build environment).
const sha = (process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || (() => { try { return execSync('git rev-parse HEAD').toString(); } catch { return 'local'; } })()).slice(0, 7);
const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify(builtAt), __BUILD_SHA__: JSON.stringify(sha) },
  server: { port: 5174, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg', 'brand/*.svg'],
      manifest: {
        name: 'Bills',
        short_name: 'Bills',
        description: 'Monthly utility meter reporting and bill splitting',
        start_url: '/',
        display: 'standalone',
        background_color: '#f4f3ef',
        theme_color: '#0e6b5e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: { navigateFallback: '/index.html', cleanupOutdatedCaches: true },
    }),
  ],
});
