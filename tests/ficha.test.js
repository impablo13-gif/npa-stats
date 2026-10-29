import test from "node:test";
import assert from "node:assert/strict";
import { buildPlayerReportHtml } from "../src/fichaHtml.js";
import { playerReport, seasonTable } from "../src/jugadores.js";

const stats = (o = {}) => ({ seconds: 0, goals: 0, assists: 0, fouls: 0, foulsReceived: 0, yellow: 0, red: 0, saves: 0, turnovers: 0, recoveries: 0, shotsOn: 0, shotsOff: 0, shotsPost: 0, ...o });
const mk = (name, rival, extra = {}) => ({
  date: "2026-10-01T18:00:00.000Z", rivalName: rival, teamGoals: 2, rivalScore: 1,
  players: [{ id: "a", name, number: 7, position: "ALA", isGK: false, ...stats({ seconds: 1500, goals: 1, shotsOn: 1, recoveries: 3 }) }],
  convocados: [{ id: "a", name, number: 7 }],
  goalEvents: [{ type: "for", authorId: "a", onCourt: [{ id: "a", name, number: 7 }] }],
  ...extra,
});
const html = (matches, o = {}) => buildPlayerReportHtml({ report: playerReport(matches, "a"), teamName: "Noia", periodLabel: "Toda la temporada", ...o });

test("la ficha incluye nombre, dorsal, totales y bloques de corte de PDF", () => {
  const h = html([mk("Ana", "Lugo")]);
  assert.ok(h.includes("#7 Ana"));
  assert.ok(h.includes("Ficha de jugador"));
  assert.ok((h.match(/data-pdf-block/g) || []).length >= 5);
  assert.ok(h.includes("+1")); // +/- = 1 a favor, 0 en contra
});

test("sin NaN, undefined ni null visibles en el HTML", () => {
  const h = html([mk("Ana", "Lugo")]);
  assert.ok(!/NaN|undefined|null|Infinity/.test(h));
});

test("un nombre o rival con HTML no se inyecta (XSS)", () => {
  const h = html([mk('<img src=x onerror="alert(1)">', '<script>alert(2)</script>')], { notes: '<b onmouseover="x()">hola</b>' });
  assert.ok(!h.includes("<script"));
  assert.ok(!h.includes("<img src=x"));
  assert.ok(!h.includes("<b onmouseover"));
  assert.ok(h.includes("&lt;script&gt;"));
});

test("jugador sin minutos: no inventa +/- ni ritmos", () => {
  const m = mk("Ana", "Lugo");
  m.players[0] = { ...m.players[0], ...stats() };
  m.goalEvents = [];
  const h = html([m]);
  assert.ok(h.includes("sin minutos"));
  assert.ok(h.includes("no calculados"));
  assert.ok(!/NaN|undefined/.test(h));
});

test("mapa de zonas: con zona fina usa 18 casillas, con la rejilla antigua usa 9 y avisa", () => {
  const ev = (zone) => ({ action: "shotsOn", zone });
  const fine = html([mk("Ana", "Lugo")], { zoneEvents: [ev("f5-centro"), ev("f6-izq"), ev("def-izq")] });
  assert.equal((fine.match(/border-radius:6px;">/g) || []).length, 18);
  assert.ok(fine.includes("18 zonas"));
  assert.ok(fine.includes("no se puede repartir"));
  const old = html([mk("Ana", "Lugo")], { zoneEvents: [ev("def-izq"), ev("ataque-centro")] });
  assert.equal((old.match(/border-radius:6px;">/g) || []).length, 9);
  assert.ok(old.includes("9 zonas"));
});

test("sin eventos con zona se dice, y las conclusiones solo salen si las hay", () => {
  const sin = html([mk("Ana", "Lugo")]);
  assert.ok(sin.includes("Sin registros con zona"));
  assert.ok(!sin.includes("Conclusiones del entrenador"));
  const con = html([mk("Ana", "Lugo")], { notes: "Mejorar el cierre al segundo palo." });
  assert.ok(con.includes("Conclusiones del entrenador"));
  assert.ok(con.includes("segundo palo"));
});

test("la tabla de plantilla y la ficha coinciden en los numeros", () => {
  const ms = [mk("Ana", "Lugo")];
  const total = seasonTable(ms)[0].total;
  const h = html(ms);
  assert.equal(total.goals, 1);
  assert.ok(h.includes(">1</div>")); // tile Goles
});
