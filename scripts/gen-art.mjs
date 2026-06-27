// Genererer søte kawaii-blob pixel-art-sprites i kode (inspirert av runde,
// lubne skapninger med store glansøyne, rosa kinn, lite smil og glitter).
// Skriver PNG til public/sprites/ og kobler dem i manifest.json.
// Kjør: node scripts/gen-art.mjs
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/sprites');
mkdirSync(outDir, { recursive: true });

// ---------- PNG-encoder (RGBA) ----------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- tegne-canvas ----------
class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.d = Buffer.alloc(w * h * 4); }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, a = c[3] ?? 255;
    if (a === 255) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; }
    else { const ba = this.d[i + 3] / 255, sa = a / 255, oa = sa + ba * (1 - sa);
      for (let k = 0; k < 3; k++) this.d[i + k] = Math.round((c[k] * sa + this.d[i + k] * ba * (1 - sa)) / (oa || 1));
      this.d[i + 3] = Math.round(oa * 255); }
  }
  opaque(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 40; }
  disk(cx, cy, r, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c); }
  ellipse(cx, cy, rx, ry, c) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c); }
  rect(x0, y0, ww, hh, c) { for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + ww; x++) this.set(x, y, c); }
  ring(cx, cy, r, thick, c) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r && d >= r - thick) this.set(x, y, c); } }
  tri(ax, ay, bx, by, cx, cy, c) {
    const mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx), mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy);
    const sg = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = mny; y <= mxy; y++) for (let x = mnx; x <= mxx; x++) { const d1 = sg(x, y, ax, ay, bx, by), d2 = sg(x, y, bx, by, cx, cy), d3 = sg(x, y, cx, cy, ax, ay); if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) this.set(x, y, c); }
  }
  outline(c) {
    const m = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.opaque(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { if (dx === 0 && dy === 0) continue; if (this.opaque(x + dx, y + dy)) { near = true; break; } }
      if (near) m.push([x, y]);
    }
    for (const [x, y] of m) this.set(x, y, c);
  }
  png() { return encodePng(this.w, this.h, this.d); }
}

// ---------- kawaii-byggeklosser ----------
// Lubben rund kropp med lysere mage.
function blob(c, cx, cy, color, belly, s = 1) {
  c.ellipse(cx, cy, 12 * s, 10 * s, color);
  c.disk(cx, cy - 4 * s, 10 * s, color);
  c.ellipse(cx - 6 * s, cy + 8 * s, 3.5 * s, 2.6 * s, color); // føtter
  c.ellipse(cx + 6 * s, cy + 8 * s, 3.5 * s, 2.6 * s, color);
  c.ellipse(cx, cy + 3 * s, 8 * s, 7 * s, belly); // mage-høylys
}
// Søtt ansikt: store glansøyne, rosa kinn, lite smil.
function face(c, cx, ey, s = 1) {
  const dx = 5 * s, exr = 2.7 * s, eyr = 3.3 * s, dark = [40, 36, 54];
  c.ellipse(cx - dx, ey, exr, eyr, dark); c.ellipse(cx + dx, ey, exr, eyr, dark);
  c.disk(cx - dx - 0.8 * s, ey - 1.6 * s, 1.3 * s, [255, 255, 255]); // glans
  c.disk(cx + dx - 0.8 * s, ey - 1.6 * s, 1.3 * s, [255, 255, 255]);
  c.set(Math.round(cx - dx + exr * 0.5), Math.round(ey + eyr * 0.5), [255, 255, 255]);
  c.set(Math.round(cx + dx + exr * 0.5), Math.round(ey + eyr * 0.5), [255, 255, 255]);
  c.ellipse(cx - dx - 2.6 * s, ey + 3 * s, 2.1 * s, 1.4 * s, [255, 145, 165, 165]); // kinn
  c.ellipse(cx + dx + 2.6 * s, ey + 3 * s, 2.1 * s, 1.4 * s, [255, 145, 165, 165]);
  const my = Math.round(ey + 4.2 * s); // lite smil
  c.set(cx - 1, my, [120, 80, 92]); c.set(cx, my + 1, [120, 80, 92]); c.set(cx + 1, my, [120, 80, 92]);
}
function sparkles(c, pts) {
  for (const [x, y] of pts) { c.set(x, y, [255, 255, 255]); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.set(x + dx, y + dy, [255, 255, 255, 150]); }
}
function bunnyEars(c, cx, baseY, color, s = 1) { c.ellipse(cx - 4 * s, baseY, 2 * s, 5 * s, color); c.ellipse(cx + 4 * s, baseY, 2 * s, 5 * s, color); }
function roundEars(c, cx, baseY, color, s = 1) { c.disk(cx - 6 * s, baseY, 3 * s, color); c.disk(cx + 6 * s, baseY, 3 * s, color); }
function wings(c, cx, cy, color, s = 1) { c.ellipse(cx - 12 * s, cy - 1, 4 * s, 6 * s, color); c.ellipse(cx + 12 * s, cy - 1, 4 * s, 6 * s, color); }

