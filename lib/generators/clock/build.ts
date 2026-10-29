import { markLetters } from "../textOps";
/**
 * Clock geometry: a face (round, square, polygon, sunburst, gear, scalloped, flower, heart, cloud or a custom outline),
 * optionally layered (back plate + ring, + centre disc), hour markers, hands with holes for a
 * standard quartz movement, a keyhole hanger and a slot-in desk stand. mm, y down, centre (0, 0).
 */
import { intersectShapes, makeShape, offsetShapes, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import {
  TAU, arc, bboxOf, circle, contourGap, customOutline, deg, distToContour, pointInContour, rect, regularPolygon, roundCorners,
  roundedRect, signedArea, stadium, transform,
} from "../geom";
import { tagItem } from "../items";
import { shapeOutline } from "../shapes";
import { arcSpan, bendAround } from "../textPath";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { MOVEMENT_BOX, type ClockParams } from "./params";

const ROMAN = ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

/** The label for hour h (0 = twelve). */
export function numeral(set: ClockParams["markers"]["numerals"], h: number): string {
  const n = h === 0 ? 12 : h;
  switch (set) {
    case "roman": return ROMAN[h];
    case "roman-iv": return h === 4 ? "IV" : ROMAN[h];
    default: return String(n);
  }
}

/** The face outline, centred on (0, 0), or null when a custom outline cannot be read. */
export function faceOutline(p: ClockParams): Contour | null {
  const f = p.face, R = f.size / 2;
  switch (f.shape) {
    case "square": return roundedRect(-R, -R, f.size, f.size, f.corner);
    case "polygon": {
      const n = Math.max(3, Math.round(f.sides));
      return roundCorners(regularPolygon(n, R, 180 / n), f.corner);
    }
    case "sunburst": {
      const n = Math.max(3, Math.round(f.rays)), pts: Contour = [];
      for (let i = 0; i < 2 * n; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / n, r = i % 2 ? R - f.depth : R;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return roundCorners(pts, Math.min(f.corner, 4));
    }
    case "gear": {
      const n = Math.max(6, Math.round(f.rays)), w = TAU / n, root = R - f.depth, out: Contour = [];
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + i * w - w / 4;
        out.push(...arc(0, 0, root, a0, a0 + w * 0.25, 0.05, false));
        out.push(...arc(0, 0, R, a0 + w * 0.35, a0 + w * 0.65, 0.05));
        out.push(...arc(0, 0, root, a0 + w * 0.75, a0 + w, 0.05, false));
      }
      return out;
    }
    case "scallop": {
      const n = Math.max(3, Math.round(f.rays)), m = Math.max(360, n * 24), out: Contour = [];
      for (let i = 0; i < m; i++) {
        const t = (TAU * i) / m, r = R - f.depth * (1 - Math.abs(Math.cos((n * t) / 2)));
        out.push([r * Math.sin(t), -r * Math.cos(t)]);
      }
      return out;
    }
    case "flower": {
      const n = Math.max(3, Math.round(f.rays)), pr = Math.min(f.depth, R * 0.45);
      const petals = [circle(0, 0, R - pr, 0.05)];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (TAU * i) / n;
        petals.push(circle((R - pr) * Math.cos(a), (R - pr) * Math.sin(a), pr, 0.05));
      }
      const u = unionShapes(petals);
      return u.reduce((a, b) => (b.area > a.area ? b : a), u[0]).outer;
    }
    case "heart": return transform(shapeOutline("heart", f.size, f.size * 0.9), { x: -R, y: -f.size * 0.42 });
    case "cloud": return transform(shapeOutline("cloud", f.size, f.size * 0.7), { x: -R, y: -f.size * 0.38 });
    case "custom": return f.path.trim() ? customOutline(f.path, f.size, f.size) : null;
    default: return circle(0, 0, R);
  }
}

/**
 * Whether a point lies inside every one of `ins` (null ones skipped) except the second, which it
 * must lie outside: the numerals' band. Rasterised once at MASK_STEP mm by scanlines, so each test is
 * a lookup; a cell counts only if its centre and its four neighbours are in, which keeps the test on
 * the safe side of the edges by about one cell.
 */
