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

/* Vuelca todo el contenido de una vez, para las copias de seguridad.
   Las claves y los valores se leen en la MISMA transaccion: si se leyeran por
   separado, un guardado automatico entre medias podria descuadrarlos. */
storage.all = async function all() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const s = t.objectStore(STORE);
      const kq = s.getAllKeys();
      const vq = s.getAll();
      t.oncomplete = () => {
        const out = {};
        (kq.result || []).forEach((k, i) => { out[k] = (vq.result || [])[i]; });
        resolve(out);
      };
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } catch (e) {
    return Object.fromEntries(memFallback());
  }
};

/* Escribe muchas claves en una sola transaccion: al restaurar una copia, o
   entra todo o no entra nada, nunca a medias. */
storage.setMany = async function setMany(obj) {
  try {
    await tx("readwrite", (s) => { Object.entries(obj).forEach(([k, v]) => s.put(v, k)); });
    return true;
  } catch (e) {
    const map = memFallback();
    Object.entries(obj).forEach(([k, v]) => map.set(k, v));
    return false;
  }
};

/* Importar una copia: o entra todo o no cambia nada. A diferencia de
   setMany/clear, aqui NO hay plan B en memoria: si IndexedDB falla (sin
   espacio, bloqueada...), la transaccion se aborta, los datos de antes siguen
   intactos y el error llega a quien llama para poder avisar. Borrar y escribir
   en dos pasos sueltos dejaba la base vacia si fallaba el segundo. */
function writeAtomically(obj, { clearFirst }) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, "readwrite");
        const s = t.objectStore(STORE);
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error || new Error("no se pudo escribir"));
        t.onabort = () => reject(t.error || new Error("escritura cancelada"));
        // Un put() que lanza (dato no clonable, transaccion inactiva...) NO
        // cancela la transaccion por si solo: se confirmaria con el clear() y
        // lo que se hubiera escrito hasta ahi. Hay que abortarla a mano.
        try {
          if (clearFirst) s.clear();
          Object.entries(obj).forEach(([k, v]) => s.put(v, k));
        } catch (e) {
          try { t.abort(); } catch (e2) {}
          reject(e);
        }
      })
  );
}
storage.replaceAll = (obj) => writeAtomically(obj, { clearFirst: true });
storage.putAll = (obj) => writeAtomically(obj, { clearFirst: false });

storage.clear = async function clear() {
  try {
    await tx("readwrite", (s) => { s.clear(); });
    return true;
  } catch (e) {
    memFallback().clear();
    return false;
  }
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
