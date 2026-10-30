/**
 * The Shape Library tool's ready shapes (basic shapes, arrows, flowchart symbols, banners and
 * callouts) and Burst Lines (comic-style speed rays). Every library shape is drawn into its box
 * w × h centred on the origin, so it stays a live shape you can resize and later expand to a path.
 */
import { PathBuilder, roundedPolygon, setShapeLibrary } from "./geom";
import { uniteClosed } from "./effects/clip";
import type { Subpath, Vec } from "./types";

export type LibraryGroup = "Basic" | "Arrows" | "Flowchart" | "Banners" | "Callouts";
export interface LibraryShape { id: string; label: string; group: LibraryGroup; draw: (w: number, h: number) => Subpath[] }

const poly = (w: number, h: number, pts: [number, number][], closed = true): Subpath => ({ closed, nodes: pts.map(([x, y]) => ({ x: x * w, y: y * h })) });
const ellipse = (cx: number, cy: number, rx: number, ry: number): Subpath[] => new PathBuilder().arc(cx, cy, rx, ry, 0, 360).close().done();
const ring = (n: number, r0: number, r1: number, w: number, h: number, start = -90): Subpath =>
  ({ closed: true, nodes: Array.from({ length: 2 * n }, (_, k) => { const r = k % 2 ? r1 : r0, a = ((start + (180 * k) / n) * Math.PI) / 180; return { x: r * w * Math.cos(a), y: r * h * Math.sin(a) }; }) });
const reversed = (s: Subpath): Subpath => ({ ...s, nodes: s.nodes.slice().reverse().map((n) => ({ x: n.x, y: n.y })) });

