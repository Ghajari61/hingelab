import "server-only";
/**
 * Flat artwork in, a laser piece out: the picture is traced exactly (our own tracer, the same as
 * Trace Bitmap) and engraved, and a cut outline, the pad, is offset round it so the whole piece is
 * one part. Colour does not matter when the picture is a drawing on a plain ground. The model only
 * names the piece and chooses its size, the pad width and whether it hangs; it never redraws the artwork.
 */
import { Resvg } from "@resvg/resvg-js";
import * as ClipperLib from "clipper-lib";
import type { Path, Paths } from "clipper-lib";
import type { UserContent } from "ai";
import { z } from "zod";
import { pathD, transformSubpaths } from "@/lib/studio/geom";
import { fromPath, regionOf, toPath, UNIT } from "@/lib/studio/pathfinder";
import { parsePathData } from "@/lib/studio/svgImport";
import { traceOutlines } from "@/lib/studio/trace/contours";
import { luminance, removeSpeckles, type Bitmap, type Raster } from "@/lib/studio/trace/raster";
import type { Subpath, Vec } from "@/lib/studio/types";
import { artDesign, buildArt, cleanArt, type Art, type ArtAsk, type BuiltArt } from "./art";
import type { AIDesign, AIMatch } from "./types";
import type { Plan } from "@/lib/plans";

/** Longest side the picture is traced at, px. */
const TRACE_PX = 1024;
/** Path data the design may hold, so it can still be sent back for an edit (the art schema's own limit is 150 000). */
const MAX_CHARS = 140_000;
/** Hanging hole: 4.5 mm across, as the handbook's 4–5 mm. */
const HOLE_R = 2.25;
const ARC_TOL = 0.02 * UNIT;

export interface PadSpec {
  /** Longest side of the finished piece, mm. */
  size: number;
  /** Width of the border round the artwork, mm. */
  pad: number;
  /** A tab with a hanging hole at the top. */
  hole: boolean;
}

// ---------- reading the picture ----------

/** Pixel size of a PNG or JPEG from its header; null for anything else. */
function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** The photo's pixels on white, at most TRACE_PX on its longest side; null when it cannot be read. */
export function decodePhoto(dataUrl: string, px = TRACE_PX): Raster | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    const size = imageSize(Buffer.from(m[2], "base64"));
    const k = size && size.w > 0 && size.h > 0 ? Math.min(1, px / Math.max(size.w, size.h)) : 1;
    const w = Math.max(1, Math.round(size ? size.w * k : px)), h = Math.max(1, Math.round(size ? size.h * k : px));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
      + `<image width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" xlink:href="${dataUrl}"/></svg>`;
    const img = new Resvg(svg, { background: "#ffffff", font: { loadSystemFonts: false } }).render();
    return { width: img.width, height: img.height, data: img.pixels };
  } catch {
    return null;
  }
}

/**
 * Whether a picture is black-and-white artwork (a logo, silhouette, line drawing or stencil): nearly
 * every pixel grey and close to black or white, with some of each. Photos, even grey ones, fail.
 */
export function isTwoTone(r: Raster): boolean {
  const lum = luminance(r), d = r.data, n = lum.length;
  if (n < 64) return false;
  let grey = 0, extreme = 0, ink = 0;
  for (let i = 0; i < n; i++) {
    const a = d[i * 4], b = d[i * 4 + 1], c = d[i * 4 + 2];
    if (Math.max(a, b, c) - Math.min(a, b, c) < 40) grey++;
    const l = lum[i];
    if (l < 85 || l > 170) extreme++;
    if (l < 128) ink++;
  }
  return grey / n >= 0.97 && extreme / n >= 0.9 && Math.min(ink, n - ink) / n >= 0.002;
}

/** 16 steps per channel, so anti-aliased fringes do not each count as their own colour. */
const bucket = (r: number, g: number, b: number) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
/** 8 steps per channel: a drawing's colours stay apart, a photograph's shades collapse. */
const coarse = (r: number, g: number, b: number) => ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);

/**
 * A drawing on a plain ground, in any number of flat colours up to a poster. The edge is mostly one
 * colour and the picture uses at most twenty-four. A photograph has a mixed edge or too many shades,
 * so it is left to the designer.
 */
