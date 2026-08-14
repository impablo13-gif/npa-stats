import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import "./index.css";

/* El service worker es lo que hace que la app arranque sin conexion: guarda
   todos sus archivos en el dispositivo la primera vez que se abre con wifi.
   `onNeedRefresh` no interrumpe nada — la version nueva se aplicara la
   proxima vez que se pulse "Actualizar ahora", nunca en mitad de un partido.
   El enlace de la app no cambia nunca: siempre es el mismo, es la propia app
   la que se renueva sola por debajo. */
let refreshPending = false;
let swRegistration = null;
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    swRegistration = registration || null;
  },
  onNeedRefresh() {
    refreshPending = true;
    window.dispatchEvent(new CustomEvent("npa:update-ready"));
  },
});

/* El navegador solo revisa si hay una versión nueva al cargar la página desde
   cero — y una PWA instalada casi nunca se recarga: se abre desde el icono y
   se queda ahí, a veces días, así que ese chequeo nunca llegaba a pasar. Aquí
   se fuerza esa comprobación cada vez que la app vuelve a primer plano (abrir
   la tablet, cambiar de app y volver) y, por si se queda abierta mucho rato
   sin moverse, también cada hora. */
function checkForUpdate() {
  if (swRegistration) swRegistration.update().catch(() => {});
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForUpdate();
});
window.addEventListener("focus", checkForUpdate);
setInterval(checkForUpdate, 60 * 60 * 1000);

/* Solo se recarga cuando la app lleva un rato en segundo plano y no hay nada
   en juego, para no perder datos de un partido en curso. */
window.addEventListener("npa:apply-update", () => {
  if (refreshPending) updateSW(true);
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
