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
      includeAssets: [
        'photos/*',
        'icon-*.png',
        'apple-touch-icon*.png',
        'favicon*.png',
        'streak-achievements/*.PNG',
      ],
      manifest: {
        name: 'Strength Trainer 2.0',
        short_name: 'Strength',
        description: 'Your training. Your progress.',
        theme_color: '#0B0810',
        background_color: '#0B0810',
        display: 'standalone',
        id: '/strength-tracker/',
        start_url: '/strength-tracker/',
        scope: '/strength-tracker/',
        icons: [
          { src: 'icon-st-v2-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-st-v2-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-st-v2-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,mjs,css,html,png,jpg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6_000_000,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
