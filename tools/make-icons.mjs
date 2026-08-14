/* Genera los iconos de la PWA sin depender de ninguna libreria de imagen:
 * dibuja los pixeles a mano y los empaqueta en PNG con el zlib de Node.
 *
 * Es un escudo rojo con una franja blanca en diagonal — un marcador de sitio
 * sobrio hasta que se quiera poner el escudo real del club. Para cambiarlo,
 * basta con sustituir los PNG de /public conservando los nombres.
 *
 *   npm run icons
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(OUT, { recursive: true });

const BG = [0x0a, 0x0a, 0x0a];
const RED = [0xe6, 0x39, 0x46];
const WHITE = [0xf7, 0xf7, 0xf5];

/* ---- geometria del escudo, en coordenadas 0..1 ---- */
const Y_TOP = 0.14, Y_SHOULDER = 0.52, Y_TIP = 0.88, HALF_W = 0.30, CORNER = 0.07;

function inShield(u, v) {
  if (v < Y_TOP || v > Y_TIP) return false;
  const dx = Math.abs(u - 0.5);
  if (v <= Y_SHOULDER) {
    if (v < Y_TOP + CORNER && dx > HALF_W - CORNER) {
      const cx = HALF_W - CORNER, cy = Y_TOP + CORNER;
      return (dx - cx) ** 2 + (v - cy) ** 2 <= CORNER ** 2;
    }
    return dx <= HALF_W;
  }
  const t = (v - Y_SHOULDER) / (Y_TIP - Y_SHOULDER);
  const w = HALF_W * (1 - 0.85 * t - 0.15 * t * t);
  return dx <= Math.max(0, w);
}

// Franja diagonal, guino a la daga del escudo original.
function inStripe(u, v) {
  return Math.abs((u - 0.5) - 0.5 * (v - 0.5)) < 0.052;
}

/* `scale` < 1 encoge el dibujo: los iconos "maskable" de Android se recortan
   en circulo, y todo lo importante debe caber en el 80% central. */
function colorAt(u, v, scale) {
  const su = 0.5 + (u - 0.5) / scale;
  const sv = 0.5 + (v - 0.5) / scale;
  if (!inShield(su, sv)) return BG;
  return inStripe(su, sv) ? WHITE : RED;
}

function renderRGBA(size, scale) {
  const SS = 3; // supermuestreo: 3x3 por pixel, para que los bordes no salgan dentados
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const c = colorAt(u, v, scale);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      data[i] = Math.round(r / n);
      data[i + 1] = Math.round(g / n);
      data[i + 2] = Math.round(b / n);
      data[i + 3] = 255;
    }
  }
  return data;
}

/* ---- PNG minimo (RGBA, sin filtros) ---- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function toPng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bits por canal
  ihdr[9] = 6;    // color RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // sin filtro
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "icon-512-maskable.png", size: 512, scale: 0.72 },
  { file: "apple-touch-icon-180.png", size: 180, scale: 1 },
];

for (const t of targets) {
  writeFileSync(join(OUT, t.file), toPng(t.size, renderRGBA(t.size, t.scale)));
  console.log("escrito", t.file);
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0A0A0A"/>
  <path d="M20 21 h60 v31 c0 26 -14 30 -30 36 c-16 -6 -30 -10 -30 -36 z" fill="#E63946"/>
  <path d="M45.6 14 L56.6 14 L54.4 86 L43.4 86 Z" fill="#F7F7F5"
        transform="rotate(-26.6 50 50)" clip-path="url(#c)"/>
  <defs>
    <clipPath id="c">
      <path d="M20 21 h60 v31 c0 26 -14 30 -30 36 c-16 -6 -30 -10 -30 -36 z"/>
    </clipPath>
  </defs>
</svg>
`;
writeFileSync(join(OUT, "favicon.svg"), favicon);
console.log("escrito favicon.svg");