const MASK_STEP = 0.5;
function bandMask(outline: Contour, [faceIn, bandOut, opening]: (Contour | null)[]): (q: Pt) => boolean {
  const b = bboxOf([outline]), x0 = b.x0 - 1, y0 = b.y0 - 1;
  const W = Math.ceil((b.x1 + 1 - x0) / MASK_STEP) + 1, H = Math.ceil((b.y1 + 1 - y0) / MASK_STEP) + 1;
  const fill = (c: Contour) => {
    const g = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) {
      const y = y0 + (j + 0.5) * MASK_STEP, xs: number[] = [];
      for (let i = 0, k = c.length - 1; i < c.length; k = i++) {
        const [ax, ay] = c[k], [bx, by] = c[i];
        if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((p, q) => p - q);
      for (let t = 0; t + 1 < xs.length; t += 2) {
        const i0 = Math.max(0, Math.ceil((xs[t] - x0) / MASK_STEP - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[t + 1] - x0) / MASK_STEP - 0.5));
        for (let i = i0; i <= i1; i++) g[j * W + i] = 1;
      }
    }
    return g;
  };
  const ok = new Uint8Array(W * H).fill(1);
  [faceIn, bandOut, opening].forEach((c, n) => {
    if (!c) return;
    const g = fill(c);
    for (let i = 0; i < ok.length; i++) if (n === 1 ? g[i] : !g[i]) ok[i] = 0;
  });
  if (!faceIn) ok.fill(0);
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && ok[j * W + i] === 1;
  return ([x, y]) => {
    const i = Math.floor((x - x0) / MASK_STEP), j = Math.floor((y - y0) / MASK_STEP);
    return at(i, j) && at(i + 1, j) && at(i - 1, j) && at(i, j + 1) && at(i, j - 1);
  };
}

/** Convex hull of points (monotone chain), counter-clockwise. */
function hullOf(pts: Pt[]): Contour {
  const q = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (q.length < 3) return q;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], hi: Pt[] = [];
  for (const p of q) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of q.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}

