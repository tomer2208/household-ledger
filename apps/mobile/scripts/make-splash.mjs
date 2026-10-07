// T15: iPhone launch images for the Home Screen app (apple-touch-startup-image). iOS shows a
// blank white screen without them, and needs one exact-size image per screen. Each is the app
// background (light or dark) with the icon, corners rounded, in the middle.
// Re-run after changing the icon:  node scripts/make-splash.mjs
// It also prints the <link> tags for public/index.html. No dependencies: Node's zlib only.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'splash');

// CSS size, pixel ratio. Portrait only (the app is portrait).
const SCREENS = [
  [440, 956, 3], // 16 Pro Max
  [402, 874, 3], // 16 Pro
  [430, 932, 3], // 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max
  [393, 852, 3], // 16, 15, 15 Pro, 14 Pro
  [428, 926, 3], // 14 Plus, 13 Pro Max, 12 Pro Max
  [390, 844, 3], // 14, 13, 13 Pro, 12, 12 Pro
  [375, 812, 3], // 13 mini, 12 mini, 11 Pro, XS, X
  [414, 896, 3], // 11 Pro Max, XS Max
  [414, 896, 2], // 11, XR
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // SE (2nd, 3rd), 8
];
// The app's background (`bg` in lib/tokens), so the first screen follows without a flash.
const THEMES = { light: [0xed, 0xf0, 0xeb], dark: [0x12, 0x15, 0x11] };
const ICON_PT = 96; // icon size in points

// ───────── PNG in ─────────

function decodePng(buf) {
  let pos = 8;
  let width, height, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('only 8-bit, non-interlaced PNGs');
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const channels = { 2: 3, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      cur[i] = (cur[i] + [0, a, b, (a + b) >> 1, paeth][filter]) & 0xff;
    }
    cur.copy(prev);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      px[o] = cur[x * channels];
      px[o + 1] = cur[x * channels + 1];
      px[o + 2] = cur[x * channels + 2];
      px[o + 3] = channels === 4 ? cur[x * channels + 3] : 255;
    }
  }
  return { width, height, px };
}

// ───────── PNG out ─────────

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ───────── drawing ─────────

// The icon at size s: averaged from the source (it is only ever scaled down), with iOS-like
// rounded corners (radius 22.37%) anti-aliased over 4×4 samples per pixel.
function roundedIcon(src, s) {
  const out = new Float64Array(s * s * 4);
  const r = s * 0.2237;
  const scale = src.width / s;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let cover = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
          const dx = Math.max(r - px, px - (s - r), 0), dy = Math.max(r - py, py - (s - r), 0);
          if (dx * dx + dy * dy <= r * r) cover++;
        }
      }
      const o = (y * s + x) * 4;
      const x0 = Math.floor(x * scale), x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      const y0 = Math.floor(y * scale), y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          out[o] += src.px[i]; out[o + 1] += src.px[i + 1]; out[o + 2] += src.px[i + 2];
          n++;
        }
      }
      out[o] /= n; out[o + 1] /= n; out[o + 2] /= n;
      out[o + 3] = cover / 16;
    }
  }
  return out;
}

const src = decodePng(readFileSync(join(ROOT, 'public', 'icons', 'icon-512.png')));
mkdirSync(OUT, { recursive: true });
const icons = {};
const links = [];
for (const [w, h, dpr] of SCREENS) {
  const W = w * dpr, H = h * dpr, S = ICON_PT * dpr;
  icons[S] ??= roundedIcon(src, S);
  const icon = icons[S];
  const left = Math.round((W - S) / 2), top = Math.round((H - S) / 2);
  for (const [theme, bg] of Object.entries(THEMES)) {
    const rgb = Buffer.alloc(W * H * 3);
    for (let i = 0; i < W * H; i++) rgb.set(bg, i * 3);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const o = (y * S + x) * 4, a = icon[o + 3];
        if (!a) continue;
        const d = ((top + y) * W + left + x) * 3;
        for (let k = 0; k < 3; k++) rgb[d + k] = Math.round(icon[o + k] * a + bg[k] * (1 - a));
      }
    }
    const name = `${theme}-${W}x${H}.png`;
    writeFileSync(join(OUT, name), encodePng(W, H, rgb));
    links.push(
      `    <link rel="apple-touch-startup-image" href="/splash/${name}" media="(prefers-color-scheme: ${theme}) and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`,
    );
  }
}
console.log(links.join('\n'));
