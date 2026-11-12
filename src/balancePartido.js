/* Balance mas/menos de UN partido: todos los convocados, con minutos.
 *
 * DEFINICION (la misma en pantalla, PDF y tests):
 *   Mas/menos de un jugador = goles a favor - goles en contra marcados mientras
 *   ESTABA en pista.
 *
 * ATRIBUCION: cada gol guarda la foto de quienes estaban en pista en el instante
 * exacto en que se anoto (goalEvents[].onCourt). Un gol se atribuye a TODOS los
 * de esa foto: un gol propio suma "a favor" a cada uno; uno rival, "en contra".
 * Un autogol rival cuenta a favor. Un jugador que sale en el mismo segundo del
 * gol cuenta segun la foto, no se reinterpreta.
 *
 * VERIFICACION: como el balance sale de las fotos, se contrasta con una segunda
 * fuente independiente, las rotaciones (quien entro y salio y cuando): cada
 * jugador de una foto debe tener una rotacion que cubra el momento del gol. Las
 * discrepancias no se corrigen en silencio: se cuentan y se avisan.
 *
 * ESTADOS:
 *   "pos" / "neg"  balance distinto de cero
 *   "zero"         jugo y el balance es exactamente 0 (se muestra un 0 explicito)
 *   "np"           convocado que no participo (sin minutos ni gol en su pista)
 *
 * Funciones puras, sin React ni almacenamiento.
 */

import { playerKeyOf } from "./zonas.js";

const OT_HALF_MIN = 3;
const n = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const halfSeconds = (half, base) => (half <= 2 ? base : OT_HALF_MIN) * 60;
const keyOf = (p) => playerKeyOf(p.id || p.playerId, p.name || p.playerName, p.number !== undefined ? p.number : p.playerNumber);

/* Los convocados se guardan como {id,name,number}; se enlazan con la lista de
   jugadores por id o por nombre|dorsal (como hace el informe). Un partido sin
   convocatoria (antiguo) se trata como "todos los guardados". */
function squadPlayers(match) {
  const players = match.players || [];
  const called = Array.isArray(match.convocados) && match.convocados.length ? match.convocados : null;
  if (!called) return players;
  const ids = new Set(called.map((c) => c.id).filter(Boolean));
  const nameNum = new Set(called.map((c) => `${c.name}|${c.number}`));
  return players.filter((p) => ids.has(p.id) || nameNum.has(`${p.name}|${p.number}`));
}

/* Rotaciones validas por jugador: { key -> [{half, from, to}] } con from/to en
   segundos jugados desde el inicio de la parte. */
function stintsByPlayer(match) {
  const base = Number(match.halfLength) || 20;
  const out = new Map();
  (match.rotations || []).forEach((r) => {
    if (!r || r.playerId === undefined || r.playerId === null) return;
    const half = Number(r.half) || 1;
    const len = halfSeconds(half, base);
    const from = len - Number(r.startRemaining);
    const to = len - Number(r.endRemaining);
    if (!isFinite(from) || !isFinite(to) || to < from) return;
    const key = String(r.playerId);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ half, from, to });
  });
  return out;
}

const goalSide = (ev) => (ev.type === "for" ? "favor" : ev.type === "against" ? "contra" : null);
const goalElapsed = (ev, base) => (typeof ev.remaining === "number" ? halfSeconds(Number(ev.half) || 1, base) - ev.remaining : null);

/* Balance de cada convocado en el partido. `half` (opcional) limita a una parte:
   solo cuentan los goles de esa parte y, si hay rotaciones, sus minutos. */
export function matchBalance(match, { half = null } = {}) {
  const base = Number(match.halfLength) || 20;
  const stints = stintsByPlayer(match);
  const hasRotations = stints.size > 0;
  const goalEvents = (match.goalEvents || []).filter((ev) => goalSide(ev));
  const inPeriod = (ev) => half === null || (Number(ev.half) || 1) === half;

  const rows = new Map();
  const ensure = (p) => {
    const key = keyOf(p);
    if (!rows.has(key)) {
      rows.set(key, {
        key, id: p.id || p.playerId || null, name: p.name || p.playerName || "?", number: p.number !== undefined ? p.number : p.playerNumber,
        position: p.position || "", isGK: !!p.isGK,
        seconds: 0, favor: 0, contra: 0, byHalf: {}, goals: [], inSnapshot: false,
      });
    }
    return rows.get(key);
  };
  squadPlayers(match).forEach((p) => { const r = ensure(p); r.seconds = n(p.seconds); });

  // Minutos de la parte pedida, desde las rotaciones (si no las hay, no se inventan).
  if (half !== null) {
    rows.forEach((r) => {
      const list = (stints.get(String(r.id)) || []).filter((s) => s.half === half);
      r.seconds = hasRotations ? list.reduce((s, x) => s + (x.to - x.from), 0) : null;
    });
  }

  goalEvents.forEach((ev) => {
    const side = goalSide(ev);
    const h = Number(ev.half) || 1;
    (ev.onCourt || []).forEach((p) => {
      const r = ensure(p);
      r.inSnapshot = true;
      const bh = r.byHalf[h] || (r.byHalf[h] = { favor: 0, contra: 0 });
      bh[side] += 1;
      if (inPeriod(ev)) {
        r[side] += 1;
        r.goals.push({ half: h, elapsed: goalElapsed(ev, base), type: ev.type, ownGoal: !!ev.ownGoal });
      }
    });
  });

  const out = [...rows.values()].map((r) => {
    // En un periodo concreto, "participo" es haber tenido minutos o gol con el en pista en ese periodo.
    const played = half !== null
      ? (r.seconds || 0) > 0 || r.goals.length > 0
      : (r.seconds || 0) > 0 || stints.has(String(r.id)) || r.inSnapshot;
    const balance = r.favor - r.contra;
    return {
      ...r, balance, played,
      status: !played ? "np" : balance > 0 ? "pos" : balance < 0 ? "neg" : "zero",
    };
  });
  return out;
}

