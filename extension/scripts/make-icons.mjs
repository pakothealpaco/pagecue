// Draws the pagecue icon, "lit line": three cue lines on a dark tile, the middle one lit green like
// the current cue in the prompter. Writes PNGs in the sizes Chrome uses. No image dependencies:
// shapes are rasterised with 4x4 supersampling and encoded with node:zlib.
// Run with `node scripts/make-icons.mjs`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '../public/icon');
const TILE = [20, 23, 28];
const DIM = [58, 65, 75];
const LIT = [52, 194, 122];
// Toolbar colours: a green and a grey that hold contrast on both a light and a dark toolbar.
const LIT_SMALL = [38, 170, 104];
const MUTED = [128, 136, 147];

// Shapes in a 0..1 unit square (the design is drawn on a 96-unit grid).
const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
};
const u = (v) => v / 96;
const pill = (x, y, w, h) => roundRect(u(x), u(y), u(x + w), u(y + h), u(h / 2));
const tile = roundRect(u(2), u(2), u(94), u(94), u(22));
const everywhere = () => true;

/**
 * Two drawings of one mark. Large sizes (the extensions page, the store) sit on the dark tile.
 * Toolbar sizes drop the tile, which reads as a heavy black square beside other toolbar icons, and
 * thicken the lines so they hold at 16 px on light and dark toolbars alike.
 */
const TILED = {
  base: tile,
  fill: TILE,
  layers: [
    { shape: pill(14, 43, 68, 11), color: LIT },
    { shape: pill(22, 26, 46, 8), color: DIM },
    { shape: pill(22, 63, 34, 8), color: DIM },
  ],
};
const BARE = {
  base: (x, y) => [pill(6, 39, 84, 18), pill(16, 13, 56, 14), pill(16, 69, 40, 14)].some((s) => s(x, y)),
  fill: null,
  layers: [
    { shape: pill(6, 39, 84, 18), color: LIT_SMALL },
    { shape: everywhere, color: MUTED },
  ],
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

function png(size, design) {
  const { base, fill, layers } = design;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const ss = 4;
  for (let py = 0; py < size; py += 1) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px += 1) {
      let bg = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          if (!base(x, y)) continue;
          bg += 1;
          const color = layers.find((layer) => layer.shape(x, y))?.color ?? fill;
          for (let c = 0; c < 3; c += 1) sum[c] += color[c];
        }
      }
      const offset = py * (size * 4 + 1) + 1 + px * 4;
      for (let c = 0; c < 3; c += 1) raw[offset + c] = bg ? Math.round(sum[c] / bg) : 0;
      raw[offset + 3] = Math.round((bg / (ss * ss)) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 96, 128]) writeFileSync(join(out, `${size}.png`), png(size, size <= 32 ? BARE : TILED));
// The Claude app shows desktop extensions' icons large.
writeFileSync(join(out, '../../../plugins/pagecue/desktop/icon.png'), png(512, TILED));
console.log(`Icons written to ${out}`);