export function isFlatArt(r: Raster): boolean {
  const { width: w, height: h, data: d } = r;
  const n = w * h;
  if (n < 64) return false;
  const edge = new Map<number, number>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const k = coarse(d[i], d[i + 1], d[i + 2]);
    edge.set(k, (edge.get(k) ?? 0) + 1);
  };
  for (let x = 0; x < w; x++) { add(x, 0); if (h > 1) add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); if (w > 1) add(w - 1, y); }
  let bgN = 0, edgeN = 0;
  for (const c of edge.values()) { edgeN += c; if (c > bgN) bgN = c; }
  if (edgeN === 0 || bgN / edgeN < 0.72) return false;
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const k = coarse(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const real = [...counts.values()].filter((c) => c / n >= 0.008).length;
  const bg = [...edge.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const ink = 1 - (counts.get(bg) ?? 0) / n;
  return real >= 2 && real <= 24 && ink >= 0.01 && ink <= 0.85;
}

/** Gaussian blur (sigma in pixels), edges clamped. */
function blur(v: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 2.5), k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const sum = k.reduce((a, b) => a + b, 0);
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += k[i + r] * v[y * w + Math.min(w - 1, Math.max(0, x + i))];
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += k[i + r] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
    out[y * w + x] = s;
  }
  return out;
}

/** JPEG noise along the edges is blurred away before the threshold. */
const BLUR_PX = 0.9;
/** The ink is cut out at up to this many times the picture's pixels (bilinear), so edges fall between pixels. */
const UPSAMPLE = 3;
const MAX_INK_PX = 3072;

