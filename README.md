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
    dispositivo igual que el que hizo la copia. No se puede deshacer, pero se
    aplica en una sola operación: si falla a mitad (sin espacio, archivo
    dañado), no cambia nada y la app avisa del error.

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

### Pruebas

```bash
npm test
```

Prueba la lógica pura con el ejecutor de pruebas de Node, sin dependencias
nuevas: el mapa de zonas (`src/zonas.js`), los agregados por jugador
(`src/jugadores.js`) y el HTML de la ficha (`src/fichaHtml.js`, incluido que
escape los textos). El despliegue a GitHub Pages ejecuta
`npm test` antes de compilar: si falla, no se publica.

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
*Actualizar ahora*, que además se niega a hacerlo con el reloj en marcha. El
aviso sale en Inicio, Plantilla e Historial. Al pie de Inicio se ve la **versión
instalada en ese dispositivo** (el commit con el que se compiló y la fecha), con
un botón *Buscar actualizaciones* que fuerza la comprobación: es la forma de
saber con certeza si una tablet o un móvil tiene ya lo último.

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
a cambiarse. Solo hay un portero en pista a la vez: si en la plantilla hay
más de uno (titular y suplente), la app no deja meter al segundo mientras el
primero siga en pista con la posición de portero — avisa y no hace el
cambio.

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
dieciocho zonas que ya usan pérdidas, recuperaciones y tiros, y luego se ve
junto a los tiros en el informe (en verde, para distinguirla de los tiros a
puerta y fuera). Un gol del rival solo pide la fase — no tiene autor propio
ni tiene sentido pedirle asistencia o zona.

Los goles y las asistencias **solo se anotan con el botón Gol** (la Ficha del
jugador no los deja tocar): un gol sumado a mano subía el marcador pero no dejaba
fase, asistente ni zona, y el resumen, la tabla de fases y el informe no lo veían.
El «−» del marcador rival quita el último gol rival de verdad, con su fase. «Sin
asistencia» cubre el gol que el autor genera él solo: no existe la autoasistencia.

La **duración de las partes** solo se puede cambiar antes de arrancar el reloj.
Las faltas acumuladas se cuentan por parte, pero las de la 2ª parte siguen
sumando en la prórroga (la 6ª falta acumulada ya es de 10 m).

Un gol ya registrado se puede corregir: el icono de engranaje junto a cada
gol deja cambiar quién marcó y de qué fase vino. Los minutos y el quinteto en
pista no se tocan, solo el autor y la fase. Funciona igual durante el
partido (en **Resumen**) que después, con el partido ya guardado (en la
ficha de cada partido del **Historial**) — ajustando los goles del jugador
correspondiente en ese partido guardado.

Un partido guardado se puede borrar desde el **Historial**, con confirmación.
No se puede deshacer.

**Dos amarillas del mismo jugador equivalen a una roja** — se anota sola,
sin tocar nada más. Una roja (directa o por doble amarilla) expulsa al
jugador el resto del partido: si estaba en pista sale ya mismo, y desaparece
de la pantalla de rotaciones (sus minutos, goles y tarjetas siguen intactos
en Resumen, Historial, Excel e informe — solo deja de poder gestionarse en
directo, porque ya no puede jugar). El equipo pasa a jugar con uno menos —
un aviso rojo lo deja claro y el máximo en pista baja en consecuencia — hasta
que pasen 2 minutos de juego o el rival marque, lo que ocurra antes.

### Pérdidas, recuperaciones, tiros y faltas por zona

Al anotar una pérdida, una recuperación, un tiro (a puerta o fuera) o una
falta (cometida o recibida) desde **Acciones**, después de elegir al jugador
se abre un campo de fútbol sala dibujado con **dieciocho zonas** (6 filas × 3
carriles, de unos 6,7 m de lado) — vuestra portería siempre abajo, la rival
arriba. Se toca la zona donde ocurrió y queda
registrado con jugador, zona y minuto. Se ve en Resumen, en el Historial y en
la exportación a Excel (hojas «Zonas» y, para las faltas, también «Faltas y
tarjetas»).

