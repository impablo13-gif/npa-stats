/* HTML de la ficha individual de un jugador (pantalla + PDF).
 *
 * Funcion pura que devuelve un string: la misma ficha se ve en la app y se
 * rasteriza a PDF con exportReportToPdf (los bloques con data-pdf-block son los
 * puntos de corte de pagina). Todo texto escrito por una persona (nombres,
 * rival, conclusiones) pasa por esc(): un "<" en un nombre no puede romper ni
 * inyectar nada. No usa SVG ni canvas, solo cajas y colores, porque html2canvas
 * descarta trazos SVG al capturar paginas largas.
 */

import { ZONES_COARSE, ZONES_FINE, ZONE_ACTIONS, FINE_ROW_NAMES, countByZone, isFineKey } from "./zonas.js";
import { MIN_RATE_SECONDS, RATE_BASE_MIN } from "./jugadores.js";

const esc = (v) => String(v === undefined || v === null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PAL = {
  red: "#C0202E", ink: "#15181c", dim: "#6b7280", line: "#e6e8eb", soft: "#f6f7f8",
  favor: "#1FA971", favorBg: "#EAFBF3", contra: "#D93B4A", contraBg: "#FDEEF0", amber: "#B7791F",
};
const CARD = `border:1px solid ${PAL.line}; border-radius:12px; padding:14px; background:#fff; box-shadow:0 1px 3px rgba(15,23,32,0.05); margin-bottom:12px;`;
const H = `font-size:11px; font-weight:800; letter-spacing:0.6px; text-transform:uppercase; color:${PAL.dim}; margin-bottom:10px;`;
const TH = `padding:6px 8px; text-align:right; font-size:10px; font-weight:800; color:${PAL.dim}; text-transform:uppercase; white-space:nowrap;`;
const TD = `padding:6px 8px; text-align:right; font-size:12px; white-space:nowrap;`;

const ZONE_RGB = {
  finish: "230,57,70", goal: "230,57,70", shotsOn: "230,57,70", shotsOff: "120,120,120", shotsPost: "200,150,30",
  recoveries: "31,169,113", turnovers: "200,150,30", fouls: "224,138,60", foulsReceived: "46,155,214",
};

const fmtClock = (s) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, "0")}"`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtNum = (v, d = 1) => (v === null || v === undefined ? "—" : String(Number(v.toFixed(d))).replace(".", ","));
const signed = (v) => (v > 0 ? `+${v}` : String(v));
const balColor = (v) => (v > 0 ? PAL.favor : v < 0 ? PAL.contra : PAL.dim);

function tile(label, value, sub, color) {
  return `<div style="flex:1 1 130px; min-width:110px; border:1px solid ${PAL.line}; border-radius:10px; padding:10px 12px; background:${PAL.soft};">
    <div style="font-size:9.5px; font-weight:800; letter-spacing:0.5px; text-transform:uppercase; color:${PAL.dim};">${esc(label)}</div>
    <div style="font-size:26px; font-weight:800; line-height:1.15; color:${color || PAL.ink};">${esc(value)}</div>
    <div style="font-size:10.5px; color:${PAL.dim}; min-height:14px;">${esc(sub || "")}</div>
  </div>`;
}

/* Mapa de zonas hecho con cajas (no SVG). Fila 0 = junto a la porteria propia,
   se dibuja abajo; la rival, arriba. */
function zoneGrid(events, action) {
  const def = ZONE_ACTIONS.find((a) => a.key === action) || ZONE_ACTIONS[0];
  const filtered = events.filter((e) => def.members.includes(e.action));
  const hasFine = filtered.some((e) => isFineKey(e.zone));
  const resolution = hasFine ? "fine" : "coarse";
  const { counts, share, total, max, excluded } = countByZone(filtered, resolution);
  const zones = resolution === "fine" ? ZONES_FINE : ZONES_COARSE;
  const rows = resolution === "fine" ? 6 : 3;
  const rgb = ZONE_RGB[action] || ZONE_RGB.finish;
  const rowH = resolution === "fine" ? 44 : 70;
  let cells = "";
  for (let r = rows - 1; r >= 0; r -= 1) {
    for (let c = 0; c < 3; c += 1) {
      const z = zones.find((zz) => zz.row === r && zz.col === c);
      const n = counts[z.key];
      const alpha = n > 0 && max > 0 ? 0.15 + 0.75 * (n / max) : 0.05;
      const dark = alpha > 0.5;
      cells += `<td style="height:${rowH}px; border:2px solid #fff; background:rgba(${rgb},${alpha.toFixed(2)}); text-align:center; vertical-align:middle; border-radius:6px;">
        <div style="font-size:18px; font-weight:800; color:${n > 0 ? (dark ? "#fff" : PAL.ink) : "#b5b9bf"};">${n}</div>
        <div style="font-size:9.5px; color:${n > 0 ? (dark ? "rgba(255,255,255,0.9)" : PAL.dim) : "#b5b9bf"};">${total ? `${Math.round(share[z.key] * 100)} %` : "—"}</div>
      </td>`;
    }
    cells += "</tr><tr>";
  }
  cells = cells.replace(/<tr>$/, "");
  const grid = `<table style="border-collapse:separate; border-spacing:0; width:100%; table-layout:fixed;"><tr>${cells}</table>`;
  const note = resolution === "fine"
    ? `18 zonas${excluded ? ` · ${excluded} registro${excluded === 1 ? "" : "s"} antiguo${excluded === 1 ? "" : "s"} (anotado${excluded === 1 ? "" : "s"} en 9 zonas) no se puede${excluded === 1 ? "" : "n"} repartir aquí` : ""}`
    : "9 zonas (registros anotados con la rejilla antigua)";
  return { html: grid, total, note, label: def.label, rowNames: resolution === "fine" ? FINE_ROW_NAMES : ["Defensa", "Medio", "Ataque"] };
}

