import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