### Mapa de zonas de la temporada

En **Historial → Zonas** se ve, sobre la pista, dónde se anotó cada acción a lo
largo de la temporada: finalizaciones (goles y tiros), recuperaciones, pérdidas y
faltas. Se filtra por acción, jugador, parte y partido, y enseña el total por
zona, por línea (ataque, medio, defensa) y por carril. **Exportar CSV** baja los
eventos del filtro actual (separador `;`, abre bien en Excel en español).

Es una **distribución por zonas**, no un mapa de posiciones: la app solo
guarda la zona que se toca al anotar la acción, no coordenadas exactas, así
que no puede decir dónde estaba cada jugador ni cuánto ocupó la pista.

Hay dos resoluciones: **18 zonas** (lo que se anota desde este cambio) y **9
zonas** (3×3, como se anotaba antes). Los partidos antiguos conservan sus 9
zonas: no se pueden repartir en 18 sin inventar en cuál de las dos filas
ocurrieron, así que en la vista de 18 se avisa de cuántos registros quedan
fuera y en la de 9 sale todo junto (lo nuevo se agrupa en la zona de 9 que lo
contiene). El informe PDF sigue dibujando el campo en 9 zonas. Lo que no se anotó con zona (tarjetas, goles rivales, partidos antiguos)
no sale en el mapa y la pantalla avisa de cuántas acciones se quedan fuera.
Con menos de 15 registros avisa de que es solo orientación.

### Partido en directo: deshacer, tiempos muertos y casos especiales

- **Deshacer** quita los registros uno a uno, del último al primero (goles,
  tarjetas, faltas, tiros, pérdidas, paradas, tiempos muertos). La pila vive en
  memoria: tras recargar la app empieza vacía.
- **Deshacer «Empezar 2ª parte»**: tras pulsarlo aparece «Deshacer: volver a la
  1ª parte (mm:ss)», que devuelve el reloj al minuto exacto en que estaba y
  restaura rotaciones y minutos. Solo se ofrece mientras en la parte nueva no se
  haya anotado nada.
- **Autogol del rival**: al pedir «¿Quién marcó?» hay un botón que anota un gol a
  favor sin autor (suma al marcador, no es de ningún jugador).
- **Portero expulsado**: es una expulsión normal (con uno menos 2 minutos de juego
  o hasta gol del rival) y el expulsado no puede volver a jugar ese partido. Un
  aviso deja meter al portero suplente (sale un jugador de pista) o poner de
  portero a uno de los que siguen en pista.
- **Tiempos muertos**: botones «T.M. nuestro» y «T.M. rival»; paran el reloj y se
  anotan con parte y minuto (se ven en la ficha del partido). No se bloquea por
  cuántos lleve cada equipo porque el reglamento de cada competición varía.
- En pantallas de móvil (menos de 600 px) la pantalla de partido se compacta:
  cabecera más baja, jugadores en 2 columnas y barra inferior en una fila.

### Análisis de temporada y memoria

