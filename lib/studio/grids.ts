/**
 * Document grids beyond the plain rectangular one: axonometric (two slanted line families, isometric
 * at 30°/30°), modular (modules with gutters) and polar (rings and spokes). Pure: the nearest grid
 * node for snapping, and SVG path data for the canvas. The rectangular grid keeps its own drawing and
 * snapping (snap.ts) exactly as before.
 */
import type { GridKind, GridSpec, Vec } from "./types";

export const GRID_KINDS: { value: GridKind; label: string }[] = [
  { value: "rectangular", label: "Rectangular" },
  { value: "axonometric", label: "Axonometric" },
  { value: "modular", label: "Modular" },
  { value: "polar", label: "Polar" },
];

export const GRID_DEFAULTS = { angleX: 30, angleZ: 30, moduleW: 40, moduleH: 40, gutterX: 5, gutterY: 5, divisions: 12 } as const;

export const gridKind = (g: GridSpec): GridKind => g.kind ?? "rectangular";
export const minorStep = (g: GridSpec) => g.size / Math.max(1, g.subdivisions);
export const gridOrigin = (g: GridSpec): Vec => (gridKind(g) === "rectangular" ? { x: 0, y: 0 } : { x: g.originX ?? 0, y: g.originY ?? 0 });

const clampAngle = (a: number | undefined, d: number) => Math.max(5, Math.min(85, Number.isFinite(a) ? (a as number) : d));

/** Lattice vectors of an axonometric grid with node spacing `step`: u rises to the right at angleX, v falls at angleZ. */
export function axonBasis(g: GridSpec, step: number): { u: Vec; v: Vec } {
  const ax = (clampAngle(g.angleX, GRID_DEFAULTS.angleX) * Math.PI) / 180, az = (clampAngle(g.angleZ, GRID_DEFAULTS.angleZ) * Math.PI) / 180;
  return { u: { x: step * Math.cos(ax), y: -step * Math.sin(ax) }, v: { x: step * Math.cos(az), y: step * Math.sin(az) } };
}

/** Lattice coordinates (a, b) of p: p = o + a·u + b·v. */
function latticeCoords(p: Vec, o: Vec, u: Vec, v: Vec) {
  const det = u.x * v.y - u.y * v.x, x = p.x - o.x, y = p.y - o.y;
  return { a: (x * v.y - y * v.x) / det, b: (u.x * y - u.y * x) / det };
}

