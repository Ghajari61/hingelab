/**
 * The pattern builder every leather product uses: parts, seams with matched holes, single-part
 * stitch lines, fold seams, hardware mounts, and the records the checks read.
 */
import { circle, distToContour, pointInContour } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { footprint, mountHoles, type HwKind, type HwLine, type HwSizes } from "./hardware";
import { pathLength } from "./path";
import type { Rig } from "./rig";
import { holeMark, holeOutline, intervals, placeHoles, threadFor, type HolePlace, type StitchSpec } from "./stitch";

export interface SeamReport {
  label: string;
  parts: string[];
  /** Holes in each row. */
  holes: number;
  rows: number;
  /** Stitch-path length of each side, mm (one entry per side). */
  lengths: number[];
  thread: number;
}

export interface HoleRec { pt: Pt; r: number; what: string; t?: Pt }

export class Pattern {
  parts: GenPart[] = [];
  seams: SeamReport[] = [];
  hardware = new Map<string, HwLine>();
  holes = new Map<string, HoleRec[]>();
  /** Hardware centres per part, with the radius they cover. */
  fittings = new Map<string, { pt: Pt; r: number; kind: HwKind }[]>();
  steps: string[] = [];
  /** The longest part the bed takes, mm (longer straps are made in two halves). */
  maxLen = Infinity;
  /** Where the loose pieces go in the 3D preview (rig.ts). */
  rigs: Rig[] = [];
  /** Parts already placed in 3D by their builder with a plain (x, y, z) place. */
  keep = new Set<string>();
  /** Straps made in two halves: the second half by the first's id, and where it starts along the strap. */
  splits = new Map<string, { part: GenPart; off: number }>();
  notes: string[] = [];

  constructor(public s: StitchSpec, public T: number, public hw: HwSizes) {}

  add(p: GenPart): GenPart { this.parts.push(p); return p; }
  part(id: string): GenPart { const p = this.parts.find((q) => q.id === id); if (!p) throw new Error(`no part ${id}`); return p; }

  private rec(part: GenPart, r: HoleRec) { const l = this.holes.get(part.id) ?? []; l.push(r); this.holes.set(part.id, l); }

  /** Puts stitch holes (or, in the guide and template modes, marks) into a part. */
  private put(part: GenPart, places: HolePlace[], what: string) {
    for (const h of places) {
      if (this.s.mode === "laser") part.holes.push(holeOutline(h, this.s));
      else (part.score ??= []).push(...holeMark(h, this.s));
      this.rec(part, { pt: h.pt, t: h.t, r: this.s.type === "lacing" ? Math.max(1.25, this.s.hole * 1.2) : this.s.shape === "round" ? this.s.hole / 2 : Math.max(0.5, this.s.hole / 2), what });
    }
  }

