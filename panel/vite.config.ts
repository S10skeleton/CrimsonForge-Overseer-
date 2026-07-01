import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Installable PWA companion (MOBILE-1). Precache the app shell; API is
    // network-first so stats are always fresh (offline shows a clean fallback,
    // never stale numbers). Auto-updates the SW on new deploys.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['overseer-favicon.svg', 'overseer-icon.png'],
      manifest: {
        name: 'Overseer',
        short_name: 'Overseer',
        description: 'Crimson Forge Overseer — ops companion',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#C0302A',
        background_color: '#F4F5F7',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Fresh data always: try network first, fall back to cache only offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.href.includes('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'overseer-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 60, maxAgeSeconds: 300 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist',
  },
})
