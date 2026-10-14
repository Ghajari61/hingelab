/**
 * Layered paper-cut shadow box: a stack of frames of the same outline whose cut-outs grow from the
 * back layer to the front one, so the pattern reads as a tunnel of depth when they are stacked with
 * foam or spacer frames between them. Every layer keeps the frame's border whole; paper narrower
 * than the bridge width is opened up, and pieces that would fall out are left out.
 */
import { differenceShapes, intersectShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { MATERIALS } from "@/lib/hinge/defaults";
import { simplifyClosed } from "@/lib/parametric/slice/clean";
import { bboxOf, circle, ellipse, rect, regularPolygon, TAU, transform } from "../geom";
import { motif } from "../motifs";
import { heartCurve, orient, shapeOutline, starPolygon } from "../shapes";
import type { BuildContext, Contour, GenImage, GenOutput, GenPart, Pt } from "../types";
import { textBlock, weld } from "../weld";
import { PALETTES, type FrameShape, type Opening, type Petal, type Ridge, type ShadowBoxParams } from "./params";

export interface ShadowBoxInfo {
  /** The window inside the frame's border, mm. */
  winW: number;
  winH: number;
  /** Layers whose cut-outs fill the whole window (only the frame is left). */
  open: number;
  /** Loose pieces left out. */
  dropped: number;
  /** The border leaves no window. */
  noWindow: boolean;
  /** Stack depth, mm. */
  depth: number;
  /** Width of the front layer's words, and the window's width there less the padding, mm. */
  textW?: number;
  textRoom?: number;
  /** The words' size after shrinking them to fit, mm. */
  textSize?: number;
  /** Share of the window left open by the tightest pattern layer: at most this much of the photo shows, %. */
  photoShown?: number;
}

export type ShadowBoxOutput = GenOutput & { info?: ShadowBoxInfo };

/** Largest gap between a cut line and the drawn curve when points are thinned out, mm. */
const SIMPLIFY = 0.15;
/** Chord tolerance of small round holes (dots), mm. */
const DOT_TOL = 0.15;
const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const biggest = (s: Shape[]) => s.reduce((a, b) => (b.area > a.area ? b : a));

/** Seeded random numbers in [0, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- Shapes

/** A superellipse (|x|⁴ + |y|⁴ = 1): a square with soft, continuous corners, ±rx by ±ry. */
function squircle(rx: number, ry: number, m = 144): Contour {
  const out: Contour = [];
  for (let i = 0; i < m; i++) {
    const t = (TAU * i) / m, c = Math.cos(t), s = Math.sin(t);
    out.push([rx * Math.sign(c) * Math.sqrt(Math.abs(c)), ry * Math.sign(s) * Math.sqrt(Math.abs(s))]);
  }
  return out;
}

/** A circle whose edge swells in and out on a sine: `n` waves, troughs at `inner` of the radius. */
function wavyCircle(n: number, inner: number, m = Math.max(144, n * 24)): Contour {
  const out: Contour = [];
  for (let i = 0; i < m; i++) {
    const t = (TAU * i) / m, r = 1 - (1 - inner) * (0.5 - 0.5 * Math.cos(n * t));
    out.push([r * Math.sin(t), -r * Math.cos(t)]);
  }
  return out;
}

/** The outline of a frame shape filling (0, 0)–(w, h). */
export function frameOutline(kind: FrameShape, w: number, h: number, corner: number): Contour {
  if (kind === "squircle") return squircle(w / 2, h / 2, 192).map(([x, y]) => [x + w / 2, y + h / 2] as Pt);
  if (kind === "blossom") return wavyCircle(8, 0.86, 256).map(([x, y]) => [w / 2 + (x * w) / 2, h / 2 + (y * h) / 2] as Pt);
  return shapeOutline(kind, w, h, corner);
}

/** An opening shape centred on 0 within ±1, first point or petal up. */
export function unitOpening(kind: Exclude<Opening, "frame">, sides: number, inner: number): Contour {
  const n = Math.max(3, sides);
  switch (kind) {
    case "circle": return ellipse(0, 0, 1, 1, 144);
    case "oval": return ellipse(0, 0, 0.7, 1, 144);
    case "squircle": return squircle(1, 1);
    case "wavy": return wavyCircle(n, inner);
    case "orbit": {
      // Ellipses crossing in the middle, turned evenly: a soft rosette.
      const cs = Array.from({ length: n }, (_, k) => transform(ellipse(0, 0, Math.max(0.12, inner), 1, 96), { x: 0, y: 0, rot: (180 * k) / n, sx: 1, sy: 1 }));
      return biggest(unionShapes(cs.map(orient))).outer;
    }
    case "polygon": return regularPolygon(n, 1);
    case "star": return starPolygon(n, 1, inner);
    case "flower": {
      const m = Math.max(144, n * 28), out: Contour = [];
      for (let i = 0; i < m; i++) {
        const t = (TAU * i) / m, r = inner + (1 - inner) * Math.abs(Math.cos((n * t) / 2));
        out.push([r * Math.sin(t), -r * Math.cos(t)]);
      }
      return out;
    }
    case "heart": {
      const h = heartCurve(160), b = bboxOf([h]);
      const s = 2 / Math.max(b.x1 - b.x0, b.y1 - b.y0), mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      return h.map(([x, y]) => [(x - mx) * s, (y - my) * s] as Pt);
    }
    case "arch": return shapeOutline("arch", 1.6, 2).map(([x, y]) => [x - 0.8, y - 1] as Pt);
    case "drop": return dropCurve(0.8, 2);
  }
}

/** A leaf pointed at both ends (`kind` 1) or a teardrop with its tip up (2), `w` wide each side. */
function dropCurve(w: number, kind: 1 | 2): Contour {
  const m = 48, out: Contour = [];
  for (let i = 0; i < m; i++) {
    const t = (TAU * i) / m;
    const x = kind === 1 ? w * Math.sin(t) * Math.abs(Math.sin(t)) : w * Math.sin(t) * Math.sin(t / 2);
    out.push([x, -Math.cos(t)]);
  }
  return out;
}

/** A petal pointing up, centred on 0, ±1 long. */
function unitPetal(kind: Petal): Contour {
  switch (kind) {
    case "drop": return dropCurve(0.7, 2);
    case "leaf": return dropCurve(0.42, 1);
    case "diamond": return [[0, -1], [0.38, 0], [0, 1], [-0.38, 0]];
    case "circle": return ellipse(0, 0, 0.62, 0.62, 72);
  }
}

/** A point `r` from (cx, cy) at `a` radians clockwise from up. */
const polar = (cx: number, cy: number, r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
const rad = (d: number) => (d * Math.PI) / 180;

/** Turn contours by `deg` about (cx, cy). */
function turn(cs: Contour[], deg: number, cx: number, cy: number): Contour[] {
  if (!deg) return cs;
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return cs.map((k) => k.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c] as Pt));
}

