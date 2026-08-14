import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages sirve el sitio bajo https://USUARIO.github.io/NOMBRE-DEL-REPO/,
// asi que todas las rutas tienen que colgar de ese subdirectorio. Si algun dia
// se publica en un dominio propio, basta con BASE_PATH=/ al compilar.
const base = process.env.BASE_PATH || "/npa-stats/";

export default defineConfig({
  base,
  build: {
    // El bundle de SheetJS es grande por naturaleza; no es un problema real
    // porque se descarga una sola vez y despues vive en la cache del navegador.
    chunkSizeWarningLimit: 1200,
  },
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
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: base + "index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