/** Mean colour of the plain ground, from the edge pixels of its majority bucket. */
function ground(r: Raster): [number, number, number] {
  const { width: w, height: h, data: d } = r;
  const edge = new Map<number, number>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const k = bucket(d[i], d[i + 1], d[i + 2]);
    edge.set(k, (edge.get(k) ?? 0) + 1);
  };
  for (let x = 0; x < w; x++) { add(x, 0); if (h > 1) add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); if (w > 1) add(w - 1, y); }
  let bg = 0, bgN = 0;
  for (const [k, c] of edge) if (c > bgN) { bg = k; bgN = c; }
  let n = 0, R = 0, G = 0, B = 0;
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (bucket(d[i], d[i + 1], d[i + 2]) !== bg) return;
    n++; R += d[i]; G += d[i + 1]; B += d[i + 2];
  };
  for (let x = 0; x < w; x++) { take(x, 0); if (h > 1) take(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { take(0, y); if (w > 1) take(w - 1, y); }
  return n ? [R / n, G / n, B / n] : [255, 255, 255];
}

/**
 * The artwork as ink. Black-and-white pictures use darkness (and flip when the ground is dark).
 * A coloured drawing uses distance from the ground colour, so a turquoise stroke on white is ink
 * and the white gaps inside it stay empty. Sampled at `up` times the picture's resolution.
 */
export function inkBitmap(r: Raster): Bitmap & { up: number } {
  const { width: w, height: h } = r;
  if (!isTwoTone(r)) return colorInk(r);
  const lum = blur(luminance(r), w, h, BLUR_PX);
  let edge = 0, dark = 0;
  const isDark = (x: number, y: number) => (lum[y * w + x] < 128 ? 1 : 0);
  for (let x = 0; x < w; x++) { edge += 2; dark += isDark(x, 0) + isDark(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { edge += 2; dark += isDark(0, y) + isDark(w - 1, y); }
  const inv = dark / Math.max(1, edge) > 0.6;
  const up = Math.max(1, Math.min(UPSAMPLE, Math.floor(MAX_INK_PX / Math.max(w, h))));
  const W = w * up, H = h * up, bits = new Uint8Array(W * H);
  const at = (p: number, n: number) => { const s = Math.min(n - 1, Math.max(0, (p + 0.5) / up - 0.5)); const i = Math.min(n - 2, Math.floor(s)); return n < 2 ? { i: 0, f: 0 } : { i, f: s - i }; };
  const xs = Array.from({ length: W }, (_, X) => at(X, w));
  for (let Y = 0; Y < H; Y++) {
    const { i: y0, f: fy } = at(Y, h), y1 = Math.min(h - 1, y0 + 1);
    for (let X = 0; X < W; X++) {
      const { i: x0, f: fx } = xs[X], x1 = Math.min(w - 1, x0 + 1);
      const top = lum[y0 * w + x0] * (1 - fx) + lum[y0 * w + x1] * fx, bot = lum[y1 * w + x0] * (1 - fx) + lum[y1 * w + x1] * fx;
      bits[Y * W + X] = ((top * (1 - fy) + bot * fy < 128) !== inv) ? 1 : 0;
    }
  }
  return { ...removeSpeckles({ width: W, height: H, bits }, Math.max(4 * up * up, Math.round(W * H * 1e-5))), up };
}

/** How far a colour must be from the ground before it counts as ink. */
const INK_DIST = 55;

function colorInk(r: Raster): Bitmap & { up: number } {
  const { width: w, height: h, data: d } = r;
  const ch = [0, 1, 2].map((c) => blur(Float32Array.from({ length: w * h }, (_, i) => d[i * 4 + c]), w, h, BLUR_PX));
  const [bgR, bgG, bgB] = ground(r);
  const up = Math.max(1, Math.min(UPSAMPLE, Math.floor(MAX_INK_PX / Math.max(w, h))));
  const W = w * up, H = h * up, bits = new Uint8Array(W * H);
  const at = (p: number, n: number) => { const s = Math.min(n - 1, Math.max(0, (p + 0.5) / up - 0.5)); const i = Math.min(n - 2, Math.floor(s)); return n < 2 ? { i: 0, f: 0 } : { i, f: s - i }; };
  const sample = (ch: Float32Array, x0: number, y0: number, x1: number, y1: number, fx: number, fy: number) => {
    const top = ch[y0 * w + x0] * (1 - fx) + ch[y0 * w + x1] * fx;
    const bot = ch[y1 * w + x0] * (1 - fx) + ch[y1 * w + x1] * fx;
    return top * (1 - fy) + bot * fy;
  };
  const xs = Array.from({ length: W }, (_, X) => at(X, w));
  for (let Y = 0; Y < H; Y++) {
    const { i: y0, f: fy } = at(Y, h), y1 = Math.min(h - 1, y0 + 1);
    for (let X = 0; X < W; X++) {
      const { i: x0, f: fx } = xs[X], x1 = Math.min(w - 1, x0 + 1);
      const dr = sample(ch[0], x0, y0, x1, y1, fx, fy) - bgR;
      const dg = sample(ch[1], x0, y0, x1, y1, fx, fy) - bgG;
      const db = sample(ch[2], x0, y0, x1, y1, fx, fy) - bgB;
      bits[Y * W + X] = dr * dr + dg * dg + db * db > INK_DIST * INK_DIST ? 1 : 0;
    }
  }
  return { ...removeSpeckles({ width: W, height: H, bits }, Math.max(4 * up * up, Math.round(W * H * 1e-5))), up };
}

/** One bitmap per flat colour that is not the ground, on the same grid as the ink. */
function colorLayers(r: Raster, up: number): Bitmap[] {
  if (isTwoTone(r)) return [];
  const { width: w, height: h, data: d } = r;
  const n = w * h;
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const k = coarse(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const [bgR, bgG, bgB] = ground(r);
  const bg = coarse(Math.round(bgR), Math.round(bgG), Math.round(bgB));
  const colors = [...counts.entries()].filter(([k, c]) => k !== bg && c / n >= 0.008).sort((a, b) => b[1] - a[1]).slice(0, 24);
  if (colors.length < 2) return [];
  const index = new Map(colors.map(([k], i) => [k, i]));
  const W = w * up, H = h * up;
  const maps = colors.map(() => new Uint8Array(W * H));
  const minInk = INK_DIST * INK_DIST;
  for (let Y = 0; Y < H; Y++) {
    const y = Math.min(h - 1, Math.floor((Y + 0.5) / up));
    for (let X = 0; X < W; X++) {
      const x = Math.min(w - 1, Math.floor((X + 0.5) / up));
      const i = (y * w + x) * 4;
      const dr = d[i] - bgR, dg = d[i + 1] - bgG, db = d[i + 2] - bgB;
      if (dr * dr + dg * dg + db * db <= minInk) continue;
      const at = index.get(coarse(d[i], d[i + 1], d[i + 2]));
      if (at !== undefined) maps[at][Y * W + X] = 1;
    }
  }
  const speck = Math.max(4 * up * up, Math.round(W * H * 1e-5));
  return maps.map((bits) => removeSpeckles({ width: W, height: H, bits }, speck)).filter((b) => b.bits.some((v) => v === 1));
}

// ---------- the pad ----------

const bboxOf = (pts: Vec[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
};
const anchors = (subs: Subpath[]) => subs.flatMap((s) => s.nodes.flatMap((a) => [a, ...(a.i ? [a.i] : []), ...(a.o ? [a.o] : [])]));

function offset(p: Paths, mm: number): Paths {
  const co = new ClipperLib.ClipperOffset(2, ARC_TOL);
  co.AddPaths(p, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const out: Paths = [];
  co.Execute(out, mm * UNIT);
  return out;
}
const outers = (p: Paths) => p.filter((q) => ClipperLib.Clipper.Area(q) > 0);
const unite = (p: Paths): Paths => {
  const c = new ClipperLib.Clipper();
  c.AddPaths(p, ClipperLib.PolyType.ptSubject, true);
  const out: Paths = [];
  c.Execute(ClipperLib.ClipType.ctUnion, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return out;
};
function hull(p: Paths): Path {
  const pts = p.flat().slice().sort((a, b) => a.X - b.X || a.Y - b.Y);
  const cross = (o: { X: number; Y: number }, a: { X: number; Y: number }, b: { X: number; Y: number }) => (a.X - o.X) * (b.Y - o.Y) - (a.Y - o.Y) * (b.X - o.X);
  const lo: Path = [], hi: Path = [];
  for (const q of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of pts.slice().reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  const h = [...lo.slice(0, -1), ...hi.slice(0, -1)];
  return ClipperLib.Clipper.Area(h) < 0 ? h.reverse() : h;
}
const circle = (c: Vec, r: number): Path => Array.from({ length: 72 }, (_, k) => ({ X: Math.round((c.x + r * Math.cos((k * Math.PI) / 36)) * UNIT), Y: Math.round((c.y + r * Math.sin((k * Math.PI) / 36)) * UNIT) }));

/** One solid outline: the pieces closed together (rounded), or their hull when they are far apart. */
function onePiece(p: Paths, span: number): Paths {
  let out = outers(unite(p));
  for (let g = 1; out.length > 1 && g <= span; g *= 2) out = outers(offset(offset(out, g), -g));
  return out.length > 1 ? [hull(out)] : out;
}

export interface PadResult { engrave: string; cut: string[]; score: string[]; width: number; height: number; scale: number }

/**
 * The pad round artwork outlines (any units): the artwork scaled so the piece's longest side is
 * `spec.size`, the pad `spec.pad` wide round it, and a hanging tab when asked, everything moved to start at 0, 0.
 */
export function padShapes(ink: Subpath[], spec: PadSpec): PadResult | null {
  const b = bboxOf(anchors(ink));
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  if (!(span > 0)) return null;
  const build = (k: number) => {
    const art = transformSubpaths(ink, [k, 0, 0, k, -b.x0 * k, -b.y0 * k]);
    const region = regionOf(art);
    if (!region.length) return null;
    let solid = offset(outers(region), spec.pad);
    let hole: Vec | null = null;
    if (spec.hole) {
      // Hang from the highest point of the artwork near its middle, so it hangs level.
      const artW = (b.x1 - b.x0) * k, pts = region.flatMap(fromPath).filter((p) => Math.abs(p.x - artW / 2) <= artW * 0.15);
      const top = pts.length ? pts.reduce((a, p) => (p.y < a.y ? p : a)) : { x: artW / 2, y: 0 };
      hole = { x: top.x, y: top.y - HOLE_R - Math.min(spec.pad, 2) };
      solid = [...solid, circle(hole, HOLE_R + Math.max(3, spec.pad))];
    }
    const piece = onePiece(solid, Math.max(span * k, 1));
    const box = bboxOf(piece.flatMap(fromPath));
    return { art, piece, hole, box };
  };
  const longSide = (bb: { x0: number; y0: number; x1: number; y1: number }) => Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
  let k = Math.max(0.01, spec.size - 2 * spec.pad) / span;
  let got = build(k);
  for (let i = 0; i < 3 && got; i++) {
    const long = longSide(got.box);
    if (Math.abs(long - spec.size) < 0.05) break;
    // The pad and the tab keep their size; only the artwork scales.
    const extra = long - span * k;
    k = Math.max(0.01, spec.size - extra) / span;
    got = build(k);
  }
  if (!got) return null;
  const dx = -got.box.x0, dy = -got.box.y0;
  const move = (s: Subpath[]) => transformSubpaths(s, [1, 0, 0, 1, dx, dy]);
  const ring = (q: Path): Subpath => ({ closed: true, nodes: fromPath(ClipperLib.Clipper.CleanPolygon(q, 0.01 * UNIT) as Path).map((v) => ({ x: v.x, y: v.y })) });
  const cut = [pathD(move(got.piece.map(ring)), 2)];
  if (got.hole) {
    const c = { x: got.hole.x + dx, y: got.hole.y + dy }, r = HOLE_R, f = (v: number) => Math.round(v * 100) / 100;
    cut.push(`M${f(c.x - r)} ${f(c.y)}A${r} ${r} 0 1 0 ${f(c.x + r)} ${f(c.y)}A${r} ${r} 0 1 0 ${f(c.x - r)} ${f(c.y)}Z`);
  }
  return { engrave: pathD(move(got.art), 2), cut, score: [], width: got.box.x1 - got.box.x0, height: got.box.y1 - got.box.y0, scale: k };
}

/** The same placement padShapes used, so extra outlines land on the engraved artwork. */
function placed(ink: Subpath[], spec: PadSpec, marks: Subpath[]): string[] {
  const shaped = padShapes(ink, spec);
  if (!shaped || !marks.length) return [];
  const art = bboxOf(anchors(ink));
  const out = bboxOf(anchors(parsePathData(shaped.engrave)));
  const span = Math.max(art.x1 - art.x0, art.y1 - art.y0);
  const outSpan = Math.max(out.x1 - out.x0, out.y1 - out.y0);
  if (!(span > 0) || !(outSpan > 0)) return [];
  const k = outSpan / span;
  const moved = transformSubpaths(marks, [k, 0, 0, k, out.x0 - art.x0 * k, out.y0 - art.y0 * k]);
  return moved.map((s) => pathD([s], 2)).filter((d) => d.length > 0);
}

/** Corner smoothing for `traceOutlines`: turns sharper than about 40° stay corners, so straight edges stay straight. */
const SMOOTH = 0.4;
/** Path optimisation levels (px), tried in turn until the file is small enough to edit. */
const OPTIMIZE_PX = [0.5, 1, 1.6, 2.5, 4, 6];

const fileChars = (p: PadResult) => p.engrave.length + p.cut.reduce((n, d) => n + d.length, 0) + p.score.reduce((n, d) => n + d.length, 0);

// ---------- the model's part ----------

const specFields = {
  name: z.string().describe("A short English name for the piece."),
  summary: z.string().describe("One sentence for the user: what it is, its size and how it is made."),
  size: z.number().describe("Longest side of the finished piece in mm."),
  pad: z.number().describe("Width of the border round the artwork in mm."),
  hole: z.boolean().describe("True for a hanging hole at the top (keychains, ornaments, tags, or when asked to hang it)."),
  material: z.string().describe("Material and thickness, e.g. \"3 mm birch plywood\"."),
  thickness: z.number().describe("Material thickness in mm."),
  notes: z.array(z.string()).describe("At most one short plain English sentence for the user about a guessed size, usually none."),
};
const padSchema = z.object(specFields);
const padEditSchema = z.object({
  ...specFields,
  other: z.string().describe("A requested change that is not the size, border, hanging hole, material or name, in a few words; empty when there is none."),
});
type PadAnswer = z.infer<typeof padSchema>;

const PAD_RULES = `The app traces the artwork exactly, engraves it, and cuts a border (the pad) round it so the whole piece is one part. You decide only:
- size: the longest side of the finished piece in mm. Use the user's size; otherwise a real size for what it is: keychain or tag 40-60, ornament 70-100, coaster 90-100, magnet 50-80, sign or wall art 150-400, anything else 100.
- pad: the border width in mm. Use the user's value; otherwise about 2 × the material thickness, at least 3 mm, up to 8 mm on large pieces.
- hole: a hanging hole for keychains, ornaments, tags and anything to hang.
- material and thickness: what the user says, otherwise 3 mm birch plywood.
Name, summary and notes are in English whatever the language of the request.`;

const PAD_SYSTEM = `The user sent a picture of flat artwork (a logo, calligraphy, silhouette or drawing, in any colour) to make into a laser-cut piece.\n${PAD_RULES}`;
const PAD_EDIT_SYSTEM = `You change a traced laser piece as the user asks. ${PAD_RULES}\nKeep every value the user does not ask to change. A size asked for is the longest side of the result.`;

const clampSpec = (a: PadAnswer, fallback?: PadSpec): PadSpec & { thickness: number } => {
  const n = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const size = n(a.size, 15, 1200, fallback?.size ?? 100);
  return { size, pad: n(a.pad, 1, Math.min(30, size / 4), fallback?.pad ?? 4), hole: !!a.hole, thickness: n(a.thickness, 0.5, 20, 3) };
};

const DEFAULT_ANSWER: PadAnswer = { name: "Traced design", summary: "", size: 100, pad: 4, hole: false, material: "3 mm birch plywood", thickness: 3, notes: [] };

export class PadError extends Error {}

async function build(p: PadResult | null, a: PadAnswer, spec: PadSpec, thickness: number): Promise<BuiltArt> {
  if (!p) throw new PadError("No artwork was found in the picture.");
  if (fileChars(p) > MAX_CHARS) throw new PadError("The picture is too detailed to trace. Try a simpler or cleaner picture.");
  const art: Art = cleanArt({
    name: a.name, material: a.material, thickness,
    summary: a.summary || `${Math.round(p.width)} × ${Math.round(p.height)} mm, the artwork engraved with a ${spec.pad} mm cut border round it.`,
    width: p.width, height: p.height,
    shapes: [...p.cut.map((d) => ({ layer: "cut" as const, d })), ...p.score.map((d) => ({ layer: "score" as const, d })), { layer: "engrave", d: p.engrave }],
    texts: [], notes: a.notes.slice(0, 1),
  });
  return buildArt(art);
}

/** The design's answer, carrying the pad so an edit can rebuild it from the engraving. */
export function padDesign(b: BuiltArt, spec: PadSpec, plan: Plan, match: AIMatch = "exact", notes: string[] = []): AIDesign {
  const d = artDesign(b, plan, match, notes);
  return { ...d, params: { ...d.params, pad: spec } };
}

/** A new piece from black-and-white artwork. */
export async function padFromPicture(r: Raster, request: UserContent, ask: ArtAsk): Promise<{ built: BuiltArt; spec: PadSpec }> {
  const bits = inkBitmap(r);
  const layers = colorLayers(r, bits.up);
  let a = DEFAULT_ANSWER;
  try { a = await ask(PAD_SYSTEM, request, padSchema, "low"); } catch (e) { console.error("ai pad: sizing failed, using defaults", e); }
  const s = clampSpec(a);
  const spec = { size: s.size, pad: s.pad, hole: s.hole };
  let p: PadResult | null = null;
  for (const optimize of OPTIMIZE_PX) {
    const ink = traceOutlines(bits, { smooth: SMOOTH, optimize: optimize * bits.up });
    p = ink.length ? padShapes(ink, spec) : null;
    if (p && layers.length) {
      const marks = layers.flatMap((b) => traceOutlines(b, { smooth: SMOOTH, optimize: optimize * bits.up }));
      p = { ...p, score: placed(ink, spec, marks) };
    }
    if (!p || fileChars(p) <= MAX_CHARS) break;
    if (optimize === OPTIMIZE_PX[OPTIMIZE_PX.length - 1]) p = { ...p, score: [] };
  }
  return { built: await build(p, a, spec, s.thickness), spec };
}

/** The pad of a design made here, when its settings carry one. */
export function padOf(params: Record<string, unknown>): PadSpec | null {
  const p = params.pad as Partial<PadSpec> | undefined;
  return p && typeof p.size === "number" && typeof p.pad === "number" ? { size: p.size, pad: p.pad, hole: !!p.hole } : null;
}

/** Changes a traced piece: size, pad, hole, material and name are rebuilt from its engraving; other changes are reported. */
export async function editPad(current: Art, spec: PadSpec, change: string, ask: ArtAsk): Promise<{ built: BuiltArt; spec: PadSpec; other: string }> {
  const ink = current.shapes.filter((s) => s.layer === "engrave").flatMap((s) => parsePathData(s.d));
  if (!ink.length) throw new PadError("This design has no engraving to put a border round.");
  const now = `The piece now: ${JSON.stringify({ name: current.name, size: spec.size, pad: spec.pad, hole: spec.hole, material: current.material, thickness: current.thickness })}`;
  const a = await ask(PAD_EDIT_SYSTEM, [{ type: "text", text: `Change: ${change}\n\n${now}` }], padEditSchema, "low");
  const s = clampSpec(a, spec);
  const next = { size: s.size, pad: s.pad, hole: s.hole };
  return { built: await build(padShapes(ink, next), { ...a, summary: "" }, next, s.thickness), spec: next, other: a.other.trim() };
}
