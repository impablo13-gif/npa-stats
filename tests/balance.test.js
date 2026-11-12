import test from "node:test";
import assert from "node:assert/strict";
import { matchBalance, sortBalance, verifyBalance, balanceSummary, balanceGoalDetail } from "../src/balancePartido.js";
import { quintetBalance } from "../src/analisis.js";
import { buildBalanceBody, buildQuintetsBody } from "../src/balanceHtml.js";

/* Partido de referencia de 2 x 20', calculado a mano.
 *
 * En pista (segundos jugados desde el inicio de cada parte):
 *   1ª parte   0-600: a b c d e      600-1200: a b d f g
 *   2ª parte   0-600: a b e f g      600-1050: a b c d g      1050-1200: a b c d i
 * Goles (parte, segundo, tipo, quinteto):
 *   G1 1ª 300  favor    a b c d e      G5 2ª 900   favor    a b c d g
 *   G2 1ª 480  favor    a b c d e      G6 2ª 1080  contra   a b c d i
 *   G3 1ª 720  contra   a b d f g      G7 2ª 1140  contra   a b c d i
 *   G4 2ª 180  favor    a b e f g      G8 2ª 1170  contra   a b c d i
 * Balance esperado: e +3 · g +1 · a b c f 0 · d -1 · i -3 · h no participa (NP). */
const P = (id, num, extra = {}) => ({ id, name: `Jugador ${id.toUpperCase()}`, number: num, position: "ALA", isGK: false, seconds: 0, ...extra });
const SEC = { a: 2400, b: 2400, c: 1200, d: 1800, e: 1200, f: 1200, g: 1650, i: 150, h: 0 };
const players = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id, k) => P(id, k + 1, { seconds: SEC[id], isGK: id === "a", position: id === "a" ? "POR" : "ALA" }));
const rot = (id, half, startRemaining, endRemaining) => ({ playerId: id, playerName: `Jugador ${id.toUpperCase()}`, playerNumber: players.find((p) => p.id === id).number, half, startRemaining, endRemaining });
const rotations = [
  rot("a", 1, 1200, 0), rot("b", 1, 1200, 0), rot("d", 1, 1200, 0), rot("c", 1, 1200, 600), rot("e", 1, 1200, 600), rot("f", 1, 600, 0), rot("g", 1, 600, 0),
  rot("a", 2, 1200, 0), rot("b", 2, 1200, 0), rot("e", 2, 1200, 600), rot("f", 2, 1200, 600), rot("g", 2, 1200, 150), rot("c", 2, 600, 0), rot("d", 2, 600, 0), rot("i", 2, 150, 0),
];
const oc = (...ids) => ids.map((id) => players.find((p) => p.id === id)).map(({ id, name, number }) => ({ id, name, number }));
const goal = (type, half, elapsed, ...ids) => ({ type, half, remaining: 1200 - elapsed, onCourt: oc(...ids), phase: "Ataque posicional" });
const goalEvents = [
  goal("for", 1, 300, "a", "b", "c", "d", "e"), goal("for", 1, 480, "a", "b", "c", "d", "e"), goal("against", 1, 720, "a", "b", "d", "f", "g"),
  goal("for", 2, 180, "a", "b", "e", "f", "g"), goal("for", 2, 900, "a", "b", "c", "d", "g"),
  goal("against", 2, 1080, "a", "b", "c", "d", "i"), goal("against", 2, 1140, "a", "b", "c", "d", "i"), goal("against", 2, 1170, "a", "b", "c", "d", "i"),
];
const match = {
  date: "2026-11-01T18:00:00.000Z", rivalName: "Lugo", teamGoals: 4, rivalScore: 4, halfLength: 20,
  players, rotations, goalEvents, convocados: players.map(({ id, name, number }) => ({ id, name, number })),
};
const byId = (rows, id) => rows.find((r) => r.id === id);

