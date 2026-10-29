/* Analisis por zonas de la pista (mapa de calor de temporada).
 *
 * Lo unico espacial que registra la app es la ZONA (rejilla 3x3 marcada a mano
 * al anotar una accion), no coordenadas. Por eso esto es una distribucion de
 * acciones por zona: cuenta cuantas veces se anoto cada accion en cada zona.
 * No es un mapa de ocupacion ni de posiciones exactas.
 *
 * Todo son funciones puras (sin React, sin almacenamiento) para poder probarlas.
 */

export const ZONE_KEYS = [
  "def-izq", "def-centro", "def-der",
  "medio-izq", "medio-centro", "medio-der",
  "ataque-izq", "ataque-centro", "ataque-der",
];

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
const VALID_ZONE = new Set(ZONE_KEYS);

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
      if (!VALID_ZONE.has(ev.zone)) { withoutZone += 1; return; }
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
      if (ev.type !== "for") return;
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

/* Cuenta por zona. `share` es el % de cada zona sobre el total filtrado
   (0 si no hay nada: nunca se divide por cero). */
export function countByZone(events) {
  const counts = {};
  ZONE_KEYS.forEach((k) => { counts[k] = 0; });
  events.forEach((e) => { counts[e.zone] += 1; });
  const total = events.length;
  const max = Math.max(0, ...ZONE_KEYS.map((k) => counts[k]));
  const share = {};
  ZONE_KEYS.forEach((k) => { share[k] = total ? counts[k] / total : 0; });
  return { counts, share, total, max };
}

/* CSV de los eventos filtrados: separador ";" y BOM para que Excel en espanol
   lo abra en columnas y con los acentos bien. Los textos van entre comillas. */
export function eventsToCsv(events, { zoneLabel = (k) => k, actionLabel = (k) => k } = {}) {
  const q = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
  const mmss = (s) => (s === null ? "" : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);
  const head = ["fecha", "rival", "parte", "tiempo_restante", "dorsal", "jugador", "accion", "zona"];
  const rows = events.map((e) => [
    new Date(e.matchDate).toISOString().slice(0, 10), e.rival, e.half, mmss(e.remaining),
    e.playerNumber, e.playerName, actionLabel(e.action), zoneLabel(e.zone),
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(";")).join("\r\n");
}
