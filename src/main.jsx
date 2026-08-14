import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import "./index.css";

/* El service worker es lo que hace que la app arranque sin conexion: guarda
   todos sus archivos en el dispositivo la primera vez que se abre con wifi.
   `onNeedRefresh` no interrumpe nada — la version nueva se aplicara la
   proxima vez que se abra la app, nunca en mitad de un partido. */
let refreshPending = false;
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    refreshPending = true;
    window.dispatchEvent(new CustomEvent("npa:update-ready"));
  },
});

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
