import test from "node:test";
import assert from "node:assert/strict";
import { buildSeasonReportHtml } from "../src/memoriaHtml.js";
import { seasonSummary, goalsByMinute, quintetBalance, goalsByPhase } from "../src/analisis.js";
import { seasonTable } from "../src/jugadores.js";

const on = (...ids) => ids.map((id, i) => ({ id, name: id, number: i + 1 }));
const stats = (o = {}) => ({ seconds: 0, goals: 0, assists: 0, fouls: 0, foulsReceived: 0, yellow: 0, red: 0, saves: 0, turnovers: 0, recoveries: 0, shotsOn: 0, shotsOff: 0, shotsPost: 0, ...o });
const mk = (rival, name = "Ana") => ({
  date: "2026-10-01T18:00:00.000Z", rivalName: rival, teamGoals: 2, rivalScore: 1, halfLength: 20,
  players: [{ id: "a", name, number: 7, position: "ALA", isGK: false, ...stats({ seconds: 1500, goals: 1 }) }],
  convocados: [{ id: "a", name, number: 7 }],
  goalEvents: [
    { type: "for", half: 1, remaining: 900, phase: "ABP", authorId: "a", onCourt: on("a", "b", "c", "d", "e") },
    { type: "against", half: 2, remaining: 100, phase: "Transición", onCourt: on("a", "b", "c", "d", "e") },
  ],
});
const html = (ms, o = {}) => buildSeasonReportHtml({
  teamName: "Noia", periodLabel: "Toda la temporada", summary: seasonSummary(ms), minutes: goalsByMinute(ms), quintets: quintetBalance(ms),
  phases: goalsByPhase(ms), phaseOrder: [{ key: "ABP", label: "ABP" }, { key: "Transición", label: "Transición" }], playersTable: seasonTable(ms), ...o,
});

test("la memoria incluye resumen, fases, minutos, jugadores y quintetos", () => {
  const h = html([mk("Lugo")]);
  for (const t of ["Memoria", "Resultados", "Goles por fase", "Goles por minuto", "Jugadores con más minutos", "Quintetos más usados"]) assert.ok(h.includes(t), t);
  assert.ok((h.match(/data-pdf-block/g) || []).length >= 7);
});

test("sin NaN, undefined ni null visibles, tambien sin partidos", () => {
  assert.ok(!/NaN|undefined|null|Infinity/.test(html([mk("Lugo")])));
  assert.ok(!/NaN|undefined|null|Infinity/.test(html([])));
});

test("textos con HTML no se inyectan (rival, jugador, conclusiones)", () => {
  const h = html([mk("<script>alert(1)</script>", '<img src=x onerror="alert(2)">')], { notes: "<b onclick=x()>hola</b>" });
  assert.ok(!h.includes("<script"));
  assert.ok(!h.includes("<img src=x"));
  assert.ok(!h.includes("<b onclick"));
  assert.ok(h.includes("&lt;script&gt;"));
});

test("las conclusiones solo salen si las hay", () => {
  assert.ok(!html([mk("Lugo")]).includes("Conclusiones del entrenador"));
  assert.ok(html([mk("Lugo")], { notes: "Cerrar mejor las segundas partes." }).includes("segundas partes"));
});

test("la muestra pequeña de un quinteto se avisa", () => {
  assert.ok(html([mk("Lugo")]).includes("muestra pequeña"));
});

test("quintetos: muestra minutos y +/- por 40' cuando hay rotaciones, y avisa cuando no", () => {
  const rot = (playerId, startRemaining, endRemaining) => ({ playerId, half: 1, startRemaining, endRemaining, playerName: playerId, playerNumber: 1 });
  const con = { ...mk("Lugo"), rotations: ["a", "b", "c", "d", "e"].map((id) => rot(id, 1200, 0)) };
  const h = html([con]);
  assert.ok(h.includes("20&#39;00") || h.includes("20'00"));
  assert.ok(h.includes("rotaciones de 1 de 1 partido"));
  assert.ok(!/NaN|undefined|Infinity/.test(h));
  const sin = html([mk("Lugo")]);
  assert.ok(sin.includes("Ningún partido del periodo guardó rotaciones"));
});
