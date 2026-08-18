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

> Los datos viven en la tablet donde se usa la app: si se instala en dos
> dispositivos, cada uno tiene su propio historial. Para pasarlos de uno a otro,
> usa **Copia de seguridad** (más abajo).

---

## Compartir los datos entre dispositivos

No hay servidor, así que los datos no viajan solos. Para moverlos hay un
archivo de copia, en *Inicio → Copia de seguridad*:

- **Crear copia**: genera un archivo con todo (equipos, plantillas, fotos,
  partidos y entrenos). En iPad se abre directamente la hoja de compartir, así
  que se manda por AirDrop, WhatsApp o correo. En el resto, se descarga.
- **Importar copia**: se elige el archivo recibido y, **antes de aplicar nada**,
  se ve qué contiene (equipos, jugadores, partidos y de cuándo es). Después hay
  que elegir cómo entra:
  - *Añadir estos equipos* — para un segundo entrenador: trae los equipos de la
    copia sin tocar los que ya tuviera. Si un equipo ya estaba, su plantilla
    pasa a ser la de la copia y sus partidos se suman a los que hubiera.
  - *Reemplazar todo* — para una tablet nueva o de sustitución: deja el
    dispositivo igual que el que hizo la copia. No se puede deshacer.

Conviene crear una copia de vez en cuando: es lo único que protege los datos si
la tablet se rompe o se pierde. El partido en curso no entra en la copia, solo
lo ya finalizado.

Es una foto del momento, no una sincronización: si dos personas apuntan cosas a
la vez en tablets distintas, cada una tiene lo suyo y la copia no las mezcla
sola.

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
| `src/backup.js` | Copias de seguridad: crear el archivo, validarlo y restaurarlo. |
| `src/index.css` | Estilos globales y fuentes empaquetadas (no se descargan de internet). |
| `vite.config.js` | Compilación y configuración de la PWA (manifiesto y service worker). |
| `tools/make-icons.mjs` | Genera los iconos sin depender de librerías de imagen. |
| `.github/workflows/deploy.yml` | Compila y publica en GitHub Pages en cada push. |

### Datos por parte

Cada acción y cada segundo se anotan **en la parte en la que ocurren**, y el
total del partido se calcula sumando las partes. Eso aparece en tres sitios:

- **Resumen** (durante el partido): tres secciones — 1ª parte, 2ª parte y total,
  cada parte con su marcador y sus goles.
- **Historial**: la ficha de cada partido guardado deja cambiar entre 1ª, 2ª y
  total.
- **Excel e informe**: hoja/sección por parte, además del total.

El fútbol sala solo tiene 2 partes reglamentarias, así que el botón de
siguiente parte se detiene ahí. Si al agotarse el tiempo de la 2ª parte no se
pulsa *Finalizar partido*, aparece un botón para iniciar la **prórroga**
(2 partes fijas de 3 minutos cada una, independientes de la duración
configurada) — pensado solo para partidos de eliminatoria con empate; en
liga, con empate, se finaliza directamente sin tocar ese botón.

### El portero

El portero en pista va **anclado**: su tarjeta tiene fondo azul propio y un
toque normal no lo saca a la banda, para no sacarlo por accidente en mitad de
una sustitución cualquiera. Para cambiarlo se toca su propia tarjeta, que abre
un selector dedicado con el banquillo (porteros primero, luego jugadores de
campo).

Si se elige a un jugador de campo — típico en situaciones de 5x4 — queda
marcado como **PORTERO·JUGADOR**, con la misma tarjeta azul, hasta que vuelva
a cambiarse. Solo hay un portero en pista a la vez.

**Parada**, en el panel de Acciones, se anota directa a quien esté ocupando el
puesto de portero en ese momento — no hace falta tocar ningún jugador después.
Solo puede anotarse a quien puede pararlas: el portero, o quien esté jugando
de portero-jugador.

### Faltas, tarjetas y goles

Cada falta (cometida o recibida) y cada tarjeta quedan registradas con el
minuto exacto en que se marcaron — se ven en **Resumen** (durante el partido)
y en la ficha de cada partido del **Historial**, en la sección «Faltas y
tarjetas».

