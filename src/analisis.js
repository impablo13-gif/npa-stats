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

/* Tramos de tiempo en los que un grupo exacto de jugadores estuvo en pista, a
   partir de las rotaciones guardadas en el partido (quien entra y sale y en que
   minuto del reloj de la app). El reloj se para en los parones, asi que son
   minutos de juego efectivo, no de reloj de pared. Devuelve null si el partido
   no guardo rotaciones (partidos anteriores a registrarlas). */
export function onCourtSegments(match) {
  const rots = match && match.rotations;
  if (!Array.isArray(rots) || !rots.length) return null;
  const baseLen = Number(match.halfLength) || 20;
  const byHalf = new Map();
  rots.forEach((r) => {
    if (!r || r.playerId === undefined || r.playerId === null) return;
    const half = Number(r.half) || 1;
    const len = halfMinutes(half, baseLen) * 60;
    const s = len - Number(r.startRemaining);
    const e = len - Number(r.endRemaining);
    if (!(e > s) || !isFinite(s) || !isFinite(e)) return;
    if (!byHalf.has(half)) byHalf.set(half, []);
    byHalf.get(half).push({ id: String(r.playerId), s, e, name: r.playerName, number: r.playerNumber });
  });
  const segments = [];
  byHalf.forEach((intervals, half) => {
    const points = [...new Set(intervals.flatMap((i) => [i.s, i.e]))].sort((a, b) => a - b);
    for (let k = 0; k < points.length - 1; k += 1) {
      const p0 = points[k], p1 = points[k + 1];
      const on = intervals.filter((i) => i.s <= p0 && i.e >= p1);
      if (!on.length) continue;
      const ids = on.map((i) => i.id).sort();
      segments.push({ half, from: p0, to: p1, seconds: p1 - p0, key: ids.join("|"), size: ids.length, players: on.map((i) => ({ key: i.id, name: i.name, number: i.number })) });
    }
  });
  return segments;
}

export const QUINTET_RATE_MIN_SECONDS = 5 * 60; // por debajo, un ritmo por 40' engaña
export const QUINTET_LOW_SAMPLE_SECONDS = 10 * 60;

/* Balance por quinteto (grupo exacto de jugadores en pista).
 *  - Goles: de la foto de los 5 en pista al marcarse, en todos los partidos.
 *  - Minutos: de las rotaciones, solo en los partidos que las guardaron. Para
 *    que el ritmo sea honesto, el +/- por 40' usa SOLO los goles de esos mismos
 *    partidos (timedFavor/timedContra), nunca goles de partidos sin minutos.
 * Ordenado por minutos jugados y, a igualdad, por goles. */
export function quintetBalance(matches) {
  const map = new Map();
  const get = (key, size, players) => {
    if (!map.has(key)) {
      map.set(key, {
        key, size, favor: 0, contra: 0, seconds: 0, timedFavor: 0, timedContra: 0,
        players: players.map((p) => ({ key: p.key, name: p.name, number: p.number })).sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999)),
      });
    }
    return map.get(key);
  };
  let timedMatches = 0;
  (matches || []).forEach((m) => {
    const segs = onCourtSegments(m);
    if (segs && segs.length) timedMatches += 1;
    (segs || []).forEach((sg) => { get(sg.key, sg.size, sg.players).seconds += sg.seconds; });
    (m.goalEvents || []).forEach((ev) => {
      const oc = ev.onCourt || [];
      if (!oc.length || (ev.type !== "for" && ev.type !== "against")) return;
      const key = oc.map(rowKey).sort().join("|");
      const d = get(key, oc.length, oc.map((p) => ({ key: rowKey(p), name: p.name, number: p.number })));
      if (ev.type === "for") d.favor += 1; else d.contra += 1;
      if (segs && segs.length) { if (ev.type === "for") d.timedFavor += 1; else d.timedContra += 1; }
    });
  });
  const list = [...map.values()].map((q) => {
    const goals = q.favor + q.contra;
    const rateOk = q.seconds >= QUINTET_RATE_MIN_SECONDS;
    return {
      ...q, goals, diff: q.favor - q.contra,
      per40: rateOk ? ((q.timedFavor - q.timedContra) * 40 * 60) / q.seconds : null,
      lowSample: goals < QUINTET_LOW_SAMPLE || (q.seconds > 0 && q.seconds < QUINTET_LOW_SAMPLE_SECONDS),
    };
  }).filter((q) => q.goals > 0 || q.seconds >= 3 * 60); // un quinteto sin goles solo interesa si jugo un rato
  list.sort((a, b) => b.seconds - a.seconds || b.goals - a.goals || b.diff - a.diff);
  list.timedMatches = timedMatches;
  list.totalMatches = (matches || []).length;
  return list;
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
