import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// En local (dev) servimos desde "/". En el build de producción usamos la ruta
// del repo de GitHub Pages (ej. "/personal_trainer/"). El workflow setea VITE_BASE.
const REPO_BASE = process.env.VITE_BASE || '/personal_trainer/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'Gym Coach',
        short_name: 'GymCoach',
        description: 'Control de comida y rutina de gym con IA',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        // El catálogo es grande: no lo metemos en el precache, lo cacheamos en runtime
        globIgnores: ['**/exercise-catalog.json'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/functions\//],
        runtimeCaching: [
          {
            // Catálogo de ejercicios: se descarga una vez y queda guardado
            urlPattern: ({ url }) => url.pathname.endsWith('exercise-catalog.json'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-catalog',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            // Imágenes de ejercicios (CDN público)
            urlPattern: ({ url }) =>
              url.hostname.includes('jsdelivr.net') || url.hostname.includes('githubusercontent.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // No cachear las llamadas a la IA / Supabase
            urlPattern: ({ url }) => url.pathname.includes('/functions/'),
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
}))