  /** A short scored tick at each end of a seam on each part, from the end hole toward the edge. */
  private ticks(part: GenPart, path: Pt[]) {
    for (const [i, j] of [[0, 1], [path.length - 1, path.length - 2]] as const) {
      const a = path[i], b = path[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      const e = this.s.edge * 0.6;
      if (pointInContour([a[0] + nx * e, a[1] + ny * e], part.outer)) { nx = -nx; ny = -ny; }
      const d0 = Math.max(this.s.hole, 1.2);
      (part.score ??= []).push([[a[0] + nx * d0, a[1] + ny * d0], [a[0] + nx * (this.s.edge - 0.4), a[1] + ny * (this.s.edge - 0.4)]]);
    }
  }

  /**
   * Stitches parts together. Each side gives one path per row (the same number of rows on every
   * side), in its own part's frame and running the same way. The first side's first row sets the
   * hole count; every row on every side gets that many holes by arc length.
   */
  seam(label: string, sides: { part: GenPart; rows: Pt[][] }[], opts: { ticks?: boolean } = {}): SeamReport {
    const rows = Math.min(...sides.map((sd) => sd.rows.length));
    const n = intervals(pathLength(sides[0].rows[0]), this.s.pitch);
    for (const sd of sides) for (let r = 0; r < rows; r++) {
      // a closed loop's last hole is its first: put it once
      const row = sd.rows[r], closed = Math.hypot(row[0][0] - row[row.length - 1][0], row[0][1] - row[row.length - 1][1]) < 0.01;
      const hs = placeHoles(row, n);
      this.put(sd.part, closed ? hs.slice(0, -1) : hs, label);
      if (r === 0 && opts.ticks !== false) this.ticks(sd.part, sd.rows[0]);
    }
    const stack = sides.reduce((k, sd) => k + (sd.part.t ?? this.T), 0);
    const lengths = sides.map((sd) => pathLength(sd.rows[0]));
    const rep: SeamReport = { label, parts: sides.map((sd) => sd.part.id), holes: n + 1, rows, lengths, thread: rows > 1 && this.s.type === "double" ? threadFor("double", n + 1, this.s.pitch, stack, this.s.edge) : threadFor(this.s.type, n + 1, this.s.pitch, stack, this.s.edge) * rows };
    this.seams.push(rep);
    return rep;
  }

  /** Stitch lines in one part with no mate (an edge finish, a strap's edge, layers glued and stitched together). */
  line(label: string, part: GenPart, rows: Pt[][], layers = 1): SeamReport {
    const n = intervals(pathLength(rows[0]), this.s.pitch);
    for (const row of rows) { const hs = placeHoles(row, n), closed = Math.hypot(row[0][0] - row[row.length - 1][0], row[0][1] - row[row.length - 1][1]) < 0.01; this.put(part, closed ? hs.slice(0, -1) : hs, label); }
    const rep: SeamReport = { label, parts: [part.id], holes: n + 1, rows: rows.length, lengths: [pathLength(rows[0])], thread: threadFor(this.s.type, n + 1, this.s.pitch, layers * (part.t ?? this.T), this.s.edge) * rows.length };
    this.seams.push(rep);
    return rep;
  }

  /**
   * Stitching through a stack of layers glued on a base (a wallet's pockets on its lining): holes
   * along the path in the base, and in each layer (placed at ox, oy in the base's frame) the same
   * holes wherever they fall inside it, at least `inset` from its edge.
   */
  stack(label: string, base: GenPart, rows: Pt[][], layers: { part: GenPart; ox: number; oy: number }[], inset = 0.8): SeamReport {
    const rep = this.line(label, base, rows, 1 + layers.length);
    const placed = rows.flatMap((row) => { const hs = placeHoles(row, rep.holes - 1); const closed = Math.hypot(row[0][0] - row[row.length - 1][0], row[0][1] - row[row.length - 1][1]) < 0.01; return closed ? hs.slice(0, -1) : hs; });
    for (const l of layers) {
      const mine = placed.map((h) => ({ pt: [h.pt[0] - l.ox, h.pt[1] - l.oy] as Pt, t: h.t })).filter((h) => pointInContour(h.pt, l.part.outer) && distToContour(h.pt, l.part.outer) >= inset);
      this.put(l.part, mine, label);
    }
    rep.parts.push(...layers.map((l) => l.part.id));
    return rep;
  }

  /** Hardware mounting holes in a part (cut in every mode: they are punched or cut either way). */
  mount(kind: HwKind, part: GenPart, at: Pt, angle = 0, note = "", width = 20, count = true) {
    const hs = mountHoles(kind, at, angle, this.hw, width);
    if (this.s.mode === "manual") for (const h of hs) (part.score ??= []).push([...h, h[0]]);
    else part.holes.push(...hs);
    const r = footprint(kind, this.hw, width);
    if (r > 0) { const l = this.fittings.get(part.id) ?? []; l.push({ pt: at, r, kind }); this.fittings.set(part.id, l); }
    for (const h of hs) { const xs = h.map((q) => q[0]), ys = h.map((q) => q[1]); this.rec(part, { pt: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2], r: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2, what: `${kind} mount` }); }
    if (count) this.count(kind, 1, note);
  }

  /** A plain round hole punched or cut (belt holes, a lacing hole), recorded for the checks. */
  punch(part: GenPart, at: Pt, d: number, what: string) {
    const c = circle(at[0], at[1], d / 2, 0.03);
    if (this.s.mode === "manual") (part.score ??= []).push([...c, c[0]]);
    else part.holes.push(c);
    this.rec(part, { pt: at, r: d / 2, what });
  }

  /** Counts hardware for the bill of materials without cutting anything. */
  count(kind: HwKind, qty: number, note = "") {
    const key = `${kind}|${note}`;
    const l = this.hardware.get(key);
    if (l) l.qty += qty;
    else this.hardware.set(key, { kind, qty, note });
  }

  /** A scored circle where something is glued or set, for placement only. */
  markCircle(part: GenPart, at: Pt, r: number) { const c = circle(at[0], at[1], r, 0.1); (part.score ??= []).push([...c, c[0]]); }

  /** A fold line, scored. */
  fold(part: GenPart, a: Pt, b: Pt) { (part.score ??= []).push([a, b]); }

  get thread(): number { return this.seams.reduce((k, s) => k + s.thread, 0); }
  get stitchLength(): number { return this.seams.reduce((k, s) => k + s.lengths[0] * s.rows, 0); }
}

/** A placement matrix (row-major 3 × 4) from a part's (u, v, through) to the plan, from its axes and origin. */
export function frame(U: [number, number, number], V: [number, number, number], O: [number, number, number]): number[] {
  const N: [number, number, number] = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
  return [U[0], V[0], N[0], O[0], U[1], V[1], N[1], O[1], U[2], V[2], N[2], O[2]];
}

/** Lays a part flat on the ground at (x, y): for straps and small pieces shown beside the product. */
export const flatAt = (x: number, y: number, z = 0) => ({ x, y, z });

export type { Contour };
