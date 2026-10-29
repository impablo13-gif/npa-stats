/* Ficha de jugador: agregados de temporada, balance en pista (+/-) y ritmos.
 *
 * Todo son funciones puras (sin React, sin almacenamiento) para poder probarlas.
 * Parten de los partidos ya guardados y NO inventan nada: si un dato no se
 * registro (convocatoria en partidos antiguos, id de jugador, zona), se dice y
 * se trata con el criterio mas prudente.
 *
 * Que cuenta como que:
 *  - CONVOCADO: esta en `match.convocados`. Si el partido no la tiene (guardado
 *    antes de existir), se considera convocado a quien tenga minutos o alguna
 *    accion: es lo unico que se puede afirmar con honestidad.
 *  - JUGO: tiene minutos en pista (seconds > 0).
 *  - FINALIZACIONES: goles + tiros a puerta + tiros fuera + tiros al palo (el
 *    mismo criterio que el mapa de zonas). El gol sale del boton Gol; los
 *    tiros, de las acciones rapidas, asi que no se cuentan dos veces.
 *  - BALANCE EN PISTA (+/-): goles a favor y en contra marcados mientras el
 *    jugador estaba en el quinteto. Sale de `goalEvents[].onCourt`, la foto de
 *    los 5 en pista tomada en el instante del gol. Es una medida de contexto,
 *    no de merito individual: depende de con quien comparte pista.
 */

import { playerKeyOf } from "./zonas.js";

const NUM_KEYS = ["seconds", "goals", "assists", "fouls", "foulsReceived", "yellow", "red", "saves", "turnovers", "recoveries", "shotsOn", "shotsOff", "shotsPost"];

// Ritmos por 40 min (un partido de futbol sala: 2 x 20). Con pocos minutos un
// ritmo engana (1 gol en 3 minutos = 13 por 40), asi que por debajo de este
// umbral no se calcula y se muestra "—".
export const RATE_BASE_MIN = 40;
export const MIN_RATE_SECONDS = 20 * 60;
export const LOW_SAMPLE_SECONDS = 60 * 60; // por debajo, el ritmo se marca como orientativo

const n = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

export const finishesOf = (s) => n(s.goals) + n(s.shotsOn) + n(s.shotsOff) + n(s.shotsPost);

/* Clave estable del jugador en un partido guardado: su id si lo tiene (los
   partidos recientes lo guardan) y, si no, nombre#dorsal. */
export const rowKey = (p) => playerKeyOf(p.id, p.name, p.number);

function hasAnyStat(p) {
  return NUM_KEYS.some((k) => n(p[k]) > 0);
}

/* Balance en pista de cada jugador en UN partido: { key -> { favor, contra } }.
   Un gol propio suma a favor a los 5 que estaban en pista; uno rival, en contra. */
export function onCourtBalance(match) {
  const out = new Map();
  (match.goalEvents || []).forEach((ev) => {
    (ev.onCourt || []).forEach((p) => {
      const key = rowKey(p);
      if (!out.has(key)) out.set(key, { favor: 0, contra: 0 });
      const d = out.get(key);
      if (ev.type === "for") d.favor += 1; else if (ev.type === "against") d.contra += 1;
    });
  });
  return out;
}

/* Quien estaba convocado en un partido (Set de claves) o null si el partido no
   guardo la convocatoria. */
function calledSet(match) {
  if (!Array.isArray(match.convocados)) return null;
  return new Set(match.convocados.map(rowKey));
}

/* Una fila por jugador y partido (solo de los convocados), en orden cronologico.
   Cada fila lleva sus numeros del partido y el balance en pista. */
