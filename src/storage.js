/* Almacenamiento local del dispositivo.
 *
 * La app tiene que funcionar en un pabellon sin wifi, asi que no hay servidor:
 * todo (equipos, plantillas, fotos, historial y el partido en curso) vive en
 * IndexedDB, dentro del propio navegador de la tablet.
 *
 * Se elige IndexedDB y no localStorage porque las fotos de los jugadores se
 * guardan como data URLs y unas pocas ya superan el limite de ~5 MB de
 * localStorage. Aun asi queda un plan B en memoria para que la app no reviente
 * en modo privado de Safari, donde IndexedDB puede estar capado.
 */

const DB_NAME = "npa-stats";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise = null;
let fallback = null; // Map usada solo si IndexedDB no esta disponible

function memFallback() {
  if (!fallback) fallback = new Map();
  return fallback;
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("sin IndexedDB"));
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      return reject(e);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("no se pudo abrir IndexedDB"));
    req.onblocked = () => reject(new Error("IndexedDB bloqueada"));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function tx(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        try {
          result = run(store);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

const req = (r) => ({ __req: r });

export const storage = {
  async get(key) {
    try {
      const value = await tx("readonly", (s) => req(s.get(key)));
      return value === undefined ? null : { value };
    } catch (e) {
      const map = memFallback();
      return map.has(key) ? { value: map.get(key) } : null;
    }
  },

  async set(key, value) {
    try {
      await tx("readwrite", (s) => {
        s.put(value, key);
      });
      return true;
    } catch (e) {
      memFallback().set(key, value);
      return false;
    }
  },

  async del(key) {
    try {
      await tx("readwrite", (s) => {
        s.delete(key);
      });
      return true;
    } catch (e) {
      memFallback().delete(key);
      return false;
    }
  },

  /* Devuelve { keys: [...] } con todas las claves que empiezan por `prefix`,
     que es como la app localiza los partidos y entrenos de un equipo. */
  async list(prefix) {
    try {
      // Cota superior del prefijo: el ultimo caracter posible, para que el rango
      // incluya cualquier clave que empiece por `prefix` sea cual sea el resto.
      const range = IDBKeyRange.bound(prefix, prefix + String.fromCharCode(0xffff), false, false);
      const keys = await tx("readonly", (s) => req(s.getAllKeys(range)));
      return { keys: keys || [] };
    } catch (e) {
      const map = memFallback();
      return { keys: Array.from(map.keys()).filter((k) => k.startsWith(prefix)) };
    }
  },
};

/* Cuanto espacio queda en el dispositivo — util para avisar antes de que una
   plantilla llena de fotos empiece a fallar en mitad de un partido. */
export async function estimateStorage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage || 0, quota: quota || 0 };
    }
  } catch (e) {}
  return null;
}

/* Pide al navegador que no borre estos datos si se queda corto de espacio.
   En iOS es especialmente relevante: sin esto, Safari puede purgar los datos
   de un sitio que lleva semanas sin abrirse. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (e) {}
  return false;
}
