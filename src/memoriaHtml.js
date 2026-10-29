/* HTML de la memoria de temporada / fase (pantalla + PDF).
 *
 * Funcion pura que devuelve un string, igual que fichaHtml.js: se ve en la app
 * y se rasteriza a PDF con exportReportToPdf (los bloques data-pdf-block son los
 * puntos de corte). Todo texto escrito por una persona pasa por esc(). Sin SVG
 * ni canvas: solo cajas y colores, porque html2canvas descarta trazos SVG.
 */

import { RATE_BASE_MIN } from "./jugadores.js";

const esc = (v) => String(v === undefined || v === null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PAL = { red: "#C0202E", ink: "#15181c", dim: "#6b7280", line: "#e6e8eb", soft: "#f6f7f8", favor: "#1FA971", contra: "#D93B4A", amber: "#B7791F" };
const CARD = `border:1px solid ${PAL.line}; border-radius:12px; padding:14px; background:#fff; box-shadow:0 1px 3px rgba(15,23,32,0.05); margin-bottom:12px;`;
const H = `font-size:11px; font-weight:800; letter-spacing:0.6px; text-transform:uppercase; color:${PAL.dim}; margin-bottom:10px;`;
const TH = `padding:6px 8px; text-align:right; font-size:10px; font-weight:800; color:${PAL.dim}; text-transform:uppercase; white-space:nowrap;`;
const TD = `padding:6px 8px; text-align:right; font-size:12px; white-space:nowrap;`;

const fmtDate = (iso) => new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
const signed = (v) => (v > 0 ? `+${v}` : String(v));
const balColor = (v) => (v > 0 ? PAL.favor : v < 0 ? PAL.contra : PAL.dim);
const OUTCOME_BG = { V: PAL.favor, E: "#9aa0a6", D: PAL.contra };

function tile(label, value, sub, color) {
  return `<div style="flex:1 1 130px; min-width:110px; border:1px solid ${PAL.line}; border-radius:10px; padding:10px 12px; background:${PAL.soft};">
    <div style="font-size:9.5px; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; color:${PAL.dim};">${esc(label)}</div>
    <div style="font-size:26px; font-weight:800; line-height:1.15; color:${color || PAL.ink};">${esc(value)}</div>
    <div style="font-size:10.5px; color:${PAL.dim}; min-height:14px;">${esc(sub || "")}</div>
  </div>`;
}

/* Barra doble favor/contra con ancho proporcional al maximo del bloque. */
function dualBar(favor, contra, max) {
  const w = (v) => `${max ? Math.round((v / max) * 100) : 0}%`;
  return `<div style="display:flex; flex-direction:column; gap:2px; min-width:140px;">
    <div style="display:flex; align-items:center; gap:6px;"><div style="height:7px; border-radius:4px; background:${PAL.favor}; width:${w(favor)}; min-width:${favor ? 3 : 0}px;"></div><span style="font-size:10.5px; font-weight:700; color:${PAL.favor};">${favor}</span></div>
    <div style="display:flex; align-items:center; gap:6px;"><div style="height:7px; border-radius:4px; background:${PAL.contra}; width:${w(contra)}; min-width:${contra ? 3 : 0}px;"></div><span style="font-size:10.5px; font-weight:700; color:${PAL.contra};">${contra}</span></div>
  </div>`;
}

/* opts: { teamName, periodLabel, summary, minutes, quintets, phases (Map de analisis.goalsByPhase),
           phaseOrder ([{key,label}]), playersTable (seasonTable), notes, generatedAt } */
export function buildSeasonReportHtml(opts) {
  const { teamName, periodLabel, summary, minutes, quintets, phases, phaseOrder = [], playersTable = [], notes = "", generatedAt } = opts;
  const when = new Date(generatedAt || Date.now()).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
  const dif = summary.gf - summary.ga;

  const resultsRows = summary.results.map((r, i) => `
    <tr style="border-top:1px solid ${PAL.line}; background:${i % 2 ? PAL.soft : "#fff"};">
      <td style="${TD} text-align:left;">${esc(fmtDate(r.date))}</td>
      <td style="${TD} text-align:left;">${esc(r.rival)}</td>
      <td style="${TD}">${r.gf} - ${r.ga}</td>
      <td style="${TD}"><span style="display:inline-block; min-width:20px; text-align:center; padding:1px 6px; border-radius:6px; color:#fff; font-weight:800; font-size:11px; background:${OUTCOME_BG[r.outcome]};">${r.outcome}</span></td>
    </tr>`).join("");

  // Fases: primero las conocidas en su orden, luego cualquier otra que aparezca.
  const known = phaseOrder.map((p) => ({ key: p.key, label: p.label }));
  const extra = [...(phases || new Map()).keys()].filter((k) => !known.some((p) => p.key === k)).map((k) => ({ key: k, label: k }));
  const phaseRows = [...known, ...extra].map((p) => ({ label: p.label, ...(phases && phases.get(p.key) ? phases.get(p.key) : { favor: 0, contra: 0 }) })).filter((p) => p.favor || p.contra);
  const phaseMax = Math.max(1, ...phaseRows.map((p) => Math.max(p.favor, p.contra)));

  const minMax = Math.max(1, ...minutes.rows.map((r) => Math.max(r.favor, r.contra)));
  const minuteBlock = [1, 2].map((half) => `
    <div style="flex:1 1 260px; min-width:0;">
      <div style="font-size:11px; font-weight:800; color:${PAL.ink}; margin-bottom:6px;">${half}ª parte</div>
      <table style="width:100%; border-collapse:collapse;">
        ${minutes.rows.filter((r) => r.half === half).map((r) => `<tr style="border-top:1px solid ${PAL.line};"><td style="${TD} text-align:left; width:64px;">${r.from}–${r.to}'</td><td style="padding:6px 8px;">${dualBar(r.favor, r.contra, minMax)}</td></tr>`).join("")}
      </table>
    </div>`).join("");

  const topPlayers = [...playersTable].filter((p) => p.total.matchesPlayed > 0).sort((a, b) => b.total.seconds - a.total.seconds).slice(0, 10);
  const playerRows = topPlayers.map((p, i) => `
    <tr style="border-top:1px solid ${PAL.line}; background:${i % 2 ? PAL.soft : "#fff"};">
      <td style="${TD} text-align:left;"><span style="color:${PAL.red}; font-weight:800;">${esc(p.number)}</span> ${esc(p.name)}</td>
      <td style="${TD}">${p.total.matchesPlayed}</td><td style="${TD}">${Math.round(p.total.minutes)}</td>
      <td style="${TD}">${p.total.goals}</td><td style="${TD}">${p.total.assists}</td>
      <td style="${TD} font-weight:800; color:${balColor(p.total.balance)};">${esc(signed(p.total.balance))}</td>
    </tr>`).join("");

  const topQuintets = quintets.slice(0, 5);
  const quintetRows = topQuintets.map((q, i) => `
    <tr style="border-top:1px solid ${PAL.line}; background:${i % 2 ? PAL.soft : "#fff"};">
      <td style="${TD} text-align:left; white-space:normal; font-size:11.5px; line-height:1.4;">${q.players.map((p) => `<span style="color:${PAL.red}; font-weight:800;">${esc(p.number)}</span> ${esc(p.name)}`).join(" · ")}${q.size < 5 ? ` <span style="color:${PAL.amber};">(${q.size} en pista)</span>` : ""}</td>
      <td style="${TD}">${q.favor}</td><td style="${TD}">${q.contra}</td>
      <td style="${TD} font-weight:800; color:${balColor(q.diff)};">${esc(signed(q.diff))}</td>
      <td style="${TD} color:${PAL.amber}; font-size:10.5px;">${q.lowSample ? "muestra pequeña" : ""}</td>
    </tr>`).join("");

  return `
  <div style="font-family:Arial, Helvetica, sans-serif; color:${PAL.ink}; background:#fff; max-width:900px; width:100%; margin:0 auto; padding:18px; box-sizing:border-box;">
    <div data-pdf-block style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap; border-bottom:3px solid ${PAL.red}; padding-bottom:10px; margin-bottom:14px;">
      <div>
        <div style="font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:${PAL.red};">${esc(teamName || "Equipo")} · Memoria</div>
        <div style="font-size:28px; font-weight:800; line-height:1.1;">${esc(periodLabel)}</div>
      </div>
      <div style="text-align:right; font-size:11px; color:${PAL.dim};">${summary.played} partido${summary.played === 1 ? "" : "s"} · generada el ${esc(when)}</div>
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Resumen</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${tile("Partidos", summary.played, `${summary.points} puntos (3-1-0)`)}
        ${tile("V - E - D", `${summary.wins} - ${summary.draws} - ${summary.losses}`, "")}
        ${tile("Goles", `${summary.gf} - ${summary.ga}`, `diferencia ${signed(dif)}`, balColor(dif))}
        ${tile("Media por partido", summary.played ? `${(summary.gf / summary.played).toFixed(1).replace(".", ",")} - ${(summary.ga / summary.played).toFixed(1).replace(".", ",")}` : "—", "a favor - en contra")}
      </div>
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Resultados</div>
      ${summary.results.length ? `<table style="width:100%; border-collapse:collapse;"><tr style="color:${PAL.dim};"><th style="${TH} text-align:left;">Fecha</th><th style="${TH} text-align:left;">Rival</th><th style="${TH}">Res.</th><th style="${TH}"></th></tr>${resultsRows}</table>` : `<div style="font-size:12px; color:${PAL.dim};">Sin partidos en el periodo.</div>`}
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Goles por fase <span style="font-weight:600; text-transform:none; letter-spacing:0;">(<span style="color:${PAL.favor};">a favor</span> · <span style="color:${PAL.contra};">en contra</span>)</span></div>
      ${phaseRows.length ? `<table style="width:100%; border-collapse:collapse;">${phaseRows.map((p) => `<tr style="border-top:1px solid ${PAL.line};"><td style="${TD} text-align:left;">${esc(p.label)}</td><td style="padding:6px 8px;">${dualBar(p.favor, p.contra, phaseMax)}</td></tr>`).join("")}</table>` : `<div style="font-size:12px; color:${PAL.dim};">Sin goles registrados.</div>`}
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Goles por minuto <span style="font-weight:600; text-transform:none; letter-spacing:0;">(<span style="color:${PAL.favor};">a favor</span> · <span style="color:${PAL.contra};">en contra</span>, tramos de ${minutes.bucketMin || 5}')</span></div>
      <div style="display:flex; gap:18px; flex-wrap:wrap;">${minuteBlock}</div>
      <div style="font-size:11.5px; line-height:1.5; margin-top:10px;">
        <strong>Primeros 5' de cada parte:</strong> <span style="color:${PAL.favor}; font-weight:700;">${minutes.first5.favor}</span> a favor · <span style="color:${PAL.contra}; font-weight:700;">${minutes.first5.contra}</span> en contra.
        <strong style="margin-left:8px;">Últimos 5' de cada parte:</strong> <span style="color:${PAL.favor}; font-weight:700;">${minutes.last5.favor}</span> a favor · <span style="color:${PAL.contra}; font-weight:700;">${minutes.last5.contra}</span> en contra.
      </div>
      <div style="font-size:10.5px; color:${PAL.dim}; margin-top:6px; line-height:1.5;">
        ${minutes.total.favor + minutes.total.contra} goles con minuto${minutes.extraTime.favor + minutes.extraTime.contra ? ` · ${minutes.extraTime.favor + minutes.extraTime.contra} en la prórroga (no entran en los tramos)` : ""}${minutes.withoutMinute ? ` · ${minutes.withoutMinute} sin minuto registrado (partidos antiguos), no incluidos` : ""}.
      </div>
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Jugadores con más minutos</div>
      ${topPlayers.length ? `<table style="width:100%; border-collapse:collapse;"><tr style="color:${PAL.dim};"><th style="${TH} text-align:left;">Jugador</th><th style="${TH}">PJ</th><th style="${TH}">Min</th><th style="${TH}">G</th><th style="${TH}">A</th><th style="${TH}">+/-</th></tr>${playerRows}</table>` : `<div style="font-size:12px; color:${PAL.dim};">Sin minutos registrados.</div>`}
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Quintetos con más goles</div>
      ${topQuintets.length ? `<table style="width:100%; border-collapse:collapse;"><tr style="color:${PAL.dim};"><th style="${TH} text-align:left;">Quinteto en pista al marcarse</th><th style="${TH}">A favor</th><th style="${TH}">En contra</th><th style="${TH}">+/-</th><th style="${TH}"></th></tr>${quintetRows}</table>` : `<div style="font-size:12px; color:${PAL.dim};">Sin goles con quinteto registrado.</div>`}
    </div>

    ${notes && notes.trim() ? `<div data-pdf-block style="${CARD}">
      <div style="${H}">Conclusiones del entrenador</div>
      <div style="font-size:13px; line-height:1.55; white-space:pre-wrap;">${esc(notes.trim())}</div>
    </div>` : ""}

    <div data-pdf-block style="font-size:10.5px; color:${PAL.dim}; line-height:1.5; padding:4px 2px 0;">
      <strong>Cómo leerlo.</strong> Los minutos de los goles son tiempo jugado dentro de cada parte. El balance de un quinteto es de <em>goles</em> (a favor menos en contra) con esos cinco en pista al marcarse: la app no guarda cuánto tiempo estuvo cada quinteto, así que no es un balance por minuto y con pocos goles es anecdótico.
      El +/- de un jugador es contexto, no mérito individual. Los ritmos por ${RATE_BASE_MIN} min están en la ficha de cada jugador. Los datos salen de lo anotado en los partidos; lo que no se anotó no se estima.
    </div>
  </div>`;
}