/* Orden para mostrar. "balance": mayor +/- primero y, a igualdad, mas minutos;
   "minutes": mas minutos primero; "number": por dorsal. Los NP van siempre al final. */
export function sortBalance(rows, by = "balance") {
  const num = (r) => (Number(r.number) || 999);
  const cmp = {
    balance: (a, b) => b.balance - a.balance || (b.seconds || 0) - (a.seconds || 0) || num(a) - num(b),
    minutes: (a, b) => (b.seconds || 0) - (a.seconds || 0) || b.balance - a.balance || num(a) - num(b),
    number: (a, b) => num(a) - num(b),
  }[by] || ((a, b) => num(a) - num(b));
  const played = rows.filter((r) => r.status !== "np").sort(cmp);
  const np = rows.filter((r) => r.status === "np").sort((a, b) => num(a) - num(b));
  return [...played, ...np];
}

/* Cada gol con su quinteto: el detalle que explica el balance y permite revisarlo. */
export function balanceGoalDetail(match) {
  const base = Number(match.halfLength) || 20;
  return (match.goalEvents || []).filter((ev) => goalSide(ev)).map((ev) => ({
    half: Number(ev.half) || 1, elapsed: goalElapsed(ev, base), type: ev.type, ownGoal: !!ev.ownGoal,
    onCourt: (ev.onCourt || []).map((p) => ({ key: keyOf(p), name: p.name, number: p.number })),
  })).sort((a, b) => a.half - b.half || (a.elapsed === null ? 1 : b.elapsed === null ? -1 : a.elapsed - b.elapsed));
}

/* Comprobaciones de coherencia (no cambian el calculo, solo lo auditan):
 *  - sinFoto: goles sin quienes estaban en pista (no se pueden atribuir).
 *  - fueraDeRotacion: jugadores de una foto sin rotacion que cubra ese instante.
 *  - marcador: goles registrados frente al marcador guardado del partido.
 *  - tamanosRaros: fotos con un numero de jugadores distinto de 5 (informativo:
 *    puede ser superioridad/inferioridad por expulsion).
 * ok = no hay sinFoto, ni fueraDeRotacion, ni descuadre de marcador. */
export function verifyBalance(match) {
  const base = Number(match.halfLength) || 20;
  const stints = stintsByPlayer(match);
  const checkRot = stints.size > 0;
  const evs = (match.goalEvents || []).filter((ev) => goalSide(ev));
  const res = { goles: evs.length, sinFoto: 0, fueraDeRotacion: 0, tamanosRaros: 0, marcador: null, tieneRotaciones: checkRot };
  evs.forEach((ev) => {
    const oc = ev.onCourt || [];
    if (!oc.length) { res.sinFoto += 1; return; }
    if (oc.length !== 5) res.tamanosRaros += 1;
    if (!checkRot || typeof ev.remaining !== "number") return;
    const at = halfSeconds(Number(ev.half) || 1, base) - ev.remaining;
    const h = Number(ev.half) || 1;
    oc.forEach((p) => {
      const list = stints.get(String(p.id || p.playerId)) || [];
      if (!list.some((s) => s.half === h && s.from <= at && at <= s.to)) res.fueraDeRotacion += 1;
    });
  });
  const gf = evs.filter((e) => e.type === "for").length, ga = evs.filter((e) => e.type === "against").length;
  const sf = Number(match.teamGoals), sa = Number(match.rivalScore);
  if (isFinite(sf) && isFinite(sa)) res.marcador = { registrados: [gf, ga], guardado: [sf, sa], ok: gf === sf && ga === sa };
  res.ok = res.sinFoto === 0 && res.fueraDeRotacion === 0 && (!res.marcador || res.marcador.ok);
  return res;
}

/* Totales del balance. Cada gol suma una vez por jugador en pista, asi que la
   suma de "a favor" de todos NO es el marcador: se da el marcador aparte. */
export function balanceSummary(rows) {
  return {
    convocados: rows.length,
    participaron: rows.filter((r) => r.status !== "np").length,
    positivos: rows.filter((r) => r.status === "pos").length,
    negativos: rows.filter((r) => r.status === "neg").length,
    ceros: rows.filter((r) => r.status === "zero").length,
    noParticiparon: rows.filter((r) => r.status === "np").length,
  };
}
