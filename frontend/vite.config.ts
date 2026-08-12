import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Este es un sitio de emergencia: nunca serví datos viejos como si
      // fueran actuales. Network-first para la API (intenta la red, usa el
      // caché solo si de verdad no hay conexión); las tiles del mapa sí se
      // cachean agresivamente porque no cambian.
      workbox: {
        navigateFallback: "/index.html",
        // Agrega los listeners de push/notificationclick al mismo service
        // worker sin salirnos del modo generateSW (más simple que armar uno
        // a mano con injectManifest).
        importScripts: ["push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 6 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith("tile.openstreetmap.org"),
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
        ],
      },
      manifest: {
        name: "AquiAyudamosVE",
        short_name: "Aquí Ayudamos",
        description: "Información comunitaria verificable durante la emergencia en Cali.",
        lang: "es",
        theme_color: "#111318",
        background_color: "#111318",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // Proxying /api keeps the frontend same-origin with the backend in dev,
    // so the httpOnly refresh cookie works without SameSite=None+Secure
    // gymnastics on localhost.
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