/** Nearest module edge along one axis: modules of `size` repeat every size + gutter from `o`. */
function modularAxis(v: number, o: number, size: number, gutter: number): number {
  const period = size + Math.max(0, gutter);
  const k = Math.floor((v - o) / period);
  let best = o + k * period, bd = Infinity;
  for (const e of [o + (k - 1) * period + size, o + k * period, o + k * period + size, o + (k + 1) * period]) {
    const d = Math.abs(e - v);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const modW = (g: GridSpec) => Math.max(0.1, g.moduleW ?? GRID_DEFAULTS.moduleW);
const modH = (g: GridSpec) => Math.max(0.1, g.moduleH ?? GRID_DEFAULTS.moduleH);
const divs = (g: GridSpec) => Math.max(2, Math.round(g.divisions ?? GRID_DEFAULTS.divisions));

/** The grid point nearest to p (intersection of grid lines; for modular grids, module corners). */
export function gridNode(p: Vec, g: GridSpec): Vec {
  const step = minorStep(g), o = gridOrigin(g);
  switch (gridKind(g)) {
    case "rectangular":
      return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
    case "modular":
      return { x: modularAxis(p.x, o.x, modW(g), g.gutterX ?? GRID_DEFAULTS.gutterX), y: modularAxis(p.y, o.y, modH(g), g.gutterY ?? GRID_DEFAULTS.gutterY) };
    case "axonometric": {
      const { u, v } = axonBasis(g, step);
      const { a, b } = latticeCoords(p, o, u, v);
      let best = o, bd = Infinity;
      for (let i = Math.floor(a); i <= Math.floor(a) + 1; i++) for (let j = Math.floor(b); j <= Math.floor(b) + 1; j++) {
        const q = { x: o.x + i * u.x + j * v.x, y: o.y + i * u.y + j * v.y };
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    }
    case "polar": {
      const r = Math.hypot(p.x - o.x, p.y - o.y), n = divs(g), dt = (2 * Math.PI) / n;
      const ring = Math.round(r / step), spoke = Math.round(Math.atan2(p.y - o.y, p.x - o.x) / dt);
      let best = o, bd = r;
      for (let k = Math.max(1, ring - 1); k <= ring + 1; k++) for (let m = spoke - 1; m <= spoke + 1; m++) {
        const q = { x: o.x + k * step * Math.cos(m * dt), y: o.y + k * step * Math.sin(m * dt) };
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) { bd = d; best = q; }
      }
      return best;
    }
  }
}

/** Nearest modular edge on each axis separately (box edges snap to columns and rows independently). */
export function modularEdges(p: Vec, g: GridSpec): Vec {
  const o = gridOrigin(g);
  return { x: modularAxis(p.x, o.x, modW(g), g.gutterX ?? GRID_DEFAULTS.gutterX), y: modularAxis(p.y, o.y, modH(g), g.gutterY ?? GRID_DEFAULTS.gutterY) };
}

export interface ViewBox { minX: number; minY: number; maxX: number; maxY: number }
export interface GridDrawing { minor: string; major: string }

const MIN_PX = 7;
const MAX_LINES = 1200;
const f = (v: number) => Math.round(v * 1000) / 1000;

/** Path data for a non-rectangular grid over the visible area (mm), minor and major lines apart. Empty when too dense. */
export function gridDrawing(g: GridSpec, vb: ViewBox, zoom: number): GridDrawing {
  const out: GridDrawing = { minor: "", major: "" };
  const o = gridOrigin(g), minor = minorStep(g), sub = Math.max(1, Math.round(g.subdivisions));
  const corners = [{ x: vb.minX, y: vb.minY }, { x: vb.maxX, y: vb.minY }, { x: vb.minX, y: vb.maxY }, { x: vb.maxX, y: vb.maxY }];
  switch (gridKind(g)) {
    case "rectangular": return out;
    case "axonometric": {
      for (const [step, key] of [[minor, "minor"], [g.size, "major"]] as const) {
        if (step * zoom < MIN_PX || (key === "minor" && sub === 1)) continue;
        const { u, v } = axonBasis(g, step);
        const cs = corners.map((c) => latticeCoords(c, o, u, v));
        const a0 = Math.floor(Math.min(...cs.map((c) => c.a))), a1 = Math.ceil(Math.max(...cs.map((c) => c.a)));
        const b0 = Math.floor(Math.min(...cs.map((c) => c.b))), b1 = Math.ceil(Math.max(...cs.map((c) => c.b)));
        if (a1 - a0 + (b1 - b0) > MAX_LINES) continue;
        const at = (a: number, b: number) => `${f(o.x + a * u.x + b * v.x)} ${f(o.y + a * u.y + b * v.y)}`;
        let d = "";
        for (let b = b0; b <= b1; b++) d += `M${at(a0, b)}L${at(a1, b)}`;
        for (let a = a0; a <= a1; a++) d += `M${at(a, b0)}L${at(a, b1)}`;
        // Equal angles put the nodes in vertical columns too: draw them, as on isometric paper.
        if (Math.abs(clampAngle(g.angleX, 30) - clampAngle(g.angleZ, 30)) < 1e-9) {
          const dx = u.x;
          const k0 = Math.floor((vb.minX - o.x) / dx), k1 = Math.ceil((vb.maxX - o.x) / dx);
          if (k1 - k0 <= MAX_LINES) for (let k = k0; k <= k1; k++) d += `M${f(o.x + k * dx)} ${f(vb.minY)}V${f(vb.maxY)}`;
        }
        out[key] = d;
      }
      return out;
    }
    case "modular": {
      const w = modW(g), h = modH(g), gx = Math.max(0, g.gutterX ?? GRID_DEFAULTS.gutterX), gy = Math.max(0, g.gutterY ?? GRID_DEFAULTS.gutterY);
      const px = w + gx, py = h + gy;
      if (Math.min(w, h) * zoom < MIN_PX / 2) return out;
      const k0 = Math.floor((vb.minX - o.x) / px), k1 = Math.ceil((vb.maxX - o.x) / px);
      const m0 = Math.floor((vb.minY - o.y) / py), m1 = Math.ceil((vb.maxY - o.y) / py);
      if ((k1 - k0) * (m1 - m0) > MAX_LINES * 4) return out;
      let d = "";
      for (let k = k0; k <= k1; k++) for (let m = m0; m <= m1; m++) {
        const x = o.x + k * px, y = o.y + m * py;
        d += `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
      }
      out.major = d;
      return out;
    }
    case "polar": {
      const n = divs(g), rMax = Math.max(...corners.map((c) => Math.hypot(c.x - o.x, c.y - o.y)));
      const inside = vb.minX <= o.x && o.x <= vb.maxX && vb.minY <= o.y && o.y <= vb.maxY;
      const rMin = inside ? 0 : Math.max(0, Math.min(...corners.map((c) => Math.hypot(c.x - o.x, c.y - o.y))) - Math.hypot(vb.maxX - vb.minX, vb.maxY - vb.minY));
      const ring = (r: number) => `M${f(o.x + r)} ${f(o.y)}A${f(r)} ${f(r)} 0 1 0 ${f(o.x - r)} ${f(o.y)}A${f(r)} ${f(r)} 0 1 0 ${f(o.x + r)} ${f(o.y)}`;
      for (const [step, key] of [[minor, "minor"], [g.size, "major"]] as const) {
        if (step * zoom < MIN_PX || (key === "minor" && sub === 1)) continue;
        const k0 = Math.max(1, Math.floor(rMin / step)), k1 = Math.ceil(rMax / step);
        if (k1 - k0 > MAX_LINES) continue;
        let d = "";
        for (let k = k0; k <= k1; k++) d += ring(k * step);
        out[key] += d;
      }
      // Spokes: every quarter turn is major.
      const dt = (2 * Math.PI) / n;
      const rOut = Math.ceil(rMax / g.size) * g.size;
      for (let m = 0; m < n; m++) {
        const t = m * dt, quarter = Math.abs(Math.round((t / (Math.PI / 2))) * (Math.PI / 2) - t) < 1e-9;
        const seg = `M${f(o.x)} ${f(o.y)}L${f(o.x + rOut * Math.cos(t))} ${f(o.y + rOut * Math.sin(t))}`;
        if (quarter) out.major += seg; else out.minor += seg;
      }
      return out;
    }
  }
}
