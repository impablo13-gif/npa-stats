import test from "node:test";
import assert from "node:assert/strict";
import { seasonSummary, goalsByMinute, quintetBalance, goalsByPhase, QUINTET_LOW_SAMPLE } from "../src/analisis.js";

const on = (...ids) => ids.map((id, i) => ({ id, name: id.toUpperCase(), number: i + 1 }));
const g = (type, half, remaining, onCourt = [], extra = {}) => ({ type, half, remaining, onCourt, phase: "ABP", ...extra });
const m1 = { date: "2026-10-01T18:00:00.000Z", rivalName: "Lugo", teamGoals: 3, rivalScore: 1, halfLength: 20, goalEvents: [
  g("for", 1, 1190, on("a", "b", "c", "d", "e")),   // 10 s jugados -> tramo 0-5, primeros 5
  g("for", 1, 600, on("a", "b", "c", "d", "e")),    // 10 min jugados -> tramo 10-15
  g("against", 2, 200, on("a", "b", "c", "d", "f")), // 2ª, 1000 s jugados -> tramo 15-20, ultimos 5
  g("for", 2, 0, on("a", "b", "c", "d", "f"), { ownGoal: true }), // minuto 20 -> ultimo tramo y ultimos 5
] };
const m2 = { date: "2026-10-08T18:00:00.000Z", rivalName: "Vigo", teamGoals: 0, rivalScore: 2, halfLength: 20, goalEvents: [
  g("against", 1, 1180, on("a", "b", "c", "d", "e")),
  g("against", 2, undefined, on("a", "b")), // sin minuto: se cuenta aparte
] };

test("resumen: resultados, puntos 3-1-0 y goles", () => {
  const s = seasonSummary([m2, m1]);
  assert.equal(s.played, 2);
  assert.deepEqual([s.wins, s.draws, s.losses], [1, 0, 1]);
  assert.equal(s.points, 3);
  assert.equal(s.gf, 3);
  assert.equal(s.ga, 3);
  assert.deepEqual(s.results.map((r) => r.outcome), ["V", "D"]); // cronologico
});

test("goles por minuto: tramos de 5 minutos dentro de cada parte", () => {
  const r = goalsByMinute([m1]);
  assert.equal(r.rows.length, 8); // 2 partes x 4 tramos
  const cell = (half, from) => r.rows.find((x) => x.half === half && x.from === from);
  assert.equal(cell(1, 0).favor, 1);
  assert.equal(cell(1, 10).favor, 1);
  assert.equal(cell(2, 15).contra, 1);
  assert.equal(cell(2, 15).favor, 1); // el autogol en el minuto 20 cae en el ultimo tramo
  assert.deepEqual(r.total, { favor: 3, contra: 1 });
});

test("primeros y ultimos 5 minutos de cada parte", () => {
  const r = goalsByMinute([m1]);
  assert.deepEqual(r.first5, { favor: 1, contra: 0 });
  assert.deepEqual(r.last5, { favor: 1, contra: 1 });
});

test("un gol sin minuto se cuenta aparte y no entra en los tramos", () => {
  const r = goalsByMinute([m2]);
  assert.equal(r.withoutMinute, 1);
  assert.equal(r.total.contra, 1);
});

test("la prorroga cuenta en el total pero no en los tramos", () => {
  const r = goalsByMinute([{ halfLength: 20, goalEvents: [g("for", 3, 90, on("a"))] }]);
  assert.equal(r.extraTime.favor, 1);
  assert.equal(r.total.favor, 1);
  assert.equal(r.rows.reduce((s, x) => s + x.favor, 0), 0);
});

test("sin partidos: ceros, sin NaN", () => {
  const r = goalsByMinute([]);
  assert.equal(r.rows.length, 8);
  assert.deepEqual(r.total, { favor: 0, contra: 0 });
  assert.deepEqual(seasonSummary([]).results, []);
  assert.deepEqual(quintetBalance([]), []);
});

test("quintetos: el mismo grupo se une entre partidos", () => {
  const q = quintetBalance([m1, m2]);
  const abcde = q.find((x) => x.players.length === 5 && x.players.some((p) => p.key === "e"));
  assert.equal(abcde.favor, 2);
  assert.equal(abcde.contra, 1); // el gol en contra de m2
});

test("quintetos: balance, muestra pequena y orden por goles", () => {
  const q = quintetBalance([m1]);
  assert.equal(q[0].goals >= q[1].goals, true);
  const abcde = q.find((x) => x.players.some((p) => p.key === "e"));
  assert.deepEqual([abcde.favor, abcde.contra, abcde.diff], [2, 0, 2]);
  assert.equal(abcde.lowSample, 2 < QUINTET_LOW_SAMPLE);
  const abcdf = q.find((x) => x.players.some((p) => p.key === "f"));
  assert.deepEqual([abcdf.favor, abcdf.contra, abcdf.diff], [1, 1, 0]);
});

test("goles por fase", () => {
  const m = goalsByPhase([m1]);
  assert.deepEqual(m.get("ABP"), { phase: "ABP", favor: 3, contra: 1 });
});

test("tamaño de tramo: 2, 3, 5 y 10 minutos", () => {
  const total = (r) => r.rows.reduce((s, x) => s + x.favor + x.contra, 0);
  for (const size of [2, 3, 5, 10]) {
    const r = goalsByMinute([m1], size);
    assert.equal(r.bucketMin, size);
    assert.equal(r.rows.length, 2 * Math.ceil(20 / size), `${size} min`);
    assert.equal(total(r), 4, `${size} min conserva todos los goles`);
    assert.deepEqual(r.total, { favor: 3, contra: 1 });
  }
});

test("tramos de 3 min: el ultimo es mas corto y recoge el minuto 20", () => {
  const r = goalsByMinute([m1], 3);
  const last = r.rows.filter((x) => x.half === 2).pop();
  assert.deepEqual([last.from, last.to], [18, 20]);
  assert.equal(last.favor, 1); // el autogol del minuto 20
  assert.equal(last.contra, 0);
  assert.equal(r.rows.find((x) => x.half === 2 && x.from === 15).contra, 1); // 16:40 cae en 15-18
});

test("tramos de 10 min y de 2 min colocan los goles donde toca", () => {
  const r10 = goalsByMinute([m1], 10);
  const c = (half, from) => r10.rows.find((x) => x.half === half && x.from === from);
  assert.equal(c(1, 0).favor, 1); // 10 s jugados
  assert.equal(c(1, 10).favor, 1); // 10:00 exactos cae en 10-20
  const r2 = goalsByMinute([m1], 2);
  assert.equal(r2.rows.find((x) => x.half === 1 && x.from === 0).favor, 1);
});

test("un tamaño no permitido vuelve al de 5 y los bordes de 5' no cambian con el tramo", () => {
  assert.equal(goalsByMinute([m1], 7).bucketMin, 5);
  assert.deepEqual(goalsByMinute([m1], 10).first5, goalsByMinute([m1], 2).first5);
  assert.deepEqual(goalsByMinute([m1], 10).last5, goalsByMinute([m1], 2).last5);
});