export const SHAPE_LIBRARY: LibraryShape[] = [
  // ---- basic
  { id: "rightTriangle", label: "Right triangle", group: "Basic", draw: (w, h) => [poly(w, h, [[-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])] },
  { id: "triangle", label: "Triangle", group: "Basic", draw: (w, h) => [poly(w, h, [[0, -0.5], [0.5, 0.5], [-0.5, 0.5]])] },
  { id: "trapezoid", label: "Trapezoid", group: "Basic", draw: (w, h) => [poly(w, h, [[-0.3, -0.5], [0.3, -0.5], [0.5, 0.5], [-0.5, 0.5]])] },
  { id: "parallelogram", label: "Parallelogram", group: "Basic", draw: (w, h) => [poly(w, h, [[-0.3, -0.5], [0.5, -0.5], [0.3, 0.5], [-0.5, 0.5]])] },
  { id: "cross", label: "Cross", group: "Basic", draw: (w, h) => [poly(w, h, [[-0.17, -0.5], [0.17, -0.5], [0.17, -0.17], [0.5, -0.17], [0.5, 0.17], [0.17, 0.17], [0.17, 0.5], [-0.17, 0.5], [-0.17, 0.17], [-0.5, 0.17], [-0.5, -0.17], [-0.17, -0.17]])] },
  { id: "hexagram", label: "Six-point star", group: "Basic", draw: (w, h) => [ring(6, 0.5, 0.2887, w, h)] },
  { id: "donut", label: "Ring", group: "Basic", draw: (w, h) => [...ellipse(0, 0, w / 2, h / 2), ...ellipse(0, 0, w * 0.3, h * 0.3).map(reversed)] },
  { id: "frame", label: "Frame", group: "Basic", draw: (w, h) => [poly(w, h, [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]), reversed(poly(w, h, [[-0.38, -0.38], [0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]]))] },
  { id: "plaque", label: "Plaque", group: "Basic", draw: (w, h) => {
    // a rectangle with its corners scooped inwards
    const r = Math.min(w, h) * 0.16, hw = w / 2, hh = h / 2;
    return new PathBuilder().move(-hw + r, -hh).line(hw - r, -hh).arc(hw, -hh, r, r, 180, 90).line(hw, hh - r).arc(hw, hh, r, r, 270, 180)
      .line(-hw + r, hh).arc(-hw, hh, r, r, 0, -90).line(-hw, -hh + r).arc(-hw, -hh, r, r, 90, 0).close().done();
  } },
  { id: "crescent", label: "Moon", group: "Basic", draw: (w, h) => {
    const hw = w / 2, hh = h / 2;
    return new PathBuilder().move(0, -hh).arc(0, 0, hw, hh, -90, 90).cubic(-hw * 0.95, hh * 0.55, -hw * 0.95, -hh * 0.55, 0, -hh).close().done();
  } },
  { id: "teardrop", label: "Drop", group: "Basic", draw: (w, h) => {
    const hw = w / 2, hh = h / 2;
    return new PathBuilder().move(0, -hh).cubic(hw * 0.4, -hh * 0.3, hw, hh * 0.05, hw, hh * 0.45).arc(0, hh * 0.45, hw, hh * 0.55, 0, 180).cubic(-hw, hh * 0.05, -hw * 0.4, -hh * 0.3, 0, -hh).close().done();
  } },
  { id: "lightning", label: "Lightning", group: "Basic", draw: (w, h) => [poly(w, h, [[0.1, -0.5], [-0.35, 0.05], [-0.02, 0.05], [-0.15, 0.5], [0.35, -0.08], [0.02, -0.08]])] },
  { id: "smiley", label: "Smiley", group: "Basic", draw: (w, h) => {
    const hw = w / 2, hh = h / 2;
    const mouth = new PathBuilder().move(-hw * 0.5, hh * 0.12).cubic(-hw * 0.3, hh * 0.65, hw * 0.3, hh * 0.65, hw * 0.5, hh * 0.12).cubic(hw * 0.3, hh * 0.42, -hw * 0.3, hh * 0.42, -hw * 0.5, hh * 0.12).close().done();
    return [...ellipse(0, 0, hw, hh), ...ellipse(-hw * 0.33, -hh * 0.25, hw * 0.1, hh * 0.13).map(reversed), ...ellipse(hw * 0.33, -hh * 0.25, hw * 0.1, hh * 0.13).map(reversed), ...mouth.map(reversed)];
  } },
  // ---- arrows
  { id: "doubleArrow", label: "Two-way arrow", group: "Arrows", draw: (w, h) => [poly(w, h, [[-0.5, 0], [-0.25, -0.5], [-0.25, -0.2], [0.25, -0.2], [0.25, -0.5], [0.5, 0], [0.25, 0.5], [0.25, 0.2], [-0.25, 0.2], [-0.25, 0.5]])] },
  { id: "chevron", label: "Chevron", group: "Arrows", draw: (w, h) => [poly(w, h, [[-0.5, -0.5], [0.15, -0.5], [0.5, 0], [0.15, 0.5], [-0.5, 0.5], [-0.15, 0]])] },
  { id: "arrowUp", label: "Up arrow", group: "Arrows", draw: (w, h) => [poly(w, h, [[0, -0.5], [0.5, 0], [0.2, 0], [0.2, 0.5], [-0.2, 0.5], [-0.2, 0], [-0.5, 0]])] },
  { id: "pentagonArrow", label: "Tag arrow", group: "Arrows", draw: (w, h) => [poly(w, h, [[-0.5, -0.5], [0.25, -0.5], [0.5, 0], [0.25, 0.5], [-0.5, 0.5]])] },
  { id: "uTurn", label: "U-turn arrow", group: "Arrows", draw: (w, h) => {
    // a thick arch from the bottom left over to an arrowhead pointing down on the right
    const R = 0.38, r = 0.18, cx = -0.06, cy = 0.02, pts: [number, number][] = [];
    for (let k = 0; k <= 16; k++) { const t = Math.PI + (Math.PI * k) / 16; pts.push([cx + R * Math.cos(t), cy + R * Math.sin(t) * 1.25]); }
    pts.push([cx + R + 0.12, cy], [cx + (R + r) / 2, cy + 0.45], [cx + r - 0.12, cy]);
    for (let k = 0; k <= 16; k++) { const t = 2 * Math.PI - (Math.PI * k) / 16; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t) * 1.25]); }
    pts.push([cx - r, 0.5], [cx - R, 0.5]);
    return [poly(w, h, pts)];
  } },
  // ---- flowchart
  { id: "process", label: "Process", group: "Flowchart", draw: (w, h) => [poly(w, h, [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])] },
  { id: "decision", label: "Decision", group: "Flowchart", draw: (w, h) => [poly(w, h, [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]])] },
  { id: "terminator", label: "Start / end", group: "Flowchart", draw: (w, h) => { const r = h / 2, hw = w / 2; return new PathBuilder().move(-hw + r, -r).line(hw - r, -r).arc(hw - r, 0, r, r, -90, 90).line(-hw + r, r).arc(-hw + r, 0, r, r, 90, 270).close().done(); } },
  { id: "data", label: "Data", group: "Flowchart", draw: (w, h) => [poly(w, h, [[-0.3, -0.5], [0.5, -0.5], [0.3, 0.5], [-0.5, 0.5]])] },
  { id: "document", label: "Document", group: "Flowchart", draw: (w, h) => {
    const hw = w / 2, hh = h / 2;
    return new PathBuilder().move(-hw, -hh).line(hw, -hh).line(hw, hh * 0.7).cubic(hw * 0.5, hh * 0.35, 0, hh * 1.15, -hw * 0.5, hh * 0.9).cubic(-hw * 0.75, hh * 0.8, -hw * 0.9, hh * 0.7, -hw, hh * 0.75).close().done();
  } },
  { id: "predefined", label: "Subroutine", group: "Flowchart", draw: (w, h) => [poly(w, h, [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]), poly(w, h, [[-0.38, -0.5], [-0.38, 0.5]], false), poly(w, h, [[0.38, -0.5], [0.38, 0.5]], false)] },
  { id: "manualInput", label: "Manual input", group: "Flowchart", draw: (w, h) => [poly(w, h, [[-0.5, -0.2], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])] },
  { id: "delay", label: "Delay", group: "Flowchart", draw: (w, h) => { const hw = w / 2, hh = h / 2; return new PathBuilder().move(-hw, -hh).line(hw * 0.4, -hh).arc(hw * 0.4, 0, hw * 0.6, hh, -90, 90).line(-hw, hh).close().done(); } },
  { id: "database", label: "Stored data", group: "Flowchart", draw: (w, h) => {
    const hw = w / 2, hh = h / 2, e = hh * 0.22;
    const body = new PathBuilder().move(-hw, -hh + e).arc(0, -hh + e, hw, e, 180, 360).line(hw, hh - e).arc(0, hh - e, hw, e, 0, 180).close().done();
    return [...body, ...new PathBuilder().move(-hw, -hh + e).arc(0, -hh + e, hw, e, 180, 0).done()];
  } },
  // ---- banners
  { id: "ribbon", label: "Ribbon", group: "Banners", draw: (w, h) => uniteClosed([
    [poly(w, h, [[-0.36, -0.35], [0.36, -0.35], [0.36, 0.25], [-0.36, 0.25]])],
    [poly(w, h, [[-0.36, -0.15], [-0.5, -0.15], [-0.42, 0.1], [-0.5, 0.35], [-0.28, 0.35], [-0.28, 0.25], [-0.36, 0.25]])],
    [poly(w, h, [[0.36, -0.15], [0.5, -0.15], [0.42, 0.1], [0.5, 0.35], [0.28, 0.35], [0.28, 0.25], [0.36, 0.25]])],
  ]) },
  { id: "scroll", label: "Scroll", group: "Banners", draw: (w, h) => {
    const hw = w / 2, hh = h / 2, r = Math.min(hh * 0.3, hw * 0.12);
    return new PathBuilder().move(-hw + r, -hh + r).line(hw - r, -hh + r).arc(hw - r, -hh + 2 * r, r, r, -90, 90).line(hw - r, hh - r).line(-hw + r, hh - r).arc(-hw + r, hh - 2 * r, r, r, 90, 270).close().done();
  } },
  { id: "explosion", label: "Explosion", group: "Banners", draw: (w, h) => {
    const n = 13, out: Vec[] = [];
    for (let k = 0; k < 2 * n; k++) { const r = k % 2 ? 0.3 + 0.06 * Math.sin(k * 2.1) : 0.47 - 0.03 * Math.cos(k * 1.7), a = (-90 + (180 * k) / n + (k % 3) * 4) * (Math.PI / 180); out.push({ x: r * w * Math.cos(a), y: r * h * Math.sin(a) }); }
    return [{ closed: true, nodes: out }];
  } },
  { id: "seal", label: "Seal", group: "Banners", draw: (w, h) => [ring(24, 0.5, 0.44, w, h)] },
  // ---- callouts
  { id: "rectCallout", label: "Callout", group: "Callouts", draw: (w, h) => [poly(w, h, [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.25], [-0.05, 0.25], [-0.25, 0.5], [-0.2, 0.25], [-0.5, 0.25]])] },
  { id: "roundCallout", label: "Rounded callout", group: "Callouts", draw: (w, h) => {
    const pts: Vec[] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.25], [-0.05, 0.25], [-0.25, 0.5], [-0.2, 0.25], [-0.5, 0.25]].map(([x, y]) => ({ x: x * w, y: y * h }));
    const r = Math.min(w, h) * 0.12;
    return [roundedPolygon(pts, [r, r, r, 0, 0, 0, r])];
  } },
  { id: "ovalCallout", label: "Oval callout", group: "Callouts", draw: (w, h) => {
    // the ellipse with a gap at the lower left, and the tail's tip there
    const hw = w / 2, hh = h * 0.38, cy = -h * 0.12, t0 = 110, t1 = 135, out: Vec[] = [];
    for (let k = 0; k <= 48; k++) { const t = ((t1 + ((360 - (t1 - t0)) * k) / 48) * Math.PI) / 180; out.push({ x: hw * Math.cos(t), y: cy + hh * Math.sin(t) }); }
    out.push({ x: -hw * 0.6, y: h * 0.5 });
    return [{ closed: true, nodes: out }];
  } },
  { id: "cloudCallout", label: "Thought bubble", group: "Callouts", draw: (w, h) => {
    const bumps = 9, hw = w / 2, hh = h * 0.36, cy = -h * 0.14, out: Vec[] = [];
    for (let k = 0; k <= bumps * 6; k++) { const t = (k / (bumps * 6)) * 2 * Math.PI, b = 1 + 0.09 * Math.abs(Math.sin((t * bumps) / 2)); out.push({ x: hw * b * 0.92 * Math.cos(t), y: cy + hh * b * 0.92 * Math.sin(t) }); }
    out.pop();
    return [{ closed: true, nodes: out }, ...ellipse(-hw * 0.42, h * 0.32, w * 0.07, h * 0.06), ...ellipse(-hw * 0.62, h * 0.45, w * 0.04, h * 0.04)];
  } },
];

