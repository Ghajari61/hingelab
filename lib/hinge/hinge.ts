/** Hinge patterns: column placement, slit intervals and the cut paths for each pattern and cut style. */
import type { ColKind, HingeCol, HingeSegments, Params } from "./types";
import { TAU, clamp, r3 } from "./util";

/** Closed (bridged) and open (edge-reaching) slit intervals down a wall of height h. */
export function hingeSegments(h: number, slit: number, g: number): HingeSegments {
  let n = Math.max(1, Math.round((h - g) / (slit + g)));
  let Lp = (h - g) / n - g;
  while (Lp < g && n > 1) { n--; Lp = (h - g) / n - g; }
  const closed: [number, number][] = [];
  for (let i = 0; i < n; i++) { const y = g + i * (Lp + g); closed.push([y, y + Lp]); }
  const open: [number, number][] = []; let y = -0.4;
  for (let i = 0; i < n; i++) { const c = g + i * (Lp + g) + Lp / 2; open.push([y, c - g / 2]); y = c + g / 2; }
  open.push([y, h + 0.4]);
  return { closed, open, Lp, n };
}

/* Columns of one hinge zone [a,b]. The column count is odd, so both ends of a zone are "closed"
   columns (bridges at both edges) and the zone blends into the flat wall without an edge notch.
   Serpentine alternates cuts that start at the top edge and at the bottom edge. */
export function makeCols(a: number, b: number, p: Params): HingeCol[] {
  let nc = Math.max(1, Math.floor((b - a) / p.pitch));
  if (nc % 2 === 0) nc -= 1;
  const start = a + ((b - a) - (nc - 1) * p.pitch) / 2;
  const cols: HingeCol[] = [];
  for (let j = 0; j < nc; j++) {
    const kind: ColKind = p.pattern === "serpentine" ? (j % 2 === 0 ? "top" : "bottom") : (j % 2 === 0 ? "closed" : "open");
    cols.push({ x: start + j * p.pitch, kind });
  }
  return cols;
}

/** Slit intervals for one column kind on a wall of height h with bridge g. */
export function colSegments(kind: ColKind, hs: HingeSegments, h: number, g: number): [number, number][] {
  if (kind === "closed") return hs.closed;
  if (kind === "open") return hs.open;
  if (kind === "top") return [[-0.4, h - g]];
  return [[g, h + 0.4]];
}

/* Wave cuts follow ONE global sine (phase depends on y only), so every cut is a parallel copy of its
   neighbour and the torsion bars keep a constant width. */
export function waveParams(p: Params) { return { A: p.pitch * 0.3, lambda: Math.max(4 * p.pitch, 8) }; }
export function reliefRadius(p: Params) { return clamp((p.pitch - p.K) * 0.22, 0.25, 0.6); }

/** Single-line cut style: centerline paths for one column (the laser kerf is the cut). */
export function slitPaths(x: number, segs: [number, number][], h: number, p: Params, ox: number, oy: number) {
  const out: string[] = [];
  for (const [y1, y2] of segs) {
    if (y2 - y1 < 0.3) continue;
    if (p.pattern === "wave") {
      const { A, lambda } = waveParams(p), len = y2 - y1;
      const steps = Math.max(6, Math.ceil(len / 0.6));
      let d = "";
      for (let i = 0; i <= steps; i++) { const y = y1 + len * i / steps, xx = x + A * Math.sin(TAU * y / lambda); d += (i ? " L" : "M") + `${r3(xx + ox)},${r3(y + oy)}`; }
      out.push(d);
    } else {
      out.push(`M${r3(x + ox)},${r3(y1 + oy)} L${r3(x + ox)},${r3(y2 + oy)}`);
      if (p.pattern === "relief") {
        const rr = reliefRadius(p);
        const circ = (cy: number) => `M${r3(x - rr + ox)},${r3(cy + oy)} A${r3(rr)},${r3(rr)} 0 1 0 ${r3(x + rr + ox)},${r3(cy + oy)} A${r3(rr)},${r3(rr)} 0 1 0 ${r3(x - rr + ox)},${r3(cy + oy)} Z`;
        if (y1 > 0.01) out.push(circ(y1));
        if (y2 < h - 0.01) out.push(circ(y2));
      }
    }
  }
  return out;
}

/* ---- Slot cut style ----
   Each cut is a closed, round-ended slot of width slotW (the laser follows its outline, so the path is
   inset by kerf/2 and the removed strip is exactly slotW wide). Cuts that reach the top or bottom edge
   become rounded notches in the wall outline itself, so the part has one clean outer contour.
   Wave keeps its edge cuts as wavy slots that run past the edge into the waste. */
/** Honeycomb cells are always closed shapes, so they use the slot geometry whatever the cut style. */
export const slotLike = (p: Params) => p.cutStyle === "slot" || p.pattern === "honeycomb";
export const cutWidth = (p: Params) => slotLike(p) ? p.slotW : p.K;
export const mergesEdgeCuts = (p: Params) => slotLike(p) && p.pattern !== "wave";
/** Kerf across cuts along X (missing Ky: the same as K). */
export const kerfY = (p: Params) => p.Ky ?? p.K;

/** Rise of a honeycomb cell's pointed end: a regular hexagon's, for half-width `hw`. */
export const honeyRise = (hw: number) => hw / Math.sqrt(3);