// ---------- sprite-definisjoner ----------
const sprites = {
  // Bladunge (natur) — grønn kanin-blob med blad
  mon_leafling_0: () => {
    const c = new Canvas(32, 32);
    bunnyEars(c, 16, 8, [124, 206, 110]);
    blob(c, 16, 18, [124, 206, 110], [180, 232, 150]);
    c.tri(16, 1, 12, 8, 16, 8, [150, 220, 120]); c.tri(16, 1, 20, 8, 16, 8, [150, 220, 120]); // blad
    c.outline([56, 122, 58]); face(c, 16, 16); sparkles(c, [[25, 12], [8, 21]]);
    return c;
  },
  // Skyggevalp (mørke) — mørk blob med runde ører og stjerner
  mon_shadepup_0: () => {
    const c = new Canvas(32, 32);
    roundEars(c, 16, 9, [92, 80, 130]);
    blob(c, 16, 18, [92, 80, 130], [120, 108, 162]);
    c.outline([48, 40, 80]); face(c, 16, 16, 1);
    sparkles(c, [[24, 13], [9, 22], [22, 24]]);
    return c;
  },
  // Vindpust (vind) — lyseblå blob med vinger
  mon_gustling_0: () => {
    const c = new Canvas(32, 32);
    wings(c, 16, 17, [225, 240, 252]);
    blob(c, 16, 18, [150, 205, 240], [205, 232, 250]);
    c.tri(13, 3, 16, 9, 11, 9, [180, 220, 248]); // liten tofs
    c.outline([84, 140, 184]); face(c, 16, 16); sparkles(c, [[24, 11], [7, 20]]);
    return c;
  },
  // Moserygg (jord) — brun blob med mose
  mon_mossback_0: () => {
    const c = new Canvas(32, 32);
    roundEars(c, 16, 10, [150, 118, 72]);
    blob(c, 16, 18, [150, 118, 72], [186, 152, 100]);
    c.ellipse(16, 11, 9, 4, [96, 176, 88]); // mose
    c.disk(11, 10, 1.6, [120, 196, 100]); c.disk(20, 9, 1.6, [120, 196, 100]);
    c.outline([88, 66, 38]); face(c, 16, 17); sparkles(c, [[24, 22]]);
    return c;
  },
  // Glødvalp (ild) — orange blob med ører og flammetofs
  mon_emberpup_0: () => {
    const c = new Canvas(32, 32);
    c.tri(9, 12, 7, 4, 14, 10, [240, 135, 90]); c.tri(23, 12, 25, 4, 18, 10, [240, 135, 90]); // ører
    blob(c, 16, 18, [240, 135, 90], [255, 182, 132]);
    c.tri(16, 1, 13, 9, 16, 8, [255, 210, 110]); c.tri(16, 2, 19, 9, 16, 8, [255, 150, 70]); // flamme
    c.outline([150, 62, 32]); face(c, 16, 17); sparkles(c, [[25, 13]]);
    return c;
  },
  // Tidvannsfinne (vann) — blå blob med finner (axolotl-aktig)
  mon_tidefin_0: () => {
    const c = new Canvas(32, 32);
    c.ellipse(5, 15, 3, 4, [150, 200, 240]); c.ellipse(27, 15, 3, 4, [150, 200, 240]); // gjeller
    c.ellipse(4, 12, 2, 3, [150, 200, 240]); c.ellipse(28, 12, 2, 3, [150, 200, 240]);
    blob(c, 16, 18, [90, 150, 225], [155, 198, 242]);
    c.tri(16, 2, 13, 9, 19, 9, [130, 180, 235]); // ryggfinne
    c.outline([40, 84, 144]); face(c, 16, 17); sparkles(c, [[24, 22], [9, 12]]);
    return c;
  },
  // Steinrygg (jord, tank) — gråbrun blob med steiner
  mon_stoneback_0: () => {
    const c = new Canvas(32, 32);
    blob(c, 16, 19, [150, 138, 110], [186, 172, 140]);
    c.disk(11, 10, 3, [170, 162, 150]); c.disk(20, 9, 3.4, [182, 174, 162]); c.disk(16, 12, 2.6, [160, 152, 138]); // steiner
    c.outline([80, 70, 50]); face(c, 16, 18); sparkles(c, [[24, 22]]);
    return c;
  },
  // Gnistunge (lyn) — gul blob med lyn-ører
  mon_sparkit_0: () => {
    const c = new Canvas(32, 32);
    c.tri(10, 9, 6, 2, 13, 10, [255, 226, 120]); c.tri(22, 9, 26, 2, 19, 10, [255, 226, 120]); // lyn-ører
    blob(c, 16, 18, [245, 215, 90], [255, 240, 160]);
    c.outline([170, 130, 30]); face(c, 16, 17); sparkles(c, [[24, 12], [8, 21], [16, 27]]);
    return c;
  },
  // Lysmøll (lys) — kremfarget blob med mølvinger og antenner
  mon_lumenmoth_0: () => {
    const c = new Canvas(32, 32);
    c.ellipse(6, 16, 5, 7, [255, 248, 215]); c.ellipse(26, 16, 5, 7, [255, 248, 215]); // store vinger
    blob(c, 16, 19, [245, 235, 190], [255, 248, 220]);
    c.rect(13, 4, 1, 5, [180, 160, 110]); c.rect(19, 4, 1, 5, [180, 160, 110]); c.disk(13, 4, 1.3, [255, 215, 120]); c.disk(19, 4, 1.3, [255, 215, 120]);
    c.outline([176, 158, 104]); face(c, 16, 18); sparkles(c, [[7, 14], [25, 18]]);
    return c;
  },
  // Frostunge (vann/is) — iskald blob med kanin-ører og krystall
  mon_frostkit_0: () => {
    const c = new Canvas(32, 32);
    bunnyEars(c, 16, 8, [200, 232, 250]);
    blob(c, 16, 18, [180, 225, 250], [220, 242, 255]);
    c.tri(16, 1, 13, 7, 19, 7, [240, 250, 255]); // iskrystall
    c.outline([100, 150, 185]); face(c, 16, 16, 1); sparkles(c, [[24, 12], [8, 20], [22, 24]]);
    return c;
  },
  // Glohale (ild) — orange rev-blob med busket hale
  mon_cindertail_0: () => {
    const c = new Canvas(32, 32);
    c.disk(26, 16, 5, [245, 165, 95]); c.disk(28, 12, 3.2, [255, 220, 175]); // busket hale
    c.tri(9, 11, 6, 3, 13, 10, [235, 150, 80]); c.tri(21, 11, 24, 3, 17, 10, [235, 150, 80]); // ører
    blob(c, 15, 18, [235, 150, 80], [255, 196, 142]);
    c.outline([140, 75, 30]); face(c, 15, 17); sparkles(c, [[7, 21]]);
    return c;
  },
  // Auraunge (lys) — hvit blob med glorie og små vinger
  mon_auraling_0: () => {
    const c = new Canvas(32, 32);
    c.ring(16, 4, 4, 1.6, [255, 218, 110]); // glorie
    c.ellipse(5, 16, 3, 5, [255, 252, 240]); c.ellipse(27, 16, 3, 5, [255, 252, 240]); // vinger
    blob(c, 16, 19, [250, 248, 238], [255, 255, 252]);
    c.outline([188, 176, 150]); face(c, 16, 18); sparkles(c, [[24, 13], [8, 22]]);
    return c;
  },
  // Jordbrøl (Moserygg evolvert, boss) — større, mose + steiner + horn, fortsatt søt
  mon_mossback_1: () => {
    const c = new Canvas(44, 44);
    c.tri(13, 6, 11, 1, 16, 8, [120, 96, 58]); c.tri(31, 6, 33, 1, 28, 8, [120, 96, 58]); // horn
    roundEars(c, 22, 12, [150, 118, 72], 1.4);
    blob(c, 22, 25, [150, 118, 72], [186, 152, 100], 1.4);
    c.ellipse(22, 15, 13, 6, [96, 176, 88]); // mose
    [[14, 13], [22, 11], [30, 13]].forEach(([x, y]) => c.disk(x, y, 2.2, [120, 196, 100]));
    c.disk(13, 14, 3, [172, 164, 152]); c.disk(31, 14, 3.4, [182, 174, 162]); // steiner
    c.outline([84, 62, 34]); face(c, 22, 23, 1.4); sparkles(c, [[34, 18], [11, 30], [33, 32]]);
    return c;
  },

  // ===== EVOLVERTE FORMER (44x44, større og staseligere, fortsatt søte) =====
  // Torndyr (Bladunge evolvert) — frodig grønn med blomsterkrone
  mon_leafling_1: () => {
    const c = new Canvas(44, 44);
    bunnyEars(c, 22, 9, [100, 180, 90], 1.4);
    blob(c, 22, 25, [100, 180, 90], [172, 226, 140], 1.4);
    c.tri(22, 1, 17, 11, 22, 11, [140, 210, 110]); c.tri(22, 1, 27, 11, 22, 11, [140, 210, 110]);
    c.disk(15, 12, 2, [255, 170, 190]); c.disk(29, 12, 2, [255, 170, 190]);
    c.outline([52, 116, 54]); face(c, 22, 23, 1.4); sparkles(c, [[34, 16], [10, 28], [33, 33]]);
    return c;
  },
  // Nattgap (Skyggevalp evolvert) — mørk med horn og stjerner
  mon_shadepup_1: () => {
    const c = new Canvas(44, 44);
    roundEars(c, 22, 12, [80, 68, 118], 1.4);
    c.tri(13, 7, 11, 1, 17, 9, [80, 68, 118]); c.tri(31, 7, 33, 1, 27, 9, [80, 68, 118]);
    blob(c, 22, 25, [80, 68, 118], [112, 100, 156], 1.4);
    c.outline([46, 38, 76]); face(c, 22, 23, 1.4); sparkles(c, [[33, 16], [11, 28], [34, 33], [12, 15]]);
    return c;
  },
  // Stormvinge (Vindpust evolvert) — store vinger
  mon_gustling_1: () => {
    const c = new Canvas(44, 44);
    wings(c, 22, 24, [222, 238, 252], 1.4);
    c.ellipse(8, 18, 3, 5, [222, 238, 252]); c.ellipse(36, 18, 3, 5, [222, 238, 252]);
    blob(c, 22, 25, [140, 198, 238], [200, 230, 250], 1.4);
    c.tri(18, 2, 22, 11, 15, 11, [175, 215, 246]);
    c.outline([78, 134, 180]); face(c, 22, 23, 1.4); sparkles(c, [[33, 14], [9, 26]]);
    return c;
  },
  // Infernohund (Glødvalp evolvert) — flammemanke og horn
  mon_emberpup_1: () => {
    const c = new Canvas(44, 44);
    c.tri(11, 14, 8, 3, 17, 12, [232, 110, 70]); c.tri(33, 14, 36, 3, 27, 12, [232, 110, 70]);
    blob(c, 22, 25, [232, 110, 70], [255, 170, 120], 1.4);
    c.tri(22, 0, 17, 11, 22, 10, [255, 205, 100]); c.tri(22, 1, 27, 11, 22, 10, [255, 140, 60]);
    c.tri(15, 4, 12, 12, 18, 11, [255, 160, 70]); c.tri(29, 4, 32, 12, 26, 11, [255, 160, 70]);
    c.outline([150, 58, 28]); face(c, 22, 24, 1.4); sparkles(c, [[34, 16]]);
    return c;
  },
  // Tidvannsgap (Tidvannsfinne evolvert) — store gjeller og finne
  mon_tidefin_1: () => {
    const c = new Canvas(44, 44);
    c.ellipse(6, 20, 4, 6, [150, 200, 240]); c.ellipse(38, 20, 4, 6, [150, 200, 240]);
    c.ellipse(5, 14, 3, 4, [150, 200, 240]); c.ellipse(39, 14, 3, 4, [150, 200, 240]);
    blob(c, 22, 25, [80, 140, 220], [150, 195, 240], 1.4);
    c.tri(22, 2, 17, 12, 27, 12, [120, 175, 232]);
    c.outline([38, 80, 140]); face(c, 22, 24, 1.4); sparkles(c, [[33, 30], [10, 15]]);
    return c;
  },
  // Kampestein (Steinrygg evolvert) — flere steiner og krystall
  mon_stoneback_1: () => {
    const c = new Canvas(44, 44);
    blob(c, 22, 26, [148, 136, 108], [184, 170, 138], 1.4);
    c.disk(13, 12, 4, [170, 162, 150]); c.disk(30, 11, 4.5, [182, 174, 162]); c.disk(22, 9, 3.5, [160, 152, 138]);
    c.tri(22, 2, 19, 9, 25, 9, [200, 230, 250]);
    c.outline([78, 68, 48]); face(c, 22, 25, 1.4); sparkles(c, [[34, 30], [10, 30]]);
    return c;
  },
  // Voltdyr (Gnistunge evolvert) — store lyn-ører og gnister
  mon_sparkit_1: () => {
    const c = new Canvas(44, 44);
    c.tri(13, 10, 7, 1, 17, 12, [255, 224, 118]); c.tri(31, 10, 37, 1, 27, 12, [255, 224, 118]);
    blob(c, 22, 25, [248, 210, 80], [255, 238, 158], 1.4);
    c.outline([168, 128, 28]); face(c, 22, 24, 1.4); sparkles(c, [[34, 14], [9, 24], [22, 38], [33, 33], [11, 15]]);
    return c;
  },
  // Stråleugle (Lysmøll evolvert) — store vinger og glorie
  mon_lumenmoth_1: () => {
    const c = new Canvas(44, 44);
    c.ellipse(8, 20, 6, 9, [255, 246, 212]); c.ellipse(36, 20, 6, 9, [255, 246, 212]);
    c.ring(22, 6, 5, 1.4, [255, 225, 130]);
    blob(c, 22, 26, [248, 236, 195], [255, 248, 222], 1.4);
    c.tri(15, 12, 13, 5, 18, 13, [248, 236, 195]); c.tri(29, 12, 31, 5, 26, 13, [248, 236, 195]);
    c.outline([176, 158, 104]); face(c, 22, 25, 1.4); sparkles(c, [[8, 16], [36, 16]]);
    return c;
  },
  // Isbringer (Frostunge evolvert) — iskrone
  mon_frostkit_1: () => {
    const c = new Canvas(44, 44);
    bunnyEars(c, 22, 9, [200, 232, 250], 1.4);
    blob(c, 22, 25, [175, 222, 248], [218, 240, 255], 1.4);
    c.tri(16, 3, 14, 11, 18, 11, [240, 250, 255]); c.tri(22, 1, 20, 11, 24, 11, [240, 250, 255]); c.tri(28, 3, 26, 11, 30, 11, [240, 250, 255]);
    c.outline([96, 146, 182]); face(c, 22, 23, 1.4); sparkles(c, [[34, 14], [10, 26], [33, 33], [12, 16]]);
    return c;
  },
  // Magmagap (Glohale evolvert) — stor hale og magma-sprekker
  mon_cindertail_1: () => {
    const c = new Canvas(44, 44);
    c.disk(34, 20, 7, [245, 150, 80]); c.disk(38, 14, 4.5, [255, 200, 150]);
    c.tri(12, 13, 9, 3, 18, 12, [235, 140, 70]); c.tri(32, 13, 35, 3, 26, 12, [235, 140, 70]);
    blob(c, 20, 25, [235, 140, 70], [255, 188, 135], 1.4);
    c.set(16, 28, [255, 210, 90]); c.set(18, 30, [255, 210, 90]); c.set(22, 29, [255, 210, 90]);
    c.outline([138, 72, 28]); face(c, 20, 24, 1.4); sparkles(c, [[8, 28]]);
    return c;
  },
  // Serafyks (Auraunge evolvert) — store vinger og glorie
  mon_auraling_1: () => {
    const c = new Canvas(44, 44);
    c.ellipse(7, 20, 5, 8, [255, 252, 242]); c.ellipse(37, 20, 5, 8, [255, 252, 242]);
    c.ring(22, 5, 5, 1.6, [255, 220, 110]);
    blob(c, 22, 26, [252, 248, 235], [255, 255, 252], 1.4);
    c.outline([186, 174, 148]); face(c, 22, 25, 1.4); sparkles(c, [[34, 14], [10, 26], [22, 40], [12, 16], [33, 33]]);
    return c;
  },

  // ---- NPC-er (28x36 søte chibi) ----
  npc_shop: () => npc([201, 162, 39]),
  npc_healer: () => npc([79, 209, 197], true),
  npc_smith: () => npc([155, 106, 63]),
  npc_elder: () => npc([150, 130, 200], false, true),
  npc_villager: () => npc([143, 174, 106]),

  // ---- miljø ----
  deco_tree: () => {
    const c = new Canvas(48, 60);
    c.rect(21, 38, 6, 20, [94, 62, 34]); c.set(22, 44, [70, 46, 24]); c.set(25, 50, [70, 46, 24]);
    c.disk(24, 24, 17, [86, 174, 84]); c.disk(16, 20, 10, [104, 196, 100]); c.disk(32, 22, 10, [104, 196, 100]); c.disk(24, 14, 9, [128, 214, 120]);
    c.outline([46, 110, 50]); sparkles(c, [[14, 16], [34, 28]]);
    return c;
  },
  deco_bush: () => {
    const c = new Canvas(40, 28);
    c.disk(11, 18, 8, [86, 174, 84]); c.disk(29, 18, 8, [86, 174, 84]); c.disk(20, 14, 10, [104, 196, 100]);
    c.outline([46, 110, 50]); sparkles(c, [[26, 12]]);
    return c;
  },
  chest: () => {
    const c = new Canvas(28, 28);
    c.rect(3, 12, 22, 14, [150, 100, 52]); c.rect(3, 7, 22, 6, [176, 122, 66]);
    c.rect(3, 11, 22, 3, [240, 200, 90]); c.rect(12, 13, 4, 6, [240, 200, 90]); c.set(13, 15, [120, 80, 20]);
    c.outline([84, 52, 22]); sparkles(c, [[7, 9], [22, 20]]);
    return c;
  },
};