export const LIBRARY_BY_ID = new Map(SHAPE_LIBRARY.map((s) => [s.id, s]));

export function libraryPaths(id: string, w: number, h: number): Subpath[] {
  const s = LIBRARY_BY_ID.get(id) ?? SHAPE_LIBRARY[0];
  return s.draw(Math.max(w, 1e-3), Math.max(h, 1e-3));
}

/**
 * Burst Lines: wedge-shaped rays between an inner and an outer radius, lengths varied by a seed
 * (comic-book speed lines round a subject). `width` is each ray's base as a share of its slot.
 */
export function burstPaths(rays: number, r: number, inner: number, width: number, jitter: number, seed: number): Subpath[] {
  const n = Math.max(3, Math.min(240, Math.round(rays)));
  let s = (Math.round(seed) * 9301 + 49297) % 233280 || 1;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const out: Subpath[] = [];
  const slot = (2 * Math.PI) / n, half = (slot * Math.max(0.05, Math.min(0.95, width))) / 2;
  for (let k = 0; k < n; k++) {
    const a = k * slot - Math.PI / 2, ri = Math.max(0, Math.min(r * 0.98, inner * (1 + (rnd() - 0.5) * jitter)));
    const ro = Math.max(ri + 0.01, r * (1 - rnd() * jitter * 0.5));
    out.push({ closed: true, nodes: [
      { x: ri * Math.cos(a), y: ri * Math.sin(a) },
      { x: ro * Math.cos(a - half), y: ro * Math.sin(a - half) },
      { x: ro * Math.cos(a + half), y: ro * Math.sin(a + half) },
    ] });
  }
  return out;
}

/** A crossed star: n points on a circle joined every `skip` points ({n/skip}); several loops when they share a factor. */
export function crossedStar(n: number, skip: number, r: number): Subpath[] {
  const N = Math.max(5, Math.round(n)), k = Math.max(2, Math.min(Math.floor((N - 1) / 2), Math.round(skip)));
  const pt = (i: number): Vec => { const a = (-90 + (360 * i) / N) * (Math.PI / 180); return { x: r * Math.cos(a), y: r * Math.sin(a) }; };
  const g = gcd(N, k), out: Subpath[] = [];
  for (let start = 0; start < g; start++) {
    const nodes: Vec[] = [];
    for (let j = 0, i = start; j < N / g; j++, i = (i + k) % N) nodes.push(pt(i));
    out.push({ closed: true, nodes });
  }
  return out;
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

setShapeLibrary({ library: libraryPaths, burst: burstPaths, crossed: crossedStar });
