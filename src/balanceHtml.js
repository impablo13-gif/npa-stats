/* HTML del balance mas/menos y de los quintetos de UN partido (pantalla + PDF).
 *
 * Funciones puras que devuelven strings con tablas y cajas (sin SVG ni canvas,
 * que html2canvas descarta en paginas largas). Cada fila lleva data-pdf-block:
 * son puntos de corte de pagina, asi una tabla larga no se parte por la mitad de
 * una fila. Todo texto escrito por una persona pasa por esc().
 */

import { matchBalance, sortBalance, verifyBalance, balanceGoalDetail, balanceSummary } from "./balancePartido.js";
import { quintetBalance, onCourtSegments, QUINTET_RATE_MIN_SECONDS, QUINTET_LOW_SAMPLE_SECONDS } from "./analisis.js";

const esc = (v) => String(v === undefined || v === null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PAL = {
  ink: "#15181c", dim: "#6b7280", line: "#e6e8eb", soft: "#f6f7f8",
  favor: "#1FA971", favorBg: "#EAFBF3", contra: "#D93B4A", contraBg: "#FDEEF0", amber: "#B7791F", amberBg: "#FEF8E7",
};
const TH = `padding:7px 8px; text-align:right; font-size:9.5px; font-weight:800; color:${PAL.dim}; text-transform:uppercase; letter-spacing:0.4px; white-space:nowrap; background:${PAL.soft};`;
const TD = `padding:7px 8px; text-align:right; font-size:11.5px; white-space:nowrap;`;
const TABLE = `width:100%; border-collapse:collapse; border:1px solid ${PAL.line};`;

const signed = (v) => (v > 0 ? `+${v}` : String(v));
const fmtMin = (s) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, "0")}"`;
const fmtDec = (v) => (v > 0 ? "+" : "") + String(Number(v.toFixed(1))).replace(".", ",");
const halfName = (h) => (h === 1 ? "1ª parte" : h === 2 ? "2ª parte" : "Prórroga");
const halfShort = (h) => (h === 1 ? "1ª P" : h === 2 ? "2ª P" : "Prór.");

const STATUS_STYLE = {
  pos: { color: PAL.favor, bg: PAL.favorBg, label: "Positivo" },
  neg: { color: PAL.contra, bg: PAL.contraBg, label: "Negativo" },
  zero: { color: PAL.ink, bg: "#fff", label: "Cero" },
  np: { color: "#9aa0a6", bg: "#fff", label: "NP" },
};

function halvesOf(match) {
  const set = new Set();
  (match.goalEvents || []).forEach((e) => set.add(Number(e.half) || 1));
  (match.rotations || []).forEach((r) => set.add(Number(r.half) || 1));
  set.add(1); set.add(2);
  return [...set].filter((h) => h >= 1 && h <= 3).sort((a, b) => a - b);
}

function cell(r, v, extra = "") { return `<td style="${TD} ${extra}">${v}</td>`; }