/*
 * Honeycomb: regular hexagon cells (width = slotW) on columns `pitch` apart, neighbouring columns
 * half a cell apart, so the cells nest and the material left is a honeycomb with walls 2*pitch - slotW
 * thick. The cell height and the gap between cells down a column follow from that, so the slit and
 * bridge settings are not used.
 */
export function honeyLattice(p: Params): Params {
  if (p.pattern !== "honeycomb") return p;
  const cell = (2 * p.slotW) / Math.sqrt(3), period = 2 * Math.sqrt(3) * p.pitch;
  return { ...p, slit: r3(cell), bridge: r3(Math.max(0.5, period - cell)) };
}

/** Width of the material left between neighbouring cuts (the torsion bars, or the honeycomb walls). */
export const barWidth = (p: Params) => p.pattern === "honeycomb" ? 2 * p.pitch - p.slotW : p.pitch - cutWidth(p);

/** Pointy-ended hexagon cell from ya to yb, half-width hw (a diamond when it is too short for straight sides). */
export function hexCellD(x: number, ya: number, yb: number, hw: number, ox: number, oy: number) {
  const rise = Math.min(honeyRise(hw), (yb - ya) / 2), m = (ya + yb) / 2;
  const pts: [number, number][] = yb - ya > 2 * rise + 0.01
    ? [[x, ya], [x + hw, ya + rise], [x + hw, yb - rise], [x, yb], [x - hw, yb - rise], [x - hw, ya + rise]]
    : [[x, ya], [x + hw, m], [x, yb], [x - hw, m]];
  return "M" + pts.map(([px, py]) => `${r3(px + ox)},${r3(py + oy)}`).join(" L") + " Z";
}

/** Closed stadium (round-ended slot) path, or a circle when the slot is too short. */
export function stadiumD(x: number, ya: number, yb: number, rr: number, ox: number, oy: number) {
  if (yb - ya < 2 * rr + 0.05) { const cy = (ya + yb) / 2; return `M${r3(x - rr + ox)},${r3(cy + oy)} A${r3(rr)},${r3(rr)} 0 1 0 ${r3(x + rr + ox)},${r3(cy + oy)} A${r3(rr)},${r3(rr)} 0 1 0 ${r3(x - rr + ox)},${r3(cy + oy)} Z`; }
  const s0 = ya + rr, s1 = yb - rr;
  return `M${r3(x - rr + ox)},${r3(s0 + oy)} L${r3(x - rr + ox)},${r3(s1 + oy)} A${r3(rr)},${r3(rr)} 0 0 0 ${r3(x + rr + ox)},${r3(s1 + oy)} L${r3(x + rr + ox)},${r3(s0 + oy)} A${r3(rr)},${r3(rr)} 0 0 0 ${r3(x - rr + ox)},${r3(s0 + oy)} Z`;
}

/** Cut paths for one column in either cut style. */
export function hingeCutPaths(x: number, segs: [number, number][], h: number, p: Params, ox: number, oy: number) {
  if (!slotLike(p)) return slitPaths(x, segs, h, p, ox, oy);
  const out: string[] = [], rr = (p.slotW - p.K) / 2, k2 = kerfY(p) / 2;
  for (const [y1, y2] of segs) {
    const atEdge = y1 < 0 || y2 > h;
    if (atEdge && mergesEdgeCuts(p)) continue;          // drawn as an outline notch instead
    if (y2 - y1 < p.slotW * 0.8) continue;
    if (p.pattern === "honeycomb") {
      // Inset by half the kerf: the 120° points move in by k/2 / sin 60°.
      const tip = (2 * k2) / Math.sqrt(3);
      out.push(hexCellD(x, y1 + tip, y2 - tip, rr, ox, oy));
    } else if (p.pattern === "wave") {
      const { A, lambda } = waveParams(p);
      const ya = y1 + k2 + rr, yb = y2 - k2 - rr, len = yb - ya, steps = Math.max(6, Math.ceil(len / 0.6));
      const L: [number, number][] = [], Rt: [number, number][] = [];
      for (let i = 0; i <= steps; i++) { const y = ya + len * i / steps, xx = x + A * Math.sin(TAU * y / lambda); L.push([xx - rr, y]); Rt.push([xx + rr, y]); }
      const P2 = (q: [number, number]) => `${r3(q[0] + ox)},${r3(q[1] + oy)}`;
      out.push(`M${L.map(P2).join(" L")} A${r3(rr)},${r3(rr)} 0 0 0 ${P2(Rt[steps])} L${Rt.slice().reverse().map(P2).join(" L")} A${r3(rr)},${r3(rr)} 0 0 0 ${P2(L[0])} Z`);
    } else if (p.pattern === "relief") {
      const R = Math.max(reliefRadius(p), rr * 1.6), dy = Math.sqrt(R * R - rr * rr);
      const ya = y1, yb = y2;
      out.push(`M${r3(x - rr + ox)},${r3(ya + dy + oy)} L${r3(x - rr + ox)},${r3(yb - dy + oy)} A${r3(R)},${r3(R)} 0 1 0 ${r3(x + rr + ox)},${r3(yb - dy + oy)} L${r3(x + rr + ox)},${r3(ya + dy + oy)} A${r3(R)},${r3(R)} 0 1 0 ${r3(x - rr + ox)},${r3(ya + dy + oy)} Z`);
    } else {
      out.push(stadiumD(x, y1 + k2, y2 - k2, rr, ox, oy));
    }
  }
  return out;
}