test("balance: +3, +1, 0, -1, -3 y no participante, todos presentes", () => {
  const rows = matchBalance(match);
  assert.equal(rows.length, 9); // todos los convocados, incluidos los de balance 0 y el NP
  const expect = { e: 3, g: 1, a: 0, b: 0, c: 0, f: 0, d: -1, i: -3 };
  Object.entries(expect).forEach(([id, bal]) => assert.equal(byId(rows, id).balance, bal, `balance de ${id}`));
  assert.equal(byId(rows, "e").status, "pos");
  assert.equal(byId(rows, "d").status, "neg");
  assert.equal(byId(rows, "c").status, "zero"); // jugo y quedo igualado: cero explicito, no NP
  assert.equal(byId(rows, "h").status, "np");
  assert.deepEqual([byId(rows, "e").favor, byId(rows, "e").contra], [3, 0]);
  assert.deepEqual([byId(rows, "d").favor, byId(rows, "d").contra], [3, 4]);
  assert.deepEqual(balanceSummary(rows), { convocados: 9, participaron: 8, positivos: 2, negativos: 2, ceros: 4, noParticiparon: 1 });
});

test("balance: coincide con un calculo independiente hecho solo desde las rotaciones", () => {
  // Referencia: para cada gol, quien tiene una rotacion que cubre ese instante.
  const reference = (id) => goalEvents.reduce((s, ev) => {
    const on = rotations.some((r) => r.playerId === id && r.half === ev.half && r.startRemaining >= ev.remaining && ev.remaining >= r.endRemaining);
    return on ? s + (ev.type === "for" ? 1 : -1) : s;
  }, 0);
  matchBalance(match).forEach((r) => assert.equal(r.balance, reference(r.id), `jugador ${r.id}`));
});

test("balance: minutos por jugador y por parte", () => {
  const rows = matchBalance(match);
  assert.equal(byId(rows, "g").seconds, 1650);
  const h1 = matchBalance(match, { half: 1 });
  assert.equal(byId(h1, "g").seconds, 600);
  assert.equal(byId(h1, "d").balance, 1); // 1ª parte: favor G1 G2, contra G3
  assert.equal(byId(matchBalance(match, { half: 2 }), "d").balance, -2); // 2ª: favor G5, contra G6 G7 G8
  assert.equal(byId(h1, "i").status, "np"); // i no participo en la 1ª parte
  assert.equal(byId(matchBalance(match, { half: 2 }), "c").balance, -2); // c en 2ª: G5 a favor, 3 en contra
});

test("balance: un partido sin rotaciones no inventa minutos por parte", () => {
  const sinRot = { ...match, rotations: [] };
  assert.equal(byId(matchBalance(sinRot), "e").balance, 3); // sale de las fotos de los goles
  assert.equal(byId(matchBalance(sinRot, { half: 1 }), "e").seconds, null);
  assert.equal(verifyBalance(sinRot).tieneRotaciones, false);
});

test("autogol del rival cuenta a favor de los 5 en pista", () => {
  const og = { ...match, goalEvents: goalEvents.map((g, k) => (k === 0 ? { ...g, ownGoal: true } : g)) };
  assert.equal(byId(matchBalance(og), "e").balance, 3);
  assert.equal(balanceGoalDetail(og)[0].ownGoal, true);
});

test("orden: por balance, minutos o dorsal, y los NP siempre al final", () => {
  const rows = matchBalance(match);
  const ids = (by) => sortBalance(rows, by).map((r) => r.id);
  assert.equal(ids("balance")[0], "e");
  assert.equal(ids("balance").at(-1), "h");
  assert.equal(ids("balance").at(-2), "i");
  assert.equal(ids("minutes")[0], "a");
  assert.equal(ids("minutes").at(-1), "h");
  assert.equal(ids("number")[0], "a");
});

