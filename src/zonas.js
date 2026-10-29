/* Analisis por zonas de la pista (mapa de calor de temporada).
 *
 * Lo unico espacial que registra la app es la ZONA (rejilla marcada a mano al
 * anotar una accion), no coordenadas. Por eso esto es una distribucion de
 * acciones por zona: cuenta cuantas veces se anoto cada accion en cada zona.
 * No es un mapa de ocupacion ni de posiciones exactas.
 *
 * Hay dos resoluciones y las dos conviven:
 *  - FINA, 18 zonas (6 filas x 3 carriles, ~6,7 x 6,7 m en una pista de 40x20):
 *    es la que se registra ahora en directo. Claves "f1-izq" ... "f6-der".
 *  - GRUESA, 9 zonas (3 x 3): la que se registraba antes. Claves "def-izq" ...
 *    "ataque-der". Los partidos ya guardados siguen con estas claves.
 * Una zona fina cabe entera en una gruesa (las filas 1-2 son "def", 3-4 "medio"
 * y 5-6 "ataque"), asi que lo nuevo se puede ver en 9 zonas junto a lo antiguo,
 * pero lo antiguo NO se puede repartir en 18: no hay forma honesta de saber en
 * cual de las dos filas finas ocurrio.
 *
 * Todo son funciones puras (sin React, sin almacenamiento) para poder probarlas.
 */

const SIDE_KEYS = ["izq", "centro", "der"];
const SIDE_NAMES = ["izquierda", "centro", "derecha"];

// De vuestra porteria (fila 1) a la rival (fila 6).
export const FINE_ROW_NAMES = ["Área propia", "Defensa", "Medio defensivo", "Medio ofensivo", "Ataque", "Área rival"];
const COARSE_ROW_KEYS = ["def", "medio", "ataque"];
const COARSE_ROW_NAMES = ["Defensa", "Medio", "Ataque"];

// row 0 = junto a vuestra porteria (se dibuja abajo); col 0 = izquierda.
export const ZONES_COARSE = COARSE_ROW_KEYS.flatMap((rk, row) =>
  SIDE_KEYS.map((sk, col) => ({ key: `${rk}-${sk}`, label: `${COARSE_ROW_NAMES[row]}\n${SIDE_NAMES[col]}`, row, col })));

export const ZONES_FINE = FINE_ROW_NAMES.flatMap((name, row) =>
  SIDE_KEYS.map((sk, col) => ({ key: `f${row + 1}-${sk}`, label: `${name}\n${SIDE_NAMES[col]}`, row, col })));

export const ZONE_KEYS = ZONES_COARSE.map((z) => z.key);
export const ZONE_KEYS_FINE = ZONES_FINE.map((z) => z.key);
const COARSE_SET = new Set(ZONE_KEYS);
const FINE_SET = new Set(ZONE_KEYS_FINE);

// Etiqueta legible de cualquier clave, de la resolucion que sea.
export const ZONE_LABELS = Object.fromEntries([...ZONES_COARSE, ...ZONES_FINE].map((z) => [z.key, z.label.replace("\n", " ")]));

export const isFineKey = (key) => FINE_SET.has(key);
export const isZoneKey = (key) => COARSE_SET.has(key) || FINE_SET.has(key);

/* Cualquier clave -> su zona gruesa (las gruesas se quedan como estan). */
export function toCoarseKey(key) {
  if (COARSE_SET.has(key)) return key;
  const m = /^f([1-6])-(izq|centro|der)$/.exec(key || "");
  if (!m) return key;
  return `${COARSE_ROW_KEYS[Math.floor((Number(m[1]) - 1) / 2)]}-${m[2]}`;
}

// Orden y nombre de las acciones que se pueden mapear. "goal" sale de los goles
// propios con zona; el resto, de las acciones con zona (tiros, perdidas...).
export const ZONE_ACTIONS = [
  { key: "finish", label: "Finalizaciones (goles + tiros)", members: ["goal", "shotsOn", "shotsOff", "shotsPost"] },
  { key: "goal", label: "Goles", members: ["goal"] },
  { key: "shotsOn", label: "Tiros a puerta", members: ["shotsOn"] },
  { key: "shotsOff", label: "Tiros fuera", members: ["shotsOff"] },
  { key: "shotsPost", label: "Tiros al palo", members: ["shotsPost"] },
  { key: "recoveries", label: "Recuperaciones", members: ["recoveries"] },
  { key: "turnovers", label: "Pérdidas", members: ["turnovers"] },
  { key: "fouls", label: "Faltas cometidas", members: ["fouls"] },
  { key: "foulsReceived", label: "Faltas recibidas", members: ["foulsReceived"] },
];

const ZONED_KEYS = new Set(["shotsOn", "shotsOff", "shotsPost", "recoveries", "turnovers"]);
const DISCIPLINE_ZONED = new Set(["fouls", "foulsReceived"]);

export const playerKeyOf = (id, name, number) => (id ? String(id) : `${name || "?"}#${number === undefined ? "?" : number}`);

