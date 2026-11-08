import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  base: '/strength-tracker/',
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      filename: 'sw.js',
      scope: '/strength-tracker/',
      includeAssets: ['photos/*', 'icon-*.png'],
      manifest: {
        name: 'Strength Tracker',
        short_name: 'Strength',
        description: 'Your training. Your progress.',
        theme_color: '#0B0810',
        background_color: '#0B0810',
        display: 'standalone',
        id: '/strength-tracker/',
        start_url: '/strength-tracker/',
        scope: '/strength-tracker/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,png,jpg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