/* Cuerpo de la seccion "Balance mas/menos": todos los convocados. */
export function buildBalanceBody(match, { sortBy = "balance" } = {}) {
  const rows = sortBalance(matchBalance(match), sortBy);
  const halves = halvesOf(match);
  const perHalf = halves.map((h) => new Map(matchBalance(match, { half: h }).map((r) => [r.key, r])));
  const sum = balanceSummary(rows);
  const check = verifyBalance(match);
  const hasRot = check.tieneRotaciones;

  if (!rows.length) return `<div style="font-size:11px; color:${PAL.dim};">Este partido no tiene jugadores guardados.</div>`;

  const body = rows.map((r) => {
    const st = STATUS_STYLE[r.status];
    const np = r.status === "np";
    const dash = `<span style="color:#c4c8cd;">—</span>`;
    const halfCells = halves.map((h, i) => {
      const hr = perHalf[i].get(r.key);
      if (np || !hr || !hr.played) return cell(r, dash);
      return cell(r, esc(signed(hr.balance)), `color:${hr.balance > 0 ? PAL.favor : hr.balance < 0 ? PAL.contra : PAL.dim};`);
    }).join("");
    return `<tr data-pdf-block="true" style="border-top:1px solid ${PAL.line}; background:${st.bg};">
      <td style="${TD} text-align:left; font-weight:${np ? 500 : 700}; color:${np ? st.color : PAL.ink};"><span style="color:${PAL.dim}; font-weight:600;">${esc(r.number)}</span> &nbsp;${esc(r.name)}${r.isGK ? ` <span style="font-size:9px; color:${PAL.dim};">POR</span>` : ""}</td>
      ${cell(r, np ? dash : esc(fmtMin(r.seconds || 0)))}
      ${cell(r, np ? dash : String(r.favor), `color:${PAL.favor};`)}
      ${cell(r, np ? dash : String(r.contra), `color:${PAL.contra};`)}
      <td style="${TD} font-weight:800; font-size:13px; color:${st.color}; ${np ? "font-style:italic; font-weight:600; font-size:11px;" : ""}">${np ? "NP" : esc(signed(r.balance))}</td>
      ${halfCells}
    </tr>`;
  }).join("");

  const chip = (n, label, color) => `<span style="display:inline-block; margin:0 8px 4px 0; font-size:10.5px; color:${color}; font-weight:700;">${n} ${esc(label)}</span>`;
  const summary = `<div style="margin-bottom:8px;">
      ${chip(sum.positivos, "con balance positivo", PAL.favor)}${chip(sum.ceros, sum.ceros === 1 ? "con balance 0" : "con balance 0", PAL.ink)}${chip(sum.negativos, "con balance negativo", PAL.contra)}${chip(sum.noParticiparon, "no participaron (NP)", "#9aa0a6")}
    </div>`;

  const notes = [];
  if (check.sinFoto) notes.push(`${check.sinFoto} gol${check.sinFoto === 1 ? "" : "es"} sin los jugadores en pista guardados: no se puede atribuir y no suma a nadie.`);
  if (check.fueraDeRotacion) notes.push(`${check.fueraDeRotacion} caso${check.fueraDeRotacion === 1 ? "" : "s"} en que un jugador figura en pista en un gol sin que sus rotaciones lo cubran (revisa ese gol).`);
  if (check.marcador && !check.marcador.ok) notes.push(`Los goles registrados (${check.marcador.registrados.join("-")}) no coinciden con el marcador guardado (${check.marcador.guardado.join("-")}).`);
  if (!hasRot) notes.push("Este partido no guardó rotaciones: el balance sale de los jugadores en pista de cada gol, pero no se pudo contrastar con las entradas y salidas.");
  const verify = notes.length
    ? `<div style="margin-top:8px; background:${PAL.amberBg}; border:1px solid #F0DCA0; border-radius:8px; padding:8px 12px; font-size:10px; color:#665;"><b>Revisar:</b> ${notes.map(esc).join(" ")}</div>`
    : `<div style="margin-top:8px; font-size:9.5px; color:${PAL.dim};">Comprobado: los ${check.goles} gol${check.goles === 1 ? "" : "es"} cuadran con el marcador y con las rotaciones.</div>`;

  const goalRows = balanceGoalDetail(match).map((g) => {
    const isFor = g.type === "for";
    const when = g.elapsed === null ? "—" : fmtMin(g.elapsed);
    const lineup = g.onCourt.length ? g.onCourt.map((p) => esc(p.number)).join(" · ") : `<span style="color:#c4c8cd;">sin datos</span>`;
    return `<tr data-pdf-block="true" style="border-top:1px solid ${PAL.line};">
      <td style="${TD} text-align:left;">${esc(halfShort(g.half))}</td>
      <td style="${TD}">${esc(when)}</td>
      <td style="${TD} text-align:left; font-weight:700; color:${isFor ? PAL.favor : PAL.contra};">${isFor ? (g.ownGoal ? "A favor (autogol rival)" : "A favor") : "En contra"}</td>
      <td style="${TD} text-align:left;">${lineup}</td>
    </tr>`;
  }).join("");
  const detail = !goalRows ? "" : `
    <div data-pdf-block="true" style="font-size:10px; font-weight:800; color:${PAL.dim}; text-transform:uppercase; letter-spacing:0.5px; margin:16px 0 6px;">Goles que explican el balance <span style="font-weight:500; text-transform:none;">(dorsales en pista en cada gol)</span></div>
    <table style="${TABLE}"><thead><tr><th style="${TH} text-align:left;">Parte</th><th style="${TH}">Min</th><th style="${TH} text-align:left;">Gol</th><th style="${TH} text-align:left;">En pista</th></tr></thead><tbody>${goalRows}</tbody></table>`;

  return `
    ${summary}
    <table style="${TABLE}">
      <thead><tr data-pdf-block="true">
        <th style="${TH} text-align:left;">Jugador</th><th style="${TH}">Min</th><th style="${TH}">GF</th><th style="${TH}">GC</th><th style="${TH}">+/-</th>
        ${halves.map((h) => `<th style="${TH}">${esc(halfShort(h))}</th>`).join("")}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div style="margin-top:8px; font-size:9.5px; color:${PAL.dim}; line-height:1.5;">
      <b>+/-</b> = goles a favor − goles en contra mientras el jugador estaba en pista (GF y GC son esos goles). Un gol cuenta para los jugadores que estaban en pista cuando se marcó; la suma de todos no es el marcador. Un <b>0</b> es un jugador que jugó y quedó igualado; <b>NP</b> es convocado que no participó. Es contexto, no mérito individual: depende de con quién se comparte pista.
    </div>
    ${verify}
    ${detail}`;
}

