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
import { bboxOf, circle, ellipse, regularPolygon, TAU, transform } from "../geom";
import { heartCurve, orient, shapeOutline, starPolygon } from "../shapes";
import type { Contour, GenOutput, GenPart, Pt } from "../types";
import { PALETTES, type Opening, type Petal, type Ridge, type ShadowBoxParams } from "./params";

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
}

export type ShadowBoxOutput = GenOutput & { info?: ShadowBoxInfo };

/** Largest gap between a cut line and the drawn curve when points are thinned out, mm. */
const SIMPLIFY = 0.15;
/** Chord tolerance of small round holes (dots), mm. */
const DOT_TOL = 0.15;
const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
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

/** An opening shape centred on 0 within ±1, first point or petal up. */
export function unitOpening(kind: Exclude<Opening, "frame">, n: number, inner: number): Contour {
  switch (kind) {
    case "circle": return ellipse(0, 0, 1, 1, 144);
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
      } else if (g.cell === "diamond") {
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
  }
}

/** The light hole in the back layer. */
function moonHole(p: ShadowBoxParams, w: Win): Contour {
  if (p.design.pattern !== "landscape") return circle(w.cx, w.cy, w.R * 0.12, 0.05);
  const low = p.design.from === "top";
  return circle(w.x0 + w.w * (low ? 0.3 : 0.72), w.y0 + w.h * (low ? 0.78 : 0.22), w.R * 0.18, 0.05);
}

export function buildShadowBox(p: ShadowBoxParams): ShadowBoxOutput {
  const { width: W, height: H, border } = p.frame;
  const T = p.T, N = p.stack.count;
  const frame = orient(simplifyClosed(shapeOutline(p.frame.shape, W, H, p.frame.corner), SIMPLIFY));
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

  /** The frame with `cuts` taken out of its window, cleaned of slivers and loose pieces. */
  const layerOf = (cuts: Contour[]): Shape => {
    if (!cuts.length) return frameShape;
    const merged = unionShapes(cuts.map(orient));
    const inWin = intersectShapes(shapeContours(merged), winCs);
    let body = differenceShapes([frame], shapeContours(inWin));
    if (web > 0) body = offsetShapes(offsetShapes(body, -web / 2, "miter"), web / 2, "miter");
    const all = unionShapes([...shapeContours(body), ...shapeContours(ring)]);
    if (!all.length) return frameShape;
    const main = biggest(all);
    info.dropped += all.filter((s) => s !== main && s.area > 1).length;
    if (main.area < ringArea * 1.01 + 1) info.open++;
    return makeShape(main.outer, main.holes.map((h) => simplifyClosed(h, SIMPLIFY)));
  };

  const L = p.stack.back ? N - 1 : N;
  const shapes: Shape[] = [];
  const moon = p.design.moon ? [moonHole(p, w)] : [];
  if (p.stack.back) shapes.push(moon.length ? layerOf(moon) : frameShape);
  for (let i = 0; i < L; i++) shapes.push(layerOf([...openingsOf(p, w, win, i, L), ...(i === 0 && !p.stack.back ? moon : [])]));

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
    parts.push({ id: `layer${k + 1}`, name, outer: sh.outer, holes: sh.holes, color, matte: true, place: { x: 0, y: 0, z } });
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
    ],
    assembly: [
      blade
        ? `Cut every layer from its own colour of ${mat}; Layer 1 is the back and Layer ${N} the front.`
        : `Cut the ${N} layers from ${mat}; Layer 1 is the back and Layer ${N} the front.`,
      frames
        ? `Glue ${per === 1 ? "a spacer frame" : `${per} spacer frames`} between each pair of layers, lining up the outlines.`
        : `Stick ${r1(gapZ)} mm foam tape around the border of every layer but the front one, with small foam squares behind wide areas of the pattern.`,
      "Stack the layers in order from the back, pressing each one down evenly before the next.",
      ...(p.design.moon ? ["For a lit box, put a battery LED strip or puck light behind the back layer's round hole."] : []),
      `Fit the stack into a shadow box frame at least ${Math.ceil(depth + 5)} mm deep, or glue a backing card on and hang it as it is.`,
    ],
    info,
    stacked: true,
  };
}
