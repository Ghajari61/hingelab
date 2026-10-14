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
import { bandPoint, digits, drillPart, feet, HEAD_DEPTH, keyholes, lightRings, notchedRings, pinHoles, ringCount, screwHoles, walls, WALL_PLAY, type Band } from "./enclosure";
import { bridgeIslands } from "./islands";
import { PALETTES, type FrameShape, type Opening, type Petal, type Ridge, type ShadowBoxParams } from "./params";
import { photoDpi, photoPlace, type WinBox } from "./photo";
import { pictureCuts, pictureMode, pictureSource, silhouette, wordSource, type PicSource } from "./picture";

/** Play each side of a photo slot, mm. */
const SLOT_PLAY = 0.75;

export interface ShadowBoxInfo {
  /** The window inside the frame's border, mm. */
  winW: number;
  winH: number;
  /** Layers whose cut-outs fill the whole window (only the frame is left). */
  open: number;
  /** Loose pieces left out. */
  dropped: number;
  /** Bridges added to hold loose pieces, and loose pieces cut as parts of their own. */
  bridges?: number;
  pieces?: number;
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
  /** Dots per inch the stored photo gives at its printed size. */
  photoDpi?: number;
  /** Width of the border band every part shares (where pins, screws and numbers go), mm. */
  band?: number;
  /** Light box rings. */
  rings?: number;
  /** The keyholes need a wider border: this wide, mm. */
  keyBorder?: number;
  /** The finger-jointed box, outside, mm. */
  boxW?: number;
  boxH?: number;
  boxD?: number;
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
    case "picture":
      return [];
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
 * the layers sit a little off), zoomed from the middle and shifted by a share of the spare room. A
 * photo in a slot is a rectangular print slid in by hand, so it is only drawn on the 3D model.
 */
function photoOn(p: ShadowBoxParams, w: Win, win: Shape): GenImage | null {
  if (!p.photo.image) return null;
  const { x, y, iw, ih, bw, bh, b } = photoPlace(p, w);
  if (p.photo.mount === "slot") return { href: p.photo.image, x: r2(x), y: r2(y), w: r2(iw), h: r2(ih), clip: rect(w.cx - bw / 2, w.cy - bh / 2, bw, bh), only3d: true };
  const grown = offsetShapes([win], b, "round");
  const clip = grown.length ? orient(simplifyClosed(biggest(grown).outer, SIMPLIFY)) : win.outer;
  return { href: p.photo.image, x: r2(x), y: r2(y), w: r2(iw), h: r2(ih), clip };
}

/**
 * The holder a printed photo slides into: the frame with a channel the print's width (plus play) cut
 * from the top edge down to the print's bottom edge, so the print rests on it behind the window.
 */
function photoHolder(p: ShadowBoxParams, w: Win, frame: Contour): Shape | null {
  const { bw, bh } = photoPlace(p, w), fb = bboxOf([frame]);
  const channel = rect(w.cx - bw / 2 - SLOT_PLAY, fb.y0 - 1, bw + 2 * SLOT_PLAY, w.cy + bh / 2 + SLOT_PLAY - fb.y0 + 1);
  const left = differenceShapes([frame], [channel]).filter((s) => s.area > 1);
  return left.length ? makeShape(simplifyClosed(biggest(left).outer, SIMPLIFY), biggest(left).holes.map((h) => simplifyClosed(h, SIMPLIFY))) : null;
}

/** The window's box inside the border, or null when the border leaves no window. */
export function windowBox(p: ShadowBoxParams): WinBox | null {
  const frame = orient(simplifyClosed(frameOutline(p.frame.shape, p.frame.width, p.frame.height, p.frame.corner), SIMPLIFY));
  const wins = offsetShapes([makeShape(frame, [])], -p.frame.border);
  if (!wins.length || biggest(wins).area < 100) return null;
  const wb = bboxOf([biggest(wins).outer]);
  return { x0: wb.x0, y0: wb.y0, w: wb.x1 - wb.x0, h: wb.y1 - wb.y0, cx: (wb.x0 + wb.x1) / 2, cy: (wb.y0 + wb.y1) / 2 };
}

