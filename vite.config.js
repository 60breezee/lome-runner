import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          three: ['three'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['assets/**/*.svg', 'icons/*.svg', 'icons/*.png'],
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lome-runner-google-fonts',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        id: '/',
        name: 'Lomé Runner',
        short_name: 'Lomé Runner',
        description: 'Cours, esquive et bats ton record dans les rues de Lomé.',
        lang: 'fr',
        dir: 'ltr',
        categories: ['games'],
        theme_color: '#181614',
        background_color: '#181614',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
});
