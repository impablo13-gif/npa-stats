/* Analisis de temporada: goles por tramo de minutos, balance por quinteto y
 * resumen de resultados. Funciones puras (sin React ni almacenamiento).
 *
 * Todo sale de lo ya registrado en cada partido (goalEvents con su minuto y los
 * 5 en pista en el instante del gol). No se estima nada: un gol sin minuto
 * (partidos muy antiguos) se cuenta aparte y se avisa.
 *
 *  - TRAMOS: el minuto de juego dentro de la parte (tiempo jugado = duracion de
 *    la parte menos el tiempo restante). Un autogol del rival cuenta a favor.
 *  - QUINTETO: el grupo de jugadores en pista al marcarse cada gol. Solo se
 *    sabe con quien se jugo cuando HAY gol (no se guarda cuanto tiempo estuvo
 *    cada quinteto), asi que el balance es de goles, no de minutos.
 */

import { rowKey } from "./jugadores.js";

export const BUCKET_MIN = 5; // tramo por defecto
export const BUCKET_OPTIONS = [2, 3, 5, 10]; // tamaños de tramo que se pueden elegir
const EDGE_MIN = 5; // "primeros y ultimos 5 minutos" no depende del tramo elegido
export const QUINTET_LOW_SAMPLE = 3; // por debajo de tantos goles, el balance de un quinteto es anecdotico
const OT_HALF_MIN = 3;

const halfMinutes = (half, base) => (half <= 2 ? base : OT_HALF_MIN);

/* Resultado de cada partido y totales: puntos 3-1-0. */
export function seasonSummary(matches) {
  const sorted = [...(matches || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const s = { played: sorted.length, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0, results: [] };
  sorted.forEach((m) => {
    const gf = Number(m.teamGoals) || 0, ga = Number(m.rivalScore) || 0;
    s.gf += gf; s.ga += ga;
    if (gf > ga) { s.wins += 1; s.points += 3; } else if (gf === ga) { s.draws += 1; s.points += 1; } else s.losses += 1;
    s.results.push({ date: m.date, rival: m.rivalName || "Rival", gf, ga, outcome: gf > ga ? "V" : gf === ga ? "E" : "D" });
  });
  return s;
}

/* Goles a favor y en contra por tramos (2, 3, 5 o 10 min) de cada parte, mas los
   primeros y los ultimos 5 minutos de cada parte. Solo partes reglamentarias
   (1ª y 2ª) en la tabla; la prorroga se cuenta en el total pero no en tramos. */
export function goalsByMinute(matches, bucketMin = BUCKET_MIN) {
  const size = BUCKET_OPTIONS.includes(Number(bucketMin)) ? Number(bucketMin) : BUCKET_MIN;
  const maxLen = Math.max(20, ...(matches || []).map((m) => Number(m.halfLength) || 20));
  const nBuckets = Math.ceil(maxLen / size);
  const rows = [];
  [1, 2].forEach((half) => {
    for (let b = 0; b < nBuckets; b += 1) {
      rows.push({ half, from: b * size, to: Math.min((b + 1) * size, maxLen), favor: 0, contra: 0 });
    }
  });
  const out = { bucketMin: size, rows, total: { favor: 0, contra: 0 }, first5: { favor: 0, contra: 0 }, last5: { favor: 0, contra: 0 }, extraTime: { favor: 0, contra: 0 }, withoutMinute: 0 };
  (matches || []).forEach((m) => {
    const baseLen = Number(m.halfLength) || 20;
    (m.goalEvents || []).forEach((ev) => {
      const side = ev.type === "for" ? "favor" : ev.type === "against" ? "contra" : null;
      if (!side) return;
      if (typeof ev.remaining !== "number") { out.withoutMinute += 1; return; }
      out.total[side] += 1;
      const half = Number(ev.half) || 1;
      if (half > 2) { out.extraTime[side] += 1; return; }
      const len = halfMinutes(half, baseLen) * 60;
      const elapsed = Math.min(len, Math.max(0, len - ev.remaining));
      const bucket = Math.min(Math.floor(elapsed / (size * 60)), nBuckets - 1);
      rows[(half - 1) * nBuckets + bucket][side] += 1;
      if (elapsed < EDGE_MIN * 60) out.first5[side] += 1;
      if (ev.remaining <= EDGE_MIN * 60) out.last5[side] += 1;
    });
  });
  return out;
}

/* Balance de goles por quinteto (grupo exacto de jugadores en pista al marcar). */
export function quintetBalance(matches) {
  const map = new Map();
  (matches || []).forEach((m) => {
    (m.goalEvents || []).forEach((ev) => {
      const oc = ev.onCourt || [];
      if (!oc.length || (ev.type !== "for" && ev.type !== "against")) return;
      const keys = oc.map(rowKey).sort();
      const key = keys.join("|");
      if (!map.has(key)) {
        map.set(key, {
          key, size: oc.length, favor: 0, contra: 0,
          players: oc.map((p) => ({ key: rowKey(p), name: p.name, number: p.number })).sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999)),
        });
      }
      const d = map.get(key);
      if (ev.type === "for") d.favor += 1; else d.contra += 1;
    });
  });
  return [...map.values()]
    .map((q) => ({ ...q, goals: q.favor + q.contra, diff: q.favor - q.contra, lowSample: q.favor + q.contra < QUINTET_LOW_SAMPLE }))
    .sort((a, b) => b.goals - a.goals || b.diff - a.diff);
}

/* Goles a favor y en contra por fase (ABP, ataque posicional...). */
export function goalsByPhase(matches) {
  const map = new Map();
  (matches || []).forEach((m) => (m.goalEvents || []).forEach((ev) => {
    const side = ev.type === "for" ? "favor" : ev.type === "against" ? "contra" : null;
    if (!side) return;
    const k = ev.phase || "Sin fase";
    if (!map.has(k)) map.set(k, { phase: k, favor: 0, contra: 0 });
    map.get(k)[side] += 1;
  }));
  return map;
}
