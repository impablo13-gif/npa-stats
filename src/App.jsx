import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Play, Pause, RotateCcw, Plus, Minus, X, Save,
  Shirt, ChevronRight, Trash2, History, ClipboardList,
  Target, Footprints, Shield, Hand, ArrowLeftRight, AlertTriangle, Camera, BarChart3, Users, Check, ZoomIn,
  Home, FileSpreadsheet, ArrowRight, Trophy, Settings, Star, Dumbbell, CheckCheck, Undo2, Clock3, MapPin,
  Maximize2, Minimize2, Download, RefreshCw, WifiOff,
} from "lucide-react";
import { storage, requestPersistence } from "./storage.js";

/* TOKENS — colores del escudo real del Noia Portus Apostoli FS:
   rojo (la daga/espada), negro (texto y balón) y blanco, sobre un fondo
   oscuro neutro para que se lea bien en pista. */
const T = {
  bg: "#0A0A0A",
  surface: "#161616",
  surface2: "#1F1F1F",
  surface3: "#2A2A2A",
  red: "#E63946",
  redDim: "#7A1620",
  white: "#F7F7F5",
  negative: "#8B2635",
  amber: "#E3B23C",
  text: "#F5F5F5",
  dim: "#9A9A9A",
  line: "rgba(245,245,245,0.10)",
};

const POSITIONS = ["POR", "CIE", "ALA", "PIV"];
const POS_LABEL = { POR: "Portero", CIE: "Cierre", ALA: "Ala", PIV: "Pívot" };

const DRAFT_VERSION = 1;
const matchDraftKey = (teamId) => `draft:match:${teamId}`;
const trainingDraftKey = (teamId) => `draft:training:${teamId}`;

const defaultRoster = () =>
  Array.from({ length: 22 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Jugador ${i + 1}`,
    number: i + 1,
    position: i < 2 ? "POR" : POSITIONS[1 + (i % 3)],
    isGK: i < 2,
    photo: null,
  }));

const emptyStats = () => ({
  seconds: 0, goals: 0, assists: 0, fouls: 0, yellow: 0, red: 0,
  saves: 0, turnovers: 0, recoveries: 0, shotsOn: 0, shotsOff: 0,
});
const STAT_KEYS = Object.keys(emptyStats());

// Todo se anota dentro de la parte en la que ocurrio: los totales del partido
// se calculan sumando las partes, nunca al reves. Asi el desglose por parte y
// el total no pueden acabar contando cosas distintas.
function sumHalves(statsByHalf, players) {
  const out = {};
  (players || []).forEach((p) => { out[p.id] = emptyStats(); });
  Object.values(statsByHalf || {}).forEach((halfMap) => {
    Object.entries(halfMap || {}).forEach(([id, s]) => {
      if (!out[id]) out[id] = emptyStats();
      STAT_KEYS.forEach((k) => { out[id][k] += s[k] || 0; });
    });
  });
  return out;
}

// Las partes a mostrar: siempre 1ª y 2ª (futbol sala), mas las prorrogas que
// existan si alguna vez se juegan.
function halvesPresent(statsByHalf, goalEvents) {
  const set = new Set([1, 2]);
  Object.keys(statsByHalf || {}).forEach((h) => set.add(Number(h)));
  (goalEvents || []).forEach((ev) => set.add(Number(ev.half) || 1));
  return [...set].filter((h) => h > 0).sort((a, b) => a - b);
}

const halfLabel = (h) => (h <= 2 ? `${h}ª parte` : `Prórroga ${h - 2}`);

function fmtClock(t) { const m = Math.floor(t / 60), s = t % 60; return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }
function fmtMin(t) { const m = Math.floor(t / 60), s = t % 60; return `${m}'${String(s).padStart(2, "0")}"`; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function Square({ size = 16, color = "currentColor" }) {
  return <div style={{ width: size * 0.62, height: size * 0.85, background: color, borderRadius: 2 }} />;
}

const STAT_DEFS = [
  { key: "goals", label: "Gol", icon: Target, color: T.red },
  { key: "assists", label: "Asistencia", icon: ArrowLeftRight, color: T.red },
  { key: "shotsOn", label: "Tiro a puerta", icon: Target, color: T.red },
  { key: "shotsOff", label: "Tiro fuera", icon: X, color: T.dim },
  { key: "recoveries", label: "Recuperación", icon: Shield, color: T.red },
  { key: "turnovers", label: "Pérdida", icon: Footprints, color: T.dim },
  { key: "fouls", label: "Falta", icon: AlertTriangle, color: T.negative },
  { key: "yellow", label: "Amarilla", icon: Square, color: T.amber },
  { key: "red", label: "Roja", icon: Square, color: T.negative },
];

// The bottom quick-action bar's "Acciones" button opens a picker of these.
const QUICK_STAT_ACTIONS = [
  { key: "shotsOn", label: "Tiro a puerta", icon: Target, color: T.red },
  { key: "shotsOff", label: "Tiro fuera", icon: X, color: T.dim },
  { key: "turnovers", label: "Pérdida", icon: Footprints, color: T.dim },
  { key: "recoveries", label: "Recuperación", icon: Shield, color: T.red },
  { key: "fouls", label: "Falta", icon: AlertTriangle, color: T.negative },
  { key: "assists", label: "Asistencia", icon: ArrowLeftRight, color: T.red },
  { key: "saves", label: "Parada", icon: Hand, color: T.red },
];

// The bottom bar's own dedicated "Tarjeta" button opens this separate, smaller picker.
const CARD_ACTIONS = [
  { key: "yellow", label: "Amarilla", icon: (p) => <Square {...p} />, color: T.amber },
  { key: "red", label: "Roja", icon: (p) => <Square {...p} />, color: T.negative },
];

// Every goal (a favor or en contra) must be tagged with exactly one of these — mandatory,
// no "skip" option — grouped and color-coded so the origin is readable at a glance.
const GOAL_PHASES = [
  { key: "ABP", label: "ABP", group: 1, color: "#8E5FD9" },
  { key: "Ataque Posicional", label: "Ataque Posicional", group: 2, color: T.red },
  { key: "Incorporación", label: "Incorporación", group: 2, color: T.red },
  { key: "Recuperación", label: "Recuperación", group: 3, color: "#2FBF87" },
  { key: "Transición", label: "Transición", group: 3, color: "#2FBF87" },
  { key: "5x4", label: "5x4", group: 4, color: "#3B82C4" },
  { key: "4x5", label: "4x5", group: 4, color: "#3B82C4" },
  { key: "4x3", label: "4x3", group: 5, color: "#E08A3C" },
  { key: "3x4", label: "3x4", group: 5, color: "#E08A3C" },
];

// Some browsers rotate the <img> preview to respect a photo's EXIF orientation tag but
// ignore that same tag when the pixels are later drawn onto a <canvas> — which is exactly
// what made the saved crop not match what was seen while framing it. Normalizing every
// picked photo through createImageBitmap's orientation-aware decoder once, up front, means
// the crop editor and the final save always work from the same, already-corrected pixels.
async function fileToDataUrl(file) {
  try {
    if (window.createImageBitmap) {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.92);
    }
  } catch (e) { /* fall through to the raw read below */ }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

/* Excel export ------------------------------------------------------ */

// Excel rechaza los nombres de hoja con : \ / ? * [ ] y los de mas de 31
// caracteres. El nombre del rival entra tal cual en el nombre de la hoja, asi
// que un rival como "C.D. Pepe/Juan" tumbaba la exportacion entera.
function sanitizeSheetName(name) {
  return String(name || "").replace(/[:\\/?*[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 31);
}

// Dos partidos el mismo dia (torneos, por ejemplo) generaban dos hojas con el
// mismo nombre y XLSX aborta al encontrar la repetida.
function uniqueSheetName(wb, desired, fallback) {
  const base = sanitizeSheetName(desired) || sanitizeSheetName(fallback) || "Hoja";
  if (!wb.SheetNames.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    const suffix = ` (${i})`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!wb.SheetNames.includes(candidate)) return candidate;
  }
  return base.slice(0, 27) + Math.floor(Math.random() * 1000);
}

function addSheet(wb, rows, desiredName, fallback) {
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), uniqueSheetName(wb, desiredName, fallback));
}

