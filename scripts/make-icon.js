'use strict';

/* Draws the app icon in pure Node (no native graphics deps) and packs a multi-size .ico.
   Run with: node scripts/make-icon.js */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- png encoder ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- vector-ish drawing ---------- */

const BG = [0x2b, 0x6e, 0xf5];
const FG = [0xff, 0xff, 0xff];

function insideRoundRect(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r || (px >= x + r && px <= x + w - r) || (py >= y + r && py <= y + h - r);
}

/* geometry in a 256x256 design space */
const SHAPES = {
  bg: { x: 10, y: 10, w: 236, h: 236, r: 54 },
  bars: [
    { x: 64, y: 74, w: 128, h: 22, r: 11, a: 1 },
    { x: 64, y: 117, w: 128, h: 22, r: 11, a: 0.94 },
    { x: 64, y: 160, w: 82, h: 22, r: 11, a: 0.82 }
  ]
};

function render(size, ss) {
  const out = Buffer.alloc(size * size * 4);
  const scale = 256 / size;
  const step = scale / ss;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let aSum = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;

      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = (x + (sx + 0.5) / ss) * scale;
          const py = (y + (sy + 0.5) / ss) * scale;

          const b = SHAPES.bg;
          if (!insideRoundRect(px, py, b.x, b.y, b.w, b.h, b.r)) continue;

          let color = BG.slice();
          for (const bar of SHAPES.bars) {
            if (!insideRoundRect(px, py, bar.x, bar.y, bar.w, bar.h, bar.r)) continue;
            for (let i = 0; i < 3; i++) color[i] = color[i] * (1 - bar.a) + FG[i] * bar.a;
          }

          aSum += 1;
          rSum += color[0];
          gSum += color[1];
          bSum += color[2];
        }
      }

      const total = ss * ss;
      const idx = (y * size + x) * 4;
      if (aSum === 0) {
        out[idx] = 0; out[idx + 1] = 0; out[idx + 2] = 0; out[idx + 3] = 0;
      } else {
        out[idx] = Math.round(rSum / aSum);
        out[idx + 1] = Math.round(gSum / aSum);
        out[idx + 2] = Math.round(bSum / aSum);
        out[idx + 3] = Math.round((aSum / total) * 255);
      }
    }
  }
  return out;
}

/* ---------- ico ---------- */

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + 16 * entries.length;
  const dirs = [];
  for (const e of entries) {
    const b = Buffer.alloc(16);
    b.writeUInt8(e.size >= 256 ? 0 : e.size, 0);
    b.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    b.writeUInt8(0, 2);
    b.writeUInt8(0, 3);
    b.writeUInt16LE(1, 4);
    b.writeUInt16LE(32, 6);
    b.writeUInt32LE(e.png.length, 8);
    b.writeUInt32LE(offset, 12);
    offset += e.png.length;
    dirs.push(b);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

/* ---------- run ---------- */

const assets = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assets, { recursive: true });

const sizes = [16, 32, 48, 64, 128, 256];
const entries = sizes.map((s) => {
  const ss = s <= 32 ? 8 : 4;
  return { size: s, png: encodePng(s, s, render(s, ss)) };
});

fs.writeFileSync(path.join(assets, 'icon.ico'), buildIco(entries));
fs.writeFileSync(path.join(assets, 'icon.png'), entries[entries.length - 1].png);

console.log('written:', path.join(assets, 'icon.ico'), `(${sizes.join('/')}, ${fs.statSync(path.join(assets, 'icon.ico')).size} bytes)`);
console.log('preview:', path.join(assets, 'icon.png'));
