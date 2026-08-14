/* Copias de seguridad: llevarse los datos a otra tablet, o recuperarlos si la
 * tablet se rompe o el navegador los borra.
 *
 * Toda la app vive en el dispositivo, sin servidor, asi que la unica forma
 * honesta de mover los datos es un archivo: se genera aqui, se pasa por
 * AirDrop, correo o WhatsApp, y se carga en el otro dispositivo. No hace falta
 * internet en ningun momento.
 */
import { storage } from "./storage.js";

export const BACKUP_FORMAT = "npa-stats-copia";
export const BACKUP_VERSION = 1;

// Los borradores son un partido a medias de ESTE dispositivo: llevarselos a
// otra tablet solo generaria confusion. La copia guarda lo consolidado.
const isTransientKey = (k) => String(k).startsWith("draft:") || k === "activeTeamId";

export async function buildBackup() {
  const all = await storage.all();
  const datos = {};
  Object.entries(all).forEach(([k, v]) => {
    if (isTransientKey(k)) return;
    if (typeof v === "string") datos[k] = v;
  });
  return {
    formato: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: "NPA Stats",
    creada: new Date().toISOString(),
    datos,
  };
}

export function summarizeBackup(backup) {
  const datos = (backup && backup.datos) || {};
  let equipos = [];
  try { equipos = JSON.parse(datos.teams || "[]"); } catch (e) {}

  let jugadores = 0;
  Object.entries(datos).forEach(([k, v]) => {
    if (!k.startsWith("roster:")) return;
    try { const r = JSON.parse(v); if (Array.isArray(r)) jugadores += r.length; } catch (e) {}
  });

  const claves = Object.keys(datos);
  const bytes = claves.reduce((n, k) => n + k.length + (datos[k] || "").length, 0);

  return {
    equipos: Array.isArray(equipos) ? equipos : [],
    partidos: claves.filter((k) => k.startsWith("matches:")).length,
    entrenos: claves.filter((k) => k.startsWith("trainings:")).length,
    jugadores,
    creada: backup && backup.creada,
    bytes,
  };
}

export function fmtBytes(n) {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function backupFileName() {
  return `npa-stats_copia_${new Date().toISOString().slice(0, 10)}.json`;
}

/* En iPad lo natural es la hoja de compartir (AirDrop, WhatsApp, correo);
   donde no exista, se descarga el archivo como en cualquier web. */
export async function shareOrDownload(json, filename) {
  const blob = new Blob([json], { type: "application/json" });
  try {
    if (navigator.canShare && typeof File === "function") {
      const file = new File([blob], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Copia de NPA Stats" });
        return "compartido";
      }
    }
  } catch (e) {
    // Si la persona cierra la hoja de compartir no es un error: no se descarga
    // por detras, simplemente no se hizo nada.
    if (e && e.name === "AbortError") return "cancelado";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "descargado";
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        return reject(new Error("El archivo no se puede leer: puede estar dañado o no ser una copia."));
      }
      if (!parsed || parsed.formato !== BACKUP_FORMAT) {
        return reject(new Error("Ese archivo no es una copia de NPA Stats."));
      }
      if (!parsed.datos || typeof parsed.datos !== "object" || !parsed.datos.teams) {
        return reject(new Error("La copia está incompleta: no contiene ningún equipo."));
      }
      if (Number(parsed.version) > BACKUP_VERSION) {
        return reject(new Error("La copia viene de una versión más nueva de la app. Actualiza la app antes de importarla."));
      }
      resolve(parsed);
    };
    reader.readAsText(file);
  });
}

/* Dos formas de importar, con consecuencias muy distintas:
 *
 *  · "reemplazar": borra lo que haya y deja el dispositivo igual que el que
 *    hizo la copia. Es lo que se quiere en una tablet nueva.
 *
 *  · "anadir": trae los equipos de la copia sin tocar los demas. Si un equipo
 *    ya estaba, su plantilla pasa a ser la de la copia y sus partidos se suman
 *    a los que ya hubiera.
 */
export async function applyBackup(backup, mode) {
  const datos = { ...(backup.datos || {}) };

  if (mode === "reemplazar") {
    await storage.clear();
    await storage.setMany(datos);
    return;
  }

  let locales = [];
  try {
    const actual = await storage.get("teams");
    locales = JSON.parse((actual && actual.value) || "[]");
  } catch (e) {}
  let entrantes = [];
  try { entrantes = JSON.parse(datos.teams || "[]"); } catch (e) {}

  const porId = new Map((Array.isArray(locales) ? locales : []).map((t) => [t.id, t]));
  (Array.isArray(entrantes) ? entrantes : []).forEach((t) => porId.set(t.id, t));

  await storage.setMany({ ...datos, teams: JSON.stringify([...porId.values()]) });
}