/* Une, en una sola lista, todo lo que tiene zona en los partidos guardados:
   acciones con zona, faltas con zona y goles propios con zona. Lo que no tiene
   zona (tarjetas, goles rivales, partidos antiguos) no entra, pero se cuenta
   aparte para poder avisar de cuanto se queda fuera. */
export function collectZoneEvents(matches) {
  const events = [];
  let withoutZone = 0;
  (matches || []).forEach((m) => {
    const base = { matchDate: m.date, rival: m.rivalName || "Rival" };
    const push = (action, ev, playerId, playerName, playerNumber) => {
      if (!isZoneKey(ev.zone)) { withoutZone += 1; return; }
      events.push({
        ...base, action, zone: ev.zone, half: Number(ev.half) || 1,
        remaining: typeof ev.remaining === "number" ? ev.remaining : null,
        playerKey: playerKeyOf(playerId, playerName, playerNumber),
        playerName: playerName || "?", playerNumber: playerNumber === undefined ? "?" : playerNumber,
      });
    };
    (m.zonedEvents || []).forEach((ev) => { if (ZONED_KEYS.has(ev.key)) push(ev.key, ev, ev.playerId, ev.playerName, ev.playerNumber); });
    (m.disciplineEvents || []).forEach((ev) => { if (DISCIPLINE_ZONED.has(ev.type)) push(ev.type, ev, ev.playerId, ev.playerName, ev.playerNumber); });
    (m.goalEvents || []).forEach((ev) => {
      if (ev.type !== "for" || ev.ownGoal) return; // un autogol del rival no tiene autor ni zona nuestra
      const row = (ev.onCourt || []).find((p) => p.id === ev.authorId);
      push("goal", ev, ev.authorId, ev.authorName, row ? row.number : undefined);
    });
  });
  return { events, withoutZone };
}

/* Jugadores que aparecen en los eventos, ordenados por dorsal. */
export function playersOf(events) {
  const map = new Map();
  events.forEach((e) => { if (!map.has(e.playerKey)) map.set(e.playerKey, { key: e.playerKey, name: e.playerName, number: e.playerNumber }); });
  return [...map.values()].sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999) || String(a.name).localeCompare(String(b.name)));
}

/* Filtros: accion (grupo de ZONE_ACTIONS), jugador, parte, partido. */
export function filterEvents(events, { action = "finish", playerKey = "all", half = "all", matchDate = "all" } = {}) {
  const def = ZONE_ACTIONS.find((a) => a.key === action) || ZONE_ACTIONS[0];
  const members = new Set(def.members);
  return events.filter((e) =>
    members.has(e.action) &&
    (playerKey === "all" || e.playerKey === playerKey) &&
    (half === "all" || (half === "ot" ? e.half > 2 : e.half === Number(half))) &&
    (matchDate === "all" || e.matchDate === matchDate));
}

/* Cuenta por zona en la resolucion pedida:
 *  - "fine" (18): solo los eventos registrados ya con zona fina; los antiguos
 *    (zona 3x3) no se pueden repartir y se devuelven en `excluded`.
 *  - "coarse" (9): todos, juntando las zonas finas en su zona gruesa.
 * `share` es el % de cada zona sobre el total mostrado (0 si no hay nada: nunca
 * se divide por cero). */
export function countByZone(events, resolution = "coarse") {
  const fine = resolution === "fine";
  const keys = fine ? ZONE_KEYS_FINE : ZONE_KEYS;
  const counts = {};
  keys.forEach((k) => { counts[k] = 0; });
  let excluded = 0;
  events.forEach((e) => {
    if (fine) {
      if (isFineKey(e.zone)) counts[e.zone] += 1; else excluded += 1;
    } else {
      counts[toCoarseKey(e.zone)] += 1;
    }
  });
  const total = keys.reduce((s, k) => s + counts[k], 0);
  const max = Math.max(0, ...keys.map((k) => counts[k]));
  const share = {};
  keys.forEach((k) => { share[k] = total ? counts[k] / total : 0; });
  return { counts, share, total, max, excluded };
}

/* CSV de los eventos filtrados: separador ";" y BOM para que Excel en espanol
   lo abra en columnas y con los acentos bien. Los textos van entre comillas.
   Lleva la clave de la zona ademas de su nombre, y la resolucion con la que se
   registro (18 o 9 zonas), para poder cruzar o filtrar sin ambiguedad. */
export function eventsToCsv(events, { zoneLabel = (k) => ZONE_LABELS[k] || k, actionLabel = (k) => k } = {}) {
  const q = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
  const mmss = (s) => (s === null ? "" : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
  const head = ["fecha", "rival", "parte", "tiempo_restante", "dorsal", "jugador", "accion", "zona", "zona_clave", "resolucion_zonas"];
  const rows = events.map((e) => [
    new Date(e.matchDate).toISOString().slice(0, 10), e.rival, e.half, mmss(e.remaining),
    e.playerNumber, e.playerName, actionLabel(e.action), zoneLabel(e.zone), e.zone, isFineKey(e.zone) ? "18 zonas" : "9 zonas",
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(";")).join("\r\n");
}