Marcar un gol propio va **Autor → Fase → Asistencia → Zona de
finalización**. La asistencia lleva un botón dedicado **Sin asistencia**,
porque no todos los goles la llevan. La zona se marca en el mismo campo de
nueve zonas que ya usan pérdidas, recuperaciones y tiros, y luego se ve
junto a los tiros en el informe (en verde, para distinguirla de los tiros a
puerta y fuera). Un gol del rival solo pide la fase — no tiene autor propio
ni tiene sentido pedirle asistencia o zona.

Un gol ya registrado se puede corregir: el icono de engranaje junto a cada
gol deja cambiar quién marcó y de qué fase vino. Los minutos y el quinteto en
pista no se tocan, solo el autor y la fase. Funciona igual durante el
partido (en **Resumen**) que después, con el partido ya guardado (en la
ficha de cada partido del **Historial**) — ajustando los goles del jugador
correspondiente en ese partido guardado.

Un partido guardado se puede borrar desde el **Historial**, con confirmación.
No se puede deshacer.

### Pérdidas, recuperaciones, tiros y faltas por zona

Al anotar una pérdida, una recuperación, un tiro (a puerta o fuera) o una
falta (cometida o recibida) desde **Acciones**, después de elegir al jugador
se abre un campo de fútbol sala dibujado con nueve zonas — vuestra portería
siempre abajo, la rival arriba. Se toca la zona donde ocurrió y queda
registrado con jugador, zona y minuto. Se ve en Resumen, en el Historial y en
la exportación a Excel (hojas «Zonas» y, para las faltas, también «Faltas y
tarjetas»).

### Informe

El botón **Crear informe**, en cualquier partido del Historial, primero pide
los datos de cabecera que no se registran durante el partido en vivo: ciudad,
pabellón, material de la pista, escudo y nombre del rival (por si hay que
corregirlo), hora de inicio y de fin, competición o naturaleza del partido
(liga, copa, amistoso, eliminatoria...) y un cuadro de observaciones. Quedan
guardados en el propio partido, así que si se vuelve a generar el informe más
adelante ya salen rellenos.

La hora de inicio y la de fin del partido se anotan solas (al arrancar el
reloj y al finalizar el partido) — el formulario ya sale con ambas rellenas,
aunque se pueden corregir a mano si hace falta.

Con eso muestra el informe completo **a pantalla completa dentro de la
propia app**, con foto de cada jugador: minutos y rotaciones agrupados por
posición, un **top 5 de minutos en pista** con barra y podio (sin contar
porteros), los goles de cada parte con el quinteto en pista, una cronología
en línea de tiempo, faltas y tarjetas — **pérdidas/recuperaciones, tarjetas,
faltas cometidas y faltas recibidas, cada cosa en su propio dashboard**—,
tiros (con gráfico por jugador y de proporción a puerta/fuera/gol),
**campogramas de pérdidas, recuperaciones y tiros** (un punto por acción en
la zona donde ocurrió — tocarlo enseña la foto del jugador y el minuto; los
goles con zona marcada aparecen también ahí, en verde, junto a los tiros),
goles según quién estaba en pista, quiénes coincidieron más tiempo juntos
sin contar porteros (parejas, tríos y cuartetos, con foto y nombre de cada
uno) y una ficha por jugador. Arriba, el botón *Imprimir / Guardar como PDF* usa el diálogo de
impresión del navegador si hace falta un PDF, y *Cerrar* vuelve al
Historial — pero no se abre solo, para no interrumpir con eso justo al
pulsar *Crear informe*.

Se muestra dentro de la propia app, no en una pestaña o ventana nueva, a
propósito: instalada en la tablet (sin barra de pestañas del navegador),
`window.open()` no es fiable y puede no hacer nada. Se genera entero sin
conexión y sin depender de ninguna librería externa.

### Detalles que conviene conocer

- **El reloj no cuenta «tics»**, sino tiempo real del sistema. Los navegadores de
  tablet frenan los temporizadores cuando se apaga la pantalla o se cambia de
  app; contando tics, los minutos jugados salían cortos.
- **El partido en curso se guarda solo** cada 5 segundos y, además, justo al
  minimizar o cerrar la app. Si se recarga o se cierra sin querer, al volver a
  abrir ofrece retomarlo.
- **Editar la convocatoria a mitad de partido** solo cambia la lista de
  convocados; no toca minutos, goles ni tarjetas.
- **El informe** se muestra a pantalla completa dentro de la app, sin
  necesidad de conexión — y solo al pulsar *Crear informe*, nunca
  automáticamente.
