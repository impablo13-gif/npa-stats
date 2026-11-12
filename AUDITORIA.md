# NPA Stats — auditoría y plan de mejora

Estado a 12-11-2026. Este documento separa con claridad lo **implementado y probado**,
lo **implementado pero sin validar en uso real**, lo **propuesto** y lo **no hecho**.
No se da por correcto nada que no se haya ejecutado.

## 1. Mapa funcional (lo que existe y se ha comprobado leyendo y probando el código)

| Área | Qué hace | Dónde |
|---|---|---|
| Registro en directo | Reloj por parte, convocatoria, quintetos en pista, sustituciones, portero anclado, goles con fase/zona/autor/asistente, faltas, tarjetas, tiempos muertos (1 por equipo y parte), tiros, pérdidas, recuperaciones | `src/App.jsx` |
| Corrección | Deshacer en cadena (goles, T.M., acciones), deshacer «Empezar 2ª parte», editar y borrar goles ya guardados | `src/App.jsx` |
| Persistencia | IndexedDB, borrador automático, copia de seguridad JSON, aviso de copia, forzar actualización | `src/storage.js`, `src/backup.js` |
| Informe de partido | HTML en pantalla = PDF (mismo HTML); ver §4 | `buildMatchReportHtml` en `src/App.jsx` |
| Análisis de temporada | Goles por tramo (2/3/5/10 min), quintetos con minutos, fases, memoria en PDF | `src/analisis.js`, `src/memoriaHtml.js` |
| Ficha de jugador | Tabla de plantilla, ficha individual, mapa de zonas, CSV, PDF, notas | `src/jugadores.js`, `src/fichaHtml.js`, `src/zonas.js` |

Modelo de un partido guardado: `players[]` (con `seconds` y contadores), `goalEvents[]`
(tipo a favor/en contra, autor, asistente, fase, zona, parte, tiempo restante, **foto de los
jugadores en pista**), `rotations[]` (entrada/salida por jugador, parte y tiempo restante),
`disciplineEvents`, `zonedEvents`, `timeouts`, `convocados`.

## 2. Defecto crítico encontrado y corregido

**El balance en pista del informe de partido omitía jugadores.** La tarjeta «Presencia en
pista» se construía solo con quienes aparecían en la foto de algún gol. Un jugador con minutos
pero sin gol con él en pista no salía, y no había minutos ni distinción de «no participó».
Sustituido por la tabla completa de §3. *(Implementado y probado.)*

## 3. Balance más/menos (prioridad obligatoria)

**Definición.** +/- = goles a favor − goles en contra mientras el jugador estaba en pista.
Cada gol se atribuye a todos los de su foto de pista; un autogol rival cuenta a favor.

**Tabla.** Todos los convocados: minutos, GF, GC, +/-, y +/- de cada parte. Positivo en verde,
negativo en rojo, **0 explícito** para quien jugó e igualó, **NP** (gris, al final) para quien
no participó. Resumen de cuántos hay de cada tipo, y debajo la lista de goles con los dorsales
en pista para poder revisarlo.

**Verificación.** Se contrasta con una segunda fuente (las rotaciones) y con el marcador
guardado; las discrepancias se avisan, no se corrigen en silencio.

**Pruebas** (`tests/balance.test.js`, 11 pruebas): partido de referencia calculado a mano con
jugadores de +3, +1, 0, −1, −3 y un NP; comparación contra un cálculo independiente hecho solo
desde las rotaciones; balance por parte; autogol; partido sin rotaciones; detección de goles
sin foto, jugador fuera de rotación y marcador descuadrado; orden; escape de HTML; quintetos.
Además, comprobado en el navegador con ese mismo partido: las cifras del informe coinciden con
las calculadas a mano. *(Implementado y probado.)*

**Casos de la lista del encargo.**