test("verificacion: datos coherentes, y detecta incoherencias sin corregirlas en silencio", () => {
  const v = verifyBalance(match);
  assert.deepEqual([v.sinFoto, v.fueraDeRotacion, v.ok], [0, 0, true]);
  assert.equal(v.marcador.ok, true);

  // un gol cuyo quinteto incluye a alguien que no estaba en pista segun las rotaciones
  const mal = { ...match, goalEvents: goalEvents.map((g, k) => (k === 0 ? { ...g, onCourt: oc("a", "b", "c", "d", "i") } : g)) };
  const vm = verifyBalance(mal);
  assert.equal(vm.fueraDeRotacion, 1);
  assert.equal(vm.ok, false);

  // un gol sin quinteto guardado
  const sinFoto = { ...match, goalEvents: goalEvents.map((g, k) => (k === 0 ? { ...g, onCourt: [] } : g)) };
  assert.equal(verifyBalance(sinFoto).sinFoto, 1);

  // marcador guardado distinto de los goles registrados
  assert.equal(verifyBalance({ ...match, teamGoals: 5 }).marcador.ok, false);
});

test("convocado sin minutos pero con la foto de un gol no es NP", () => {
  const sinSeg = { ...match, rotations: [], players: players.map((p) => (p.id === "e" ? { ...p, seconds: 0 } : p)) };
  assert.equal(byId(matchBalance(sinSeg), "e").status, "pos");
});

test("quintetos del partido: minutos, veces, goles y mismo grupo sin importar el orden", () => {
  const q = quintetBalance([match], { minSeconds: 60 });
  const find = (...ids) => q.find((x) => x.key === ids.sort().join("|"));
  const q1 = find("a", "b", "c", "d", "e");
  assert.deepEqual([q1.seconds, q1.intervals, q1.timedFavor, q1.timedContra], [600, 1, 2, 0]);
  const q4 = find("a", "b", "c", "d", "g");
  assert.deepEqual([q4.seconds, q4.timedFavor, q4.timedContra], [450, 1, 0]);
  const q5 = find("a", "b", "c", "d", "i");
  assert.deepEqual([q5.seconds, q5.timedFavor, q5.timedContra, q5.per40], [150, 0, 3, null]); // menos de 5 min: sin ritmo
  assert.equal(q.length, 5); // 5 alineaciones distintas, ninguna duplicada
});

test("informe HTML: todos los convocados, 0 explicito, NP y texto escapado", () => {
  const raro = { ...match, players: players.map((p) => (p.id === "h" ? { ...p, name: "<b>Hugo</b>" } : p)), convocados: match.convocados.map((c) => (c.id === "h" ? { ...c, name: "<b>Hugo</b>" } : c)) };
  const html = buildBalanceBody(raro);
  players.forEach((p) => { if (p.id !== "h") assert.ok(html.includes(`Jugador ${p.id.toUpperCase()}`), `falta ${p.id}`); });
  assert.ok(html.includes("&lt;b&gt;Hugo&lt;/b&gt;")); // escapado
  assert.ok(!html.includes("<b>Hugo</b>"));
  assert.ok(html.includes(">NP<"));
  assert.ok(html.includes("+3") && html.includes("-3") && html.includes("-1") && html.includes("+1"));
  assert.ok(/>\s*0\s*<\/td>/.test(html)); // un cero explicito de balance en alguna fila
  assert.ok(html.includes("Comprobado: los 8 goles cuadran"));
  // el NP va despues de todos los que jugaron
  assert.ok(html.indexOf("Jugador I") < html.indexOf("&lt;b&gt;Hugo"));
});

test("informe HTML de quintetos: aviso si no hay rotaciones", () => {
  assert.ok(buildQuintetsBody({ ...match, rotations: [] }).includes("no guardó rotaciones"));
  const html = buildQuintetsBody(match);
  assert.ok(html.includes("10'00&quot;") && html.includes("7'30&quot;")); // el " de los segundos va escapado
});
