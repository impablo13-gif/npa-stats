import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages sirve el sitio bajo https://USUARIO.github.io/NOMBRE-DEL-REPO/,
// asi que todas las rutas tienen que colgar de ese subdirectorio. Si algun dia
// se publica en un dominio propio, basta con BASE_PATH=/ al compilar.
const base = process.env.BASE_PATH || "/npa-stats/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // "prompt" y no "autoUpdate" a proposito: con autoUpdate el navegador
      // recarga la pagina por su cuenta en cuanto detecta una version nueva, y
      // eso puede pasar en mitad de un partido. Aqui la version nueva espera y
      // solo se aplica cuando se pulsa "Actualizar ahora", con el reloj parado.
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon-180.png", "icon-192.png", "icon-512.png", "icon-512-maskable.png"],
      manifest: {
        name: "NPA Stats — Futbol sala",
        short_name: "NPA Stats",
        description: "Minutos y estadisticas en directo. Funciona sin conexion.",
        lang: "es",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#0A0A0A",
        theme_color: "#0A0A0A",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Todo lo que la app necesita para arrancar queda precacheado: sin esto
        // el primer partido sin wifi se quedaria en pantalla en blanco.
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        // "xlsx" y "xlsx-js-style" (exportar a Excel) son pesadas de verdad y
        // solo las usa quien pulsa exportar -- igual que el nucleo de ffmpeg en
        // el correctivo de video, no hace falta que bajen con el resto de la
        // app en la primera instalacion. Quedan fuera del precache de arranque
        // y se guardan aparte, en cuanto se usan una vez, para seguir
        // funcionando sin conexion a partir de ahi.
        globIgnores: ["**/xlsx*.js"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: base + "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}assets/`) && /\/xlsx.*\.js$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "xlsx-libs",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
