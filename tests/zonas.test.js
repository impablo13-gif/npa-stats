import test from "node:test";
import assert from "node:assert/strict";
import { collectZoneEvents, filterEvents, countByZone, playersOf, eventsToCsv, ZONE_KEYS } from "../src/zonas.js";

const match1 = {
  date: "2026-09-20T18:00:00.000Z", rivalName: "O Parrulo FS",
  zonedEvents: [
    { key: "shotsOn", zone: "ataque-centro", playerId: "p4", playerName: "Ana", playerNumber: 4, half: 1, remaining: 600 },
    { key: "shotsOff", zone: "ataque-izq", playerId: "p4", playerName: "Ana", playerNumber: 4, half: 2, remaining: 301 },
    { key: "recoveries", zone: "medio-centro", playerId: "p7", playerName: "Bea", playerNumber: 7, half: 1, remaining: 900 },
    { key: "turnovers", zone: null, playerId: "p7", playerName: "Bea", playerNumber: 7, half: 1, remaining: 800 },
  ],
  disciplineEvents: [
    { type: "fouls", zone: "def-der", playerId: "p7", playerName: "Bea", playerNumber: 7, half: 2, remaining: 120 },
    { type: "yellow", zone: null, playerId: "p7", playerName: "Bea", playerNumber: 7, half: 2, remaining: 100 },
  ],
  goalEvents: [
    { id: "g1", type: "for", zone: "ataque-centro", authorId: "p4", authorName: "Ana", half: 1, remaining: 500, onCourt: [{ id: "p4", name: "Ana", number: 4 }] },
    { id: "g2", type: "against", zone: null, half: 2, remaining: 200 },
    { id: "g3", type: "for", zone: null, authorId: "p7", authorName: "Bea", half: 2, remaining: 50, onCourt: [] },
  ],
};
const oldMatch = { date: "2026-08-01T18:00:00.000Z", rivalName: "Rival \"X\"" }; // partido antiguo sin ninguna lista

test("junta acciones, faltas y goles propios con zona; ignora tarjetas y goles rivales", () => {
  const { events, withoutZone } = collectZoneEvents([match1, oldMatch]);
  assert.deepEqual(events.map((e) => e.action).sort(), ["fouls", "goal", "recoveries", "shotsOff", "shotsOn"]);
  // se quedan fuera, y se cuentan: la perdida sin zona y el gol propio sin zona.
  // La amarilla y el gol rival no son acciones de zona: ni entran ni cuentan.
  assert.equal(withoutZone, 2);
});

test("el dorsal de un gol se saca del quinteto en pista", () => {
  const { events } = collectZoneEvents([match1]);
  const goal = events.find((e) => e.action === "goal");
  assert.equal(goal.playerNumber, 4);
  assert.equal(goal.playerName, "Ana");
});

test("filtra por accion, jugador, parte y partido", () => {
  const { events } = collectZoneEvents([match1]);
  assert.equal(filterEvents(events, { action: "finish" }).length, 3); // gol + tiro a puerta + tiro fuera
  assert.equal(filterEvents(events, { action: "shotsOn" }).length, 1);
  assert.equal(filterEvents(events, { action: "finish", playerKey: "p7" }).length, 0);
  assert.equal(filterEvents(events, { action: "finish", half: "2" }).length, 1);
  assert.equal(filterEvents(events, { action: "finish", half: "ot" }).length, 0);
  assert.equal(filterEvents(events, { action: "finish", matchDate: "otra" }).length, 0);
  assert.equal(filterEvents(events, { action: "inventada" }).length, 3); // cae en la accion por defecto
});

test("cuenta por zona y reparte porcentajes sin dividir por cero", () => {
  const { events } = collectZoneEvents([match1]);
  const c = countByZone(filterEvents(events, { action: "finish" }));
  assert.equal(c.total, 3);
  assert.equal(c.counts["ataque-centro"], 2);
  assert.equal(c.max, 2);
  assert.ok(Math.abs(c.share["ataque-centro"] - 2 / 3) < 1e-9);
  const empty = countByZone([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.max, 0);
  ZONE_KEYS.forEach((k) => { assert.equal(empty.share[k], 0); assert.equal(empty.counts[k], 0); });
});

test("lista de jugadores ordenada por dorsal, sin repetir", () => {
  const { events } = collectZoneEvents([match1]);
  assert.deepEqual(playersOf(events).map((p) => p.number), [4, 7]);
});

test("datos incompletos no rompen: sin listas, zona desconocida, tiempo ausente", () => {
  const rare = { date: "2026-10-01T10:00:00.000Z", zonedEvents: [{ key: "shotsOn", zone: "inventada", half: 1 }, { key: "recoveries", zone: "def-izq", playerName: "Sin id" }] };
  const { events, withoutZone } = collectZoneEvents([rare, {}, null].filter(Boolean));
  assert.equal(events.length, 1);
  assert.equal(withoutZone, 1);
  assert.equal(events[0].remaining, null);
  assert.equal(events[0].playerKey, "Sin id#?");
});

test("el CSV lleva BOM, separador ; , comillas escapadas y mm:ss", () => {
  const { events } = collectZoneEvents([match1]);
  const csv = eventsToCsv(filterEvents(events, { action: "shotsOn" }), { zoneLabel: (z) => `Z:${z}`, actionLabel: () => "Tiro a puerta" });
  assert.ok(csv.startsWith("﻿\"fecha\";\"rival\""));
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes("\"10:00\""));
  assert.ok(lines[1].includes("\"Z:ataque-centro\""));
  const quoted = eventsToCsv([{ matchDate: "2026-01-01T00:00:00.000Z", rival: 'Club "A"', half: 1, remaining: null, playerNumber: 1, playerName: "X", action: "goal", zone: "def-izq" }]);
  assert.ok(quoted.includes('"Club ""A"""'));
});