// ---------------------------------------------------------------- Ridges

/** A ridge line across u = -0.05…1.05 as [u, height] with height in about ±1 (up is positive). */
function ridgeLine(kind: Ridge, bumps: number, rand: () => number): Pt[] {
  const c = Math.max(1, bumps);
  const u0 = -0.05, u1 = 1.05;
  const out: Pt[] = [];
  const sample = (f: (u: number) => number) => {
    const m = Math.min(1600, Math.max(160, Math.round(c * 48)));
    for (let i = 0; i <= m; i++) { const u = u0 + ((u1 - u0) * i) / m; out.push([u, f(u)]); }
  };
  switch (kind) {
    case "hills": {
      const a = rand() * TAU, b = rand() * TAU, k = 1.6 + rand() * 0.6;
      sample((u) => 0.65 * Math.sin(TAU * c * u * 0.5 + a) + 0.35 * Math.sin(TAU * c * u * 0.5 * k + b));
      break;
    }
    case "sine": {
      const a = rand() * TAU;
      sample((u) => Math.sin(TAU * c * u * 0.5 + a));
      break;
    }
    case "dunes": {
      const a = rand() * TAU;
      sample((u) => { const th = TAU * c * u * 0.5 + a; return Math.sin(th + 0.75 * Math.sin(th)); });
      break;
    }
    case "waves": {
      const a = rand();
      sample((u) => 1 - 2 * Math.pow(Math.abs(Math.sin(Math.PI * (c * u + a))), 0.7));
      break;
    }
    case "zigzag": {
      const a = rand() * 0.5;
      for (let k = Math.floor((u0 * c - a) * 2) - 1; ; k++) {
        const u = (k * 0.5 + a) / c;
        out.push([u, k % 2 === 0 ? 1 : -1]);
        if (u > u1) break;
      }
      break;
    }
    case "mountains": {
      let u = u0 - rand() / c;
      out.push([u, -0.6]);
      while (u < u1) {
        const w = (0.7 + rand() * 0.6) / c;
        const peak = 0.15 + rand() * 0.85, valley = -1 + rand() * 0.6;
        const pu = u + w * (0.35 + rand() * 0.3);
        out.push([u + (pu - u) * 0.55, peak * (0.45 + rand() * 0.2)]);
        out.push([pu, peak]);
        out.push([pu + (u + w - pu) * 0.45, peak * (0.4 + rand() * 0.25)]);
        u += w;
        out.push([u, valley]);
      }
      break;
    }
    case "skyline": {
      let u = u0;
      while (u < u1) {
        const w = (0.45 + rand() * 0.8) / c, h = -0.85 + rand() * 1.7, roll = rand();
        if (roll < 0.18) {
          out.push([u, h], [u + w / 2, Math.min(1.2, h + 0.35)], [u + w, h]);
        } else if (roll < 0.3) {
          out.push([u, h], [u + w * 0.42, h], [u + w * 0.42, h + 0.4], [u + w * 0.58, h + 0.4], [u + w * 0.58, h], [u + w, h]);
        } else {
          out.push([u, h], [u + w, h]);
        }
        u += w;
      }
      break;
    }
    case "trees": {
      // Pines with three tiers of branches, standing on a low ground line with gaps between them.
      const ground = -0.8;
      let u = u0 - rand() / c;
      out.push([u, ground]);
      while (u < u1) {
        const w = (0.45 + rand() * 0.45) / c, top = -0.1 + rand() * 1.1, mid = u + w / 2;
        const tiers = 3, step = (top - ground) / tiers, side: Pt[] = [];
        for (let t = 0; t < tiers; t++) {
          const half = (w / 2) * (1 - t / (tiers + 0.4));
          side.push([mid - half, ground + step * t + (t ? 0 : 0.06)]);
          if (t < tiers - 1) side.push([mid - (w / 2) * (1 - (t + 1) / (tiers + 0.4)) * 0.45, ground + step * (t + 1)]);
        }
        out.push(...side, [mid, top], ...side.slice().reverse().map(([x, y]) => [2 * mid - x, y] as Pt));
        u += w + (rand() * 0.25) / c;
        out.push([u, ground]);
      }
      break;
    }
    case "clouds": {
      // Overlapping round puffs on a low base line.
      const puffs: { u: number; r: number; h: number }[] = [];
      for (let u = u0 - 0.5 / c; u < u1 + 0.5 / c; u += (0.35 + rand() * 0.3) / c) puffs.push({ u, r: (0.3 + rand() * 0.25) / c, h: 0.6 + rand() * 1.1 });
      sample((u) => {
        let f = 0;
        for (const q of puffs) { const x = (u - q.u) / q.r; if (x > -1 && x < 1) f = Math.max(f, q.h * Math.sqrt(1 - x * x)); }
        return -0.8 + f;
      });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- Build

interface Win { x0: number; y0: number; w: number; h: number; cx: number; cy: number; R: number }

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

/** The paper colour of layer k of n. */
export function layerColor(p: ShadowBoxParams, k: number, n: number): string {
  const stops = [...PALETTES[p.look.palette].stops];
  if (p.look.reverse) stops.reverse();
  const t = n > 1 ? k / (n - 1) : 0;
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const a = hexToRgb(stops[i]), b = hexToRgb(stops[i + 1]);
  return "#" + a.map((v, j) => Math.round(v + (b[j] - v) * f).toString(16).padStart(2, "0")).join("");
}

/** The cut-outs of pattern layer i (0 = the back one) of L. */
function openingsOf(p: ShadowBoxParams, w: Win, win: Shape, i: number, L: number): Contour[] {
  const g = p.design;
  const t = L > 1 ? i / (L - 1) : 1;
  const s = Math.max(0, (g.min + (g.max - g.min) * t) / 100);
  if (s <= 0) return [];
  const vx = w.cx + ((g.shiftX / 100) * w.w * (1 - t)) / 2;
  const vy = w.cy + ((g.shiftY / 100) * w.h * (1 - t)) / 2;
  const rot = g.rotate + g.twist * i;
  const inner = Math.min(0.95, Math.max(0.05, g.inner / 100));

  const shapeAt = (kind: Opening, size: number, angle: number): Contour[] => {
    if (kind === "frame") {
      const d = (1 - size) * w.R;
      const inset = d > 0 ? offsetShapes([win], -d) : [win];
      return turn(inset.flatMap((sh) => [sh.outer]).map((c) => c.map(([x, y]) => [x + vx - w.cx, y + vy - w.cy] as Pt)), angle, vx, vy);
    }
    const rx = size * (g.stretch ? w.w / 2 : w.R), ry = size * (g.stretch ? w.h / 2 : w.R);
    return [transform(unitOpening(kind, g.sides, inner), { x: vx, y: vy, rot: angle, sx: rx, sy: ry })];
  };

  switch (g.pattern) {
    case "tunnel":
      return shapeAt(g.opening, s, rot);
    case "mandala": {
      const n = g.count, step = 360 / n, a0 = rot + (i % 2 ? step / 2 : 0);
      const core = s * w.R * 0.42, len = s * w.R * 0.62;
      const out = shapeAt(g.opening === "frame" ? "circle" : g.opening, s * 0.42, a0);
      const petal = unitPetal(g.petal);
      const rp = core * 0.85 + len / 2, rd = core * 0.85 + len * 1.12, dr = Math.max(len * 0.09, g.web);
      for (let j = 0; j < n; j++) {
        const a = rad(a0 + j * step);
        const [x, y] = polar(vx, vy, rp, a);
        out.push(transform(petal, { x, y, rot: a0 + j * step, sx: len / 2, sy: len / 2 }));
        const [dx, dy] = polar(vx, vy, rd, a + rad(step / 2));
        out.push(circle(dx, dy, dr, DOT_TOL));
      }
      return out;
    }
    case "sunburst": {
      const n = g.count, a0 = rad(rot + (i % 2 ? 180 / n : 0));
      const hub = s * w.R * 0.32, ra = hub * 0.5, rb = s * w.R * 1.25;
      const hw = (Math.PI / n) * inner, sw = rad(g.swirl), m = 10;
      const out: Contour[] = [circle(vx, vy, hub, 0.05)];
      for (let j = 0; j < n; j++) {
        const a = a0 + (j * TAU) / n, left: Pt[] = [], right: Pt[] = [];
        for (let k = 0; k <= m; k++) {
          const f = k / m, r = ra + (rb - ra) * f, b = a + sw * f;
          left.push(polar(vx, vy, r, b - hw));
          right.push(polar(vx, vy, r, b + hw));
        }
        out.push([...left, ...right.reverse()]);
      }
      return out;
    }
    case "landscape": {
      const o = Math.min(1, s), hm = (1 - o) * w.h, amp = (g.amp / 100) * w.h * 0.5 * (0.6 + 0.4 * t);
      const bumps = g.count * (1 + 0.8 * (1 - t));
      const xs = (u: number) => w.x0 + u * w.w;
      const top = w.y0 - 5, bot = w.y0 + w.h + 5;
      const line = (side: number) => ridgeLine(g.ridge, bumps, rng(g.seed * 31 + i * 7919 + side * 104729));
      if (g.from === "both") {
        const hh = hm / 2;
        const up = line(1).map(([u, f]) => [xs(u), w.y0 + hh + amp * f] as Pt);
        const dn = line(2).map(([u, f]) => [xs(u), w.y0 + w.h - hh - amp * f] as Pt);
        return [[...up, ...dn.reverse()]];
      }
      if (g.from === "top") {
        const pts = line(1).map(([u, f]) => [xs(u), w.y0 + hm + amp * f] as Pt);
        return [[...pts, [w.x0 + w.w + 5, bot], [w.x0 - 5, bot]]];
      }
      const pts = line(0).map(([u, f]) => [xs(u), w.y0 + w.h - hm - amp * f] as Pt);
      return [[...pts, [w.x0 + w.w + 5, top], [w.x0 - 5, top]]];
    }
    case "lattice": {
      const pitch = Math.max(8, g.pitch), reach = Math.hypot(w.w, w.h) / 2 + pitch * 2;
      const dmax = Math.hypot(w.w, w.h) / 2;
      const out: Contour[] = [];
      const hole = (x: number, y: number, kind: "up" | "down" | null) => {
        const [gx, gy] = turn([[[x, y]]], rot, w.cx, w.cy)[0][0];
        if (gx < w.x0 - pitch || gx > w.x0 + w.w + pitch || gy < w.y0 - pitch || gy > w.y0 + w.h + pitch) return;
        const d = Math.hypot(gx - vx, gy - vy) / dmax;
        const k = s * Math.max(0, 1 + (g.fade / 100) * (1 - 2 * d));
        if (k * pitch < g.web) return;
        let c: Contour;
        switch (g.cell) {
          case "hex": c = regularPolygon(6, (k * pitch) / Math.sqrt(3), rot, gx, gy); break;
          case "circle": c = circle(gx, gy, (k * pitch) / 2, DOT_TOL); break;
          case "oval": c = transform(ellipse(0, 0, k * pitch * 0.3, k * pitch * 0.48, 40), { x: gx, y: gy, rot, sx: 1, sy: 1 }); break;
          case "square": c = regularPolygon(4, ((k * pitch) / 2) * Math.SQRT2, rot + 45, gx, gy); break;
          case "diamond": c = regularPolygon(4, (k * pitch) / 2, rot, gx, gy); break;
          case "triangle": c = regularPolygon(3, (k * pitch) / Math.sqrt(3), rot + (kind === "down" ? 180 : 0), gx, gy); break;
        }
        out.push(c);
      };
      const n = Math.ceil(reach / pitch) + 1;
      if (g.cell === "hex" || g.cell === "circle") {
        const dy = (pitch * Math.sqrt(3)) / 2;
        for (let j = -n * 2; j <= n * 2; j++) for (let k = -n; k <= n; k++) hole(w.cx + k * pitch + (j % 2 ? pitch / 2 : 0), w.cy + j * dy, null);
      } else if (g.cell === "square") {
        for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) hole(w.cx + k * pitch, w.cy + j * pitch, null);
      } else if (g.cell === "diamond" || g.cell === "oval") {
        for (let j = -n * 2; j <= n * 2; j++) for (let k = -n; k <= n; k++) hole(w.cx + k * pitch + (j % 2 ? pitch / 2 : 0), w.cy + (j * pitch) / 2, null);
      } else {
        const h = (pitch * Math.sqrt(3)) / 2;
        for (let j = -n * 2; j <= n * 2; j++) for (let k = -n * 2; k <= n * 2; k++) {
          const up = ((j + k) % 2 + 2) % 2 === 0;
          hole(w.cx + (k * pitch) / 2, w.cy + j * h + (up ? (2 * h) / 3 : h / 3) - h / 2, up ? "up" : "down");
        }
      }
      return out;
    }
    case "flow": {
      // Wavy slots across the window; the paper between them runs from one side of the frame to the other.
      const n = Math.max(2, g.count), pitch = w.h / n, reach = Math.hypot(w.w, w.h) / 2 + pitch;
      const th = Math.min(pitch - g.web, pitch * s * 0.9), amp = (g.amp / 100) * pitch * 1.6;
      if (th <= 0) return [];
      const k = (TAU * Math.max(1, g.waves)) / (w.w * 2), phase = rad(g.swirl) * t;
      const m = Math.ceil(((2 * reach) / w.w) * Math.max(1, g.waves) * 20);
      const out: Contour[] = [];
      for (let j = -Math.ceil(reach / pitch); j <= Math.ceil(reach / pitch); j++) {
        const yc = w.cy + (j + (n % 2 ? 0 : 0.5)) * pitch, top: Pt[] = [], bot: Pt[] = [];
        for (let q = 0; q <= m; q++) {
          const x = w.cx - reach + (2 * reach * q) / m, y = yc + amp * Math.sin(k * (x - w.x0) + phase);
          top.push([x, y - th / 2]);
          bot.push([x, y + th / 2]);
        }
        out.push([...top, ...bot.reverse()]);
      }
      return turn(out, rot, w.cx, w.cy);
    }
  }
}

/** The light hole in the back layer: in the middle, or in a landscape's sky. */
function lightHole(p: ShadowBoxParams, w: Win): Contour[] {
  const d = (2 * w.R * p.design.holeSize) / 100;
  let cx = w.cx, cy = w.cy;
  if (p.design.pattern === "landscape") {
    const low = p.design.from === "top", m = d / 2 + 3;
    cx = Math.min(w.x0 + w.w - m, Math.max(w.x0 + m, w.x0 + w.w * (low ? 0.3 : 0.72)));
    cy = Math.min(w.y0 + w.h - m, Math.max(w.y0 + m, w.y0 + w.h * (low ? 0.78 : 0.22)));
  }
  if (p.design.hole === "circle") return [circle(cx, cy, d / 2, 0.05)];
  const cs = motif(p.design.hole, d, cx, cy);
  // Every piece is cut out whole: a motif's inner details would fall out of a hole anyway.
  return shapeContours(unionShapes(cs.map(orient)).map((s) => makeShape(s.outer, [])));
}

/**
 * The photo on the back board: it covers the window and a bleed round it (so no blank paper shows if
 * the layers sit a little off), zoomed from the middle and shifted by a share of the spare room.
 */
function photoOn(p: ShadowBoxParams, w: Win, win: Shape): GenImage | null {
  const ph = p.photo;
  if (!ph.image) return null;
  const b = Math.min(3, p.frame.border / 2);
  const grown = offsetShapes([win], b, "round");
  const clip = grown.length ? orient(simplifyClosed(biggest(grown).outer, SIMPLIFY)) : win.outer;
  const bw = w.w + 2 * b, bh = w.h + 2 * b, z = ph.zoom / 100, a = ph.aspect;
  const [iw, ih] = a > bw / bh ? [bh * z * a, bh * z] : [bw * z, (bw * z) / a];
  const x = w.cx - iw / 2 + ((iw - bw) / 2) * (ph.x / 100);
  const y = w.cy - ih / 2 + ((ih - bh) / 2) * (ph.y / 100);
  return { href: ph.image, x: r2(x), y: r2(y), w: r2(iw), h: r2(ih), clip };
}

interface TextCut { keep: Contour[]; clear: Contour[]; width: number; room: number; size: number; loading: boolean }

/** Words wider than the window shrink to fit it. */
function textCut(p: ShadowBoxParams, w: Win, winCs: Contour[], ctx: BuildContext | undefined, missing: string[]): TextCut | null {
  if (!p.text.text.trim()) return null;
  if (!ctx) return { keep: [], clear: [], width: 0, room: 0, size: p.text.size, loading: true };
  let size = p.text.size, out = textAt(p, size, w, winCs, ctx, missing);
  for (let k = 0; k < 2 && !out.loading && out.room > 0 && out.width > out.room; k++) {
    size = Math.max(4, size * (out.room / out.width) * 0.98);
    out = textAt(p, size, w, winCs, ctx, []);
  }
  return out;
}

/**
 * Words standing on a paper bar across the front layer's window: the bar runs along the baseline and
 * meets the frame at both ends; a clear band around the words is cut away so they read on their own.
 */
function textAt(p: ShadowBoxParams, size: number, w: Win, winCs: Contour[], ctx: BuildContext, missing: string[]): TextCut {
  const t = { ...p.text, size };
  const b = textBlock(ctx, t.text, t.fontId, t.size, { missing, spacing: -t.size * 0.02 });
  if (b.loading || !b.contours.length) return { keep: [], clear: [], width: 0, room: 0, size, loading: b.loading };
  // The baseline: the most common lowest point of the glyphs (descenders and counters vote alone).
  const bucket = Math.max(0.3, t.size * 0.05), votes = new Map<number, number>();
  for (const c of b.contours) {
    const k = Math.round(bboxOf([c]).y1 / bucket);
    votes.set(k, (votes.get(k) ?? 0) + 1);
  }
  const base = [...votes.entries()].reduce((a, e) => (e[1] > a[1] || (e[1] === a[1] && e[0] > a[0]) ? e : a))[0] * bucket;
  const bar = Math.max(2, t.size * 0.14), pad = Math.max(3, t.size * 0.25);
  const top = -b.height / 2 - pad, bot = Math.max(b.height / 2, base + bar) + pad;
  const at = t.place === "top" ? w.y0 + w.h * 0.2 : t.place === "middle" ? w.cy : w.y0 + w.h * 0.8;
  const dy = Math.min(w.y0 + w.h - bot - 1, Math.max(w.y0 - top + 1, at - (top + bot) / 2));
  const glyphs = b.contours.map((c) => c.map(([x, y]) => [w.cx + x, y + dy] as Pt));
  const barC = rect(w.x0 - 5, base + dy - 0.3, w.w + 10, bar + 0.3);
  const clear = [rect(w.x0 - 5, top + dy, w.w + 10, bot - top)];
  const welded = weld([...glyphs, barC], { border: 0, minHole: 1.5, bridge: Math.max(1.2, t.size * 0.07) });
  const keep = welded ? shapeContours(intersectShapes(shapeContours([welded]), winCs)) : [];
  // The window's width along the words' middle line, less the padding.
  const mid = intersectShapes([rect(w.x0 - 5, dy - 0.5, w.w + 10, 1)], winCs);
  const room = mid.length ? bboxOf(mid.map((s) => s.outer)).x1 - bboxOf(mid.map((s) => s.outer)).x0 - 2 * pad : 0;
  return { keep, clear, width: b.width, room, size, loading: false };
}

export function buildShadowBox(p: ShadowBoxParams, ctx?: BuildContext): ShadowBoxOutput {
  const { width: W, height: H, border } = p.frame;
  const T = p.T, N = p.stack.count;
  const frame = orient(simplifyClosed(frameOutline(p.frame.shape, W, H, p.frame.corner), SIMPLIFY));
  const frameShape = makeShape(frame, []);
  const wins = offsetShapes([frameShape], -border);
  const info: ShadowBoxInfo = { winW: 0, winH: 0, open: 0, dropped: 0, noWindow: false, depth: 0 };
  if (!wins.length || biggest(wins).area < 100) {
    info.noWindow = true;
    return { parts: [], stats: [], error: "The frame's border leaves no window: make the border narrower or the frame larger.", info };
  }
  const win = biggest(wins);
  const wb = bboxOf([win.outer]);
  const w: Win = { x0: wb.x0, y0: wb.y0, w: wb.x1 - wb.x0, h: wb.y1 - wb.y0, cx: (wb.x0 + wb.x1) / 2, cy: (wb.y0 + wb.y1) / 2, R: Math.min(wb.x1 - wb.x0, wb.y1 - wb.y0) / 2 };
  info.winW = r1(w.w);
  info.winH = r1(w.h);
  const winCs = shapeContours([win]);
  const ring = differenceShapes([frame], winCs);
  const ringArea = ring.reduce((a, s) => a + s.area, 0);
  const web = Math.max(0, p.design.web);

  /** The frame with `cuts` taken out of its window, cleaned of slivers and loose pieces; `keep` is added back after the cleaning. */
  const layerOf = (cuts: Contour[], keep: Contour[] = []): Shape => {
    if (!cuts.length) return frameShape;
    const merged = unionShapes(cuts.map(orient));
    const inWin = intersectShapes(shapeContours(merged), winCs);
    let body = differenceShapes([frame], shapeContours(inWin));
    if (web > 0) body = offsetShapes(offsetShapes(body, -web / 2, "miter"), web / 2, "miter");
    const all = unionShapes([...shapeContours(body), ...shapeContours(ring), ...keep]);
    if (!all.length) return frameShape;
    const main = biggest(all);
    info.dropped += all.filter((s) => s !== main && s.area > 1).length;
    if (main.area < ringArea * 1.01 + 1) info.open++;
    return makeShape(main.outer, main.holes.map((h) => simplifyClosed(h, SIMPLIFY)));
  };

  // A photo needs a whole back board to sit on, and takes the place of the light hole.
  const photo = photoOn(p, w, win);
  const back = p.stack.back || !!photo;
  const L = back ? N - 1 : N;
  const shapes: Shape[] = [];
  const moon = p.design.moon && !photo ? lightHole(p, w) : [];
  const missing: string[] = [];
  const text = textCut(p, w, winCs, ctx, missing);
  if (text && !text.loading) { info.textW = r1(text.width); info.textRoom = r1(text.room); info.textSize = r1(text.size); }
  if (back) shapes.push(moon.length ? layerOf(moon) : frameShape);
  for (let i = 0; i < L; i++) {
    const front = i === L - 1 && text && !text.loading, dropped = info.dropped;
    shapes.push(layerOf([...openingsOf(p, w, win, i, L), ...(i === 0 && !back ? moon : []), ...(front ? text.clear : [])], front ? text.keep : []));
    // Bits of the pattern cut off by the words' clear band are meant to go.
    if (front) info.dropped = dropped;
  }
  if (photo && shapes.length > 1) {
    const open = Math.min(...shapes.slice(1).map((s) => win.area - (s.area - ringArea)));
    info.photoShown = Math.max(0, Math.min(100, Math.round((100 * open) / win.area)));
  }

  const frames = p.stack.spacer === "frames";
  const per = frames ? p.stack.per : 0;
  const gapZ = frames ? per * T : Math.max(0, p.stack.gap);
  const parts: GenPart[] = [];
  const ringMain = biggest(ring);
  const spacer = makeShape(simplifyClosed(ringMain.outer, SIMPLIFY), ringMain.holes.map((h) => simplifyClosed(h, SIMPLIFY)));
  let sp = 0;
  shapes.forEach((sh, k) => {
    const z = k * (T + gapZ);
    const color = layerColor(p, k, N);
    const name = `Layer ${k + 1}${k === 0 ? " (back)" : k === N - 1 ? " (front)" : ""}`;
    parts.push({ id: `layer${k + 1}`, name, outer: sh.outer, holes: sh.holes, color, matte: true, place: { x: 0, y: 0, z }, ...(k === 0 && photo ? { images: [photo] } : {}) });
    if (k < N - 1) for (let j = 0; j < per; j++) {
      sp++;
      parts.push({ id: `spacer${sp}`, name: `Spacer ${sp}`, outer: spacer.outer, holes: spacer.holes, color, matte: true, place: { x: 0, y: 0, z: z + T + j * T } });
    }
  });
  const depth = N * T + (N - 1) * gapZ;
  info.depth = r1(depth);

  const blade = p.cutter.kind === "blade";
  const mat = blade ? "card" : MATERIALS[p.material]?.name ?? `${T} mm sheet`;
  return {
    parts,
    stats: [
      { label: "Layers", value: String(N) },
      { label: "Size", value: `${r0(W)} × ${r0(H)} mm` },
      { label: "Window", value: `${r0(w.w)} × ${r0(w.h)} mm` },
      { label: "Depth", value: `${r1(depth)} mm` },
      ...(sp ? [{ label: "Spacer frames", value: String(sp) }] : []),
      ...(photo ? [{ label: "Photo shows", value: `${r0(w.w)} × ${r0(w.h)} mm` }] : []),
    ],
    assembly: [
      blade
        ? `Cut every layer from its own colour of ${mat}; Layer 1 is the back and Layer ${N} the front.`
        : `Cut the ${N} layers from ${mat}; Layer 1 is the back and Layer ${N} the front.`,
      frames
        ? `Glue ${per === 1 ? "a spacer frame" : `${per} spacer frames`} between each pair of layers, lining up the outlines.`
        : `Stick ${r1(gapZ)} mm foam tape around the border of every layer but the front one, with small foam squares behind wide areas of the pattern.`,
      ...(photo
        ? [blade
          ? "The photo is on Layer 1, the back board, on the Engrave layer of the SVG: print the SVG at 100 % on photo paper or card and glue it on the back board, or print straight onto the card before cutting Layer 1."
          : "The photo is on Layer 1, the back board, on the Engrave layer of the SVG: engrave it before cutting Layer 1 without moving the sheet, or glue a print of it on the back board."]
        : []),
      "Stack the layers in order from the back, pressing each one down evenly before the next.",
      ...(text && !text.loading ? [`The words stand on a paper bar across the front layer: cut it from a contrasting card so they read clearly.`] : []),
      ...(p.design.moon ? ["For a lit box, put a battery LED strip or puck light behind the back layer's light hole."] : []),
      `Fit the stack into a shadow box frame at least ${Math.ceil(depth + 5)} mm deep, or glue a backing card on and hang it as it is.`,
    ],
    info,
    stacked: true,
    notice: text?.loading ? "Loading the font." : undefined,
    missing: missing.length ? missing : undefined,
  };
}
