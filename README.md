# NPA Stats — control de partidos de fútbol sala

Aplicación para llevar en directo los minutos, goles y estadísticas de cada
jugador durante un partido o un entrenamiento.

Es una **PWA**: se comparte con un enlace, se instala en la tablet como una app
más y **funciona sin conexión**. Todos los datos (equipos, plantillas, fotos,
historial y el partido en curso) se guardan en el propio dispositivo, no en
ningún servidor.

---

## Uso en el pabellón

1. Con wifi (en casa o en el club), abre el enlace en la tablet.
2. Instálala:
   - **iPad / iPhone**: botón Compartir → *Añadir a pantalla de inicio*.
   - **Android / ordenador**: menú del navegador → *Instalar aplicación*
     (o el botón «Instalar app» que aparece en la pantalla de inicio).
3. A partir de ahí se abre desde el icono, a pantalla completa y sin barra del
   navegador. **Ya no hace falta wifi**: en el pabellón funciona igual.

> Los datos viven en la tablet donde se usa la app. Si se instala en dos
> dispositivos, cada uno tiene su propio historial. Para llevarse los datos,
> exporta a Excel desde *Historial*.

---

## Desarrollo

Requiere Node.js 20 o superior.

```bash
npm install
```

```bash
npm run dev
```

Compilar la versión de producción y probarla como se verá publicada:

```bash
npm run build
```

```bash
npm run preview
```

El service worker (lo que permite funcionar sin conexión) solo se activa en la
versión compilada, así que para probar el modo offline hay que usar
`npm run preview`, no `npm run dev`.

### Iconos

Los iconos son un escudo genérico generado por código. Para regenerarlos:

```bash
npm run icons
```

Para poner el escudo real del club, sustituye los archivos de `public/`
conservando los nombres (`icon-192.png`, `icon-512.png`,
`icon-512-maskable.png`, `apple-touch-icon-180.png`).

---

## Publicar en GitHub Pages

Ya está todo preparado: al subir el código a la rama `main`, GitHub compila y
publica solo. Solo hay que hacerlo una vez.

1. Crea un repositorio vacío en GitHub (por ejemplo `npa-stats`), **sin**
   README ni .gitignore.

2. Desde esta carpeta, sube el código (cambia `TU-USUARIO` y el nombre del
   repositorio si usas otro):

```bash
git remote add origin https://github.com/TU-USUARIO/npa-stats.git
```

```bash
git push -u origin main
```

3. En GitHub, entra en **Settings → Pages** y en *Source* elige
   **GitHub Actions**.

4. Espera a que termine el flujo de la pestaña **Actions**. El enlace queda en:
   `https://TU-USUARIO.github.io/npa-stats/`

Ese es el enlace que se comparte y el que se instala en la tablet.

La ruta base se toma automáticamente del nombre del repositorio, así que puedes
llamarlo como quieras. Si algún día lo pones en un dominio propio, compila con
`BASE_PATH=/`.

### Actualizaciones

Cada `git push` a `main` publica una versión nueva. Las tablets que ya la tengan
instalada **no se actualizan solas a mitad de uso**: aparece un aviso en la
pantalla de inicio de la app («Hay una versión nueva…») y se aplica al pulsar
*Actualizar ahora*, que además se niega a hacerlo con el reloj en marcha.

---

## Cómo está montado

| Archivo | Qué hace |
| --- | --- |
| `src/App.jsx` | Toda la aplicación: partido, entrenamiento, plantilla, historial. |
| `src/storage.js` | Guardado local en IndexedDB (equipos, plantillas, historial, partido en curso). |
| `src/index.css` | Estilos globales y fuentes empaquetadas (no se descargan de internet). |
| `vite.config.js` | Compilación y configuración de la PWA (manifiesto y service worker). |
| `tools/make-icons.mjs` | Genera los iconos sin depender de librerías de imagen. |
| `.github/workflows/deploy.yml` | Compila y publica en GitHub Pages en cada push. |

### Detalles que conviene conocer

- **El reloj no cuenta «tics»**, sino tiempo real del sistema. Los navegadores de
  tablet frenan los temporizadores cuando se apaga la pantalla o se cambia de
  app; contando tics, los minutos jugados salían cortos.
- **El partido en curso se guarda solo** cada 5 segundos y, además, justo al
  minimizar o cerrar la app. Si se recarga o se cierra sin querer, al volver a
  abrir ofrece retomarlo.
- **Editar la convocatoria a mitad de partido** solo cambia la lista de
  convocados; no toca minutos, goles ni tarjetas.
- **El PDF** se genera con el diálogo de imprimir del navegador
  (*Guardar como PDF*), sin necesidad de conexión.