**Historial → Análisis** reúne, para el periodo elegido (temporada, últimos 3 o 5
partidos o uno solo): resumen y resultados (puntos 3-1-0), goles por fase,
**goles por minuto** (tramos de 2, 3, 5 o 10 minutos a elegir, de cada parte, más los primeros y últimos 5'),
jugadores con más minutos y **quintetos con más goles**. Se ve en pantalla y se
baja en PDF con **Descargar memoria**; las conclusiones del entrenador se guardan
solas y salen en el PDF.

- Los minutos de los goles son tiempo jugado dentro de cada parte; un gol sin
  minuto (partidos antiguos) se cuenta aparte y se avisa, y la prórroga no entra
  en los tramos.
- **Quintetos**: los minutos de cada grupo de cinco salen de las rotaciones
  guardadas en cada partido (quién entra y sale y en qué minuto del reloj de la
  app, que se para en los parones: es juego efectivo). El balance cuenta goles con
  esos cinco en pista al marcarse y el **+/- por 40'** usa solo los goles de los
  partidos que tienen rotaciones, y solo si el quinteto suma 5 min o más. Los
  partidos anteriores a registrar rotaciones aportan goles pero no minutos (la
  memoria dice de cuántos partidos salen los minutos). Con menos de 3 goles o
  menos de 10 minutos se marca como «muestra pequeña».

### Copia de seguridad y actualización

- **Aviso de copia**: en Inicio sale cuándo fue la última copia de seguridad y,
  si no hay ninguna o tiene 7 días o más, un aviso con «Hacer copia ahora». La
  fecha es una marca de cada dispositivo y no viaja dentro de la copia.
- **Forzar actualización** (Inicio, bajo la versión): quita el service worker y
  vacía la caché de archivos de la app y recarga; al volver a abrir con
  conexión se descarga la versión actual desde cero. **No borra los datos**
  (equipos, partidos, plantilla): esos viven en IndexedDB y no se tocan. No
  está disponible con un partido en curso ni sin conexión.

### Fichas de jugador

En **Historial → Jugadores** hay una tabla de la plantilla con los totales del
**periodo** elegido (toda la temporada, los últimos 3 o 5 partidos, o un partido
concreto): partidos con minutos, minutos, goles, asistencias, finalizaciones,
efectividad, recuperaciones, pérdidas, faltas, tarjetas y **+/- en pista**. Se
ordena tocando la cabecera y **Exportar CSV** baja la tabla.

Al tocar un jugador se abre su **ficha**: resumen, acciones, ritmo por 40 min,
partido a partido (con minutos y +/-), mapa de zonas del jugador (a elegir la
acción) y un cuadro de **conclusiones del entrenador** que se guarda solo, por
equipo y jugador, y viaja en la copia de seguridad. **Descargar PDF** baja la
misma ficha que se ve en pantalla; **CSV partido a partido** baja su serie.

Criterios (para no leer de más los números):

- **Convocado** es quien está en la convocatoria del partido; en partidos
  antiguos sin convocatoria, quien tiene minutos o alguna acción. **Jugó** es
  tener minutos. Convocado sin jugar cuenta como convocatoria, no como partido.
- **+/-** = goles a favor menos en contra marcados con el jugador en el quinteto
  (sale de la foto de los 5 en pista que se guarda en cada gol). Es contexto,
  no mérito individual, y solo cuenta partidos con minutos.
- **Finalizaciones** = goles + tiros a puerta + fuera + al palo.
- **Ritmo por 40 min** solo se calcula con 20 min jugados o más y se marca como
  orientativo por debajo de 60; antes sale «—» (con pocos minutos un ritmo
  engaña).
- Los partidos antiguos no guardaron el identificador del jugador: si un mismo
  jugador sale en dos filas, la pantalla lo avisa; cada fila es correcta pero
  está repartida.
- No hay datos de pases, duelos ni vídeo: la app no los registra y no se estiman.

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
faltas cometidas y faltas recibidas, cada cosa en su propio dashboard** —,
tiros (con gráfico por jugador y de proporción a puerta/fuera/gol),
**un campograma por cada tipo de tiro** (a puerta, fuera y gol, con la zona
de finalización) **y, debajo, uno igual para pérdidas y recuperaciones** —
cada jugador con foto, nombre y ×veces que actuó en esa zona, siempre a la
vista sin tener que tocar nada —, goles según quién estaba en pista, quiénes
coincidieron más tiempo juntos sin contar porteros (parejas, tríos y
cuartetos, con foto y nombre de cada uno) y una ficha por jugador.

Arriba hay dos formas de sacarlo: **Exportar a PDF** descarga el archivo
directamente (en varias tablets, el diálogo de impresión no deja guardar
como PDF de forma sencilla, así que este botón se salta ese paso), e
*Imprimir* usa el diálogo de impresión del navegador para quien lo prefiera.
*Cerrar* vuelve al Historial. Nada de esto se dispara solo, para no
interrumpir justo al pulsar *Crear informe*.

Se muestra dentro de la propia app, no en una pestaña o ventana nueva, a
propósito: instalada en la tablet (sin barra de pestañas del navegador),
`window.open()` no es fiable y puede no hacer nada.

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