/** A closed contour's corners plus points every `step` mm along its edges. */
function sampled(c: Contour, step: number): Contour {
  const out: Pt[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Unit vector for a clock angle (degrees clockwise from twelve), y down. */
const dirOf = (a: number): Pt => [Math.sin(deg(a)), -Math.cos(deg(a))];

/** Distance from the centre to the outline along a clock angle. */
export function edgeDistance(outline: Contour, a: number): number {
  const [dx, dy] = dirOf(a);
  let best = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [x1, y1] = outline[j], [x2, y2] = outline[i];
    const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (x1 * ey - y1 * ex) / den, u = (x1 * dy - y1 * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
}

/** How far from the edge markers can sit: the inner radius for pointed outlines, else the edge. */
function markerEdge(p: ClockParams, outline: Contour, a: number): number {
  const f = p.face;
  if (f.shape === "sunburst" || f.shape === "gear" || f.shape === "scallop") return f.size / 2 - f.depth;
  if (f.shape === "flower") return f.size / 2 - Math.min(f.depth, f.size * 0.225);
  return edgeDistance(outline, a);
}

/** Radial depth of the marker band (ticks, dots or numerals), mm. */
export function markerDepth(p: ClockParams): number {
  const m = p.markers;
  const tick = m.style === "ticks" || m.style === "mixed" ? m.tickLength * 1.25 : 0;
  const dot = m.style === "dots" ? m.dot * 1.4 : 0;
  const num = m.style === "numerals" || m.style === "mixed" ? m.size * 1.3 : 0;
  const min = m.minutes ? m.tickLength * 0.45 : 0;
  return Math.max(tick, dot, num, min);
}

const rot = (c: Contour, a: number) => transform(c, { rot: a });

interface Markers {
  engrave: Contour[]; score: Contour[]; holes: Contour[]; missing: string[]; loading: boolean;
  /** The smallest numeral height used, mm: below the set size when a numeral had to shrink to fit its band. */
  numeralSize?: number;
}

/** How far inside the ring's inner edge markers on the back plate stay, mm (so the ring never covers them). */
export const RING_CLEAR = 3;
/** How far numerals stay in from the face's edge and the ring's opening, and apart from each other, mm. */
export const EDGE_CLEAR = 1.5;
/** Radius round the centre kept free of numerals, for the movement's nut and the hands' bosses, mm. */
const HUB_CLEAR = 24;

/**
 * Where the outer end of the markers sits along angle `a`: the edge gap in from the face's edge, but
 * on a layered face with the markers on the back plate never further out than RING_CLEAR inside the
 * ring's opening, so the ring cannot hide them.
 */
function markerAnchor(p: ClockParams, outline: Contour, clear: Contour | null, a: number): number {
  const r = markerEdge(p, outline, a) - p.markers.inset;
  return clear ? Math.min(r, edgeDistance(clear, a) - RING_CLEAR) : r;
}

function buildMarkers(p: ClockParams, outline: Contour, ctx: BuildContext, clear: Contour | null = null, band: Contour | null = null): Markers {
  const m = p.markers, res: Markers = { engrave: [], score: [], holes: [], missing: [], loading: false };
  if (m.style === "none" && !m.minutes) return res;
  let item = "Ticks";
  // scored markers: each tick, dot and numeral traced on its own (they never overlap one another)
  const scoring = m.mark === "score";
  const mark = (cs: Contour[], what: string, glyphs?: Contour[][]) => {
    if (scoring) res.score.push(...tagItem(markLetters({ contours: cs, glyphs }, "score", true).score ?? [], what));
    else res.engrave.push(...tagItem(cs, what));
  };
  // On the back plate of a layered face every marker stays wholly inside the ring's opening (less
  // RING_CLEAR): a wide numeral or a tick next to a curve of the opening is drawn in along its angle
  // until it fits, so the ring never covers any part of it.
  const opening = clear ? offsetShapes([makeShape(clear, [])], -RING_CLEAR).reduce<Contour | null>((b, s) => (!b || Math.abs(signedArea(s.outer)) > Math.abs(signedArea(b)) ? s.outer : b), null) : null;
  const inside = (cs: Contour[]) => !opening || cs.every((c) => c.every((q) => pointInContour(q, opening)));
  const pull = (cs: Contour[], a: number): Contour[] => {
    if (inside(cs)) return cs;
    const [dx, dy] = dirOf(a);
    for (let k = 1; k <= 400; k++) {
      const moved = cs.map((c) => c.map(([x, y]) => [x - dx * k * 0.5, y - dy * k * 0.5] as Pt));
      if (inside(moved)) return moved;
    }
    return cs;
  };
  const put = (c: Contour, a: number) => { const [q] = pull([c], a); if (m.cut) res.holes.push(tagItem([q], item)[0]); else mark([q], item); };
  const anchor = (a: number) => markerAnchor(p, outline, clear, a);
  const numeralHours = m.style === "numerals" ? (m.quarters ? [0, 3, 6, 9] : [...Array(12).keys()]) : m.style === "mixed" ? [0, 3, 6, 9] : [];
  const tickHours = m.style === "ticks" ? [...Array(12).keys()] : m.style === "mixed" ? [1, 2, 4, 5, 7, 8, 10, 11] : m.style === "numerals" && m.quarters ? [1, 2, 4, 5, 7, 8, 10, 11] : [];
  const dotHours = m.style === "dots" ? [...Array(12).keys()] : [];

  // Numerals first, so no tick (an hour tick or a minute tick) is drawn into one: wide numerals
  // such as XII or VIII reach the neighbouring minute marks, and an engraved overlap would burn twice
  // (or show as a gap in the letter).
  // Every numeral lies wholly on its band: inside the face's outline (less EDGE_CLEAR), outside the
  // ring's opening when the markers are on the ring, inside the opening when they are on the back
  // plate, and clear of the other numerals. One that does not fit where its edge gap puts it (a
  // wide VIII on a narrow ring, the notch of a heart, the point at its tip) moves along its angle
  // to the nearest place it fits. Only when one fits nowhere are all the numerals drawn smaller,
  // together, so they keep one size.
  const largest = (cs: Shape[]) => cs.reduce<Contour | null>((b, x) => (!b || Math.abs(signedArea(x.outer)) > Math.abs(signedArea(b)) ? x.outer : b), null);
  const faceIn = largest(offsetShapes([makeShape(outline, [])], -EDGE_CLEAR));
  const bandOut = band ? largest(offsetShapes([makeShape(band, [])], EDGE_CLEAR)) : null;
  const onBand = bandMask(outline, [faceIn, bandOut, opening]);
  interface Glyph { a: number; dir: Pt; extent: number; base: Contour[]; hull: Contour }
  const glyphs: Glyph[] = [];
  if (numeralHours.length) {
    if (!ctx.text) res.loading = true;
    else for (const h of numeralHours) {
      const s = numeral(m.numerals, h), shape = ctx.text(s, m.fontId, m.size);
      if (!shape) { res.loading = true; continue; }
      for (const c of shape.missing) if (!res.missing.includes(c)) res.missing.push(c);
      const a = h * 30, dir = dirOf(a);
      const extent = m.follow ? shape.height : Math.abs(shape.width * dir[0]) + Math.abs(shape.height * dir[1]);
      const base = shape.contours.map((c) => (m.follow ? rot(c, a) : c));
      glyphs.push({ a, dir, extent, base, hull: sampled(hullOf(base.flat()), 1.5) });
    }
  }
  const move = (cs: Contour[], k: number, r: number, [dx, dy]: Pt) => cs.map((c) => c.map(([x, y]) => [x * k + dx * r, y * k + dy * r] as Pt));
  /** The radius nearest the edge gap's where the numeral, k times its size, lies wholly on the band. */
  const radiusFor = (g: Glyph, k: number, hub: number): number | null => {
    const r0 = anchor(g.a) - (g.extent * k) / 2, reach = Math.max(2 * m.size + g.extent, anchor(g.a));
    for (let i = 0; i <= reach * 2; i++) {
      const r = r0 + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 0.5;
      // never under the hands' hub (the nut and the hands' bosses)
      if (r < hub + g.extent * k * 0.5) continue;
      if (move([g.hull], k, r, g.dir)[0].every(onBand)) return r;
    }
    return null;
  };
  const apart = (x: Contour[], y: Contour[]) => {
    const p = bboxOf(x), o = bboxOf(y);
    if (p.x1 + EDGE_CLEAR < o.x0 || o.x1 + EDGE_CLEAR < p.x0 || p.y1 + EDGE_CLEAR < o.y0 || o.y1 + EDGE_CLEAR < p.y0) return true;
    return x.every((c) => y.every((g) => !c.some((q) => pointInContour(q, g)) && !g.some((q) => pointInContour(q, c)) && contourGap(c, g) >= EDGE_CLEAR));
  };
  let numerals: Contour[][] = [];
  if (glyphs.length) {
    // The largest size at which every numeral has a place on the band; then, smaller still if need
    // be, the largest at which they also keep apart (failing that, the first one stands).
    // Clear of the hands' hub if the band allows it; on a small opening, anywhere on the band.
    let first: { cs: Contour[][]; k: number } | null = null, best: { cs: Contour[][]; k: number } | null = null;
    for (const hub of [HUB_CLEAR, 0]) {
      for (let k = 1; k >= 0.3 - 1e-9 && !best; k -= 0.05) {
        const rs: number[] = [];
        for (const g of glyphs) { const r = radiusFor(g, k, hub); if (r === null) break; rs.push(r); }
        if (rs.length < glyphs.length) continue;
        const placed = glyphs.map((g, i) => move(g.base, k, rs[i], g.dir));
        first ??= { cs: placed, k };
        if (placed.every((x, i) => placed.every((y, j) => j <= i || apart(x, y)))) best = { cs: placed, k };
      }
      if (best || first) break;
    }
    const pick = best ?? first;
    // Nowhere on the band at any size: the smallest size, drawn in along its angle until it is clear of the ring.
    const K = 0.3;
    numerals = pick ? pick.cs : glyphs.map((g) => pull(move(g.base, K, anchor(g.a) - (g.extent * K) / 2, g.dir), g.a));
    const k = pick ? pick.k : K;
    if (k < 1 - 1e-9) res.numeralSize = Math.floor(m.size * k * 2) / 2;
  }
  const gap = Math.max(1, m.tickWidth * 0.6);
  const boxes = numerals.map((cs) => { const b = bboxOf(cs); return { cs, x0: b.x0 - gap, y0: b.y0 - gap, x1: b.x1 + gap, y1: b.y1 + gap }; });
  /** A tick that would touch a numeral (or come within `gap` of it). */
  const hitsNumeral = (c: Contour) => {
    const b = bboxOf([c]);
    return boxes.some((n) => b.x1 > n.x0 && b.x0 < n.x1 && b.y1 > n.y0 && b.y0 < n.y1
      && n.cs.some((g) => c.some((q) => pointInContour(q, g)) || contourGap(c, g) < gap));
  };
  const tick = (c: Contour, a: number) => { const [q] = pull([c], a); if (hitsNumeral(q)) return; if (m.cut) res.holes.push(tagItem([q], item)[0]); else mark([q], item); };

  for (const h of tickHours) {
    const a = h * 30, r = anchor(a), q = h % 3 === 0 && m.style === "ticks";
    const w = m.tickWidth * (q ? 1.6 : 1), l = m.tickLength * (q ? 1.25 : 1);
    tick(rot(rect(-w / 2, -r, w, l), a), a);
  }
  for (const h of dotHours) {
    item = "Dots";
    const a = h * 30, d = m.dot * (h % 3 === 0 ? 1.4 : 1), r = anchor(a) - d / 2, [dx, dy] = dirOf(a);
    put(circle(dx * r, dy * r, d / 2, 0.02), a);
  }
  if (m.minutes) {
    item = "Ticks";
    const w = Math.max(m.tickWidth * 0.4, m.cut ? 1.2 : 0.6), l = m.tickLength * 0.45;
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      const a = i * 6;
      tick(rot(rect(-w / 2, -anchor(a), w, l), a), a);
    }
  }
  // a numeral is scored as one shape (its glyphs welded), engraved as before
  for (const placed of numerals) mark(placed, "Numerals", [placed]);
  return res;
}

/** Where the inscription runs: its centre-line radius, its extent across the line, and the angle it spans. */
export interface Inscription { engrave: Contour[]; score: Contour[]; R: number; size: number; span: number; missing: string[]; loading: boolean }

/** The inscription bent along the dial inside the markers (and inside the ring on a layered face, where it shows). */
export function buildInscription(p: ClockParams, outline: Contour, ringInner: Contour | null, ctx: BuildContext, clear: Contour | null = null): Inscription | null {
  const ins = p.inscription;
  if (!ins.text.trim()) return null;
  const a = ins.at === "top" ? 0 : 180;
  const marked = !(p.markers.style === "none" && !p.markers.minutes);
  // inside the markers (wherever they sit), or inside the face's edge when there are none
  let R = (marked ? markerAnchor(p, outline, clear, a) - markerDepth(p) : markerEdge(p, outline, a)) - ins.gap - ins.size * 0.6;
  if (ringInner) R = Math.min(R, edgeDistance(ringInner, a) - 2 - ins.size * 0.6);
  if (!ctx.text) return { engrave: [], score: [], R, size: ins.size, span: 0, missing: [], loading: true };
  const shape = ctx.text(ins.text.replace(/\s+/g, " ").trim(), ins.fontId, ins.size);
  if (!shape) return { engrave: [], score: [], R, size: ins.size, span: 0, missing: [], loading: true };
  const span = arcSpan(shape.width, R);
  if (!(R > ins.size)) return { engrave: [], score: [], R, size: shape.height, span, missing: shape.missing, loading: false };
  if (ins.mark !== "score") return { engrave: tagItem(bendAround(shape.contours, R, ins.at), "Inscription"), score: [], R, size: shape.height, span, missing: shape.missing, loading: false };
  // bent contour by contour, so each glyph's outlines stay together for No Weld
  const glyphs = shape.glyphs?.length ? shape.glyphs : [shape.contours];
  const bent = bendAround(glyphs.flat(), R, ins.at);
  let k = 0;
  const bentGlyphs = glyphs.map((g) => g.map(() => bent[k++]));
  return { engrave: [], score: tagItem(markLetters({ contours: bent, glyphs: bentGlyphs }, "score", ins.noWeld).score ?? [], "Inscription"), R, size: shape.height, span, missing: shape.missing, loading: false };
}

/** The movement's minute-hand hole: a circle with two flats. */
function doubleFlat(w: number, h: number): Contour {
  if (h >= w - 0.05) return circle(0, 0, w / 2, 0.01);
  const s = intersectShapes([circle(0, 0, w / 2, 0.01)], [rect(-h / 2, -w, h, 2 * w)]);
  return s[0]?.outer ?? circle(0, 0, w / 2, 0.01);
}

const largestOuter = (cs: Contour[]): Contour => {
  const shapes = unionShapes(cs);
  return shapes.reduce((a, b) => (b.area > a.area ? b : a), shapes[0]).outer;
};

/** A hand pointing up from (0, 0): length L to the tip, widest w, counterweight tail. */
export function handOutline(style: ClockParams["hands"]["style"], L: number, w: number, tail: number, holeD: number): Contour {
  const hub = circle(0, 0, Math.max(holeD / 2 + 2.5, w * 0.55), 0.02);
  const arm = (k: number, to: number) => rect((-w * k) / 2, -to, w * k, to + tail);
  switch (style) {
    case "baton": return largestOuter([hub, roundedRect(-w / 2, -L, w, L + tail, w * 0.45)]);
    case "classic": return largestOuter([hub, [[w / 2, tail], [w * 0.1, -L + w * 0.3], [0, -L], [-w * 0.1, -L + w * 0.3], [-w / 2, tail]]]);
    case "leaf": {
      const pts: Contour = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([(w / 2) * Math.pow(Math.sin(Math.PI * t), 0.8), -t * L]); }
      for (let i = 39; i > 0; i--) { const t = i / 40; pts.push([-(w / 2) * Math.pow(Math.sin(Math.PI * t), 0.8), -t * L]); }
      return largestOuter([hub, pts, rect(-w * 0.15, 0, w * 0.3, tail)]);
    }
    case "arrow": return largestOuter([hub, arm(0.3, L * 0.78), [[-w / 2, -L * 0.76], [w / 2, -L * 0.76], [0, -L]], circle(0, tail, w * 0.45, 0.02)]);
    default: // spade
      return largestOuter([
        hub, arm(0.3, L * 0.66),
        transform(circle(0, 0, 1, 0.002), { x: 0, y: -L * 0.72, sx: w / 2, sy: L * 0.11 }),
        [[-w * 0.4, -L * 0.74], [w * 0.4, -L * 0.74], [0, -L]],
      ]);
  }
}

/** Narrowest part of a hand's arm, mm (what breaks first). */
export function handNeck(style: ClockParams["hands"]["style"], w: number): number {
  return style === "spade" || style === "arrow" ? w * 0.3 : style === "leaf" ? w * 0.3 : style === "classic" ? w * 0.2 : w;
}

/** Layers that cover the centre (the shaft clamps through all of them). */
export const centreLayers = (p: ClockParams) => (p.face.layers === "stack" ? 2 : 1);

export interface ClockGeometry {
  outline: Contour;
  /** Inner edge of the ring layer (null for a single face). */
  ringInner: Contour | null;
  markersOn: "face" | "ring" | "back";
  /** Markers cross the inner edge of the ring. */
  straddle: boolean;
  keyholeFits: boolean;
  /** The hanger is behind the ring (or there is none), so it does not show from the front. */
  hangerHidden: boolean;
  missing: string[];
  loading: boolean;
  inscription: Inscription | null;
  /** Height the smallest numeral had to shrink to, to fit its band (unset when none did), mm. */
  numeralSize?: number;
}

/**
 * Hanger cut-out on the back-most plate, or null. On a layered face it sits under the ring, where
 * the ring hides it; on a single face the keyhole goes just above the movement.
 */
function hangerOf(p: ClockParams, outline: Contour): Contour | null {
  const top = edgeDistance(outline, 0);
  const layered = p.face.layers !== "single";
  if (p.hanger === "keyhole") {
    const y = layered ? -(top - p.face.ring / 2 - 5) : -(MOVEMENT_BOX / 2 + 10);
    const shapes = unionShapes([circle(0, y, 4.75, 0.02), stadium(0, y, 0, y - 10, 4.6)]);
    return shapes[0]?.outer ?? null;
  }
  if (p.hanger === "hole") return circle(0, -(top - (layered ? p.face.ring / 2 : 10)), 2.5, 0.02);
  return null;
}

export function clockGeometry(p: ClockParams, ctx: BuildContext = {}): (ClockGeometry & { parts: GenPart[] }) | { error: string } {
  const outline0 = faceOutline(p);
  if (!outline0 || outline0.length < 3) return { error: p.face.shape === "custom" ? "Paste the path data of a closed outline (SVG d attribute) under Face → Custom outline." : "The face outline could not be built." };
  const outline = signedArea(outline0) < 0 ? outline0.slice().reverse() : outline0;
  const T = p.T, f = p.face, mv = p.movement;
  const parts: GenPart[] = [];
  const shaft = circle(0, 0, mv.shaft / 2, 0.01);
  const hanger = hangerOf(p, outline);
  const keyholeFits = !hanger || (hanger.every((q) => pointInContour(q, outline)) && Math.min(...hanger.map((q) => distToContour(q, outline))) >= 5);
  const depth = markerDepth(p);
  const layered = f.layers !== "single";

  let ringInner: Contour | null = null;
  if (layered) {
    const inner = offsetShapes([makeShape(outline, [])], -f.ring);
    if (!inner.length) return { error: "The ring is wider than the face. Make the ring narrower or the face larger." };
    ringInner = inner.reduce((a, b) => (b.area > a.area ? b : a)).outer;
  }
  const onRing = layered && p.markers.inset + depth <= f.ring - 1.5;
  const markersOn: ClockGeometry["markersOn"] = !layered ? "face" : onRing ? "ring" : "back";
  // Markers on the back plate are kept inside the ring's opening, where they show: an edge gap that
  // would put them under the ring moves them in (`straddle` reports that it did).
  const clear = markersOn === "back" ? ringInner : null;
  const straddle = layered && !onRing && p.markers.inset < f.ring + RING_CLEAR;
  const markers = buildMarkers(p, outline, ctx, clear, markersOn === "ring" ? ringInner : null);
  const inscription = buildInscription(p, outline, ringInner, ctx, clear);
  const insEngrave = inscription?.engrave ?? [];
  const insScore = inscription?.score ?? [];
  const withScore = (cs: Contour[]) => (cs.length ? { score: cs } : {});
  const hangerHidden = !hanger || p.stand || (!!ringInner && hanger.every((q) => !pointInContour(q, ringInner!) && distToContour(q, ringInner!) >= 1.5));

  // The stand: a tab under the back plate that pushes through a slot in the base.
  const yb = bboxOf([outline]).y1;
  const tabW = Math.min(90, Math.max(30, f.size * 0.3));
  const backOuter = p.stand ? largestOuter([outline, rect(-tabW / 2, yb - 3, tabW, T + 3)]) : outline;

  const upright = p.stand;
  const placeAt = (z: number) => (upright ? { x: 0, y: -(yb + T), z: z - T / 2, upright: true } : { x: 0, y: 0, z });

  const backHoles = [shaft, ...(hanger ? [hanger] : [])];
  if (!layered) {
    parts.push({
      id: "face", name: "Face", outer: backOuter, holes: [...backHoles, ...(markers.holes)], engrave: [...markers.engrave, ...insEngrave], ...withScore([...markers.score, ...insScore]), place: placeAt(0),
    });
  } else {
    parts.push({
      id: "back", name: "Back plate", outer: backOuter,
      holes: [...backHoles, ...(markersOn === "back" ? markers.holes : [])],
      engrave: [...(markersOn === "back" ? markers.engrave : []), ...insEngrave],
      ...withScore([...(markersOn === "back" ? markers.score : []), ...insScore]),
      place: placeAt(0),
    });
    parts.push({
      id: "ring", name: "Ring", outer: outline, holes: [ringInner!, ...(markersOn === "ring" ? markers.holes : [])],
      engrave: markersOn === "ring" ? markers.engrave : [], ...withScore(markersOn === "ring" ? markers.score : []), place: placeAt(T),
    });
    if (f.layers === "stack") {
      parts.push({ id: "centre", name: "Centre disc", outer: circle(0, 0, f.centre / 2), holes: [circle(0, 0, mv.shaft / 2, 0.01)], place: placeAt(T) });
    }
  }
  const handZ = (layered ? 2 * T : T) + 0.5;
  if (p.hands.style !== "none") {
    const h = p.hands;
    parts.push({ id: "hour", name: "Hour hand", outer: handOutline(h.style, h.hour, h.width * 1.25, h.tail * 0.8, mv.hourHole), holes: [circle(0, 0, mv.hourHole / 2, 0.01)], place: { ...placeAt(handZ), rot: 305 } });
    parts.push({ id: "minute", name: "Minute hand", outer: handOutline(h.style, h.minute, h.width, h.tail, mv.minuteW), holes: [doubleFlat(mv.minuteW, mv.minuteH)], place: { ...placeAt(handZ + T + 0.5), rot: 60 } });
  }
  if (p.stand) {
    const bw = Math.max(tabW + 50, f.size * 0.55), bd = Math.max(60, Math.min(110, f.size * 0.3)), clr = 0.1;
    parts.push({
      id: "base", name: "Stand base", outer: roundedRect(-bw / 2, -bd / 2, bw, bd, 8),
      holes: [rect(-(tabW + clr) / 2, -(T + clr) / 2, tabW + clr, T + clr)], place: { x: 0, y: 0, z: 0 },
    });
  }
  const missing = [...markers.missing, ...(inscription?.missing ?? []).filter((c) => !markers.missing.includes(c))];
  return { parts, outline, ringInner, markersOn, straddle, keyholeFits, hangerHidden, missing, loading: markers.loading || !!inscription?.loading, inscription, numeralSize: markers.numeralSize };
}

/** The build output plus where the inscription ended up (for the checks). */
export type ClockOutput = GenOutput & { inscription?: { R: number; span: number; size: number }; numeralSize?: number };

export function buildClock(p: ClockParams, ctx: BuildContext): ClockOutput {
  const g = clockGeometry(p, ctx);
  if ("error" in g) return { parts: [], stats: [], error: g.error };
  const thick = centreLayers(p) * p.T;
  const assembly = [
    p.face.layers === "single" ? "Engrave and cut the face." : `Glue the ring${p.face.layers === "stack" ? " and the centre disc" : ""} onto the back plate, lining up the outlines.`,
    `Push the movement's shaft through the centre hole from the back and tighten its nut (face ${thick} mm at the centre, the movement takes up to ${p.movement.maxDial} mm).`,
    ...(p.hands.style !== "none" ? ["Press the hour hand on at 12, then the minute hand at 12, then the second hand if the movement has one."] : []),
    ...(p.stand ? ["Push the tab under the face into the slot in the stand base; a drop of glue keeps it upright."] : []),
    ...(p.hanger === "keyhole" ? ["Hang the clock on a screw through the keyhole on the back."] : []),
  ];
  return {
    parts: g.parts,
    stats: [
      { label: "Face", value: `${p.face.size} mm ${p.face.shape}` },
      { label: "Parts", value: String(g.parts.length) },
      { label: "At the centre", value: `${thick} mm (movement up to ${p.movement.maxDial} mm)` },
      ...(p.hands.style !== "none" ? [{ label: "Hands", value: `hour ${p.hands.hour} mm, minute ${p.hands.minute} mm` }] : []),
    ],
    assembly,
    notice: g.loading ? "Loading the font…" : undefined,
    missing: g.missing,
    inscription: g.inscription && !g.inscription.loading ? { R: g.inscription.R, span: g.inscription.span, size: g.inscription.size } : undefined,
    ...(g.numeralSize !== undefined ? { numeralSize: g.numeralSize } : {}),
  };
}