interface TextCut { keep: Contour[]; clear: Contour[]; glyphs: Contour[]; width: number; room: number; size: number; loading: boolean }

/**
 * The index (0 = Layer 1, the back) of the layer carrying the words: Text layer counts from the back
 * and 0 is the front. Cut words need a pattern layer; engraved ones may sit on the back board too.
 */
export function textLayer(p: ShadowBoxParams, N: number, back: boolean, engrave: boolean): number {
  if (p.text.layer <= 0) return N - 1;
  return Math.max(engrave || !back ? 0 : 1, Math.min(N - 1, Math.round(p.text.layer) - 1));
}

/** The picture pattern's source: the traced picture, the word set in its font, or the sample shape. */
function picSource(p: ShadowBoxParams, ctx: BuildContext | undefined, missing: string[]): { src: PicSource; loading: boolean } {
  const word = p.picture.word.trim();
  if (p.picture.levels || !word) return { src: pictureSource(p.picture), loading: false };
  const b = ctx ? textBlock(ctx, word, p.picture.wordFont, 100, { missing }) : null;
  if (b && !b.loading && b.contours.length) return { src: wordSource(b.contours), loading: false };
  return { src: pictureSource(p.picture), loading: !b || b.loading };
}

/** Words wider than the window shrink to fit it. */
function textCut(p: ShadowBoxParams, w: Win, winCs: Contour[], ctx: BuildContext | undefined, missing: string[]): TextCut | null {
  if (!p.text.text.trim()) return null;
  if (!ctx) return { keep: [], clear: [], glyphs: [], width: 0, room: 0, size: p.text.size, loading: true };
  let size = p.text.size, out = textAt(p, size, w, winCs, ctx, missing);
  for (let k = 0; k < 2 && !out.loading && out.room > 0 && out.width > out.room; k++) {
    size = Math.max(4, size * (out.room / out.width) * 0.98);
    out = textAt(p, size, w, winCs, ctx, []);
  }
  return out;
}

/**
 * Words standing on a paper bar across a layer's window: the bar runs along the baseline and
 * meets the frame at both ends; a clear band around the words is cut away so they read on their own.
 */
function textAt(p: ShadowBoxParams, size: number, w: Win, winCs: Contour[], ctx: BuildContext, missing: string[]): TextCut {
  const t = { ...p.text, size };
  const b = textBlock(ctx, t.text, t.fontId, t.size, { missing, spacing: -t.size * 0.02 });
  if (b.loading || !b.contours.length) return { keep: [], clear: [], glyphs: [], width: 0, room: 0, size, loading: b.loading };
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
  return { keep, clear, glyphs, width: b.width, room, size, loading: false };
}

