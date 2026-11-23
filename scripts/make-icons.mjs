// Generates the extension icons (no dependencies): node scripts/make-icons.mjs
// Design on a 128 grid: coral rounded square, white down arrow, ruler ticks.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG_TOP = [255, 112, 67];
const BG_BOTTOM = [244, 63, 94];
const WHITE = [255, 255, 255];

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (p1x, p1y, p2x, p2y) => (x - p2x) * (p1y - p2y) - (p1x - p2x) * (y - p2y);
  const d1 = s(ax, ay, bx, by), d2 = s(bx, by, cx, cy), d3 = s(cx, cy, ax, ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

const TICKS = [
  [30, 46], [44, 38], [58, 46], [72, 38], [86, 46], [100, 38],
];

function isMark(x, y) {
  if (inRoundRect(x, y, 66, 26, 82, 80, 4)) return true; // arrow shaft
  if (inTriangle(x, y, [50, 74], [98, 74], [74, 104])) return true; // arrow head
  for (const [ty, len] of TICKS) if (inRoundRect(x, y, 20, ty - 3, len, ty + 3, 3)) return true;
  return false;
}

function pixel(x, y) {
  // returns [r,g,b,a] in 0..1 coverage terms on the 128 grid
  if (!inRoundRect(x, y, 4, 4, 124, 124, 28)) return null;
  if (isMark(x, y)) return WHITE;
  const t = y / 128;
  return BG_TOP.map((c, i) => c + (BG_BOTTOM[i] - c) * t);
}

function render(size) {
  const SS = 4;
  const k = 128 / size;
  const out = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    out[py * (size * 4 + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = pixel((px + (sx + 0.5) / SS) * k, (py + (sy + 0.5) / SS) * k);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      if (a) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, size, out);
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = new URL("../icons/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`icon${size}.png`, dir), render(size));
console.log("icons written");