export function playerMatchRows(matches) {
  const sorted = [...(matches || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const rows = [];
  sorted.forEach((m) => {
    const called = calledSet(m);
    const bal = onCourtBalance(m);
    (m.players || []).forEach((p) => {
      const key = rowKey(p);
      const wasCalled = called ? called.has(key) : (n(p.seconds) > 0 || hasAnyStat(p));
      if (!wasCalled) return;
      const b = bal.get(key) || { favor: 0, contra: 0 };
      rows.push({
        key, name: p.name, number: p.number, position: p.position || "", isGK: !!p.isGK,
        matchDate: m.date, rival: m.rivalName || "Rival",
        teamGoals: n(m.teamGoals), rivalGoals: n(m.rivalScore),
        played: n(p.seconds) > 0,
        ...Object.fromEntries(NUM_KEYS.map((k) => [k, n(p[k])])),
        finishes: finishesOf(p),
        favor: b.favor, contra: b.contra, balance: b.favor - b.contra,
      });
    });
  });
  return rows;
}

/* Recorta la lista de partidos por periodo:
 *  { mode: "all" }                    toda la temporada
 *  { mode: "last", count: 5 }         los ultimos N (por fecha)
 *  { mode: "match", date }            un partido
 * Devuelve los partidos recortados en orden cronologico. */
export function selectMatches(matches, period = { mode: "all" }) {
  const sorted = [...(matches || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  if (period.mode === "last") return sorted.slice(-Math.max(1, Number(period.count) || 1));
  if (period.mode === "match") return sorted.filter((m) => m.date === period.date);
  return sorted;
}

/* Totales de un jugador a partir de sus filas por partido. Los ritmos (por 40')
   son null si no llega al minimo de minutos: nunca se divide por cero ni se
   extrapola una muestra minuscula. */
export function aggregate(rows) {
  const t = { matchesCalled: rows.length, matchesPlayed: 0, balanceFavor: 0, balanceContra: 0 };
  NUM_KEYS.forEach((k) => { t[k] = 0; });
  t.finishes = 0;
  rows.forEach((r) => {
    if (r.played) t.matchesPlayed += 1;
    NUM_KEYS.forEach((k) => { t[k] += r[k]; });
    t.finishes += r.finishes;
    // El +/- solo cuenta los partidos en los que jugo: convocado sin jugar no tiene balance.
    if (r.played) { t.balanceFavor += r.favor; t.balanceContra += r.contra; }
  });
  t.balance = t.balanceFavor - t.balanceContra;
  t.minutes = t.seconds / 60;
  t.avgSeconds = t.matchesPlayed ? t.seconds / t.matchesPlayed : 0;
  t.efficiency = t.finishes ? t.goals / t.finishes : null; // goles / finalizaciones
  t.rateReliable = t.seconds >= MIN_RATE_SECONDS;
  t.rateLowSample = t.rateReliable && t.seconds < LOW_SAMPLE_SECONDS;
  const per40 = (v) => (t.rateReliable ? (v * RATE_BASE_MIN * 60) / t.seconds : null);
  t.rates = {
    goals: per40(t.goals), assists: per40(t.assists), finishes: per40(t.finishes),
    recoveries: per40(t.recoveries), turnovers: per40(t.turnovers), fouls: per40(t.fouls),
    foulsReceived: per40(t.foulsReceived),
  };
  return t;
}

/* Plantilla con sus totales para el periodo dado, ordenada por dorsal.
   Solo entran los que fueron convocados al menos una vez en el periodo. */
export function seasonTable(matches, period = { mode: "all" }) {
  const chosen = selectMatches(matches, period);
  const rows = playerMatchRows(chosen);
  const byKey = new Map();
  rows.forEach((r) => {
    if (!byKey.has(r.key)) byKey.set(r.key, { key: r.key, name: r.name, number: r.number, position: r.position, isGK: r.isGK, rows: [] });
    const e = byKey.get(r.key);
    // Nombre, dorsal y posicion: los del partido mas reciente (rows va en orden cronologico).
    e.name = r.name; e.number = r.number; e.position = r.position || e.position; e.isGK = r.isGK;
    e.rows.push(r);
  });
  return [...byKey.values()]
    .map((e) => ({ ...e, total: aggregate(e.rows) }))
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999) || String(a.name).localeCompare(String(b.name)));
}

/* Lo que se muestra de un solo jugador: totales, serie por partido y
   comparacion con la media del equipo en minutos (para situarlo). */
export function playerReport(matches, playerKey, period = { mode: "all" }) {
  const table = seasonTable(matches, period);
  const me = table.find((p) => p.key === playerKey);
  if (!me) return null;
  const matchesInPeriod = selectMatches(matches, period).length;
  return {
    key: me.key, name: me.name, number: me.number, position: me.position, isGK: me.isGK,
    matchesInPeriod,
    total: me.total,
    series: me.rows.map((r) => ({
      matchDate: r.matchDate, rival: r.rival, result: `${r.teamGoals}-${r.rivalGoals}`,
      played: r.played, seconds: r.seconds, goals: r.goals, assists: r.assists, finishes: r.finishes,
      recoveries: r.recoveries, turnovers: r.turnovers, fouls: r.fouls, yellow: r.yellow, red: r.red,
      saves: r.saves, balance: r.balance, favor: r.favor, contra: r.contra,
    })),
  };
}

/* CSV de la tabla de plantilla (separador ";" y BOM, como el de zonas). */
export function tableToCsv(table) {
  const q = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
  const dec = (v, d = 2) => (v === null || v === undefined ? "" : String(Number(v.toFixed(d))).replace(".", ","));
  const head = ["dorsal", "jugador", "posicion", "convocatorias", "partidos_jugados", "minutos", "minutos_por_partido", "goles", "asistencias",
    "tiros_puerta", "tiros_fuera", "tiros_palo", "finalizaciones", "efectividad_pct", "recuperaciones", "perdidas", "faltas", "faltas_recibidas",
    "amarillas", "rojas", "paradas", "goles_favor_en_pista", "goles_contra_en_pista", "balance_en_pista",
    "goles_por_40", "asistencias_por_40", "recuperaciones_por_40", "perdidas_por_40"];
  const rows = table.map((p) => {
    const t = p.total;
    return [p.number, p.name, p.position, t.matchesCalled, t.matchesPlayed, dec(t.minutes, 1), dec(t.avgSeconds / 60, 1), t.goals, t.assists,
      t.shotsOn, t.shotsOff, t.shotsPost, t.finishes, t.efficiency === null ? "" : dec(t.efficiency * 100, 0), t.recoveries, t.turnovers, t.fouls, t.foulsReceived,
      t.yellow, t.red, t.saves, t.balanceFavor, t.balanceContra, t.balance,
      dec(t.rates.goals), dec(t.rates.assists), dec(t.rates.recoveries), dec(t.rates.turnovers)];
  });
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(";")).join("\r\n");
}

/* CSV de un jugador, partido a partido. */
export function seriesToCsv(report) {
  const q = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
  const head = ["fecha", "rival", "resultado", "jugo", "minutos", "goles", "asistencias", "finalizaciones", "recuperaciones", "perdidas", "faltas", "amarillas", "rojas", "paradas", "goles_favor_en_pista", "goles_contra_en_pista", "balance_en_pista"];
  const rows = report.series.map((s) => [
    new Date(s.matchDate).toISOString().slice(0, 10), s.rival, s.result, s.played ? "si" : "no", String(Number((s.seconds / 60).toFixed(1))).replace(".", ","),
    s.goals, s.assists, s.finishes, s.recoveries, s.turnovers, s.fouls, s.yellow, s.red, s.saves, s.favor, s.contra, s.balance,
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(";")).join("\r\n");
}