function npc(cloth, robe = false, staff = false) {
  const c = new Canvas(28, 36);
  if (robe) c.tri(14, 16, 6, 34, 22, 34, cloth);
  else { c.rect(8, 22, 12, 12, cloth); c.rect(6, 23, 3, 7, cloth); c.rect(19, 23, 3, 7, cloth); }
  c.disk(14, 11, 8, [248, 210, 172]); // stort søtt hode
  c.rect(6, 3, 16, 5, [86, 60, 42]); c.disk(7, 6, 2, [86, 60, 42]); c.disk(21, 6, 2, [86, 60, 42]);
  if (staff) { c.rect(23, 9, 2, 25, [120, 88, 56]); c.disk(24, 8, 3, [150, 215, 255]); }
  c.outline([60, 44, 36]);
  c.disk(11, 11, 2.2, [40, 36, 54]); c.disk(17, 11, 2.2, [40, 36, 54]); // store øyne
  c.set(10, 10, [255, 255, 255]); c.set(16, 10, [255, 255, 255]);
  c.set(12, 12, [255, 255, 255]); c.set(18, 12, [255, 255, 255]);
  c.ellipse(8, 13, 1.8, 1.3, [255, 145, 165, 165]); c.ellipse(20, 13, 1.8, 1.3, [255, 145, 165, 165]); // kinn
  c.set(13, 14, [150, 90, 100]); c.set(14, 15, [150, 90, 100]); c.set(15, 14, [150, 90, 100]); // smil
  return c;
}

// ---------- skriv filer + oppdater manifest ----------
const manifestPath = join(outDir, 'manifest.json');
let manifest = {};
try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { /* tom */ }
let n = 0;
for (const [key, build] of Object.entries(sprites)) {
  const file = `${key}.png`;
  writeFileSync(join(outDir, file), build().png());
  manifest[key] = `sprites/${file}`;
  n++;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Genererte ${n} søte pixel-art-sprites og oppdaterte manifest.json`);