/* opts: { report, teamName, periodLabel, zoneEvents, zoneAction, notes, generatedAt } */
export function buildPlayerReportHtml(opts) {
  const { report, teamName, periodLabel, zoneEvents = [], zoneAction = "finish", notes = "", generatedAt } = opts;
  const t = report.total;
  const when = new Date(generatedAt || Date.now()).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
  const noMinutes = t.matchesPlayed === 0;

  const maxSec = Math.max(1, ...report.series.map((s) => s.seconds));
  const seriesRows = report.series.map((s, i) => `
    <tr style="border-top:1px solid ${PAL.line}; background:${i % 2 ? PAL.soft : "#fff"};">
      <td style="${TD} text-align:left;">${esc(fmtDate(s.matchDate))} <span style="color:${PAL.dim};">vs ${esc(s.rival)}</span></td>
      <td style="${TD}">${esc(s.result)}</td>
      <td style="${TD} min-width:120px;">
        ${s.played
    ? `<div style="display:flex; align-items:center; gap:6px; justify-content:flex-end;"><div style="flex:1; height:7px; border-radius:4px; background:#eceef0; overflow:hidden; min-width:50px;"><div style="width:${Math.round((s.seconds / maxSec) * 100)}%; height:100%; background:${PAL.red};"></div></div><span>${esc(fmtClock(s.seconds))}</span></div>`
    : `<span style="color:${PAL.dim};">no jugó</span>`}
      </td>
      <td style="${TD}">${s.goals}</td><td style="${TD}">${s.assists}</td><td style="${TD}">${s.finishes}</td>
      <td style="${TD}">${s.recoveries}</td><td style="${TD}">${s.turnovers}</td>
      <td style="${TD} font-weight:800; color:${s.played ? balColor(s.balance) : PAL.dim};">${s.played ? esc(signed(s.balance)) : "—"}</td>
    </tr>`).join("");

  const zone = zoneGrid(zoneEvents, zoneAction);
  const rate = (label, v) => `<tr style="border-top:1px solid ${PAL.line};"><td style="${TD} text-align:left;">${esc(label)}</td><td style="${TD} font-weight:700;">${esc(fmtNum(v))}</td></tr>`;

  const rateNote = !t.rateReliable
    ? `Ritmos por ${RATE_BASE_MIN}' no calculados: hacen falta al menos ${MIN_RATE_SECONDS / 60} min jugados en el periodo (lleva ${fmtNum(t.minutes, 0)}). Con menos minutos un ritmo engaña.`
    : t.rateLowSample ? `Muestra pequeña (${fmtNum(t.minutes, 0)} min): toma los ritmos como orientación.` : "";

  return `
  <div style="font-family:Arial, Helvetica, sans-serif; color:${PAL.ink}; background:#fff; max-width:900px; width:100%; margin:0 auto; padding:18px; box-sizing:border-box;">
    <div data-pdf-block style="display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap; border-bottom:3px solid ${PAL.red}; padding-bottom:10px; margin-bottom:14px;">
      <div>
        <div style="font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:${PAL.red};">${esc(teamName || "Equipo")} · Ficha de jugador</div>
        <div style="font-size:30px; font-weight:800; line-height:1.1;">${report.number !== undefined && report.number !== "" ? `#${esc(report.number)} ` : ""}${esc(report.name)}</div>
        <div style="font-size:12px; color:${PAL.dim};">${esc(report.position || (report.isGK ? "Portero" : ""))}${report.isGK && report.position !== "POR" ? " · portero" : ""}</div>
      </div>
      <div style="text-align:right; font-size:11px; color:${PAL.dim};">
        <div style="font-weight:700; color:${PAL.ink};">${esc(periodLabel)}</div>
        <div>${report.matchesInPeriod} partido${report.matchesInPeriod === 1 ? "" : "s"} en el periodo · generada el ${esc(when)}</div>
      </div>
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Resumen</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${tile("Convocatorias", t.matchesCalled, `${t.matchesPlayed} con minutos`)}
        ${tile("Minutos", noMinutes ? "0" : fmtNum(t.minutes, 0), noMinutes ? "sin minutos" : `${fmtClock(t.avgSeconds)} por partido`)}
        ${tile("Goles", t.goals, t.finishes ? `${Math.round((t.efficiency || 0) * 100)} % de ${t.finishes} finalizaciones` : "sin finalizaciones")}
        ${tile("Asistencias", t.assists, "")}
        ${tile("+/- en pista", noMinutes ? "—" : signed(t.balance), noMinutes ? "" : `${t.balanceFavor} a favor · ${t.balanceContra} en contra`, noMinutes ? PAL.dim : balColor(t.balance))}
      </div>
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="display:flex; gap:16px; flex-wrap:wrap;">
        <div style="flex:2 1 320px; min-width:0;">
          <div style="${H}">Acciones (total del periodo)</div>
          <table style="width:100%; border-collapse:collapse;">
            <tr style="color:${PAL.dim};"><th style="${TH} text-align:left;">Acción</th><th style="${TH}">Total</th></tr>
            ${[["Tiros a puerta", t.shotsOn], ["Tiros fuera", t.shotsOff], ["Tiros al palo", t.shotsPost], ["Recuperaciones", t.recoveries], ["Pérdidas", t.turnovers],
    ["Faltas cometidas", t.fouls], ["Faltas recibidas", t.foulsReceived], ["Amarillas", t.yellow], ["Rojas", t.red], ...(report.isGK || t.saves ? [["Paradas", t.saves]] : [])]
    .map(([l, v]) => `<tr style="border-top:1px solid ${PAL.line};"><td style="${TD} text-align:left;">${esc(l)}</td><td style="${TD} font-weight:700;">${v}</td></tr>`).join("")}
          </table>
        </div>
        <div style="flex:1 1 220px; min-width:0;">
          <div style="${H}">Ritmo por ${RATE_BASE_MIN} min</div>
          <table style="width:100%; border-collapse:collapse;">
            ${rate("Goles", t.rates.goals)}${rate("Asistencias", t.rates.assists)}${rate("Finalizaciones", t.rates.finishes)}
            ${rate("Recuperaciones", t.rates.recoveries)}${rate("Pérdidas", t.rates.turnovers)}${rate("Faltas cometidas", t.rates.fouls)}
          </table>
          ${rateNote ? `<div style="font-size:10.5px; color:${PAL.amber}; margin-top:6px; line-height:1.4;">${esc(rateNote)}</div>` : ""}
        </div>
      </div>
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Partido a partido</div>
      ${report.series.length ? `<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; min-width:560px;">
        <tr style="color:${PAL.dim};"><th style="${TH} text-align:left;">Partido</th><th style="${TH}">Res.</th><th style="${TH}">Minutos</th><th style="${TH}">G</th><th style="${TH}">A</th><th style="${TH}">Fin.</th><th style="${TH}">Rec</th><th style="${TH}">Pér</th><th style="${TH}">+/-</th></tr>
        ${seriesRows}
      </table></div>` : `<div style="font-size:12px; color:${PAL.dim};">Sin partidos en el periodo.</div>`}
    </div>

    <div data-pdf-block style="${CARD}">
      <div style="${H}">Mapa de zonas · ${esc(zone.label)}</div>
      ${zone.total ? `
        <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-start;">
          <div style="flex:0 1 260px; width:260px; max-width:100%;">
            <div style="text-align:center; font-size:9px; font-weight:800; letter-spacing:1px; color:${PAL.dim}; margin-bottom:3px;">PORTERÍA RIVAL ▲</div>
            ${zone.html}
            <div style="text-align:center; font-size:9px; font-weight:800; letter-spacing:1px; color:${PAL.dim}; margin-top:3px;">▼ VUESTRA PORTERÍA</div>
          </div>
          <div style="flex:1 1 200px; font-size:11.5px; line-height:1.5; color:${PAL.dim};">
            <div><strong style="color:${PAL.ink};">n = ${zone.total}</strong> registros con zona · ${esc(zone.note)}</div>
            <div style="margin-top:6px;">La zona se marca a mano al anotar la acción: es una <strong>distribución por zonas</strong>, no la posición exacta ni la ocupación de la pista.${zone.total < 15 ? " Con tan pocos registros es solo orientativo." : ""}</div>
          </div>
        </div>` : `<div style="font-size:12px; color:${PAL.dim};">Sin registros con zona para esta acción en el periodo.</div>`}
    </div>

    ${notes && notes.trim() ? `<div data-pdf-block style="${CARD}">
      <div style="${H}">Conclusiones del entrenador</div>
      <div style="font-size:13px; line-height:1.55; white-space:pre-wrap;">${esc(notes.trim())}</div>
    </div>` : ""}

    <div data-pdf-block style="font-size:10.5px; color:${PAL.dim}; line-height:1.5; padding:4px 2px 0;">
      <strong>Cómo leerlo.</strong> El +/- en pista son los goles a favor menos los recibidos mientras el jugador estaba en el quinteto: es contexto, no mérito individual (depende de con quién comparte pista). Solo cuenta partidos con minutos.
      Finalizaciones = goles + tiros a puerta + fuera + al palo. Los datos salen de lo anotado en los partidos guardados; lo que no se anotó no se estima.
    </div>
  </div>`;
}

export const _esc = esc; // para pruebas