/** Steps for the back board, light box, pins and numbers, before the layers go on. */
function enclosureSteps(p: ShadowBoxParams, rings: number, diffuser: boolean, N: number): string[] {
  const out: string[] = [];
  if (p.box.pins) out.push(`Push ${p.box.pin} mm pins, dowels or cocktail sticks through the two pin holes as you stack the parts, so every part lines up; trim them flush when the glue is dry.`);
  if (p.box.numbers) out.push(`Each layer's number is scored on its bottom border (Layer 1 to Layer ${N - 1}; the front layer has none), so the stack goes together in order.`);
  if (p.box.back !== "none") out.push(p.box.back === "screwed"
    ? `The back board is screwed on with four ${p.box.screw} mm screws through its corner holes into the pilot holes above it, so it comes off${rings ? " to reach the lights" : ""}.`
    : "Glue the back board on behind everything else, outlines lined up.");
  if (rings) {
    out.push(`Glue the ${rings} light box rings into one stack on the back board${p.light.cable > 0 ? ", the notched ones at the back" : ""}. Stick an LED strip round the inside of the rings, facing in${p.light.cable > 0 ? ", and lead its cable out through the notch at the bottom" : ""}.`);
    if (diffuser) out.push("Lay the diffuser on the light box: it spreads the light evenly behind the layers. Cut it from white or frosted acrylic, or glue tracing paper onto a frame.");
  }
  return out;
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

  const loose = p.design.loose;
  /** Loose pieces cut as parts of their own, by layer index. */
  const pieces = new Map<number, Shape[]>();
  /**
   * The frame with `cuts` taken out of its window, cleaned of slivers and loose pieces; `keep` is added
   * back after the cleaning. `oriented` cuts keep their holes (outers positive, holes negative).
   */
  const layerOf = (cuts: Contour[], keep: Contour[] = [], oriented = false, how = loose): Shape => {
    if (!cuts.length) return frameShape;
    const merged = unionShapes(oriented ? cuts : cuts.map(orient));
    const inWin = intersectShapes(shapeContours(merged), winCs);
    let body = differenceShapes([frame], shapeContours(inWin));
    if (web > 0) body = offsetShapes(offsetShapes(body, -web / 2, "miter"), web / 2, "miter");
    const all = unionShapes([...shapeContours(body), ...shapeContours(ring), ...keep]);
    if (!all.length) return frameShape;
    let main = biggest(all);
    const rest = all.filter((s) => s !== main && s.area > 1);
    if (rest.length && how === "bridge") {
      const b = bridgeIslands(main, rest, Math.max(p.design.bridge, web));
      main = b.shape;
      info.bridges = (info.bridges ?? 0) + b.bridges;
      info.dropped += b.left;
    } else if (rest.length && how === "parts") {
      // Called as `shapes.push(layerOf(...))`, so this layer's index is the current length.
      pieces.set(shapes.length, rest.map((s) => makeShape(simplifyClosed(s.outer, SIMPLIFY), s.holes.map((h) => simplifyClosed(h, SIMPLIFY)))));
      info.pieces = (info.pieces ?? 0) + rest.length;
    } else info.dropped += rest.length;
    // A frame whose pieces are cut as parts is not an empty layer: the pieces sit in its window.
    if (main.area < ringArea * 1.01 + 1 && !(how === "parts" && rest.length)) info.open++;
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
  const source = p.design.pattern === "picture" ? picSource(p, ctx, missing) : null;
  const pic = source?.src ?? null;
  const sil = pic && pictureMode(p.picture, pic) !== "levels" ? silhouette(p.picture, pic) : [];
  const words = text && !text.loading;
  const engraved = !!words && p.text.engrave && p.cutter.kind === "laser";
  const wordsOn = words ? textLayer(p, N, back, engraved) : -1;
  if (back) shapes.push(moon.length ? layerOf(moon) : frameShape);
  for (let i = 0; i < L; i++) {
    const cutWords = !engraved && wordsOn === shapes.length && text && !text.loading ? text : null, dropped = info.dropped;
    const extra = [...(i === 0 && !back ? moon : []), ...(cutWords ? cutWords.clear : [])];
    // Bits of the pattern cut off by the words' clear band are meant to go.
    shapes.push(pic
      ? layerOf([...pictureCuts(p, pic, sil, w, winCs, i, L), ...extra.map(orient)], cutWords ? cutWords.keep : [], true, cutWords ? "drop" : loose)
      : layerOf([...openingsOf(p, w, win, i, L), ...extra], cutWords ? cutWords.keep : [], false, cutWords ? "drop" : loose));
    if (cutWords) info.dropped = dropped;
  }
  // Engraved words are kept to the paper of their layer: over a cut-out there is nothing to engrave.
  const engraveCs = engraved && text && shapes[wordsOn]
    ? shapeContours(intersectShapes(shapeContours(unionShapes(text.glyphs, [], true)), shapeContours([shapes[wordsOn]])))
    : [];
  if (photo && shapes.length > 1) {
    const open = Math.min(...shapes.slice(1).map((s) => win.area - (s.area - ringArea)));
    info.photoShown = Math.max(0, Math.min(100, Math.round((100 * open) / win.area)));
  }

  const frames = p.stack.spacer === "frames";
  const per = frames ? p.stack.per : 0;
  const gapZ = frames ? per * T : Math.max(0, p.stack.gap);
  const parts: GenPart[] = [];
  // Narrow spacer frames: the frame less its inside, spacerW in from the edge.
  const narrow = frames && p.stack.spacerW > 0 && p.stack.spacerW < border
    ? differenceShapes([frame], shapeContours(offsetShapes([frameShape], -p.stack.spacerW))) : [];
  const ringMain = biggest(narrow.length ? narrow : ring);
  const spacer = makeShape(simplifyClosed(ringMain.outer, SIMPLIFY), ringMain.holes.map((h) => simplifyClosed(h, SIMPLIFY)));

  // Behind the stack: the back board, the light box's rings and the diffuser.
  const band: Band = { frame, win: win.outer, width: narrow.length ? p.stack.spacerW : border, cx: w.cx, cy: w.cy };
  info.band = r1(band.width);
  const backColor = layerColor(p, 0, N);
  let base = 0;
  if (p.box.back !== "none") {
    parts.push({ id: "backboard", name: "Back board", outer: frame, holes: [], color: backColor, matte: true, place: { x: 0, y: 0, z: 0 } });
    base += T;
  }
  const ringZ0 = base;
  const rings = lightRings(p, band, ringCount(p));
  rings.forEach((r, i) => parts.push({ id: `ring${i + 1}`, name: `Light box ring ${i + 1}`, outer: simplifyClosed(r.outer, SIMPLIFY), holes: r.holes.map((h) => simplifyClosed(h, SIMPLIFY)), color: backColor, matte: true, place: { x: 0, y: 0, z: base + i * T } }));
  base += rings.length * T;
  if (rings.length) info.rings = rings.length;
  const diffuser = p.light.on && p.light.diffuser;
  if (diffuser) {
    parts.push({ id: "diffuser", name: "Diffuser", outer: frame, holes: [], material: "second", t: p.light.diffT, color: "#F4F4F0", place: { x: 0, y: 0, z: base } });
    base += p.light.diffT;
  }
  // A slotted photo's holder is glued straight onto the back board, under everything else.
  const holder = photo?.only3d ? photoHolder(p, w, frame) : null;
  const lift = holder ? T : 0;
  let sp = 0;
  shapes.forEach((sh, k) => {
    const z = base + k * (T + gapZ) + (k > 0 ? lift : 0);
    const color = layerColor(p, k, N);
    const name = `Layer ${k + 1}${k === 0 ? " (back)" : k === N - 1 ? " (front)" : ""}`;
    parts.push({
      id: `layer${k + 1}`, name, outer: sh.outer, holes: sh.holes, color, matte: true, place: { x: 0, y: 0, z },
      ...(k === 0 && photo ? { images: [photo] } : {}), ...(k === wordsOn && engraveCs.length ? { engrave: engraveCs } : {}),
    });
    if (k === 0 && holder) parts.push({ id: "holder", name: "Photo holder", outer: holder.outer, holes: holder.holes, color, matte: true, place: { x: 0, y: 0, z: base + T } });
    (pieces.get(k) ?? []).forEach((s, j) => parts.push({ id: `piece${k + 1}-${j + 1}`, name: `Layer ${k + 1} piece ${j + 1}`, outer: s.outer, holes: s.holes, color, matte: true, place: { x: 0, y: 0, z } }));
    if (k < N - 1) for (let j = 0; j < per; j++) {
      sp++;
      parts.push({ id: `spacer${sp}`, name: `Spacer ${sp}`, outer: spacer.outer, holes: spacer.holes, color, matte: true, place: { x: 0, y: 0, z: z + T + (k === 0 ? lift : 0) + j * T } });
    }
  });
  const depth = base + N * T + (N - 1) * gapZ + lift;
  info.depth = r1(depth);

  // Holes through the parts that share the border band, and numbers on it.
  const banded = (q: GenPart) => q.place && !q.place.upright && !q.id.startsWith("piece");
  const drill = (ok: (q: GenPart) => boolean, cs: Contour[]) => {
    for (let i = 0; i < parts.length; i++) if (banded(parts[i]) && ok(parts[i])) for (const c of cs) parts[i] = drillPart(parts[i], c);
  };
  if (p.box.pins) drill(() => true, pinHoles(p, band));
  if (p.box.back === "screwed") {
    const sc = screwHoles(p, band);
    drill((q) => q.id === "backboard", sc.clear);
    drill((q) => (rings.length ? q.id.startsWith("ring") : q.id === "layer1"), sc.pilot);
  }
  const lowest = parts.find(banded);
  if (p.box.hang === "keyhole" && lowest) {
    const inCavity = lowest.id === "backboard" && rings.length > 0;
    const kh = keyholes(p, band, inCavity);
    if (kh.needBorder) info.keyBorder = kh.needBorder;
    drill((q) => q === lowest, kh.cuts);
    const z0 = (lowest.place?.z ?? 0) + (lowest.t ?? T);
    drill((q) => q !== lowest && (q.place?.z ?? 0) >= z0 - 1e-6 && (q.place?.z ?? 0) < z0 + HEAD_DEPTH, kh.room);
  }
  if (p.box.numbers) {
    const at = bandPoint(band, Math.PI / 2), hNum = Math.min(6, band.width * 0.5);
    if (at && hNum >= 2) for (const q of parts) {
      const m = /^layer(\d+)$/.exec(q.id);
      if (m && Number(m[1]) < N) q.score = [...(q.score ?? []), ...digits(Number(m[1]), at[0], at[1], hNum)];
    }
  }

  // Round it all: the finger-jointed box, and the feet it stands in.
  const fb = bboxOf([frame]);
  const boxD = p.box.walls ? depth + p.box.lip : 0;
  if (p.box.walls) {
    const k = Math.min(rings.length, notchedRings(p));
    parts.push(...walls(p, fb, boxD, rings.length && p.light.cable > 0 ? ringZ0 + (k * T) / 2 : null));
    info.boxW = r1(fb.x1 - fb.x0 + 2 * (WALL_PLAY + T));
    info.boxH = r1(fb.y1 - fb.y0 + 2 * (WALL_PLAY + T));
    info.boxD = r1(boxD);
  }
  if (p.box.hang === "stand") {
    const outline = p.box.walls ? rect(fb.x0 - WALL_PLAY - T, fb.y0 - WALL_PLAY - T, fb.x1 - fb.x0 + 2 * (WALL_PLAY + T), fb.y1 - fb.y0 + 2 * (WALL_PLAY + T)) : frame;
    parts.push(...feet(p, outline, p.box.walls ? boxD : depth));
  }
  const dpi = photo ? Math.round(photoDpi(p, w)) : 0;
  if (dpi) info.photoDpi = dpi;
  const print = p.photo.look !== "engrave";
  const slotted = !!holder;

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
      ...(dpi ? [{ label: print ? "Photo print" : "Engraving", value: `${dpi} dpi` }] : []),
      ...(rings.length ? [{ label: "Light box", value: `${rings.length} rings, ${r1(rings.length * T)} mm deep` }] : []),
      ...(diffuser ? [{ label: "Diffuser", value: `${p.light.diffT} mm` }] : []),
      ...(p.box.walls ? [{ label: "Box", value: `${r0(info.boxW!)} × ${r0(info.boxH!)} × ${r0(boxD)} mm` }] : []),
      ...(info.bridges ? [{ label: "Bridges", value: String(info.bridges) }] : []),
      ...(info.pieces ? [{ label: "Loose pieces", value: String(info.pieces) }] : []),
    ],
    assembly: [
      blade
        ? `Cut every layer from its own colour of ${mat}; Layer 1 is the back and Layer ${N} the front.`
        : `Cut the ${N} layers from ${mat}; Layer 1 is the back and Layer ${N} the front.`,
      ...enclosureSteps(p, rings.length, diffuser, N),
      frames
        ? `Glue ${per === 1 ? "a spacer frame" : `${per} spacer frames`} between each pair of layers, lining up the outlines.`
        : `Stick ${r1(gapZ)} mm foam tape around the border of every layer but the front one, with small foam squares behind wide areas of the pattern.`,
      ...(slotted
        ? [`Glue the photo holder onto the back board, outlines lined up. Print the photo (Print photo, PDF) at 100 %, cut it out along the crop marks (${r0(w.w + 2 * Math.min(3, border / 2))} × ${r0(w.h + 2 * Math.min(3, border / 2))} mm) and slide it into the holder from the top; it can be changed at any time.`]
        : photo && !print
          ? [`The photo is engraving dots on Layer 1, the back board, on the Engrave layer of the SVG: engrave it at ${p.photo.dpi} dpi (a ${(25.4 / Number(p.photo.dpi)).toFixed(2)} mm line interval) before cutting Layer 1, without moving the sheet.`]
          : photo
            ? [blade
              ? "The photo is on Layer 1, the back board, on the Engrave layer of the SVG: print the photo (Print photo, PDF) at 100 % on photo paper and glue it on the back board, or print the SVG at 100 % straight onto the card before cutting Layer 1."
              : "The photo is on Layer 1, the back board, on the Engrave layer of the SVG: print the photo (Print photo, PDF) at 100 % and glue it on the back board, or engrave it before cutting Layer 1 without moving the sheet."]
            : []),
      ...(info.pieces
        ? [`Each layer's loose pieces are cut as parts named after it ("Layer 3 piece 1"): glue each one back where it was cut from, on a small foam square on the layer behind, so it floats in place.`]
        : []),
      "Stack the layers in order from the back, pressing each one down evenly before the next.",
      ...(words
        ? [engraved
          ? `The words are engraved on ${wordsOn === N - 1 ? "the front layer" : `Layer ${wordsOn + 1}`}, on the Engrave layer of the SVG: engrave them before cutting that layer, without moving the sheet.`
          : `The words stand on a paper bar across ${wordsOn === N - 1 ? "the front layer" : `Layer ${wordsOn + 1}`}: cut it from a contrasting card so they read clearly.`]
        : []),
      ...(p.design.moon ? ["For a lit box, put a battery LED strip or puck light behind the back layer's light hole."] : []),
      ...(p.box.walls
        ? [`Fit the four box walls together round the stack, finger joints interlocking (the top and bottom walls hold the corners), and glue them to each other and to the stack's edges; the walls stand ${r1(p.box.lip)} mm proud of the front layer.`]
        : p.box.back === "none" && !rings.length
          ? [`Fit the stack into a shadow box frame at least ${Math.ceil(depth + 5)} mm deep, or glue a backing card on and hang it as it is.`]
          : []),
      ...(p.box.hang === "keyhole" ? [`Hang it on two screws or nails ${r0((fb.x1 - fb.x0) / 2)} mm apart, level, through the keyholes near the top: slip the heads through the round ends and let the box drop onto them.`] : []),
      ...(p.box.hang === "stand" ? ["Stand the box upright in the two feet, its lower edge pushed fully into their slots."] : []),
    ],
    info,
    materials: diffuser ? { main: mat, second: `Diffuser ${p.light.diffT} mm (white or frosted acrylic, or tracing paper)` } : undefined,
    stacked: true,
    notice: text?.loading || source?.loading ? "Loading the font." : undefined,
    missing: missing.length ? missing : undefined,
  };
}