import { ZONES_FINE, ZONES_COARSE, ZONE_KEYS_FINE, ZONE_LABELS, toCoarseKey, isFineKey } from "../src/zonas.js";

test("hay 18 zonas finas (6 filas x 3 carriles) y 9 gruesas, sin claves repetidas", () => {
  assert.equal(ZONES_FINE.length, 18);
  assert.equal(ZONES_COARSE.length, 9);
  assert.equal(new Set(ZONE_KEYS_FINE).size, 18);
  assert.deepEqual([...new Set(ZONES_FINE.map((z) => z.row))], [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...new Set(ZONES_FINE.map((z) => z.col))], [0, 1, 2]);
  [...ZONES_FINE, ...ZONES_COARSE].forEach((z) => assert.ok(ZONE_LABELS[z.key], `falta etiqueta de ${z.key}`));
});

test("cada zona fina cae en la gruesa que la contiene, conservando el carril", () => {
  assert.equal(toCoarseKey("f1-izq"), "def-izq");
  assert.equal(toCoarseKey("f2-der"), "def-der");
  assert.equal(toCoarseKey("f3-centro"), "medio-centro");
  assert.equal(toCoarseKey("f4-izq"), "medio-izq");
  assert.equal(toCoarseKey("f5-der"), "ataque-der");
  assert.equal(toCoarseKey("f6-centro"), "ataque-centro");
  assert.equal(toCoarseKey("ataque-izq"), "ataque-izq"); // una gruesa se queda igual
  assert.equal(toCoarseKey("inventada"), "inventada");
  ZONES_FINE.forEach((z) => assert.ok(ZONES_COARSE.some((c) => c.key === toCoarseKey(z.key)), z.key));
});

const mixed = {
  date: "2026-10-10T18:00:00.000Z", rivalName: "Mixto",
  zonedEvents: [
    { key: "shotsOn", zone: "f6-centro", playerId: "p1", playerName: "A", playerNumber: 1, half: 1, remaining: 100 },
    { key: "shotsOn", zone: "f5-centro", playerId: "p1", playerName: "A", playerNumber: 1, half: 1, remaining: 90 },
    { key: "shotsOn", zone: "ataque-centro", playerId: "p1", playerName: "A", playerNumber: 1, half: 2, remaining: 80 }, // antiguo, 3x3
  ],
};

test("vista de 18 zonas: solo lo registrado en fino; lo antiguo se avisa como excluido", () => {
  const { events } = collectZoneEvents([mixed]);
  const c = countByZone(events, "fine");
  assert.equal(c.total, 2);
  assert.equal(c.excluded, 1);
  assert.equal(c.counts["f6-centro"], 1);
  assert.equal(c.counts["f5-centro"], 1);
  assert.equal(Object.keys(c.counts).length, 18);
  assert.ok(Math.abs(c.share["f6-centro"] - 0.5) < 1e-9);
});

test("vista de 9 zonas: junta lo fino con lo antiguo", () => {
  const { events } = collectZoneEvents([mixed]);
  const c = countByZone(events, "coarse");
  assert.equal(c.total, 3);
  assert.equal(c.excluded, 0);
  assert.equal(c.counts["ataque-centro"], 3); // f6 + f5 + el 3x3 antiguo
});

test("18 zonas sin datos: ceros, sin NaN", () => {
  const c = countByZone([], "fine");
  assert.equal(c.total, 0);
  assert.equal(c.max, 0);
  ZONE_KEYS_FINE.forEach((k) => { assert.equal(c.share[k], 0); });
});

test("el CSV lleva la clave de zona y la resolucion con la que se registro", () => {
  const { events } = collectZoneEvents([mixed]);
  const lines = eventsToCsv(events).split("\r\n");
  assert.ok(lines[0].endsWith('"zona";"zona_clave";"resolucion_zonas"'));
  assert.ok(lines[1].includes('"Ataque derecha"') === false);
  assert.ok(lines[1].includes('"Área rival centro";"f6-centro";"18 zonas"'));
  assert.ok(lines[3].includes('"ataque-centro";"9 zonas"'));
  assert.equal(isFineKey("f1-izq"), true);
  assert.equal(isFineKey("def-izq"), false);
});