// Los nombres de archivo tampoco admiten \ / : * ? " < > |
function sanitizeFileName(name) {
  return String(name || "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "").slice(0, 60);
}

const dateLabelOf = (iso) => new Date(iso).toLocaleDateString("es-ES").replace(/\//g, "-");

// Un jugador con solo una asistencia se quedaba fuera de todas las
// exportaciones, porque las asistencias faltaban en este filtro.
const hasActivity = (p) =>
  p.seconds > 0 || p.goals || p.assists || p.fouls || p.yellow || p.red ||
  p.saves || p.recoveries || p.turnovers || p.shotsOn || p.shotsOff;

const playerRow = (p) => ({
  Dorsal: p.number, Jugador: p.name, Posición: p.position,
  Minutos: fmtMin(p.seconds), "Segundos jugados": p.seconds,
  Goles: p.goals || 0, Asistencias: p.assists || 0,
  "Tiros a puerta": p.shotsOn || 0, "Tiros fuera": p.shotsOff || 0,
  Faltas: p.fouls || 0, Amarillas: p.yellow || 0, Rojas: p.red || 0, Paradas: p.saves || 0,
  Recuperaciones: p.recoveries || 0, Pérdidas: p.turnovers || 0,
});

const goalRowsOf = (match) => (match.goalEvents || []).map((ev) => ({
  Parte: ev.half,
  "Tiempo restante": fmtClock(ev.remaining !== undefined ? ev.remaining : ev.seconds),
  Tipo: ev.type === "for" ? "A favor" : "En contra",
  Autor: ev.authorName || "",
  Fase: ev.phase,
  "Jugadores en pista": (ev.onCourt || []).map((p) => `#${p.number} ${p.name}`).join(", "),
}));

// Marcador de una parte concreta, para poder leer de un vistazo en que mitad
// se decidio el partido.
function halfScore(match, half) {
  const evs = (match.goalEvents || []).filter((ev) => Number(ev.half) === Number(half));
  return { favor: evs.filter((e) => e.type === "for").length, contra: evs.filter((e) => e.type !== "for").length };
}

/* Un partido guardado lleva `halves`: el desglose de cada parte por separado.
   Los partidos guardados antes de existir ese desglose solo tienen el total,
   y entonces estas funciones simplemente no generan las hojas por parte. */
const halvesOf = (match) => (Array.isArray(match.halves) ? match.halves : []);

function exportClubDataToExcel(matches, trainings, teamName) {
  if (!matches.length && !trainings.length) return;
  const wb = XLSX.utils.book_new();

  if (matches.length) {
    const summaryRows = matches.map((m) => {
      const h1 = halfScore(m, 1), h2 = halfScore(m, 2);
      return {
        Fecha: new Date(m.date).toLocaleDateString("es-ES"),
        Hora: m.startTime || "",
        Pabellón: m.venue || "",
        Rival: m.rivalName,
        [teamName || "Equipo"]: m.teamGoals,
        "Goles rival": m.rivalScore,
        "1ª parte": `${h1.favor}-${h1.contra}`,
        "2ª parte": `${h2.favor}-${h2.contra}`,
        "Ocasiones a favor": m.occFor,
        "Ocasiones en contra": m.occAgainst,
        "Duración parte (min)": m.halfLength,
      };
    });
    addSheet(wb, summaryRows, "Resumen partidos");

    matches.forEach((m, idx) => {
      const dateLabel = dateLabelOf(m.date);
      const rows = m.players.filter(hasActivity).map(playerRow);
      addSheet(wb, rows, `P ${dateLabel}${m.rivalName ? " vs " + m.rivalName : ""}`, `Partido ${idx + 1}`);

      // Una sola hoja por partido con las partes apiladas: separarlas en varias
      // hojas dispararia el numero de pestañas de una temporada entera.
      const byHalfRows = [];
      halvesOf(m).forEach((h) => {
        h.players.filter(hasActivity).forEach((p) => byHalfRows.push({ Parte: h.half, ...playerRow(p) }));
      });
      if (byHalfRows.length) addSheet(wb, byHalfRows, `Partes ${dateLabel}`, `Partes ${idx + 1}`);

      const goalRows = goalRowsOf(m);
      if (goalRows.length) addSheet(wb, goalRows, `G ${dateLabel}`, `Goles ${idx + 1}`);
    });
  }

  if (trainings.length) {
    const trainingSummaryRows = trainings.map((t) => ({
      Fecha: new Date(t.date).toLocaleDateString("es-ES"),
      "Duración sesión": fmtMin(t.durationSeconds),
      "Jugadores con actividad": t.players.filter((p) => p.seconds > 0).length,
    }));
    addSheet(wb, trainingSummaryRows, "Resumen entrenos");

    trainings.forEach((t, idx) => {
      const rows = t.players
        .filter((p) => p.seconds > 0)
        .map((p) => ({
          Dorsal: p.number, Jugador: p.name, Posición: p.position,
          "Tiempo activo": fmtMin(p.seconds), "Segundos activo": p.seconds,
        }));
      addSheet(wb, rows, `E ${dateLabelOf(t.date)}`, `Entreno ${idx + 1}`);
    });
  }

  XLSX.writeFile(wb, `${sanitizeFileName(teamName) || "equipo"}_estadisticas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportSingleMatchToExcel(match, teamName) {
  const wb = XLSX.utils.book_new();
  const h1 = halfScore(match, 1), h2 = halfScore(match, 2);
  const summary = [{
    Fecha: new Date(match.date).toLocaleDateString("es-ES"),
    Hora: match.startTime || "",
    Pabellón: match.venue || "",
    Rival: match.rivalName,
    [teamName || "Equipo"]: match.teamGoals,
    "Goles rival": match.rivalScore,
    "1ª parte": `${h1.favor}-${h1.contra}`,
    "2ª parte": `${h2.favor}-${h2.contra}`,
    "Ocasiones a favor": match.occFor,
    "Ocasiones en contra": match.occAgainst,
    "Duración parte (min)": match.halfLength,
  }];
  addSheet(wb, summary, "Resumen");

  addSheet(wb, match.players.filter(hasActivity).map(playerRow), "Total partido");

  // Una hoja por parte, que es como se analiza despues: que paso en la primera
  // y que paso en la segunda.
  halvesOf(match).forEach((h) => {
    const rows = h.players.filter(hasActivity).map(playerRow);
    if (rows.length) addSheet(wb, rows, halfLabel(h.half), `Parte ${h.half}`);
  });

  const goalRows = goalRowsOf(match);
  if (goalRows.length) addSheet(wb, goalRows, "Goles");

  if ((match.convocados || []).length) {
    addSheet(wb, match.convocados.map((p) => ({ Dorsal: p.number, Jugador: p.name })), "Convocatoria");
  }

  const dateLabel = dateLabelOf(match.date);
  const rivalLabel = sanitizeFileName(match.rivalName) || "rival";
  XLSX.writeFile(wb, `${sanitizeFileName(teamName) || "equipo"}_${dateLabel}_vs_${rivalLabel}.xlsx`);
}

// No hay librería de PDF empaquetada, así que esto monta un informe listo para
// imprimir y abre el diálogo del navegador — eligiendo "Guardar como PDF" ahí
// sale el PDF. Funciona igual sin conexión, porque no descarga nada.
function printMatchReport(match, teamName) {
  const dateStr = new Date(match.date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });

  // Los nombres los escribe el usuario: un "<" en el nombre de un jugador o de
  // un rival rompia el informe entero al inyectarse crudo en el HTML.
  const esc = (v) => String(v === undefined || v === null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const COLS = 14;
  const tableFor = (players) => {
    const rowsHtml = players.filter(hasActivity).map((p) => `<tr>
        <td>${esc(p.number)}</td><td>${esc(p.name)}</td><td>${esc(p.position)}</td><td>${fmtMin(p.seconds)}</td>
        <td>${p.goals || 0}</td><td>${p.assists || 0}</td><td>${p.shotsOn || 0}</td><td>${p.shotsOff || 0}</td>
        <td>${p.fouls || 0}</td><td>${p.yellow || 0}</td><td>${p.red || 0}</td><td>${p.saves || 0}</td>
        <td>${p.recoveries || 0}</td><td>${p.turnovers || 0}</td>
      </tr>`).join("");
    return `<table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:6px;">
        <thead>
          <tr style="text-align:left; border-bottom:2px solid #333;">
            <th style="padding:4px;">#</th><th style="padding:4px;">Jugador</th><th style="padding:4px;">Pos</th><th style="padding:4px;">Min</th>
            <th style="padding:4px;">G</th><th style="padding:4px;">A</th><th style="padding:4px;">TP</th><th style="padding:4px;">TF</th>
            <th style="padding:4px;">F</th><th style="padding:4px;">TA</th><th style="padding:4px;">TR</th><th style="padding:4px;">Par</th>
            <th style="padding:4px;">Rec</th><th style="padding:4px;">Pér</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="${COLS}" style="padding:8px; color:#888;">Sin acciones registradas</td></tr>`}</tbody>
      </table>`;
  };

  const sectionTitle = (text, sub) =>
    `<h3 style="font-size:13px; margin:18px 0 6px; padding-bottom:3px; border-bottom:1px solid #bbb;">${esc(text)}${
      sub ? ` <span style="font-weight:400; color:#666; font-size:11px;">${esc(sub)}</span>` : ""
    }</h3>`;

  const halvesHtml = halvesOf(match).map((h) => {
    const sc = halfScore(match, h.half);
    return sectionTitle(halfLabel(h.half), `${sc.favor}-${sc.contra}`) + tableFor(h.players);
  }).join("");

  const goals = match.goalEvents || [];
  const goalsHtml = !goals.length ? "" : sectionTitle("Goles") +
    `<table style="width:100%; border-collapse:collapse; font-size:11px;">
      <thead><tr style="text-align:left; border-bottom:2px solid #333;">
        <th style="padding:4px;">Parte</th><th style="padding:4px;">Restante</th><th style="padding:4px;">Tipo</th>
        <th style="padding:4px;">Autor</th><th style="padding:4px;">Fase</th><th style="padding:4px;">En pista</th>
      </tr></thead>
      <tbody>${goals.map((ev) => `<tr>
        <td style="padding:3px 4px;">${esc(ev.half)}ª</td>
        <td style="padding:3px 4px;">${fmtClock(ev.remaining !== undefined ? ev.remaining : ev.seconds)}</td>
        <td style="padding:3px 4px;">${ev.type === "for" ? "A favor" : "En contra"}</td>
        <td style="padding:3px 4px;">${esc(ev.authorName || "—")}</td>
        <td style="padding:3px 4px;">${esc(ev.phase)}</td>
        <td style="padding:3px 4px; color:#555;">${esc((ev.onCourt || []).map((p) => `#${p.number} ${p.name}`).join(", "))}</td>
      </tr>`).join("")}</tbody>
    </table>`;

  const sc1 = halfScore(match, 1), sc2 = halfScore(match, 2);

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#111; padding:24px;">
      <h1 style="font-size:20px; margin:0 0 4px;">${esc(teamName || "Equipo")}</h1>
      <div style="font-size:12px; color:#555; margin-bottom:16px;">
        ${esc(dateStr)}${match.startTime ? " · Inicio: " + esc(match.startTime) : ""}${match.venue ? " · " + esc(match.venue) : ""}
      </div>
      <h2 style="font-size:16px; margin:0 0 10px;">${esc(teamName || "Equipo")} ${esc(match.teamGoals)} — ${esc(match.rivalScore)} ${esc(match.rivalName || "")}</h2>
      <div style="font-size:12px; margin-bottom:16px; color:#333;">
        1ª parte: ${sc1.favor}-${sc1.contra} · 2ª parte: ${sc2.favor}-${sc2.contra}<br/>
        Ocasiones a favor: ${esc(match.occFor)} · Ocasiones en contra: ${esc(match.occAgainst)} · Duración parte: ${esc(match.halfLength)} min
      </div>
      ${halvesHtml}
      ${sectionTitle("Total del partido")}
      ${tableFor(match.players)}
      ${goalsHtml}
    </div>`;

  let container = document.getElementById("print-match-report");
  if (!container) {
    container = document.createElement("div");
    container.id = "print-match-report";
    document.body.appendChild(container);
  }
  container.innerHTML = html;

  if (!document.getElementById("print-match-report-style")) {
    const style = document.createElement("style");
    style.id = "print-match-report-style";
    style.innerHTML = `
      @media screen { #print-match-report { display: none; } }
      @media print {
        body * { visibility: hidden !important; }
        #print-match-report, #print-match-report * { visibility: visible !important; }
        #print-match-report { position: absolute; top: 0; left: 0; width: 100%; }
      }
    `;
    document.head.appendChild(style);
  }

  setTimeout(() => { try { window.print(); } catch (e) {} }, 300);
}

/* Avatars ------------------------------------------------------------ */
function Avatar({ player, size = 44, onClick }) {
  if (player.photo) {
    return <img src={player.photo} alt="" onClick={onClick} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: `2px solid ${T.line}`, flexShrink: 0, cursor: onClick ? "pointer" : "default" }} />;
  }
  return (
    <div onClick={onClick} style={{ width: size, height: size, borderRadius: "50%", background: T.surface3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `2px solid ${T.line}`, cursor: onClick ? "pointer" : "default" }}>
      <span className="oswald" style={{ fontSize: size * 0.38, fontWeight: 700, color: T.dim }}>{player.number}</span>
    </div>
  );
}

function EditableAvatar({ player, size = 48, onNewFile, onReframe, onRemove }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onNewFile(f);
  };
  return (
    <div
      style={{ position: "relative", flexShrink: 0, borderRadius: "50%", outline: dragOver ? `3px solid ${T.red}` : "none", outlineOffset: 2 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <Avatar player={player} size={size} onClick={player.photo ? onReframe : () => inputRef.current && inputRef.current.click()} />
      <button onClick={() => inputRef.current && inputRef.current.click()} style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%", background: T.red, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.surface}`, cursor: "pointer" }} title="Elegir otra foto">
        <Camera size={10} color="#0A0A0A" />
      </button>
      {player.photo && (
        <button onClick={onRemove} style={{ position: "absolute", top: -4, left: -4, width: 18, height: 18, borderRadius: "50%", background: T.negative, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.surface}`, cursor: "pointer" }} title="Quitar foto">
          <X size={10} color="#0A0A0A" />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { onNewFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}

/* square crest badge — used for both "own" and rival, always square so they line up */
function CrestAvatar({ crest, size = 44, onPick, onReframe, onRemove, shape = "square" }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const radius = shape === "circle" ? "50%" : 10;
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onPick(f);
  };
  return (
    <div
      style={{ position: "relative", flexShrink: 0, borderRadius: radius, outline: dragOver ? `3px solid ${T.red}` : "none", outlineOffset: 2 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div onClick={crest ? onReframe : () => inputRef.current && inputRef.current.click()} style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", background: T.surface3, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.line}`, cursor: "pointer" }} title={crest ? "Encuadrar escudo" : "Añadir escudo"}>
        {crest ? <img src={crest} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Shield size={size * 0.5} color={T.red} />}
      </div>
      <button onClick={() => inputRef.current && inputRef.current.click()} style={{ position: "absolute", bottom: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: T.red, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.surface}`, cursor: "pointer" }} title="Elegir escudo">
        <Camera size={8} color="#0A0A0A" />
      </button>
      {crest && (
        <button onClick={onRemove} style={{ position: "absolute", top: -4, left: -4, width: 14, height: 14, borderRadius: "50%", background: T.negative, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.surface}`, cursor: "pointer" }} title="Quitar escudo">
          <X size={8} color="#0A0A0A" />
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { onPick(e.target.files && e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}

/* Photo framer — native pointer listeners, re-attached once the image container actually mounts */
function PhotoCropEditor({ src, onCancel, onSave }) {
  const containerSize = 260;
  const outputSize = 320;
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1.3);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imgElRef = useRef(null);
  const boundsRef = useRef({ minX: 0, minY: 0 });
  const dragState = useRef({ dragging: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgElRef.current = img;
      const baseScale = containerSize / Math.min(img.naturalWidth, img.naturalHeight);
      const z = 1.3;
      const w = img.naturalWidth * baseScale * z, h = img.naturalHeight * baseScale * z;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(z);
      setOffset({ x: -(w - containerSize) / 2, y: -(h - containerSize) / 2 });
    };
    img.src = src;
  }, [src]);

  const baseScale = natural ? containerSize / Math.min(natural.w, natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : 0;
  const dispH = natural ? natural.h * scale : 0;
  boundsRef.current = { minX: -(dispW - containerSize), minY: -(dispH - containerSize) };

  // Callback ref: React calls this the instant the draggable div is actually created in
  // the DOM (and again with null when it's removed). Uses unified Pointer Events with
  // setPointerCapture — one consistent event stream per finger/mouse, captured to this
  // element specifically, so there's no risk of touch and mouse events double-firing
  // on hybrid touchscreen devices (a common cause of "drag feels broken").
  const dragCleanupRef = useRef(null);
  const attachContainer = useCallback((node) => {
    if (dragCleanupRef.current) { dragCleanupRef.current(); dragCleanupRef.current = null; }
    if (!node) return;
    const down = (e) => {
      dragState.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
    };
    const move = (e) => {
      if (!dragState.current.dragging) return;
      const dx = e.clientX - dragState.current.lastX, dy = e.clientY - dragState.current.lastY;
      dragState.current.lastX = e.clientX; dragState.current.lastY = e.clientY;
      const { minX, minY } = boundsRef.current;
      setOffset((o) => ({ x: clamp(o.x + dx, minX, 0), y: clamp(o.y + dy, minY, 0) }));
    };
    const up = (e) => {
      dragState.current.dragging = false;
      try { node.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    dragCleanupRef.current = () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
    };
  }, []);

  if (!natural) {
    return <div style={overlayStyle}><div style={{ ...modalCard, maxWidth: 320, textAlign: "center", color: T.dim }}>Cargando imagen…</div></div>;
  }

  const changeZoom = (val) => {
    const z = Number(val);
    setZoom(z);
    const s = baseScale * z;
    const w = natural.w * s, h = natural.h * s;
    setOffset((o) => ({ x: clamp(o.x, -(w - containerSize), 0), y: clamp(o.y, -(h - containerSize), 0) }));
  };

  const save = () => {
    const factor = outputSize / containerSize;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize; canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgElRef.current, offset.x * factor, offset.y * factor, dispW * factor, dispH * factor);
    onSave(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={{ ...modalCard, maxWidth: 340, textAlign: "center" }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div className="oswald" style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Encuadrar foto</div>
        <div style={{ fontSize: 12, color: T.dim, marginBottom: 14 }}>Arrastra con el dedo para moverla</div>

        <div ref={attachContainer} style={{ width: containerSize, height: containerSize, borderRadius: "50%", overflow: "hidden", margin: "0 auto", position: "relative", background: T.surface3, border: `2px solid ${T.red}`, touchAction: "none", cursor: "grab", userSelect: "none" }}>
          <img src={src} alt="" draggable={false} style={{ position: "absolute", left: offset.x, top: offset.y, width: dispW, height: dispH, userSelect: "none", pointerEvents: "none" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "0 8px" }}>
          <ZoomIn size={16} color={T.dim} />
          <input type="range" min="1" max="3.5" step="0.01" value={zoom} onChange={(e) => changeZoom(e.target.value)} style={{ flex: 1, accentColor: T.red }} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={onCancel} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}>Cancelar</button>
          <button onClick={save} style={{ ...bigBtn, flex: 1, justifyContent: "center", background: T.red, color: "#0A0A0A" }}><Check size={15} /> Guardar encuadre</button>
        </div>
      </div>
    </div>
  );
}

function EditableText({ value, onChange, onBlurCommit, className, style, placeholder }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlurCommit}
      className={className}
      style={{ background: "transparent", border: "none", borderBottom: "1px dashed transparent", outline: "none", padding: 0, ...style }}
      onFocus={(e) => (e.target.style.borderBottom = `1px dashed ${T.dim}`)}
    />
  );
}

/* ==================================================================== */

const newTeam = (name) => ({ id: `team-${Date.now()}-${Math.floor(Math.random() * 1000)}`, name: name || "Nuevo equipo", subtitle: "", crest: null });

const isStandaloneApp = () => {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch (e) { return false; }
};

export default function App() {
  const [view, setView] = useState("inicio");
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [teamManagerOpen, setTeamManagerOpen] = useState(false);

  const [players, setPlayers] = useState([]);
  const [onCourt, setOnCourt] = useState([]);
  // Cada accion y cada segundo se anotan en la parte en la que ocurren:
  // { 1: { jugadorId: stats }, 2: { ... } }. El total del partido se calcula
  // sumando las partes, mas abajo.
  const [statsByHalf, setStatsByHalf] = useState({});
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [half, setHalf] = useState(1);
  const [halfLength, setHalfLength] = useState(20);
  const [rivalName, setRivalName] = useState("Rival");
  const [venue, setVenue] = useState("");
  const [matchStartTime, setMatchStartTime] = useState(null);
  const [rivalScore, setRivalScore] = useState(0);
  const [rivalCrest, setRivalCrest] = useState(null);
  const [occFor, setOccFor] = useState(0);
  const [occAgainst, setOccAgainst] = useState(0);
  const [statPlayer, setStatPlayer] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const [savedMatches, setSavedMatches] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // { key, label } | null
  const [actionsPopoverOpen, setActionsPopoverOpen] = useState(false);
  const [cardsPopoverOpen, setCardsPopoverOpen] = useState(false);
  const [subPickerFor, setSubPickerFor] = useState(null); // bench player object awaiting a substitution choice
  const [goalWizard, setGoalWizard] = useState(null); // { type: 'for'|'against', authorId, authorName } — mid-flow goal registration
  const [convocados, setConvocados] = useState(null); // null = not set yet (show everyone); array of player ids once chosen
  const [convocatoriaMode, setConvocatoriaMode] = useState(null); // 'nuevo' | 'editar' | null
  const [goalEvents, setGoalEvents] = useState([]); // additive historical log: every goal with author/phase/on-court snapshot
  const [lastGoalEvent, setLastGoalEvent] = useState(null); // { id, type, authorId } of the most recent goal, for "Deshacer"
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState(null); // { kind: 'player'|'teamCrest'|'rivalCrest', id, src }
  const [pendingDrafts, setPendingDrafts] = useState(null); // { match?, training? } sesiones sin cerrar encontradas al abrir
  const [installPrompt, setInstallPrompt] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [standalone] = useState(isStandaloneApp);

  const [trainingRunning, setTrainingRunning] = useState(false);
  const [trainingSeconds, setTrainingSeconds] = useState(0);
  const [trainingActive, setTrainingActive] = useState([]);
  const [trainingStats, setTrainingStats] = useState({});
  const [savedTrainings, setSavedTrainings] = useState([]);
  const [confirmEndTraining, setConfirmEndTraining] = useState(false);
  const [historySubTab, setHistorySubTab] = useState("partidos");

  const toastTimer = useRef(null);

  // Totales del partido = suma de las partes. Una sola fuente de verdad, para
  // que el desglose y el total no puedan discrepar.
  const stats = useMemo(() => sumHalves(statsByHalf, players), [statsByHalf, players]);

  const activeTeam = teams.find((t) => t.id === activeTeamId) || { id: null, name: "Mi equipo", subtitle: "", crest: null };

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  /* ---------------------------------------------------------------- */
  /* RELOJ                                                             */
  /*                                                                   */
  /* El tiempo no se cuenta sumando "un segundo por cada tic": los     */
  /* navegadores de tablet frenan o congelan los temporizadores cuando */
  /* la pantalla se apaga o se cambia de app, y así los minutos        */
  /* jugados salían cortos. Aquí cada actualización mira el reloj real */
  /* del sistema y reparte los segundos que hayan pasado de verdad,    */
  /* aunque hayan sido 40 de golpe al volver a la app.                 */
  /*                                                                   */
  /* Además, al vivir el contador en refs y no en las dependencias del */
  /* efecto, cambiar el quinteto ya no reinicia el intervalo — que era */
  /* lo que hacía perder hasta un segundo en cada sustitución.         */
  /* ---------------------------------------------------------------- */
  const runningRef = useRef(false);
  const onCourtRef = useRef([]);
  const secondsRef = useRef(0);
  const halfLenRef = useRef(20);
  const halfRef = useRef(1); // parte en curso: a ella se imputan segundos y acciones
  const anchorRef = useRef(null); // instante real del último reparto de tiempo

  const trainingRunningRef = useRef(false);
  const trainingActiveRef = useRef([]);
  const trainingAnchorRef = useRef(null);

  useEffect(() => { onCourtRef.current = onCourt; }, [onCourt]);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);
  useEffect(() => { halfLenRef.current = halfLength; }, [halfLength]);
  useEffect(() => { halfRef.current = half; }, [half]);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { trainingActiveRef.current = trainingActive; }, [trainingActive]);
  useEffect(() => { trainingRunningRef.current = trainingRunning; }, [trainingRunning]);

  // Reparte el tiempo transcurrido desde el último reparto entre el reloj del
  // partido y los jugadores que estaban en pista durante ese intervalo.
  const commitTime = useCallback(() => {
    const now = Date.now();
    if (!runningRef.current || anchorRef.current == null) { anchorRef.current = now; return; }
    const whole = Math.floor((now - anchorRef.current) / 1000);
    if (whole <= 0) return;
    anchorRef.current += whole * 1000; // conserva la fracción de segundo sobrante

    const total = Math.max(1, halfLenRef.current * 60);
    const allowed = Math.max(0, Math.min(whole, total - secondsRef.current));

    if (allowed > 0) {
      secondsRef.current += allowed;
      setSeconds(secondsRef.current);
      const ids = onCourtRef.current;
      if (ids.length) {
        const h = halfRef.current;
        setStatsByHalf((prev) => {
          const halfMap = { ...(prev[h] || {}) };
          ids.forEach((id) => {
            const cur = halfMap[id] || emptyStats();
            halfMap[id] = { ...cur, seconds: cur.seconds + allowed };
          });
          return { ...prev, [h]: halfMap };
        });
      }
    }

    if (secondsRef.current >= total) {
      runningRef.current = false;
      anchorRef.current = null;
      setRunning(false);
      showToast("Fin de la parte");
    }
  }, [showToast]);

  // Único punto donde arranca o para el reloj: siempre liquida antes lo que
  // llevaba corrido, para que ni un segundo se quede sin asignar.
  const setClockRunning = useCallback((next) => {
    commitTime();
    runningRef.current = next;
    anchorRef.current = next ? Date.now() : null;
    setRunning(next);
  }, [commitTime]);

  const commitTrainingTime = useCallback(() => {
    const now = Date.now();
    if (!trainingRunningRef.current || trainingAnchorRef.current == null) { trainingAnchorRef.current = now; return; }
    const whole = Math.floor((now - trainingAnchorRef.current) / 1000);
    if (whole <= 0) return;
    trainingAnchorRef.current += whole * 1000;
    setTrainingSeconds((s) => s + whole);
    const ids = trainingActiveRef.current;
    if (ids.length) {
      setTrainingStats((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          const cur = next[id] || { seconds: 0 };
          next[id] = { seconds: cur.seconds + whole };
        });
        return next;
      });
    }
  }, []);

  const setTrainingClockRunning = useCallback((next) => {
    commitTrainingTime();
    trainingRunningRef.current = next;
    trainingAnchorRef.current = next ? Date.now() : null;
    setTrainingRunning(next);
  }, [commitTrainingTime]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(commitTime, 500);
    return () => clearInterval(id);
  }, [running, commitTime]);

  useEffect(() => {
    if (!trainingRunning) return;
    const id = setInterval(commitTrainingTime, 500);
    return () => clearInterval(id);
  }, [trainingRunning, commitTrainingTime]);

  /* ---------------------------------------------------------------- */
  /* GUARDADO DEL PARTIDO EN CURSO                                     */
  /*                                                                   */
  /* Antes, si se recargaba la página o el navegador cerraba la pestaña*/
  /* para liberar memoria, se perdía el partido entero. Ahora hay una  */
  /* copia continua en el dispositivo: cada 5 s, y de inmediato cada   */
  /* vez que la app pasa a segundo plano o se cierra.                  */
  /* ---------------------------------------------------------------- */
  const matchInProgress =
    convocados !== null || seconds > 0 || rivalScore > 0 || goalEvents.length > 0 || occFor > 0 || occAgainst > 0;
  const trainingInProgress = trainingSeconds > 0;

  const draftRef = useRef({ match: null, training: null, teamId: null });
  draftRef.current = {
    teamId: activeTeamId,
    match: matchInProgress
      ? {
          v: DRAFT_VERSION, savedAt: new Date().toISOString(),
          seconds, half, halfLength, rivalName, rivalScore, rivalCrest, venue, matchStartTime,
          occFor, occAgainst, onCourt, convocados, goalEvents, statsByHalf,
        }
      : null,
    training: trainingInProgress
      ? { v: DRAFT_VERSION, savedAt: new Date().toISOString(), trainingSeconds, trainingActive, trainingStats }
      : null,
  };

  // Se congela mientras se cambia de equipo o se cierra un partido: en esos
  // instantes el estado en pantalla y el equipo activo pueden no corresponderse,
  // y un guardado automatico ahi dejaria un borrador falso.
  const autosaveSuspended = useRef(false);

  const saveDraftNow = useCallback(async () => {
    if (autosaveSuspended.current) return;
    const { teamId, match, training } = draftRef.current;
    if (!teamId) return;
    try {
      if (match) await storage.set(matchDraftKey(teamId), JSON.stringify(match));
      if (training) await storage.set(trainingDraftKey(teamId), JSON.stringify(training));
    } catch (e) { /* sin espacio o almacenamiento bloqueado: se reintenta en 5 s */ }
  }, []);

  const clearMatchDraft = useCallback(async (teamId) => {
    try { await storage.del(matchDraftKey(teamId)); } catch (e) {}
  }, []);
  const clearTrainingDraft = useCallback(async (teamId) => {
    try { await storage.del(trainingDraftKey(teamId)); } catch (e) {}
  }, []);

  useEffect(() => {
    if (loading) return;
    const id = setInterval(() => { saveDraftNow(); }, 5000);
    return () => clearInterval(id);
  }, [loading, saveDraftNow]);

  // Al minimizar, bloquear la tablet o cerrar la app: cerrar el reloj y guardar
  // al instante. `pagehide` es el único evento fiable para esto en iOS.
  useEffect(() => {
    const onHide = () => {
      commitTime();
      commitTrainingTime();
      saveDraftNow();
    };
    const onVisibility = () => {
      commitTime();
      commitTrainingTime();
      if (document.visibilityState === "hidden") saveDraftNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [commitTime, commitTrainingTime, saveDraftNow]);

  /* ---- instalación y actualizaciones de la PWA ---- */
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); };
    const onUpdate = () => setUpdateReady(true);
    const onInstalled = () => { setInstallPrompt(null); showToast("App instalada — ya funciona sin conexión"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("npa:update-ready", onUpdate);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("npa:update-ready", onUpdate);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [showToast]);

  const doInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try { await installPrompt.userChoice; } catch (e) {}
    setInstallPrompt(null);
  };

  // Solo se aplica desde Inicio y con el reloj parado: nunca en mitad de un partido.
  const applyUpdate = () => {
    if (running || trainingRunning) { showToast("Para el reloj antes de actualizar"); return; }
    saveDraftNow().finally(() => window.dispatchEvent(new CustomEvent("npa:apply-update")));
  };

  // Keep our fullscreen state in sync if the person exits via Esc / browser chrome.
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const iosTipShown = useRef(false);
  const toggleFullscreen = async () => {
    // Instalada en la pantalla de inicio, la app ya se abre sin barra del
    // navegador. Este botón solo aporta algo mientras se use desde el navegador:
    // estira el diseño a toda la pantalla disponible.
    const turningOn = !isFullscreen;
    setIsFullscreen(turningOn);
    if (turningOn && !standalone && !iosTipShown.current && /iPad|iPhone/.test(navigator.userAgent || "")) {
      iosTipShown.current = true;
      showToast("Para quitar también la barra de Safari: Compartir → Añadir a pantalla de inicio");
    }
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (document.exitFullscreen) await document.exitFullscreen();
    } catch (e) { /* no disponible en este navegador — el diseño ampliado sigue aplicándose */ }
  };

  const persistTeams = useCallback(async (list) => {
    try { await storage.set("teams", JSON.stringify(list)); } catch (e) {}
  }, []);

  const loadRosterFor = useCallback(async (teamId) => {
    let list = null;
    try {
      const r = await storage.get(`roster:${teamId}`);
      if (r && r.value) { const parsed = JSON.parse(r.value); if (Array.isArray(parsed) && parsed.length) list = parsed; }
    } catch (e) {}
    if (!list) list = defaultRoster();
    setPlayers(list);
    const startingFive = list.slice(0, 5).map((p) => p.id);
    setOnCourt(startingFive);
    onCourtRef.current = startingFive;
    setStatsByHalf({});
    setTrainingActive(list.map((p) => p.id));
    const ts = {}; list.forEach((p) => (ts[p.id] = { seconds: 0 }));
    setTrainingStats(ts);
    return list;
  }, []);

  const loadHistoryFor = useCallback(async (teamId) => {
    try {
      const list = await storage.list(`matches:${teamId}:`);
      if (!list || !list.keys) return setSavedMatches([]);
      const items = [];
      for (const key of list.keys) {
        try { const r = await storage.get(key); if (r && r.value) items.push(JSON.parse(r.value)); } catch (e) {}
      }
      items.sort((a, b) => new Date(b.date) - new Date(a.date));
      setSavedMatches(items);
    } catch (e) { setSavedMatches([]); }
  }, []);

  const loadTrainingHistoryFor = useCallback(async (teamId) => {
    try {
      const list = await storage.list(`trainings:${teamId}:`);
      if (!list || !list.keys) return setSavedTrainings([]);
      const items = [];
      for (const key of list.keys) {
        try { const r = await storage.get(key); if (r && r.value) items.push(JSON.parse(r.value)); } catch (e) {}
      }
      items.sort((a, b) => new Date(b.date) - new Date(a.date));
      setSavedTrainings(items);
    } catch (e) { setSavedTrainings([]); }
  }, []);

  const checkDraftsFor = useCallback(async (teamId) => {
    const found = {};
    try { const r = await storage.get(matchDraftKey(teamId)); if (r && r.value) found.match = JSON.parse(r.value); } catch (e) {}
    try { const r = await storage.get(trainingDraftKey(teamId)); if (r && r.value) found.training = JSON.parse(r.value); } catch (e) {}
    setPendingDrafts(found.match || found.training ? found : null);
  }, []);

  // Loads whatever is already stored — never deletes or overwrites existing teams,
  // rosters, or history. A default team is only created the very first time this app is
  // ever opened with nothing saved yet (an empty "teams" list), never afterwards.
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return; // React 18/19 monta dos veces en desarrollo
    bootedRef.current = true;
    (async () => {
      requestPersistence();

      let teamsList = null;
      try {
        const t = await storage.get("teams");
        if (t && t.value) { const parsed = JSON.parse(t.value); if (Array.isArray(parsed) && parsed.length) teamsList = parsed; }
      } catch (e) {}

      if (!teamsList) {
        const first = { ...newTeam("NPA PORTUS APOSTOLI"), subtitle: "JUVENIL DIVISIÓN DE HONOR" };
        teamsList = [first];
        await persistTeams(teamsList);
        try { await storage.set(`roster:${first.id}`, JSON.stringify(defaultRoster())); } catch (e) {}
      }

      let activeId = null;
      try {
        const a = await storage.get("activeTeamId");
        if (a && a.value && teamsList.some((t) => t.id === a.value)) activeId = a.value;
      } catch (e) {}
      if (!activeId) activeId = teamsList[0].id;

      setTeams(teamsList);
      setActiveTeamId(activeId);
      try { await storage.set("activeTeamId", activeId); } catch (e) {}

      await loadRosterFor(activeId);
      await loadHistoryFor(activeId);
      await loadTrainingHistoryFor(activeId);
      await checkDraftsFor(activeId);
      setLoading(false);
    })();
  }, [persistTeams, loadRosterFor, loadHistoryFor, loadTrainingHistoryFor, checkDraftsFor]);

  /* ---- retomar o descartar una sesión sin cerrar ---- */
  const resumeMatchDraft = (d) => {
    setClockRunning(false);
    secondsRef.current = d.seconds || 0;
    setSeconds(d.seconds || 0);
    setHalf(d.half || 1);
    halfRef.current = d.half || 1;
    halfLenRef.current = d.halfLength || 20;
    setHalfLength(d.halfLength || 20);
    setRivalName(d.rivalName || "Rival");
    setRivalScore(d.rivalScore || 0);
    setRivalCrest(d.rivalCrest || null);
    setVenue(d.venue || "");
    setMatchStartTime(d.matchStartTime || null);
    setOccFor(d.occFor || 0);
    setOccAgainst(d.occAgainst || 0);
    setConvocados(d.convocados || null);
    setGoalEvents(d.goalEvents || []);
    setLastGoalEvent(null);
    setLastEvent(null);

    // La plantilla puede haber cambiado desde entonces: se conserva lo que
    // encaje y se descarta lo que ya no existe, sin inventar jugadores.
    // `d.stats` es el formato antiguo (sin desglose): entra como 1ª parte.
    const savedHalves = d.statsByHalf || (d.stats ? { 1: d.stats } : {});
    const validIds = new Set(players.map((p) => p.id));
    const mergedHalves = {};
    Object.entries(savedHalves).forEach(([h, halfMap]) => {
      const clean = {};
      Object.entries(halfMap || {}).forEach(([id, s]) => {
        if (validIds.has(id)) clean[id] = { ...emptyStats(), ...s };
      });
      mergedHalves[h] = clean;
    });
    setStatsByHalf(mergedHalves);

    const oc = (d.onCourt || []).filter((id) => validIds.has(id)).slice(0, 5);
    setOnCourt(oc);
    onCourtRef.current = oc;

    setPendingDrafts((prev) => {
      const rest = prev && prev.training ? { training: prev.training } : null;
      return rest;
    });
    setView("partido");
    showToast("Partido retomado — el reloj sigue parado");
  };

  const discardMatchDraft = async () => {
    await clearMatchDraft(activeTeamId);
    setPendingDrafts((prev) => (prev && prev.training ? { training: prev.training } : null));
  };

  const resumeTrainingDraft = (d) => {
    setTrainingClockRunning(false);
    setTrainingSeconds(d.trainingSeconds || 0);
    const saved = d.trainingStats || {};
    const merged = {};
    players.forEach((p) => { merged[p.id] = { seconds: (saved[p.id] && saved[p.id].seconds) || 0 }; });
    setTrainingStats(merged);
    const active = (d.trainingActive || []).filter((id) => merged[id]);
    setTrainingActive(active);
    trainingActiveRef.current = active;
    setPendingDrafts((prev) => (prev && prev.match ? { match: prev.match } : null));
    setView("entrenamiento");
    showToast("Entrenamiento retomado — el reloj sigue parado");
  };

  const discardTrainingDraft = async () => {
    await clearTrainingDraft(activeTeamId);
    setPendingDrafts((prev) => (prev && prev.match ? { match: prev.match } : null));
  };

  const toggleTrainingActive = (id) => {
    commitTrainingTime();
    setTrainingActive((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const setAllTrainingActive = (active) => {
    commitTrainingTime();
    setTrainingActive(active ? players.map((p) => p.id) : []);
  };

  const resetTraining = () => {
    setTrainingClockRunning(false);
    setTrainingSeconds(0);
    const ts = {}; players.forEach((p) => (ts[p.id] = { seconds: 0 })); setTrainingStats(ts);
    const all = players.map((p) => p.id);
    setTrainingActive(all);
    trainingActiveRef.current = all;
    clearTrainingDraft(activeTeamId);
  };

  const finishTraining = async () => {
    commitTrainingTime();
    autosaveSuspended.current = true;
    const record = {
      date: new Date().toISOString(),
      durationSeconds: trainingSeconds,
      players: players.map((p) => ({ name: p.name, number: p.number, position: p.position, seconds: (trainingStats[p.id] && trainingStats[p.id].seconds) || 0 })),
    };
    try {
      await storage.set(`trainings:${activeTeamId}:${record.date}`, JSON.stringify(record));
      showToast("Entrenamiento guardado en el historial");
    } catch (e) { showToast("No se pudo guardar el entrenamiento"); }
    await clearTrainingDraft(activeTeamId);
    setConfirmEndTraining(false); resetTraining(); loadTrainingHistoryFor(activeTeamId);
    setHistorySubTab("entrenamientos"); setView("historial");
    autosaveSuspended.current = false;
  };

  const persistRoster = useCallback(async (list) => {
    try { await storage.set(`roster:${activeTeamId}`, JSON.stringify(list)); } catch (e) {}
  }, [activeTeamId]);

  const toggleCourt = (id) => {
    commitTime(); // liquida el tiempo del quinteto anterior antes de cambiarlo
    setOnCourt((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) { showToast("Ya hay 5 en pista — saca a alguien primero"); return prev; }
      return [...prev, id];
    });
  };

  // Tapping a card: if we're mid-goal-registration waiting for the scorer, this tap picks
  // them; an armed quick action records on that player; an on-court player deselects
  // (always allowed); a bench player joins directly if there's room, or — if the pitch is
  // already full — opens the substitution picker to choose who comes off.
  const handlePlayerTap = (player) => {
    if (goalWizard && goalWizard.type === "for" && !goalWizard.authorId) {
      setGoalWizard({ ...goalWizard, authorId: player.id, authorName: player.name });
      return;
    }
    if (pendingAction) { recordPendingAction(player.id, player.name); return; }
    if (onCourt.includes(player.id)) { toggleCourt(player.id); return; }
    if (onCourt.length < 5) { toggleCourt(player.id); return; }
    setSubPickerFor(player);
  };

  const doSubstitution = (outgoingId) => {
    if (!subPickerFor) return;
    const incoming = subPickerFor;
    commitTime();
    setOnCourt((prev) => prev.filter((id) => id !== outgoingId).concat(incoming.id));
    showToast(`${incoming.name} entra por sustitución`);
    setSubPickerFor(null);
    saveDraftNow();
  };

  // `targetHalf` permite deshacer en la parte donde se anotó la acción, aunque
  // mientras tanto se haya empezado la siguiente.
  const bump = (playerId, key, delta = 1, targetHalf = null) => {
    const h = targetHalf || halfRef.current;
    setStatsByHalf((prev) => {
      const halfMap = { ...(prev[h] || {}) };
      const cur = halfMap[playerId] || emptyStats();
      halfMap[playerId] = { ...cur, [key]: Math.max(0, (cur[key] || 0) + delta) };
      return { ...prev, [h]: halfMap };
    });
    if (delta > 0) setLastEvent({ playerId, key, half: h });
  };

  // Deshacer el último registro. El gol guarda su propio autor, así que
  // deshacerlo resta el gol a quien tocaba aunque por medio haya pasado
  // cualquier otra cosa — antes dependía de una referencia suelta que podía
  // quedarse desincronizada y dejar el gol sin descontar.
  const undoLast = () => {
    if (lastGoalEvent) {
      const ev = lastGoalEvent;
      setGoalEvents((prev) => prev.filter((e) => e.id !== ev.id));
      if (ev.type === "for" && ev.authorId) bump(ev.authorId, "goals", -1, ev.half);
      else if (ev.type === "against") setRivalScore((v) => Math.max(0, v - 1));
      setLastGoalEvent(null);
      setLastEvent(null);
      showToast("Gol deshecho");
      return;
    }
    if (!lastEvent) return;
    bump(lastEvent.playerId, lastEvent.key, -1, lastEvent.half);
    setLastEvent(null);
    showToast("Acción deshecha");
  };

  const savePlayerEdit = (id, patch) => {
    setPlayers((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      persistRoster(next);
      return next;
    });
  };

  const handleNewFile = async (id, file) => {
    if (!file) return;
    try { setCropTarget({ kind: "player", id, src: await fileToDataUrl(file) }); }
    catch (e) { showToast("No se pudo cargar la foto"); }
  };
  const handleReframe = (id, currentPhoto) => setCropTarget({ kind: "player", id, src: currentPhoto });

  const handleTeamCrestFile = async (teamId, file) => {
    if (!file) return;
    try { setCropTarget({ kind: "teamCrest", id: teamId, src: await fileToDataUrl(file) }); }
    catch (e) { showToast("No se pudo cargar el escudo"); }
  };
  const handleTeamCrestReframe = (teamId, crest) => { if (crest) setCropTarget({ kind: "teamCrest", id: teamId, src: crest }); };
  const handleTeamCrestRemove = (teamId) => {
    const next = teams.map((t) => (t.id === teamId ? { ...t, crest: null } : t));
    setTeams(next); persistTeams(next);
  };

  const handleRivalCrestFile = async (file) => {
    if (!file) return;
    try { setCropTarget({ kind: "rivalCrest", id: null, src: await fileToDataUrl(file) }); }
    catch (e) { showToast("No se pudo cargar el escudo"); }
  };
  const handleRivalCrestReframe = () => { if (rivalCrest) setCropTarget({ kind: "rivalCrest", id: null, src: rivalCrest }); };

  // Goal registration — GOL → AUTOR → FASE (mandatory) → registro automático.
  // GOL RIVAL → FASE (mandatory) → registro automático. Either way, the 5 players
  // currently on court are captured at this exact instant from the single source of
  // truth (`onCourt`) — never re-derived later, so history never drifts with later subs.
  const armGoal = () => { setActionsPopoverOpen(false); setPendingAction(null); setGoalWizard({ type: "for", authorId: null, authorName: null }); };
  const armRivalGoal = () => { setPendingAction(null); setGoalWizard({ type: "against", authorId: null, authorName: null }); };
  const cancelGoalWizard = () => setGoalWizard(null);

  const finalizeGoal = (phaseKey) => {
    if (!goalWizard) return;
    const onCourtSnapshot = players
      .filter((p) => onCourt.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name, number: p.number }));
    const remainingAtGoal = Math.max(0, halfLength * 60 - seconds); // exactamente lo que marca el reloj ahora
    const event = {
      id: `g${Date.now()}`,
      type: goalWizard.type,
      authorId: goalWizard.type === "for" ? goalWizard.authorId : null,
      authorName: goalWizard.type === "for" ? goalWizard.authorName : null,
      phase: phaseKey,
      half,
      remaining: remainingAtGoal,
      onCourt: onCourtSnapshot,
    };
    setGoalEvents((prev) => [...prev, event]);
    setLastGoalEvent({ id: event.id, type: event.type, authorId: event.authorId });

    if (goalWizard.type === "for") {
      bump(goalWizard.authorId, "goals", 1);
      showToast(`Gol de ${goalWizard.authorName} — ${phaseKey}`);
    } else {
      setRivalScore((v) => v + 1);
      showToast(`Gol rival — ${phaseKey}`);
    }
    setGoalWizard(null);
    saveDraftNow();
  };

  const armStatAction = (key, label) => { setActionsPopoverOpen(false); setPendingAction({ key, label }); };
  const armCardAction = (key, label) => { setCardsPopoverOpen(false); setPendingAction({ key, label }); };
  const cancelPendingAction = () => setPendingAction(null);
  const recordPendingAction = (playerId, playerName) => {
    if (!pendingAction) return;
    bump(playerId, pendingAction.key, 1);
    setLastGoalEvent(null);
    showToast(`${pendingAction.label} — ${playerName}`);
    setPendingAction(null);
  };
  const handleRivalCrestRemove = () => setRivalCrest(null);

  const handleCropSave = (dataUrl) => {
    if (!cropTarget) return;
    if (cropTarget.kind === "teamCrest") {
      const next = teams.map((t) => (t.id === cropTarget.id ? { ...t, crest: dataUrl } : t));
      setTeams(next); persistTeams(next);
    } else if (cropTarget.kind === "rivalCrest") {
      setRivalCrest(dataUrl);
    } else {
      savePlayerEdit(cropTarget.id, { photo: dataUrl });
    }
    setCropTarget(null);
  };

  const addPlayer = () => {
    setPlayers((prev) => {
      const nextNum = prev.length ? Math.max(...prev.map((p) => p.number)) + 1 : 1;
      const np = { id: `p${Date.now()}`, name: "Nuevo jugador", number: nextNum, position: "ALA", isGK: false, photo: null };
      const next = [...prev, np];
      setTrainingStats((s) => ({ ...s, [np.id]: { seconds: 0 } }));
      persistRoster(next);
      return next;
    });
  };

  const removePlayer = (id) => {
    setPlayers((prev) => { const next = prev.filter((p) => p.id !== id); persistRoster(next); return next; });
    setOnCourt((prev) => prev.filter((x) => x !== id));
    setTrainingActive((prev) => prev.filter((x) => x !== id));
  };

  const teamGoals = players.reduce((sum, p) => sum + ((stats[p.id] && stats[p.id].goals) || 0), 0);

  const resetMatch = () => {
    setClockRunning(false);
    secondsRef.current = 0;
    setSeconds(0); setHalf(1); halfRef.current = 1; setRivalScore(0); setOccFor(0); setOccAgainst(0);
    setRivalName("Rival"); setRivalCrest(null); setVenue(""); setMatchStartTime(null);
    setStatsByHalf({});
    const startingFive = players.slice(0, 5).map((p) => p.id);
    setOnCourt(startingFive); onCourtRef.current = startingFive;
    setLastEvent(null);
    setGoalWizard(null); setGoalEvents([]); setLastGoalEvent(null);
    setConvocados(null);
    clearMatchDraft(activeTeamId);
  };

  // "Nuevo partido" opens the Convocatoria step first instead of jumping straight in.
  const startNewMatch = () => { setConvocatoriaMode("nuevo"); };

  // Dos caminos bien distintos, que antes eran uno solo y por eso editar la
  // convocatoria a mitad de partido borraba minutos, goles y tarjetas:
  //  · "nuevo"  → arranca de cero.
  //  · "editar" → solo cambia la lista de convocados; no toca nada de lo jugado.
  const confirmConvocatoria = (selectedIds, mode) => {
    if (mode === "editar") {
      commitTime();
      setConvocados(selectedIds);
      setOnCourt((prev) => {
        const kept = prev.filter((id) => selectedIds.includes(id));
        if (kept.length !== prev.length) showToast("Se quitó de la pista a quien ya no está convocado");
        return kept;
      });
      setConvocatoriaMode(null);
      saveDraftNow();
      return;
    }

    setClockRunning(false);
    secondsRef.current = 0;
    setSeconds(0); setHalf(1); halfRef.current = 1; setRivalScore(0); setOccFor(0); setOccAgainst(0);
    setRivalName("Rival"); setRivalCrest(null); setVenue(""); setMatchStartTime(null);
    setStatsByHalf({});
    setConvocados(selectedIds);
    const startingFive = selectedIds.slice(0, 5);
    setOnCourt(startingFive); onCourtRef.current = startingFive;
    setLastEvent(null);
    setGoalWizard(null); setGoalEvents([]); setLastGoalEvent(null);
    setConvocatoriaMode(null);
    setView("partido");
  };

  const finishMatch = async () => {
    commitTime();
    autosaveSuspended.current = true;
    const convocadosList = convocados
      ? players.filter((p) => convocados.includes(p.id)).map((p) => ({ id: p.id, name: p.name, number: p.number }))
      : players.map((p) => ({ id: p.id, name: p.name, number: p.number }));
    const rowsFrom = (statsMap) => players.map((p) => ({
      name: p.name, number: p.number, position: p.position, isGK: p.isGK,
      ...emptyStats(), ...((statsMap || {})[p.id] || {}),
    }));
    const record = {
      date: new Date().toISOString(), rivalName, teamGoals, rivalScore, occFor, occAgainst, halfLength, venue, startTime: matchStartTime,
      players: rowsFrom(stats), // total del partido
      // Desglose por parte, en el orden en que se jugaron.
      halves: halvesPresent(statsByHalf, goalEvents).map((h) => ({ half: h, players: rowsFrom(statsByHalf[h]) })),
      goalEvents, // additive: full history of who scored, from what phase, with the exact 5 on court at that moment
      convocados: convocadosList, // additive: who was called up for this match
    };
    let saved = false;
    try {
      await storage.set(`matches:${activeTeamId}:${record.date}`, JSON.stringify(record));
      saved = true;
      showToast("Partido guardado — exportando Excel y PDF…");
    } catch (e) { showToast("No se pudo guardar el partido"); }
    // El borrador solo se borra si el partido quedó guardado de verdad; si el
    // guardado falla, la copia sigue ahí para poder recuperarlo.
    if (saved) await clearMatchDraft(activeTeamId);
    try { exportSingleMatchToExcel(record, activeTeam.name); } catch (e) {}
    try { printMatchReport(record, activeTeam.name); } catch (e) {}
    setConfirmEnd(false);
    if (saved) resetMatch();
    loadHistoryFor(activeTeamId); setHistorySubTab("partidos"); setView("historial");
    autosaveSuspended.current = false;
  };

  const startNextHalf = () => {
    setClockRunning(false); // liquida el tiempo pendiente en la parte que acaba
    secondsRef.current = 0;
    setSeconds(0);
    const next = halfRef.current + 1;
    halfRef.current = next; // a partir de aqui todo se anota en la parte nueva
    setHalf(next);
    saveDraftNow();
  };

  /* ---- multi-team actions ---- */
  const switchTeam = async (id) => {
    if (id === activeTeamId) { setTeamManagerOpen(false); setView("inicio"); return; }
    commitTime(); commitTrainingTime();
    await saveDraftNow(); // el partido del equipo actual no se pierde al cambiar
    autosaveSuspended.current = true;
    setClockRunning(false);
    setTrainingClockRunning(false);
    secondsRef.current = 0;
    setSeconds(0); setHalf(1); halfRef.current = 1; setRivalScore(0); setOccFor(0); setOccAgainst(0);
    setRivalName("Rival"); setRivalCrest(null); setVenue(""); setMatchStartTime(null);
    setLastEvent(null); setLastGoalEvent(null); setGoalEvents([]); setConvocados(null);
    setTrainingSeconds(0);
    setLoading(true);
    setActiveTeamId(id);
    try { await storage.set("activeTeamId", id); } catch (e) {}
    await loadRosterFor(id);
    await loadHistoryFor(id);
    await loadTrainingHistoryFor(id);
    await checkDraftsFor(id);
    setLoading(false);
    setTeamManagerOpen(false);
    setView("inicio");
    autosaveSuspended.current = false;
  };

  const addTeamAction = async () => {
    const t = newTeam("Nuevo equipo");
    const next = [...teams, t];
    setTeams(next); persistTeams(next);
    try { await storage.set(`roster:${t.id}`, JSON.stringify(defaultRoster())); } catch (e) {}
  };

  const editTeamField = (id, patch) => setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const commitTeams = () => persistTeams(teams);

  const removeTeamAction = async (id) => {
    if (teams.length <= 1) { showToast("Debe quedar al menos un equipo"); return; }
    const next = teams.filter((t) => t.id !== id);
    setTeams(next); persistTeams(next);
    if (id === activeTeamId) await switchTeam(next[0].id);
  };

  const statP = statPlayer ? players.find((p) => p.id === statPlayer) : null;
  const totalHalfSeconds = Math.max(1, halfLength * 60);
  const remaining = Math.max(0, totalHalfSeconds - seconds);
  const halfProgress = remaining / totalHalfSeconds;
  const onCourtCount = onCourt.length;

  const sortedPlayers = [...players].sort((a, b) => {
    const aOn = onCourt.includes(a.id), bOn = onCourt.includes(b.id);
    if (aOn !== bOn) return aOn ? -1 : 1;
    return a.number - b.number;
  });

  if (loading) {
    return <div style={{ background: T.bg, color: T.dim, minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>Cargando…</div>;
  }

  return (
    <div style={{
      background: T.bg, color: T.text, fontFamily: "'Inter', sans-serif",
      paddingBottom: `calc(70px + env(safe-area-inset-bottom, 0px))`,
      paddingTop: "env(safe-area-inset-top, 0px)",
      ...(isFullscreen
        ? { position: "fixed", inset: 0, zIndex: 9999, overflowY: "auto", minHeight: "100dvh" }
        : { position: "relative", minHeight: "100dvh" }),
    }}>
      {view !== "inicio" && (
        <>
          {/* HEADER */}
          <div style={{ background: T.surface, borderBottom: `1px solid ${T.line}`, padding: "14px 16px" }}>
            {view === "entrenamiento" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setView("inicio")}>
                  <CrestAvatar crest={activeTeam.crest} size={40} onPick={(f) => handleTeamCrestFile(activeTeamId, f)} onReframe={() => handleTeamCrestReframe(activeTeamId, activeTeam.crest)} onRemove={() => handleTeamCrestRemove(activeTeamId)} />
                  <div>
                    <div className="oswald" style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.5 }}>{activeTeam.name}</div>
                    <div style={{ fontSize: 9, color: T.dim, letterSpacing: 1 }}>{activeTeam.subtitle}</div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: trainingRunning ? T.red : T.dim }} />
                  <div className="oswald" style={{ fontSize: 32, fontWeight: 700 }}>{fmtClock(trainingSeconds)}</div>
                  <div style={{ fontSize: 11, color: T.dim }}>{trainingRunning ? "en marcha" : "parado"}</div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setTrainingClockRunning(!trainingRunning)} style={{ ...bigBtn, background: trainingRunning ? T.negative : T.red, color: "#0A0A0A", fontSize: 15, padding: "13px 22px" }}>
                    {trainingRunning ? <Pause size={20} /> : <Play size={20} />} {trainingRunning ? "Pausar" : "Iniciar"}
                  </button>
                  <button onClick={resetTraining} style={ghostBtn} title="Reiniciar sesión"><RotateCcw size={14} /> Reiniciar</button>
                </div>
              </div>
            ) : (
            <>
            {!isFullscreen && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10, flexWrap: "wrap", fontSize: 11, color: T.dim }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Clock3 size={12} />
                {matchStartTime ? `Inicio: ${matchStartTime}` : "Inicio: pendiente de empezar"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <MapPin size={12} />
                <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Pabellón" style={{ background: "transparent", border: "none", borderBottom: `1px dashed ${T.line}`, color: T.text, fontSize: 12, outline: "none", width: 140 }} />
              </div>
            </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setView("inicio")}>
                <CrestAvatar crest={activeTeam.crest} size={40} onPick={(f) => handleTeamCrestFile(activeTeamId, f)} onReframe={() => handleTeamCrestReframe(activeTeamId, activeTeam.crest)} onRemove={() => handleTeamCrestRemove(activeTeamId)} />
                <div>
                  <div className="oswald" style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.5 }}>{activeTeam.name}</div>
                  <div style={{ fontSize: 9, color: T.dim, letterSpacing: 1 }}>{activeTeam.subtitle}</div>
                </div>
              </div>

              {/* score — two symmetric columns so both crests sit at the exact same height */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <ScoreColumn
                  labelNode={<div style={{ fontSize: 9, color: T.dim, height: 12, overflow: "hidden", whiteSpace: "nowrap", textAlign: "center" }}>{(activeTeam.name || "").split(" ")[0] || "Equipo"}</div>}
                  crest={<CrestAvatar crest={activeTeam.crest} size={32} onPick={(f) => handleTeamCrestFile(activeTeamId, f)} onReframe={() => handleTeamCrestReframe(activeTeamId, activeTeam.crest)} onRemove={() => handleTeamCrestRemove(activeTeamId)} />}
                  score={<div className="oswald" style={{ fontSize: 26, fontWeight: 700, color: T.red, textAlign: "center" }}>{teamGoals}</div>}
                />
                <div style={{ width: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ height: 12 }} />
                  <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 16, color: T.dim }}>—</span></div>
                </div>
                <ScoreColumn
                  labelNode={<input value={rivalName} onChange={(e) => setRivalName(e.target.value)} style={{ background: "transparent", border: "none", color: T.dim, fontSize: 11, width: 70, height: 12, textAlign: "center", outline: "none" }} />}
                  crest={<CrestAvatar crest={rivalCrest} size={32} onPick={handleRivalCrestFile} onReframe={handleRivalCrestReframe} onRemove={handleRivalCrestRemove} />}
                  score={
                    <div className="oswald" style={{ fontSize: 26, fontWeight: 700, color: T.negative, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                      <button onClick={() => setRivalScore((v) => Math.max(0, v - 1))} style={iconBtnSm}><Minus size={11} /></button>
                      {rivalScore}
                      <button onClick={armRivalGoal} style={{ ...iconBtnSm, background: T.negative, color: "#0A0A0A" }} title="Registrar gol rival"><Plus size={11} /></button>
                    </div>
                  }
                />
              </div>

              <ClockDial seconds={remaining} progress={halfProgress} running={running} half={half} />

              <button onClick={() => { const next = !running; setClockRunning(next); if (next && !matchStartTime) setMatchStartTime(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })); }} style={{ ...bigBtn, background: running ? T.negative : T.red, color: "#0A0A0A", fontSize: 15, padding: "13px 22px" }}>
                {running ? <Pause size={20} /> : <Play size={20} />} {running ? "Pausar" : "Iniciar"}
              </button>
            </div>
            </>
            )}

            {view !== "entrenamiento" && (
            <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={startNextHalf} style={ghostBtn}><ChevronRight size={14} /> {half === 1 ? "Empezar 2ª parte" : `Empezar parte ${half + 1}`}</button>
              <div style={{ width: 1, height: 26, background: T.line }} />
              <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 260 }}>
                <OccCounter label="Ocasión favor" value={occFor} color={T.red} onInc={() => setOccFor((v) => v + 1)} onDec={() => setOccFor((v) => Math.max(0, v - 1))} />
                <OccCounter label="Ocasión contra" value={occAgainst} color={T.negative} onInc={() => setOccAgainst((v) => v + 1)} onDec={() => setOccAgainst((v) => Math.max(0, v - 1))} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.dim }}>
                Duración
                <input type="number" value={halfLength} onChange={(e) => setHalfLength(Math.max(1, Number(e.target.value) || 1))} style={{ width: 52, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 6, color: T.text, padding: "3px 5px", fontSize: 14 }} />
                min
              </div>
            </div>
            )}
          </div>

          {/* TABS */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 16px 0", background: T.bg, flexWrap: "wrap" }}>
            <TabBtn active={view === "inicio"} onClick={() => setView("inicio")} icon={Home} label="Inicio" />
            <TabBtn active={view === "partido"} onClick={() => setView("partido")} icon={ClipboardList} label="Partido" />
            <TabBtn active={view === "entrenamiento"} onClick={() => setView("entrenamiento")} icon={Dumbbell} label="Entrenamiento" />
            <TabBtn active={view === "plantilla"} onClick={() => setView("plantilla")} icon={Shirt} label="Plantilla" />
            <TabBtn active={view === "historial"} onClick={() => setView("historial")} icon={History} label="Historial" />
            <div style={{ flex: 1 }} />
            <button onClick={toggleFullscreen} style={{ ...ghostBtn, marginBottom: 8 }} title={isFullscreen ? "Volver a la vista normal" : "Ampliar y aprovechar todo el espacio"}>
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {isFullscreen ? "Vista normal" : "Ampliar vista"}
            </button>
          </div>
        </>
      )}

      <div style={{ padding: view === "inicio" ? 0 : 16 }}>
        {view === "inicio" && (
          <HomeView
            team={activeTeam}
            onPickCrest={(f) => handleTeamCrestFile(activeTeamId, f)}
            onReframeCrest={() => handleTeamCrestReframe(activeTeamId, activeTeam.crest)}
            onRemoveCrest={() => handleTeamCrestRemove(activeTeamId)}
            matches={savedMatches}
            trainings={savedTrainings}
            onNewMatch={startNewMatch}
            onNewTraining={() => { resetTraining(); setView("entrenamiento"); }}
            onGoRoster={() => setView("plantilla")}
            onGoHistory={() => setView("historial")}
            onExport={() => exportClubDataToExcel(savedMatches, savedTrainings, activeTeam.name)}
            playerCount={players.length}
            onOpenTeams={() => setTeamManagerOpen(true)}
            teamCount={teams.length}
            canInstall={!!installPrompt}
            onInstall={doInstall}
            standalone={standalone}
            updateReady={updateReady}
            onApplyUpdate={applyUpdate}
            matchInProgress={matchInProgress}
            onResumeMatch={() => setView("partido")}
          />
        )}

        {view === "partido" && (
          <div className="fadein" style={{ paddingBottom: 90 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={16} color={T.red} />
                <span className="oswald" style={{ fontSize: 15, fontWeight: 600 }}>En pista: {onCourtCount}/5</span>
                {convocados && <span style={{ fontSize: 11, color: T.dim }}>· Convocados: {convocados.length}</span>}
              </div>
              <button onClick={() => setConvocatoriaMode(convocados ? "editar" : "nuevo")} style={ghostBtn}><ClipboardList size={13} /> {convocados ? "Editar convocatoria" : "Hacer convocatoria"}</button>
            </div>

            {pendingAction && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(230,57,70,0.18)", border: `1.5px solid ${T.red}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Anotando: {pendingAction.label} — toca un jugador</span>
                <button onClick={cancelPendingAction} style={iconBtnSm}><X size={14} /></button>
              </div>
            )}

            {goalWizard && goalWizard.type === "for" && !goalWizard.authorId && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(230,57,70,0.18)", border: `1.5px solid ${T.red}`, borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>⚽ ¿Quién marcó? — toca un jugador</span>
                <button onClick={cancelGoalWizard} style={iconBtnSm}><X size={14} /></button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
              {sortedPlayers.filter((p) => !convocados || convocados.includes(p.id)).map((p) => {
                const isOn = onCourt.includes(p.id);
                return (
                  <PlayerCard
                    key={p.id} player={p} stats={stats[p.id] || emptyStats()} onCourt={isOn}
                    armed={!!pendingAction || !!(goalWizard && goalWizard.type === "for" && !goalWizard.authorId)}
                    onTap={() => handlePlayerTap(p)}
                    onOpenStats={() => setStatPlayer(p.id)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {view === "plantilla" && (
          <RosterEditor players={players} onAdd={addPlayer} onRemove={removePlayer} onSave={savePlayerEdit} onNewFile={handleNewFile} onReframe={handleReframe} />
        )}

        {view === "entrenamiento" && (
          <div className="fadein">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Dumbbell size={16} color={T.red} />
                <span className="oswald" style={{ fontSize: 15, fontWeight: 600 }}>Activos: {trainingActive.length}/{players.length}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setAllTrainingActive(true)} style={ghostBtn}><CheckCheck size={13} /> Activar todos</button>
                <button onClick={() => setAllTrainingActive(false)} style={ghostBtn}>Parar todos</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 10 }}>
              {players.map((p) => {
                const isActive = trainingActive.includes(p.id);
                const secs = (trainingStats[p.id] && trainingStats[p.id].seconds) || 0;
                return <TrainingPlayerCard key={p.id} player={p} seconds={secs} active={isActive} onToggle={() => toggleTrainingActive(p.id)} />;
              })}
            </div>
          </div>
        )}

        {view === "historial" && (
          <HistoryView
            matches={savedMatches} trainings={savedTrainings} teamName={activeTeam.name}
            subTab={historySubTab} onSubTabChange={setHistorySubTab}
            onExport={() => exportClubDataToExcel(savedMatches, savedTrainings, activeTeam.name)}
          />
        )}
      </div>

      {statP && <StatDrawer player={statP} stats={stats[statP.id] || emptyStats()} onClose={() => setStatPlayer(null)} onBump={(key, d) => bump(statP.id, key, d)} />}

      {cropTarget && <PhotoCropEditor src={cropTarget.src} onCancel={() => setCropTarget(null)} onSave={handleCropSave} />}

      {actionsPopoverOpen && (
        <ActionsPopover onPick={armStatAction} onClose={() => setActionsPopoverOpen(false)} />
      )}

      {cardsPopoverOpen && (
        <CardsPopover onPick={armCardAction} onClose={() => setCardsPopoverOpen(false)} />
      )}

      {goalWizard && (goalWizard.type === "against" || goalWizard.authorId) && (
        <GoalPhasePopover
          goalWizard={goalWizard}
          onPick={finalizeGoal}
          onClose={cancelGoalWizard}
        />
      )}

      {convocatoriaMode && (
        <ConvocatoriaModal
          players={players}
          initialSelected={convocados}
          mode={convocatoriaMode}
          onConfirm={(ids) => confirmConvocatoria(ids, convocatoriaMode)}
          onClose={() => setConvocatoriaMode(null)}
        />
      )}

      {pendingDrafts && (
        <DraftRecoveryModal
          drafts={pendingDrafts}
          teamName={activeTeam.name}
          onResumeMatch={resumeMatchDraft}
          onDiscardMatch={discardMatchDraft}
          onResumeTraining={resumeTrainingDraft}
          onDiscardTraining={discardTrainingDraft}
        />
      )}

      {subPickerFor && (
        <SubstitutionPicker
          incoming={subPickerFor}
          onCourtPlayers={players.filter((p) => onCourt.includes(p.id))}
          stats={stats}
          onPick={doSubstitution}
          onClose={() => setSubPickerFor(null)}
        />
      )}

      {summaryOpen && (
        <SummaryModal players={sortedPlayers} stats={stats} statsByHalf={statsByHalf} goalEvents={goalEvents} onClose={() => setSummaryOpen(false)} />
      )}

      {teamManagerOpen && (
        <TeamManagerModal
          teams={teams} activeTeamId={activeTeamId}
          onSelect={switchTeam}
          onFieldChange={editTeamField}
          onFieldBlur={commitTeams}
          onPickCrest={handleTeamCrestFile}
          onReframeCrest={handleTeamCrestReframe}
          onRemoveCrest={handleTeamCrestRemove}
          onAdd={addTeamAction}
          onRemove={removeTeamAction}
          onClose={() => setTeamManagerOpen(false)}
        />
      )}

      {view === "partido" && (
        <QuickActionBar
          hasLastEvent={!!lastEvent || !!lastGoalEvent}
          onGoal={armGoal}
          onOpenActions={() => setActionsPopoverOpen(true)}
          onOpenCards={() => setCardsPopoverOpen(true)}
          onOpenSummary={() => setSummaryOpen(true)}
          onUndo={undoLast}
          onFinish={() => setConfirmEnd(true)}
        />
      )}

      {view === "entrenamiento" && (
        <button onClick={() => setConfirmEndTraining(true)} style={{ position: "fixed", bottom: `calc(20px + env(safe-area-inset-bottom, 0px))`, right: 20, zIndex: 80, ...bigBtn, background: T.white, color: T.bg, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", padding: "13px 20px" }}>
          <Save size={17} /> Finalizar entrenamiento
        </button>
      )}

      {confirmEnd && (
        <div style={overlayStyle} onClick={() => setConfirmEnd(false)}>
          <div style={{ ...modalCard, maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div className="oswald" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>¿Finalizar partido?</div>
            <div style={{ fontSize: 13, color: T.dim, marginBottom: 18 }}>Se guardará el resultado y las estadísticas de cada jugador en el historial de {activeTeam.name}. El marcador y los minutos se reiniciarán.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmEnd(false)} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}>Cancelar</button>
              <button onClick={finishMatch} style={{ ...bigBtn, flex: 1, justifyContent: "center", background: T.red, color: "#0A0A0A" }}>Guardar y finalizar</button>
            </div>
          </div>
        </div>
      )}

      {confirmEndTraining && (
        <div style={overlayStyle} onClick={() => setConfirmEndTraining(false)}>
          <div style={{ ...modalCard, maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div className="oswald" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>¿Finalizar entrenamiento?</div>
            <div style={{ fontSize: 13, color: T.dim, marginBottom: 18 }}>Se guardará el tiempo de actividad de cada jugador en el historial de {activeTeam.name}. La sesión se reiniciará.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmEndTraining(false)} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}>Cancelar</button>
              <button onClick={finishTraining} style={{ ...bigBtn, flex: 1, justifyContent: "center", background: T.red, color: "#0A0A0A" }}>Guardar y finalizar</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: `calc(20px + env(safe-area-inset-bottom, 0px))`, left: "50%", transform: "translateX(-50%)", background: T.surface3, border: `1px solid ${T.line}`, color: T.text, padding: "10px 16px", borderRadius: 10, fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 100, maxWidth: "90vw", textAlign: "center" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* SUBCOMPONENTS ---------------------------------------------------- */

/* Aviso al abrir la app si quedó un partido o un entreno sin cerrar. */
function DraftRecoveryModal({ drafts, teamName, onResumeMatch, onDiscardMatch, onResumeTraining, onDiscardTraining }) {
  const when = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  };
  const m = drafts.match;
  const t = drafts.training;
  return (
    <div style={{ ...overlayStyle, alignItems: "center", zIndex: 95 }}>
      <div style={{ ...modalCard, maxWidth: 440, borderRadius: 16 }} className="fadein">
        <div className="oswald" style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>Hay algo sin terminar</div>
        <div style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>
          La app guarda sola lo que va pasando, así que esto sigue aquí aunque se cerrara el navegador o se apagara la tablet.
        </div>

        {m && (
          <div style={{ background: T.surface2, border: `1.5px solid ${T.red}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>Partido · guardado {when(m.savedAt)}</div>
            <div className="oswald" style={{ fontSize: 17, fontWeight: 600, margin: "4px 0 2px" }}>
              {(teamName || "").split(" ")[0]} {Object.values(m.stats || {}).reduce((s, x) => s + (x.goals || 0), 0)} — {m.rivalScore || 0} {m.rivalName || ""}
            </div>
            <div style={{ fontSize: 11, color: T.dim, marginBottom: 12 }}>
              {m.half}ª parte · {fmtClock(Math.max(0, (m.halfLength || 20) * 60 - (m.seconds || 0)))} por jugar
              {(m.goalEvents || []).length ? ` · ${m.goalEvents.length} gol${m.goalEvents.length === 1 ? "" : "es"} registrado${m.goalEvents.length === 1 ? "" : "s"}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onDiscardMatch} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}><Trash2 size={13} /> Descartar</button>
              <button onClick={() => onResumeMatch(m)} style={{ ...bigBtn, flex: 2, justifyContent: "center", background: T.red, color: "#0A0A0A" }}><Play size={15} /> Retomar partido</button>
            </div>
          </div>
        )}

        {t && (
          <div style={{ background: T.surface2, border: `1.5px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10, color: T.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>Entrenamiento · guardado {when(t.savedAt)}</div>
            <div className="oswald" style={{ fontSize: 17, fontWeight: 600, margin: "4px 0 12px" }}>Duración: {fmtMin(t.trainingSeconds || 0)}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onDiscardTraining} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}><Trash2 size={13} /> Descartar</button>
              <button onClick={() => onResumeTraining(t)} style={{ ...bigBtn, flex: 2, justifyContent: "center", background: T.white, color: T.bg }}><Play size={15} /> Retomar entreno</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Bottom quick-action bar for the Partido tab: tap an action, then tap a player to record it. */
function QuickActionBar({ hasLastEvent, onGoal, onOpenActions, onOpenCards, onOpenSummary, onUndo, onFinish }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 80, background: T.surface, borderTop: `1px solid ${T.line}`, padding: `10px 14px calc(10px + env(safe-area-inset-bottom, 0px))`, boxShadow: "0 -8px 24px rgba(0,0,0,0.35)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, maxWidth: 700, margin: "0 auto", flexWrap: "wrap" }}>
        <QuickActionButton icon={() => <span style={{ fontSize: 20 }}>⚽</span>} label="Gol" onClick={onGoal} accent={T.red} />
        <QuickActionButton icon={ClipboardList} label="Resumen" onClick={onOpenSummary} />
        <QuickActionButton icon={Footprints} label="Acciones" onClick={onOpenActions} />
        <QuickActionButton icon={(p) => <Square {...p} />} label="Tarjeta" onClick={onOpenCards} accent={T.amber} />
        <QuickActionButton icon={Undo2} label="Deshacer" onClick={onUndo} disabled={!hasLastEvent} />
        <button onClick={onFinish} style={{ ...bigBtn, background: T.white, color: T.bg, padding: "12px 18px", marginLeft: 8 }}>
          <Save size={16} /> Finalizar
        </button>
      </div>
    </div>
  );
}

function QuickActionButton({ icon: Icon, label, onClick, accent, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, padding: "4px 6px" }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", background: T.surface3, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${accent || T.line}` }}>
        <Icon size={20} color={accent || T.text} />
      </div>
      <span style={{ fontSize: 9, color: T.dim, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

function ActionsPopover({ onPick, onClose }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 360 }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="oswald" style={{ fontSize: 17, fontWeight: 600 }}>¿Qué acción?</div>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {QUICK_STAT_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.key} onClick={() => onPick(a.key, a.label)} style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", color: T.text }}>
                <Icon size={16} color={a.color || T.red} /><span style={{ fontSize: 13 }}>{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CardsPopover({ onPick, onClose }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 320 }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="oswald" style={{ fontSize: 17, fontWeight: 600 }}>¿Qué tarjeta?</div>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {CARD_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.key} onClick={() => onPick(a.key, a.label)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: T.surface2, border: `1.5px solid ${a.color}`, borderRadius: 12, padding: "18px 12px", cursor: "pointer", color: T.text }}>
                <Icon size={28} color={a.color} /><span style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GoalPhasePopover({ goalWizard, onPick, onClose }) {
  const isFor = goalWizard.type === "for";
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 460 }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, color: T.dim }}>{isFor ? `Gol de ${goalWizard.authorName}` : "Gol rival"}</div>
            <div className="oswald" style={{ fontSize: 17, fontWeight: 600 }}>¿De qué fase viene el gol?</div>
          </div>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 11, color: T.dim, margin: "8px 0 12px" }}>Obligatorio elegir una para completar el registro.</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {GOAL_PHASES.map((ph) => (
            <button key={ph.key} onClick={() => onPick(ph.key)} style={{ background: "transparent", border: `1.5px solid ${ph.color}`, color: ph.color, borderRadius: 10, padding: "12px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {ph.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConvocatoriaModal({ players, initialSelected, mode, onConfirm, onClose }) {
  const [selected, setSelected] = useState(() => new Set(initialSelected || players.map((p) => p.id)));
  const toggle = (id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAll = () => setSelected(new Set(players.map((p) => p.id)));
  const selectNone = () => setSelected(new Set());
  const editing = mode === "editar";

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div className="oswald" style={{ fontSize: 18, fontWeight: 600 }}>{editing ? "Editar convocatoria" : "Convocatoria"}</div>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: T.dim, margin: "6px 0 10px" }}>
          {editing
            ? "Cambia quién está convocado. Los minutos, goles y tarjetas del partido no se tocan."
            : "Elige qué jugadores de la plantilla están convocados para este partido."}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button onClick={selectAll} style={{ ...ghostBtn, fontSize: 11, padding: "6px 10px" }}><CheckCheck size={12} /> Todos</button>
          <button onClick={selectNone} style={{ ...ghostBtn, fontSize: 11, padding: "6px 10px" }}>Ninguno</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: T.dim, alignSelf: "center" }}>{selected.size} convocados</span>
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          {players.map((p) => {
            const isIn = selected.has(p.id);
            return (
              <button key={p.id} onClick={() => toggle(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, background: isIn ? "rgba(230,57,70,0.15)" : T.surface2, border: `1.5px solid ${isIn ? T.red : T.line}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}>
                <Avatar player={p} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: T.dim }}>{p.position}</div>
                </div>
                <div className="oswald" style={{ fontSize: 24, fontWeight: 700, color: isIn ? T.red : T.dim, flexShrink: 0 }}>{p.number}</div>
                <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isIn ? T.red : T.line}`, background: isIn ? T.red : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {isIn && <Check size={14} color="#0A0A0A" />}
                </div>
              </button>
            );
          })}
        </div>

        <button onClick={() => onConfirm(Array.from(selected))} disabled={!selected.size} style={{ ...bigBtn, justifyContent: "center", background: selected.size ? T.red : T.surface3, color: selected.size ? "#0A0A0A" : T.dim, marginTop: 14, opacity: selected.size ? 1 : 0.6, cursor: selected.size ? "pointer" : "default" }}>
          {editing ? "Guardar convocatoria" : "Confirmar convocatoria y empezar"}
        </button>
      </div>
    </div>
  );
}

function SubstitutionPicker({ incoming, onCourtPlayers, stats, onPick, onClose }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 420 }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar player={incoming} size={40} />
            <div>
              <div style={{ fontSize: 11, color: T.dim }}>Entra</div>
              <div className="oswald" style={{ fontSize: 18, fontWeight: 600 }}>{incoming.name}</div>
            </div>
            <div className="oswald" style={{ fontSize: 28, fontWeight: 700, color: T.red }}>{incoming.number}</div>
          </div>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: T.dim, margin: "10px 0 12px" }}>La pista está completa. Elige a quién sustituye:</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {onCourtPlayers.map((p) => (
            <button key={p.id} onClick={() => onPick(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}>
              <Avatar player={p} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: 10, color: T.dim }}>{p.position}</div>
              </div>
              <div className="oswald" style={{ fontSize: 22, fontWeight: 700, color: T.red, flexShrink: 0 }}>{p.number}</div>
              <div className="oswald" style={{ fontSize: 14, fontWeight: 600, color: T.dim, flexShrink: 0 }}>{fmtMin((stats[p.id] && stats[p.id].seconds) || 0)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Tabla de estadísticas reutilizada por cada sección del resumen. */
function StatsTable({ players, statsMap }) {
  const rows = players.filter((p) => {
    const s = statsMap[p.id];
    return s && (s.seconds > 0 || s.goals || s.assists || s.shotsOn || s.shotsOff || s.turnovers || s.recoveries || s.fouls || s.yellow || s.red || s.saves);
  });
  if (!rows.length) {
    return <div style={{ padding: "10px 4px", color: T.dim, fontSize: 12 }}>Sin actividad registrada en esta parte.</div>;
  }
  const th = { padding: "4px 6px", position: "sticky", top: 0, background: T.surface };
  const td = { padding: "4px 6px" };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: T.dim, textAlign: "left" }}>
            <th style={th}>#</th><th style={th}>Jugador</th><th style={th}>Min</th>
            <th style={th}>G</th><th style={th}>A</th>
            <th style={th}>TP</th><th style={th}>TF</th>
            <th style={th}>Pér</th><th style={th}>Rec</th>
            <th style={th}>F</th><th style={th}>TA</th><th style={th}>TR</th><th style={th}>Par</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const s = statsMap[p.id];
            return (
              <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ ...td, color: T.red, fontWeight: 600 }}>{p.number}</td>
                <td style={td}>{p.name}</td>
                <td style={td}>{fmtMin(s.seconds)}</td>
                <td style={td}>{s.goals}</td><td style={td}>{s.assists}</td>
                <td style={td}>{s.shotsOn}</td><td style={td}>{s.shotsOff}</td>
                <td style={td}>{s.turnovers}</td><td style={td}>{s.recoveries}</td>
                <td style={td}>{s.fouls}</td><td style={td}>{s.yellow}</td><td style={td}>{s.red}</td><td style={td}>{s.saves}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GoalLine({ ev }) {
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 11 }}>
      <span style={{ fontWeight: 700, color: ev.type === "for" ? T.red : T.negative }}>
        {ev.type === "for" ? `⚽ ${ev.authorName}` : "⚽ Rival"}
      </span>
      {" · "}{ev.phase} · {fmtClock(ev.remaining !== undefined ? ev.remaining : ev.seconds)}
      <div style={{ color: T.dim, marginTop: 2 }}>Quinteto en pista: {(ev.onCourt || []).map((p) => `#${p.number} ${p.name}`).join(", ")}</div>
    </div>
  );
}

function SectionHeading({ title, right, accent }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${accent || T.line}` }}>
      <span className="oswald" style={{ fontSize: 15, fontWeight: 600, color: accent || T.text, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</span>
      {right && <span className="oswald" style={{ fontSize: 15, fontWeight: 700, color: accent || T.dim }}>{right}</span>}
    </div>
  );
}

/* Resumen en tres bloques: 1ª parte, 2ª parte y total del partido. Cada parte
   lleva su propio marcador y sus goles, que es como se lee un partido de
   fútbol sala: casi siempre importa en qué mitad pasó cada cosa. */
function SummaryModal({ players, stats, statsByHalf, goalEvents, onClose }) {
  const halves = halvesPresent(statsByHalf, goalEvents);
  const scoreOf = (h) => {
    const evs = (goalEvents || []).filter((ev) => Number(ev.half) === h);
    return `${evs.filter((e) => e.type === "for").length}-${evs.filter((e) => e.type !== "for").length}`;
  };
  const totalFor = (goalEvents || []).filter((e) => e.type === "for").length;
  const totalAgainst = (goalEvents || []).length - totalFor;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 620, maxHeight: "84vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, position: "sticky", top: -18, background: T.surface, paddingTop: 2, zIndex: 1 }}>
          <div className="oswald" style={{ fontSize: 17, fontWeight: 600 }}>Resumen del partido</div>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>

        {halves.map((h) => {
          const goalsThisHalf = (goalEvents || []).filter((ev) => Number(ev.half) === h);
          return (
            <div key={h} style={{ marginBottom: 22 }}>
              <SectionHeading title={halfLabel(h)} right={scoreOf(h)} />
              <StatsTable players={players} statsMap={statsByHalf[h] || {}} />
              {goalsThisHalf.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {goalsThisHalf.map((ev) => <GoalLine key={ev.id} ev={ev} />)}
                </div>
              )}
            </div>
          );
        })}

        <div>
          <SectionHeading title="Total del partido" right={`${totalFor}-${totalAgainst}`} accent={T.red} />
          <StatsTable players={players} statsMap={stats} />
        </div>
      </div>
    </div>
  );
}

function ScoreColumn({ labelNode, crest, score }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 70 }}>
      {labelNode}
      {crest}
      {score}
    </div>
  );
}

function HomeView({
  team, onPickCrest, onReframeCrest, onRemoveCrest, matches, trainings, onNewMatch, onNewTraining,
  onGoRoster, onGoHistory, onExport, playerCount, onOpenTeams, teamCount,
  canInstall, onInstall, standalone, updateReady, onApplyUpdate, matchInProgress, onResumeMatch,
}) {
  const wins = matches.filter((m) => m.teamGoals > m.rivalScore).length;
  const draws = matches.filter((m) => m.teamGoals === m.rivalScore).length;
  const losses = matches.filter((m) => m.teamGoals < m.rivalScore).length;
  const hasHistory = matches.length > 0 || trainings.length > 0;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return (
    <div className="fadein" style={{ padding: "28px 20px 40px" }}>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ display: "inline-block" }}>
          <CrestAvatar crest={team.crest} size={84} onPick={onPickCrest} onReframe={onReframeCrest} onRemove={onRemoveCrest} shape="circle" />
        </div>
        <div className="oswald" style={{ fontSize: 24, fontWeight: 700, marginTop: 12, letterSpacing: 0.5 }}>{team.name}</div>
        <div style={{ fontSize: 11, color: T.dim, letterSpacing: 1.5, marginTop: 2 }}>{team.subtitle}</div>
        <button onClick={onOpenTeams} style={{ ...ghostBtn, marginTop: 12, fontSize: 11, padding: "6px 12px", margin: "12px auto 0" }}>
          <Settings size={12} /> {teamCount > 1 ? `Cambiar equipo (${teamCount})` : "Gestionar equipos"}
        </button>
      </div>

      {matchInProgress && (
        <div onClick={onResumeMatch} style={{ maxWidth: 760, margin: "0 auto 16px", background: "rgba(230,57,70,0.15)", border: `1.5px solid ${T.red}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Tienes un partido a medias</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.red, fontWeight: 600 }}>Continuar <ArrowRight size={14} /></span>
        </div>
      )}

      {updateReady && (
        <div style={{ maxWidth: 760, margin: "0 auto 16px", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.dim }}>Hay una versión nueva de la app lista para instalar.</span>
          <button onClick={onApplyUpdate} style={{ ...ghostBtn, borderColor: T.red, color: T.red, fontSize: 11, padding: "6px 12px" }}><RefreshCw size={12} /> Actualizar ahora</button>
        </div>
      )}

      {matches.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
          <StatPill label="Partidos" value={matches.length} color={T.text} />
          <StatPill label="Victorias" value={wins} color={T.red} />
          <StatPill label="Empates" value={draws} color={T.dim} />
          <StatPill label="Derrotas" value={losses} color={T.negative} />
          {trainings.length > 0 && <StatPill label="Entrenos" value={trainings.length} color={T.red} />}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12, maxWidth: 760, margin: "0 auto" }}>
        <HomeTile icon={Play} title="Nuevo partido" desc="Empieza a controlar minutos y estadísticas en directo" color={T.red} onClick={onNewMatch} />
        <HomeTile icon={Dumbbell} title="Nuevo entrenamiento" desc="Mide el tiempo de actividad de cada jugador" color={T.red} onClick={onNewTraining} />
        <HomeTile icon={Shirt} title="Plantilla" desc={`Gestiona jugadores, fotos y dorsales (${playerCount})`} color={T.text} onClick={onGoRoster} />
        <HomeTile icon={Trophy} title="Historial" desc={hasHistory ? `${matches.length} partido${matches.length === 1 ? "" : "s"} · ${trainings.length} entreno${trainings.length === 1 ? "" : "s"}` : "Todavía no hay partidos ni entrenamientos guardados"} color={T.text} onClick={onGoHistory} />
        <HomeTile icon={FileSpreadsheet} title="Exportar a Excel" desc={hasHistory ? "Descarga todas las estadísticas" : "Disponible cuando haya datos guardados"} color={hasHistory ? T.red : T.dim} onClick={hasHistory ? onExport : undefined} disabled={!hasHistory} />
      </div>

      {/* Instalarla en la pantalla de inicio es lo que garantiza que en el
          pabellón, sin wifi, la app abra igual y con todos los datos. */}
      {!standalone && (
        <div style={{ maxWidth: 760, margin: "20px auto 0", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Download size={16} color={T.red} />
            <span className="oswald" style={{ fontSize: 15, fontWeight: 600 }}>Instálala en la tablet</span>
          </div>
          <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.5 }}>
            {canInstall
              ? "Se abre a pantalla completa y funciona sin conexión, con los datos guardados en el propio dispositivo."
              : isIOS
                ? "En iPad/iPhone: botón Compartir → «Añadir a pantalla de inicio». Después funciona sin conexión y sin la barra de Safari."
                : "Desde el menú del navegador, elige «Instalar aplicación». Después funciona sin conexión."}
          </div>
          {canInstall && (
            <button onClick={onInstall} style={{ ...bigBtn, background: T.red, color: "#0A0A0A", marginTop: 12 }}>
              <Download size={15} /> Instalar app
            </button>
          )}
        </div>
      )}

      <div style={{ maxWidth: 760, margin: "16px auto 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: T.dim, textAlign: "center" }}>
        <WifiOff size={12} />
        Funciona sin conexión · los datos se guardan solo en este dispositivo
      </div>

      {matches.length > 0 && (
        <div style={{ maxWidth: 760, margin: "26px auto 0" }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: T.dim, textTransform: "uppercase", marginBottom: 10 }}>Últimos partidos</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.slice(0, 3).map((m) => (
              <div key={m.date} onClick={onGoHistory} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 14px", cursor: "pointer", gap: 10 }}>
                <span style={{ fontSize: 12, color: T.dim }}>{new Date(m.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}</span>
                <span className="oswald" style={{ fontSize: 14, fontWeight: 600 }}>{(team.name || "").split(" ")[0]} {m.teamGoals} — {m.rivalScore} {m.rivalName}</span>
                <ArrowRight size={14} color={T.dim} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamManagerModal({ teams, activeTeamId, onSelect, onFieldChange, onFieldBlur, onPickCrest, onReframeCrest, onRemoveCrest, onAdd, onRemove, onClose }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 460 }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div className="oswald" style={{ fontSize: 18, fontWeight: 600 }}>Mis equipos</div>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: T.dim, marginBottom: 14 }}>Cada equipo tiene su propia plantilla, marcador e historial de partidos.</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
          {teams.map((t) => {
            const isActive = t.id === activeTeamId;
            return (
              <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", background: isActive ? T.surface2 : T.surface, border: `1.5px solid ${isActive ? T.red : T.line}`, borderRadius: 12, padding: 10, flexWrap: "wrap" }}>
                <CrestAvatar crest={t.crest} size={40} onPick={(f) => onPickCrest(t.id, f)} onReframe={() => onReframeCrest(t.id, t.crest)} onRemove={() => onRemoveCrest(t.id)} />
                <div style={{ flex: 1, minWidth: 120 }}>
                  <EditableText value={t.name} onChange={(v) => onFieldChange(t.id, { name: v })} onBlurCommit={onFieldBlur} style={{ fontSize: 14, fontWeight: 600, color: T.text, width: "100%" }} placeholder="Nombre del equipo" />
                  <EditableText value={t.subtitle} onChange={(v) => onFieldChange(t.id, { subtitle: v })} onBlurCommit={onFieldBlur} style={{ fontSize: 12, color: T.dim, width: "100%", display: "block", marginTop: 2 }} placeholder="Categoría" />
                </div>
                {isActive ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: T.red, padding: "6px 10px" }}><Star size={12} /> Activo</span>
                ) : (
                  <button onClick={() => onSelect(t.id)} style={{ ...ghostBtn, borderColor: T.red, color: T.red, fontSize: 11, padding: "6px 10px" }}>Usar este</button>
                )}
                {teams.length > 1 && (
                  <button onClick={() => onRemove(t.id)} style={{ ...iconBtnSm, width: 30, height: 30, color: T.negative }}><Trash2 size={13} /></button>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onAdd} style={{ ...ghostBtn, borderColor: T.red, color: T.red, width: "100%", justifyContent: "center", marginTop: 12 }}>
          <Plus size={14} /> Añadir equipo
        </button>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="oswald" style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: T.dim, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function HomeTile({ icon: Icon, title, desc, color, onClick, disabled }) {
  return (
    <div onClick={onClick} className="tap-target" style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 18, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: T.surface3, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Icon size={19} color={color} />
      </div>
      <div className="oswald" style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.4 }}>{desc}</div>
    </div>
  );
}

function ClockDial({ seconds, progress, running, half }) {
  const r = 30, c = 2 * Math.PI * r;
  const ringColor = !running ? T.white : seconds <= 60 ? T.amber : T.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ position: "relative", width: 68, height: 68 }}>
        <svg viewBox="0 0 68 68" style={{ width: 68, height: 68, transform: "rotate(-90deg)" }}>
          <circle cx="34" cy="34" r={r} fill="none" stroke={T.surface3} strokeWidth="5" />
          <circle cx="34" cy="34" r={r} fill="none" stroke={ringColor} strokeWidth="5" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="oswald" style={{ fontSize: 15, fontWeight: 600 }}>{fmtClock(seconds)}</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.dim }}>
        <div>{half}ª parte</div>
        <div style={{ color: running ? T.red : T.dim }}>{running ? "● en juego" : "○ parado"}</div>
      </div>
    </div>
  );
}

function OccCounter({ label, value, color, onInc, onDec }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 10px", flex: 1 }}>
      <span style={{ fontSize: 11, color: T.dim, whiteSpace: "nowrap" }}>{label}</span>
      <button onClick={onDec} style={iconBtnSm}><Minus size={11} /></button>
      <span className="oswald" style={{ fontSize: 15, fontWeight: 600, color, minWidth: 16, textAlign: "center" }}>{value}</span>
      <button onClick={onInc} style={iconBtnSm}><Plus size={11} /></button>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: active ? T.surface : "transparent", border: "none", borderBottom: active ? `2px solid ${T.red}` : "2px solid transparent", color: active ? T.text : T.dim, fontSize: 13, fontWeight: 500, cursor: "pointer", borderRadius: "8px 8px 0 0" }}>
      <Icon size={15} /> {label}
    </button>
  );
}

function PlayerCard({ player, stats, onCourt, armed, onTap, onOpenStats }) {
  const hasBadges = stats.goals > 0 || stats.yellow > 0 || stats.red > 0;
  return (
    <div
      onClick={onTap}
      className={`tap-target${armed ? " armable" : ""}`}
      style={{
        background: onCourt ? T.red : T.surface,
        border: `3px solid ${onCourt ? "#F2A3A8" : T.line}`,
        boxShadow: onCourt ? "0 0 0 3px rgba(230,57,70,0.35), 0 6px 18px rgba(230,57,70,0.45)" : "none",
        borderRadius: 14, padding: 12, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar player={player} size={56} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: onCourt ? T.bg : T.text }}>{player.name}</div>
          <div className="oswald" style={{ fontSize: 18, fontWeight: 700, color: onCourt ? T.bg : T.dim }}>{fmtMin(stats.seconds)}</div>
        </div>
        <div className="oswald" style={{ fontSize: 34, fontWeight: 700, color: onCourt ? T.bg : T.red, lineHeight: 1, flexShrink: 0 }}>{player.number}</div>
      </div>

      {/* La ficha detallada del jugador estaba programada pero no había forma de
          llegar a ella: este botón es su acceso. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 6, minHeight: 22 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {hasBadges && (
            <>
              {stats.goals > 0 && <MiniBadge color={onCourt ? T.bg : T.red}>⚽ {stats.goals}</MiniBadge>}
              {stats.yellow > 0 && <MiniBadge color={onCourt ? T.bg : T.amber}>🟨 {stats.yellow}</MiniBadge>}
              {stats.red > 0 && <MiniBadge color={onCourt ? T.bg : T.negative}>🟥 {stats.red}</MiniBadge>}
            </>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenStats(); }}
          title={`Estadísticas de ${player.name}`}
          style={{
            display: "flex", alignItems: "center", gap: 4, background: onCourt ? "rgba(10,10,10,0.18)" : T.surface2,
            border: `1px solid ${onCourt ? "rgba(10,10,10,0.3)" : T.line}`, borderRadius: 8, padding: "3px 8px",
            color: onCourt ? T.bg : T.dim, fontSize: 10, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}
        >
          <BarChart3 size={12} /> Ficha
        </button>
      </div>
    </div>
  );
}

function MiniBadge({ children, color }) { return <span style={{ fontSize: 11, color, fontWeight: 600 }}>{children}</span>; }

function TrainingPlayerCard({ player, seconds, active, onToggle }) {
  return (
    <div
      onClick={onToggle}
      className="tap-target"
      style={{
        background: active ? "rgba(230,57,70,0.30)" : T.surface,
        border: `2px solid ${active ? T.red : T.line}`,
        borderRadius: 14, padding: 12, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar player={player} size={56} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: active ? T.text : T.dim, fontWeight: 600 }}>{player.position}{player.isGK ? " · GK" : ""}</div>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{player.name}</div>
          <div className="oswald" style={{ fontSize: 18, fontWeight: 700, color: active ? T.red : T.dim }}>{fmtMin(seconds)}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, color: active ? T.red : T.dim }}>
        {active ? "● ACTIVO" : "○ PARADO"}
      </div>
    </div>
  );
}

function StatDrawer({ player, stats, onClose, onBump }) {
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth: 420, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()} className="fadein">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar player={player} size={48} />
            <div>
              <div style={{ fontSize: 11, color: T.dim }}>{player.position}{player.isGK ? " · Portero" : ""} · #{player.number}</div>
              <div className="oswald" style={{ fontSize: 19, fontWeight: 600 }}>{player.name}</div>
            </div>
          </div>
          <button onClick={onClose} style={iconBtnSm}><X size={16} /></button>
        </div>
        <div className="oswald" style={{ fontSize: 24, fontWeight: 700, color: T.red, margin: "12px 0 14px" }}>{fmtMin(stats.seconds)} <span style={{ fontSize: 12, color: T.dim, fontFamily: "Inter" }}>jugados</span></div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {STAT_DEFS.map((d) => (
            <StatButton key={d.key} def={d} value={stats[d.key] || 0} onInc={() => onBump(d.key, 1)} onDec={() => onBump(d.key, -1)} />
          ))}
          {player.isGK && <StatButton def={{ key: "saves", label: "Parada", icon: Hand, color: T.red }} value={stats.saves || 0} onInc={() => onBump("saves", 1)} onDec={() => onBump("saves", -1)} />}
        </div>
      </div>
    </div>
  );
}

function StatButton({ def, value, onInc, onDec }) {
  const Icon = def.icon;
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon size={16} color={def.color} /><span style={{ fontSize: 13 }}>{def.label}</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onDec} style={iconBtnSm}><Minus size={12} /></button>
        <span className="oswald" style={{ minWidth: 16, textAlign: "center", fontWeight: 600 }}>{value}</span>
        <button onClick={onInc} style={{ ...iconBtnSm, background: def.color, color: "#0A0A0A" }}><Plus size={12} /></button>
      </div>
    </div>
  );
}

function RosterEditor({ players, onAdd, onRemove, onSave, onNewFile, onReframe }) {
  return (
    <div className="fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: T.text, textTransform: "uppercase" }}>
          <Shirt size={14} /> Plantilla · {players.length}
        </div>
        <button onClick={onAdd} style={{ ...ghostBtn, borderColor: T.red, color: T.red }}><Plus size={14} /> Añadir jugador</button>
      </div>
      <div style={{ fontSize: 12, color: T.dim, marginBottom: 12 }}>Toca la foto para moverla y encuadrarla, la cámara para elegir otra, o la X para quitarla.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {players.map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 10, flexWrap: "wrap" }}>
            <EditableAvatar player={p} size={58} onNewFile={(file) => onNewFile(p.id, file)} onReframe={() => onReframe(p.id, p.photo)} onRemove={() => onSave(p.id, { photo: null })} />
            <input type="number" inputMode="numeric" value={p.number} onChange={(e) => onSave(p.id, { number: Number(e.target.value) || 0 })} style={{ width: 56, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.red, padding: "8px 4px", textAlign: "center", fontWeight: 700 }} />
            <input value={p.name} onChange={(e) => onSave(p.id, { name: e.target.value })} style={{ flex: 1, minWidth: 110, background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text, padding: "8px 10px" }} />
            <select value={p.position} onChange={(e) => onSave(p.id, { position: e.target.value, isGK: e.target.value === "POR" })} style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, color: T.text, padding: "8px 6px" }}>
              {POSITIONS.map((pos) => <option key={pos} value={pos}>{POS_LABEL[pos]}</option>)}
            </select>
            <button onClick={() => onRemove(p.id)} style={{ ...iconBtnSm, width: 34, height: 34, color: T.negative }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryView({ matches, trainings, teamName, subTab, onSubTabChange, onExport }) {
  const [open, setOpen] = useState(null);
  const total = matches.length + trainings.length;
  return (
    <div className="fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: T.text, textTransform: "uppercase" }}>
          <History size={14} /> Historial · {total}
        </div>
        {total > 0 && (
          <button onClick={onExport} style={{ ...ghostBtn, borderColor: T.red, color: T.red }}><FileSpreadsheet size={14} /> Exportar a Excel</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <SubTabBtn active={subTab === "partidos"} onClick={() => onSubTabChange("partidos")} label={`Partidos (${matches.length})`} />
        <SubTabBtn active={subTab === "entrenamientos"} onClick={() => onSubTabChange("entrenamientos")} label={`Entrenamientos (${trainings.length})`} />
      </div>

      {subTab === "partidos" && (
        !matches.length ? (
          <div style={{ padding: 20, textAlign: "center", color: T.dim, fontSize: 13, border: `1px dashed ${T.line}`, borderRadius: 12 }}>Todavía no hay partidos guardados. Finaliza un partido para verlo aquí.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {matches.map((m) => (
              <SavedMatchCard
                key={m.date} match={m} teamName={teamName}
                isOpen={open === m.date}
                onToggle={() => setOpen(open === m.date ? null : m.date)}
              />
            ))}
          </div>
        )
      )}

      {subTab === "entrenamientos" && (
        !trainings.length ? (
          <div style={{ padding: 20, textAlign: "center", color: T.dim, fontSize: 13, border: `1px dashed ${T.line}`, borderRadius: 12 }}>Todavía no hay entrenamientos guardados. Finaliza una sesión para verla aquí.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {trainings.map((t) => {
              const isOpen = open === t.date;
              const activeCount = t.players.filter((p) => p.seconds > 0).length;
              return (
                <div key={t.date} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
                  <div onClick={() => setOpen(isOpen ? null : t.date)} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, color: T.dim }}>{new Date(t.date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</div>
                      <div className="oswald" style={{ fontSize: 16, fontWeight: 600 }}>Duración: {fmtMin(t.durationSeconds)}</div>
                    </div>
                    <div style={{ fontSize: 11, color: T.dim }}>{activeCount} jugador{activeCount === 1 ? "" : "es"} con actividad</div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${T.line}`, padding: 12, overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: T.dim, textAlign: "left" }}>
                            <th style={{ padding: "4px 6px" }}>#</th><th style={{ padding: "4px 6px" }}>Jugador</th><th style={{ padding: "4px 6px" }}>Posición</th><th style={{ padding: "4px 6px" }}>Tiempo activo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.players.filter((p) => p.seconds > 0).sort((a, b) => b.seconds - a.seconds).map((p, i) => (
                            <tr key={i} style={{ borderTop: `1px solid ${T.line}` }}>
                              <td style={{ padding: "4px 6px", color: T.red, fontWeight: 600 }}>{p.number}</td>
                              <td style={{ padding: "4px 6px" }}>{p.name}</td>
                              <td style={{ padding: "4px 6px" }}>{p.position}</td>
                              <td style={{ padding: "4px 6px" }}>{fmtMin(p.seconds)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

/* Ficha de un partido ya guardado. Igual que el resumen en directo, deja ver
   cada parte por separado o el total, sin apilar tres tablas en pantalla. */
function SavedMatchCard({ match: m, teamName, isOpen, onToggle }) {
  const halves = halvesOf(m);
  const [tab, setTab] = useState("total");
  const scoreOf = (h) => { const s = halfScore(m, h); return `${s.favor}-${s.contra}`; };

  const shown = tab === "total" ? m.players : (halves.find((h) => String(h.half) === String(tab)) || { players: [] }).players;
  const goalsShown = tab === "total" ? (m.goalEvents || []) : (m.goalEvents || []).filter((ev) => String(ev.half) === String(tab));
  const td = { padding: "4px 6px" };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: T.dim }}>{new Date(m.date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</div>
          <div className="oswald" style={{ fontSize: 16, fontWeight: 600 }}>{(teamName || "").split(" ")[0]} {m.teamGoals} — {m.rivalScore} {m.rivalName}</div>
          {halves.length > 0 && (
            <div style={{ fontSize: 10, color: T.dim, marginTop: 2 }}>1ª {scoreOf(1)} · 2ª {scoreOf(2)}</div>
          )}
        </div>
        <div style={{ fontSize: 11, color: T.dim }}>Ocasiones {m.occFor}–{m.occAgainst}</div>
      </div>

      {isOpen && (
        <div style={{ borderTop: `1px solid ${T.line}`, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: T.dim }}>
              {m.startTime ? `Inicio: ${m.startTime}` : ""}{m.venue ? `${m.startTime ? " · " : ""}${m.venue}` : ""}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => exportSingleMatchToExcel(m, teamName)} style={{ ...ghostBtn, fontSize: 11, padding: "5px 10px" }}><FileSpreadsheet size={12} /> Excel</button>
              <button onClick={() => printMatchReport(m, teamName)} style={{ ...ghostBtn, fontSize: 11, padding: "5px 10px" }}><Save size={12} /> PDF</button>
            </div>
          </div>

          {/* Los partidos guardados antes de que existiera el desglose solo
              tienen el total, y entonces no hay nada que elegir. */}
          {halves.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {halves.map((h) => (
                <SubTabBtn key={h.half} active={String(tab) === String(h.half)} onClick={() => setTab(String(h.half))} label={`${halfLabel(h.half)} · ${scoreOf(h.half)}`} />
              ))}
              <SubTabBtn active={tab === "total"} onClick={() => setTab("total")} label={`Total · ${m.teamGoals}-${m.rivalScore}`} />
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: T.dim, textAlign: "left" }}>
                  <th style={td}>#</th><th style={td}>Jugador</th><th style={td}>Min</th>
                  <th style={td}>G</th><th style={td}>A</th>
                  <th style={td}>TP</th><th style={td}>TF</th>
                  <th style={td}>F</th>
                  <th style={td}>TA</th><th style={td}>TR</th><th style={td}>Par</th>
                  <th style={td}>Rec</th><th style={td}>Pér</th>
                </tr>
              </thead>
              <tbody>
                {shown.filter(hasActivity).map((p, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ ...td, color: T.red, fontWeight: 600 }}>{p.number}</td>
                    <td style={td}>{p.name}</td>
                    <td style={td}>{fmtMin(p.seconds)}</td>
                    <td style={td}>{p.goals}</td><td style={td}>{p.assists}</td>
                    <td style={td}>{p.shotsOn || 0}</td><td style={td}>{p.shotsOff || 0}</td>
                    <td style={td}>{p.fouls}</td><td style={td}>{p.yellow}</td>
                    <td style={td}>{p.red}</td><td style={td}>{p.saves}</td>
                    <td style={td}>{p.recoveries}</td><td style={td}>{p.turnovers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {goalsShown.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Goles</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {goalsShown.map((ev) => (
                  <div key={ev.id} style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 11 }}>
                    <span style={{ fontWeight: 700, color: ev.type === "for" ? T.red : T.negative }}>
                      {ev.type === "for" ? `⚽ ${ev.authorName}` : "⚽ Rival"}
                    </span>
                    {" · "}{ev.phase} · {ev.half}ª parte · {fmtClock(ev.remaining !== undefined ? ev.remaining : ev.seconds)}
                    <div style={{ color: T.dim, marginTop: 2 }}>En pista: {(ev.onCourt || []).map((p) => `#${p.number} ${p.name}`).join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubTabBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 14px", borderRadius: 999, border: `1px solid ${active ? T.red : T.line}`, background: active ? "rgba(230,57,70,0.15)" : "transparent", color: active ? T.red : T.dim, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
      {label}
    </button>
  );
}

/* shared inline styles */
const bigBtn = { display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const ghostBtn = { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 14px", color: T.text, fontSize: 12, cursor: "pointer" };
const iconBtnSm = { display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 6, border: "none", background: T.surface3, color: T.text, cursor: "pointer" };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 90, padding: 16 };
const modalCard = { background: T.surface, border: `1px solid ${T.line}`, borderRadius: "18px 18px 12px 12px", padding: 18, width: "100%", boxShadow: "0 -8px 32px rgba(0,0,0,0.5)" };