/* Cuerpo de la seccion "Quintetos del partido". */
export function buildQuintetsBody(match) {
  const segs = onCourtSegments(match);
  if (!segs || !segs.length) {
    return `<div style="font-size:11px; color:${PAL.dim};">Este partido no guardó rotaciones, así que no se pueden calcular los minutos de cada quinteto.</div>`;
  }
  const list = quintetBalance([match], { minSeconds: 60 }).filter((q) => q.seconds > 0);
  if (!list.length) return `<div style="font-size:11px; color:${PAL.dim};">No hay quintetos con tiempo suficiente.</div>`;
  const members = (q) => q.players.map((p) => `<span style="color:${PAL.dim}; font-weight:600;">${esc(p.number)}</span> ${esc(String(p.name || "").split(" ")[0])}`).join(" · ");
  const rows = list.map((q) => {
    const per40 = q.per40 === null ? `<span style="color:#c4c8cd;">—</span>` : `<span style="color:${q.per40 > 0 ? PAL.favor : q.per40 < 0 ? PAL.contra : PAL.dim}; font-weight:700;">${esc(fmtDec(q.per40))}</span>`;
    return `<tr data-pdf-block="true" style="border-top:1px solid ${PAL.line};">
      <td style="${TD} text-align:left; white-space:normal; line-height:1.5;">${members(q)}${q.size !== 5 ? ` <span style="font-size:9px; color:${PAL.amber};">(${q.size} jugadores)</span>` : ""}${q.lowSample ? ` <span style="font-size:9px; color:${PAL.dim};">muestra pequeña</span>` : ""}</td>
      <td style="${TD} font-weight:700;">${esc(fmtMin(q.seconds))}</td>
      <td style="${TD}">${q.intervals}</td>
      <td style="${TD} color:${PAL.favor};">${q.timedFavor}</td>
      <td style="${TD} color:${PAL.contra};">${q.timedContra}</td>
      <td style="${TD} font-weight:800; color:${q.timedFavor - q.timedContra > 0 ? PAL.favor : q.timedFavor - q.timedContra < 0 ? PAL.contra : PAL.ink};">${esc(signed(q.timedFavor - q.timedContra))}</td>
      <td style="${TD}">${per40}</td>
    </tr>`;
  }).join("");
  return `
    <table style="${TABLE}">
      <thead><tr data-pdf-block="true">
        <th style="${TH} text-align:left;">Quinteto</th><th style="${TH}">Min</th><th style="${TH}">Veces</th><th style="${TH}">GF</th><th style="${TH}">GC</th><th style="${TH}">+/-</th><th style="${TH}">+/- por 40'</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:8px; font-size:9.5px; color:${PAL.dim}; line-height:1.5;">
      Un quinteto es el grupo exacto de jugadores en pista, sin importar el orden. Los minutos son tiempo de juego (el reloj de la app se para en los parones) y "Veces" es cuántas veces seguidas estuvo en pista. El +/- por 40' solo se calcula con ${QUINTET_RATE_MIN_SECONDS / 60} min o más juntos; con menos de ${QUINTET_LOW_SAMPLE_SECONDS / 60} min o pocos goles es anecdótico. Solo se muestran quintetos con al menos 1 min.
    </div>`;
}
