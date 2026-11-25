import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  let isHmrDisabled = process.env.DISABLE_HMR === 'true';

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'pwa-no-hmr-fix',
        apply: 'serve',
        enforce: 'pre',
        configResolved(config) {
          isHmrDisabled = process.env.DISABLE_HMR === 'true' || config.server.hmr === false;
        },
        resolveId(id) {
          if (isHmrDisabled && id === '/@vite-plugin-pwa/pwa-entry-point-loaded') {
            return '\0/@vite-plugin-pwa/pwa-entry-point-loaded';
          }
        },
        load(id) {
          if (isHmrDisabled && id === '\0/@vite-plugin-pwa/pwa-entry-point-loaded') {
            return `export default function registerDevSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/dev-sw.js?dev-sw', { scope: '/', type: 'module' })
      .catch(() => {});
  }
}`;
          }
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'muna-touch-icon.png',
          'muna-logo-192.png',
          'muna-logo-512.png',
          'muna-logo-maskable-512.png',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png'
        ],
        manifest: {
          id: '/',
          name: 'Muna WinGo',
          short_name: 'Muna WinGo',
          description: 'Muna WinGo Official Color & Number Prediction Game with EasyPaisa and JazzCash instant deposit & withdrawal',
          theme_color: '#1d4ed8',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/muna-logo-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/muna-logo-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/muna-logo-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/Screenshot_*.png'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/__/],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
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
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      allowedHosts: true,
    },
  };
});
