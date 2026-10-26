/**
 * A chest of drawers: the box stands on its side as an open-fronted case (the base is the back),
 * shelves split it into equal bays, and each bay takes a drawer: a small open-top hinge box of its
 * own with a front plate glued on, and a knob or finger hole to pull it by.
 *
 * Seen from the front a drawer is square-cornered, so in the case's rounded corner bays it is made
 * narrower until its corners clear the wall's curve.
 */
import type { ComputeResult, DividerPlace, DrawerPlace, Edge, Issue, Params, Part, PlatePart, WallPart } from "./types";
import { buildCore, plateExtent, roundedPointsXY } from "./core";
import { bboxOf } from "./polygon";
import { kerfY } from "./hinge";
import { ellipse } from "@/lib/materials/axes";
import { coreDistance } from "./lidSlot";
import { r3 } from "./util";
import { refitLattice } from "./analysis";

export const MAX_DRAWERS = 4;
/** Play round each drawer in its bay, mm. */
export const DRAWER_PLAY = 1;
export const drawerCount = (p: Params) => Math.max(0, Math.min(MAX_DRAWERS, Math.round(p.drawers ?? 0)));

/** The case's own settings: open at the front (the top), one shelf between each two drawers. */
export function drawerShell(p: Params): Params {
  const q: Params = { ...p, lid: "open", divX: 0, divY: drawerCount(p) - 1, divH: 0, upright: true };
  for (const k of ["lidHole", "lidHoleD", "lidHoleW", "lidSteps", "lidWindow", "baseHole", "baseHoleD", "baseHoleW"] as const) delete q[k];
  return q;
}

const floorTo = (v: number, s = 0.5) => Math.floor(v / s + 1e-9) * s;

/** The widest square-cornered front of height y0..y1 whose corners stay `r` from the core. */
function widest(edges: Edge[], r: number, y0: number, y1: number): number {
  let lo = 0, hi = 1e4;
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2;
    if ([[m, y0], [m, y1], [-m, y0], [-m, y1]].every((q) => coreDistance(edges, q as [number, number]) <= r)) lo = m; else hi = m;
  }
  return 2 * lo;
}

/**
 * The drawers for the case `p` (the user's settings) whose core is `edges` and corner radius `R`;
 * `depth` is the case's inside depth (its wall height), `shelves` where the shelves stand.
 * `build` is computeModel, passed in to keep the modules apart.
 */
export function buildDrawers(
  p: Params, edges: Edge[], R: number, depth: number, shelves: DividerPlace[],
  build: (q: Params) => ComputeResult,
): { parts: Part[]; places: DrawerPlace[]; issues: Issue[] } {
  const out = { parts: [] as Part[], places: [] as DrawerPlace[], issues: [] as Issue[] };
  const n = drawerCount(p), t = p.T, k = p.K, ky = kerfY(p), play = DRAWER_PLAY, ri = R - t;
  // The inside from top to bottom (the back of the drawing is the top of the case).
  let top = 0, bottom = 0;
  { let lo = 0, hi = 1e4; for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (coreDistance(edges, [0, -m]) <= ri) lo = m; else hi = m; } top = -lo; }
  { let lo = 0, hi = 1e4; for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (coreDistance(edges, [0, m]) <= ri) lo = m; else hi = m; } bottom = lo; }
  const ys = shelves.filter((s) => s.axis === "y").map((s) => s.at).sort((a, b) => a - b);
  if (ys.length !== n - 1) out.issues.push({ lvl: "warn", msg: `Only ${ys.length + 1} of the ${n} drawers fit with bays at least 12 mm tall.` });
  const bounds = [top, ...ys.flatMap((y) => [y - t / 2, y + t / 2]), bottom];
  const pull = p.drawerPull ?? "knob";
  for (let i = 0; i + 1 < bounds.length; i += 2) {
    const no = i / 2 + 1, name = `DRAWER ${no}`;
    const y0 = bounds[i], y1 = bounds[i + 1];
    const h = floorTo(y1 - y0 - 2 * play), w = floorTo(widest(edges, ri - play, y0 + play, y1 - play));
    const d = floorTo(depth - 1.5);
    const rd = floorTo(Math.max(t + 2, Math.min(p.shape === "rect" ? p.R : 20, Math.min(w, d) / 2 - 1)));
    const q: Params = {
      ...p, name, shape: "rect", W: w, D: d, H: h, R: rd, lid: "open", drawers: 0, divX: 0, divY: 0, upright: false,
      baseRing: false, testStrip: false, hangHoles: false, lidSteps: 0, lidWindow: false, fit: undefined,
    };
    for (const key of ["divH", "baseText", "baseHole", "baseHoleD", "baseHoleW", "lidHole", "lidHoleD", "lidHoleW", "fret", "fretOn"] as const) delete q[key];
    const m0 = build(q);
    if ("error" in m0) { out.issues.push({ lvl: "warn", msg: `${name} was left out: ${m0.error}` }); continue; }
    // A drawer's walls are lower than the case's, so they may need a lattice of their own.
    const { m, lattice } = refitLattice(q, m0, build);
    if (m.analysis.verdict === "err") out.issues.push({ lvl: "warn", msg: `${name}'s corners (R ${r3(m.rN)} mm) are tighter than its hinge bends (about R ${r3(m.analysis.rMin)} mm). Use a more flexible hinge style or a larger radius.` });
    if (lattice && no === 1) out.issues.push({ lvl: "info", msg: "The drawers' walls are lower than the case's, so their hinge was fitted to them." });
    for (const pt of m.parts) {
      if (pt.kind === "wall") out.parts.push({ ...pt, name: pt.name.replace(/^WALL/, `${name} WALL`), hs: m.hs, ...(lattice ? { lattice } : {}) } as WallPart);
      else out.parts.push({ ...pt, name: `${name} BASE` });
    }
    // The front covers the bay and half the shelf or wall round it, 1.5 mm short of the next front.
    const fw = floorTo(w + 2 * play + t), fh = floorTo(y1 - y0 + t - 1.5), rf = 2;
    const fc = buildCore({ ...p, shape: "rect", W: fw, D: fh, R: rf });
    if ("error" in fc) continue;
    const holes = [];
    const dHole = pull === "finger" ? 22 : pull === "knob" ? 5 : 0;
    if (dHole && dHole + 6 <= Math.min(fw, fh)) holes.push(ellipse(0, 0, (dHole - k) / 2, (dHole - ky) / 2, 72));
    else if (dHole) out.issues.push({ lvl: "info", msg: `${name}'s front is too small for a ${pull} hole.` });
    const front: PlatePart = ky !== k
      ? { kind: "plate", name: `${name} FRONT`, r: rf, ek: [k, ky], edges: fc.edges, slots: holes, bbox: bboxOf(roundedPointsXY(fc.edges, rf, k, ky)) }
      : { kind: "plate", name: `${name} FRONT`, r: rf + k / 2, edges: fc.edges, slots: holes, bbox: plateExtent(fc.edges, rf + k / 2) };
    if (holes.length) front.hole = dHole / 2;
    out.parts.push(front);
    out.places.push({ name, cy: (y0 + y1) / 2, w, h, d, r: rd, fw, fh });
  }
  return out;
}
