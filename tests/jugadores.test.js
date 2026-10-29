import test from "node:test";
import assert from "node:assert/strict";
import {
  finishesOf, onCourtBalance, playerMatchRows, selectMatches, aggregate, seasonTable, playerReport,
  tableToCsv, seriesToCsv, MIN_RATE_SECONDS, LOW_SAMPLE_SECONDS,
} from "../src/jugadores.js";

const stats = (o = {}) => ({ seconds: 0, goals: 0, assists: 0, fouls: 0, foulsReceived: 0, yellow: 0, red: 0, saves: 0, turnovers: 0, recoveries: 0, shotsOn: 0, shotsOff: 0, shotsPost: 0, ...o });
const row = (id, name, number, o = {}) => ({ id, name, number, position: "ALA", isGK: false, ...stats(o) });
const on = (...ids) => ids.map((id) => ({ id, name: id.toUpperCase(), number: 1 }));

// Partido 1: Ana (a) y Beto (b) juegan; Cris (c) convocada sin jugar; Dani (d) no convocado.
const m1 = {
  date: "2026-10-01T18:00:00.000Z", rivalName: "Lugo", teamGoals: 3, rivalScore: 1,
  players: [row("a", "Ana", 7, { seconds: 1500, goals: 2, shotsOn: 2, shotsOff: 1, recoveries: 4, turnovers: 2 }), row("b", "Beto", 9, { seconds: 900, assists: 2, fouls: 3, yellow: 1 }), row("c", "Cris", 11), row("d", "Dani", 4)],
  convocados: [{ id: "a", name: "Ana", number: 7 }, { id: "b", name: "Beto", number: 9 }, { id: "c", name: "Cris", number: 11 }],
  goalEvents: [
    { type: "for", authorId: "a", onCourt: on("a", "b") },
    { type: "for", authorId: "a", onCourt: on("a") },
    { type: "against", onCourt: on("b") },
    { type: "for", authorId: "b", onCourt: on("a", "b") },
  ],
};
// Partido 2 (antiguo: sin convocados ni ids): se deduce por minutos o acciones.
const m2 = {
  date: "2026-10-08T18:00:00.000Z", rivalName: "Vigo", teamGoals: 0, rivalScore: 2,
  players: [{ name: "Ana", number: 7, position: "ALA", isGK: false, ...stats({ seconds: 600 }) }, { name: "Eli", number: 5, position: "PIV", isGK: false, ...stats() }],
  goalEvents: [],
};

test("finalizaciones = goles + tiros (puerta, fuera, palo)", () => {
  assert.equal(finishesOf(stats({ goals: 2, shotsOn: 1, shotsOff: 3, shotsPost: 1 })), 7);
  assert.equal(finishesOf(stats()), 0);
});

test("balance en pista: a favor a los 5 del gol propio, en contra a los del rival", () => {
  const b = onCourtBalance(m1);
  assert.deepEqual(b.get("a"), { favor: 3, contra: 0 });
  assert.deepEqual(b.get("b"), { favor: 2, contra: 1 });
  assert.equal(b.get("c"), undefined);
});

test("solo salen los convocados; el que no esta convocado no aparece", () => {
  const rows = playerMatchRows([m1]);
  assert.deepEqual(rows.map((r) => r.key).sort(), ["a", "b", "c"]);
  assert.equal(rows.find((r) => r.key === "c").played, false);
});

test("partido antiguo sin convocatoria: entra quien tuvo minutos o acciones, no el resto", () => {
  const rows = playerMatchRows([m2]);
  assert.deepEqual(rows.map((r) => r.name), ["Ana"]);
});

test("selectMatches: toda la temporada, ultimos N y un partido", () => {
  assert.deepEqual(selectMatches([m2, m1]).map((m) => m.rivalName), ["Lugo", "Vigo"]);
  assert.deepEqual(selectMatches([m1, m2], { mode: "last", count: 1 }).map((m) => m.rivalName), ["Vigo"]);
  assert.deepEqual(selectMatches([m1, m2], { mode: "match", date: m1.date }).map((m) => m.rivalName), ["Lugo"]);
  assert.deepEqual(selectMatches([m1, m2], { mode: "last", count: 0 }).length, 1);
});

test("el +/- solo cuenta partidos jugados y convocado-sin-jugar no tiene balance", () => {
  const t = seasonTable([m1]).find((p) => p.key === "c").total;
  assert.equal(t.matchesCalled, 1);
  assert.equal(t.matchesPlayed, 0);
  assert.equal(t.balance, 0);
  assert.equal(t.minutes, 0);
});

test("agregado de Ana: minutos, goles, efectividad y ritmo por 40'", () => {
  const ana = seasonTable([m1]).find((p) => p.key === "a").total;
  assert.equal(ana.seconds, 1500);
  assert.equal(ana.goals, 2);
  assert.equal(ana.finishes, 5); // 2 goles + 2 a puerta + 1 fuera
  assert.equal(ana.efficiency, 2 / 5);
  assert.equal(ana.balance, 3);
  assert.equal(ana.rateReliable, true);
  assert.equal(ana.rateLowSample, true);
  assert.ok(Math.abs(ana.rates.goals - (2 * 40 * 60) / 1500) < 1e-9);
});

test("con pocos minutos NO hay ritmo (null), nunca NaN ni extrapolacion", () => {
  const beto = seasonTable([m1]).find((p) => p.key === "b").total; // 900 s < 1200 s
  assert.ok(900 < MIN_RATE_SECONDS);
  assert.equal(beto.rateReliable, false);
  assert.equal(beto.rates.goals, null);
  assert.equal(beto.efficiency, null); // sin finalizaciones
  const vacio = aggregate([]);
  assert.equal(vacio.rates.goals, null);
  assert.equal(vacio.avgSeconds, 0);
  assert.ok(!Number.isNaN(vacio.minutes));
});

test("umbrales coherentes", () => {
  assert.ok(MIN_RATE_SECONDS < LOW_SAMPLE_SECONDS);
});

test("el mismo jugador en dos partidos (con y sin id) no se mezcla: criterio explicito por clave", () => {
  // Ana con id "a" en m1 y sin id en m2 -> claves "a" y "Ana#7": dos filas. Se avisa en la UI.
  const table = seasonTable([m1, m2]);
  assert.equal(table.filter((p) => p.name === "Ana").length, 2);
});

test("playerReport: serie cronologica y null si el jugador no esta en el periodo", () => {
  const r = playerReport([m2, m1], "a");
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].rival, "Lugo");
  assert.equal(r.series[0].result, "3-1");
  assert.equal(r.matchesInPeriod, 2);
  assert.equal(playerReport([m1], "zzz"), null);
  assert.equal(playerReport([m1, m2], "a", { mode: "last", count: 1 }), null); // el ultimo partido es m2, sin Ana con id
});

test("CSV de plantilla: BOM, ';' y coma decimal", () => {
  const csv = tableToCsv(seasonTable([m1]));
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 4); // cabecera + 3 convocados
  assert.ok(lines[0].includes('"jugador"'));
  assert.ok(lines[1].includes('"Ana"'));
  assert.ok(lines[1].includes(';"25";')); // 1500 s = 25 min, sin decimales inutiles
  const decimal = tableToCsv(seasonTable([{ ...m1, players: [row("a", "Ana", 7, { seconds: 1530 })] }]));
  assert.ok(decimal.includes('"25,5"')); // coma decimal para Excel en espanol
});

test("CSV de un jugador: una fila por partido", () => {
  const csv = seriesToCsv(playerReport([m1], "a"));
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes('"2026-10-01"'));
  assert.ok(lines[1].includes('"si"'));
});