| Caso | Estado |
|---|---|
| Sustituciones múltiples y cambios entre partes | Probado (partido de referencia con 9 jugadores y rotaciones en ambas partes) |
| Gol justo en un cambio | Se usa la foto del gol; la verificación acepta el límite inclusivo. No se reinterpreta |
| Portero / portero-jugador | El portero sale en la tabla con la etiqueta POR y se calcula como los demás. Lo que cuente como portero-jugador depende de la foto de pista guardada |
| Expulsados | Quedan en las fotos de los goles anteriores a su expulsión. No hay una prueba específica |
| Superioridad / inferioridad | La foto puede tener ≠5 jugadores; se cuenta como dato informativo, no se rechaza |

## 4. Informe de partido: estado

Orden actual: cabecera → minutos y rotaciones → top 5 de minutos → goles → cronología →
**balance más/menos** → **quintetos del partido** → más minutos juntos → tiros →
pérdidas/recuperaciones → fichas de jugador.

*Implementado y probado:* balance, quintetos del partido (minutos, veces seguidas, GF, GC, +/-,
+/- por 40' con mínimo de 5 min).

*Pendiente de validar:* **la exportación a PDF de las dos secciones nuevas** no se ha ejecutado
(cada fila lleva marca de corte de página y usa tablas simples, pero no se ha generado el PDF).

*Propuesto, no hecho:* informe «resumido / individual / colectivo / por periodos» configurable;
reordenar el informe entero en la arquitectura de 8 bloques del encargo; sección propia de
conclusiones del partido (existe en la memoria de temporada, no en el informe de partido).

## 5. Inventario estadístico y huecos

Se registran: goles, asistencias, tiros a puerta, fuera y al palo, faltas cometidas y recibidas,
amarillas, rojas, paradas, pérdidas, recuperaciones, minutos, entradas y salidas, zona de tiros,
pérdidas, recuperaciones y faltas.

No se registran, y **no se han añadido a propósito**: pases y pases completados, regates,
duelos, intercepciones, bloqueos de tiro. Registrarlos en directo exige varios toques por
acción con el partido en marcha, y un indicador sin datos fiables es peor que no tenerlo. Cada
uno solo debería entrar si se puede anotar sin perder jugadas. *(Propuesto, no implementado.)*

Módulo de porteros específico (tiros recibidos, % de paradas, salidas, duelos): hoy solo hay
paradas y los goles encajados con ese portero en pista. *(Propuesto, no implementado.)*

## 6. Priorización de lo que queda

| Prioridad | Mejora | Beneficio | Complejidad | Riesgo |
|---|---|---|---|---|
| 1 | Probar PDF de las secciones nuevas y un partido real de punta a punta | Detecta fallos que ninguna prueba automática ve | Baja | Ninguno |
| 1 | Confirmar el reglamento de tiempos muertos en prórroga | Evitar un límite equivocado | Baja | — |
| 2 | Informe resumido / por periodos / individual | Informes más cortos para el cuerpo técnico | Media | Tocar `buildMatchReportHtml`, que es largo |
| 2 | Comparar dos jugadores y ordenar/filtrar el balance en pantalla (hoy el informe es estático) | Consulta interactiva | Media | Requiere vista React, no HTML fijo |
| 3 | Módulo de porteros (% de paradas, tiros recibidos) | Análisis específico | Media | Exige registrar tiros recibidos por portero |
| 3 | Superioridad/inferioridad en el balance | Contexto del +/- | Media | Necesita registrar bien las expulsiones |
| 4 | Evolución por temporadas, análisis de transiciones | Largo plazo | Alta | — |

## 7. Lo que NO se ha hecho en esta pasada

- **Auditoría exhaustiva de toda la app** (accesibilidad, gestión de errores, responsividad en
  tableta, duplicidades en `App.jsx`, que tiene ~6.500 líneas). Solo se revisó con detalle lo
  tocado.
- **Investigación de referentes** (FIFA Training Centre, literatura de análisis notacional,
  otras apps de fútbol sala). No se hizo y no se cita nada que no se haya consultado.
- **Rediseño visual integral.** Se mantiene la identidad existente.
- **Prueba en un partido real y en el móvil.** El móvil, además, no estaba actualizándose y no
  se ha diagnosticado.
- **Datos antiguos.** Los partidos guardados antes de existir las rotaciones calculan el
  balance desde las fotos de los goles, pero sin minutos por parte ni verificación cruzada; el
  informe lo dice.
