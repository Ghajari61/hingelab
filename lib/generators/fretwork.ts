/**
 * Fretwork: decorative patterns cut through a panel (lattice, floral rosettes, Moroccan quatrefoils,
 * honeycomb and more), as on a pierced jewellery box or lantern. Every hole is a closed shape kept
 * whole inside the region, so bars of at least `bar` mm stay between holes and round the edge;
 * shapes that would cross the region's edge or a kept area (a label, a knob) are left out.
 */
import { differenceShapes, intersectShapes, makeShape, offsetShapes, shapeContours, signedArea, unionShapes } from "@/lib/letters/polygon";
import { circle, regularPolygon } from "./geom";
import { motif } from "./motifs";
import type { Contour, Pt } from "./types";

export type FretKind = "none" | "lattice" | "floral" | "quatrefoil" | "honeycomb" | "circles" | "stars" | "leaves" | "motif";

export const FRET_NAMES: Record<FretKind, string> = {
  none: "None", lattice: "Diamond lattice", floral: "Floral rosettes", quatrefoil: "Moroccan quatrefoil",
  honeycomb: "Honeycomb", circles: "Circles", stars: "Stars", leaves: "Woven leaves",
  motif: "A motif (yours or from the library)",
};
export const FRET_KINDS = Object.keys(FRET_NAMES) as FretKind[];
export const isFretKind = (v: unknown): v is FretKind => typeof v === "string" && v in FRET_NAMES && v !== "none";

export interface FretSpec {
  kind: FretKind;
  /** Pattern repeat, mm. */
  cell: number;
  /** Narrowest wood left between holes, mm. */
  bar: number;
  /** The tile for `kind: "motif"`: outlines centred on (0, 0) with their larger side 100. */
  unit?: Contour[];
}

/** An axis-aligned area to keep solid. */
export interface KeepOut { x0: number; y0: number; x1: number; y1: number }

const poly = (n: number, f: (a: number) => [number, number]): Contour => Array.from({ length: n }, (_, i) => f((2 * Math.PI * i) / n));
const at = (c: Contour, x: number, y: number): Contour => c.map(([u, v]) => [u + x, v + y] as Pt);
const turned = (c: Contour, a: number): Contour => { const s = Math.sin(a), k = Math.cos(a); return c.map(([u, v]) => [u * k - v * s, u * s + v * k] as Pt); };

/** A lens (two circular arcs) `L` long and `w` wide, along x. */
function lens(L: number, w: number): Contour {
  const R = (L * L / 4 + w * w / 4) / w, a = Math.asin(L / 2 / R), out: Contour = [];
  for (let i = 0; i <= 16; i++) { const t = -a + (2 * a * i) / 16; out.push([R * Math.sin(t), R * Math.cos(t) - (R - w / 2)]); }
  for (let i = 0; i <= 16; i++) { const t = a - (2 * a * i) / 16; out.push([R * Math.sin(t), -(R * Math.cos(t) - (R - w / 2))]); }
  return out.slice(0, -1);
}

/** Centres on a square or hexagon-packed grid covering the region, and the shapes at each (kept or dropped together). */
function tiles(kind: FretKind, cell: number, bar: number, x0: number, y0: number, x1: number, y1: number, unit?: Contour[]): Contour[][] {
  const out: Contour[][] = [];
  const hexGrid = kind === "floral" || kind === "honeycomb" || kind === "circles" || kind === "stars" || kind === "motif";
  // A rosette is two cells across, so its petals stay wide enough to cut.
  const dx = kind === "floral" ? 2 * cell : cell, dy = hexGrid ? dx * Math.sqrt(3) / 2 : dx;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const nx = Math.ceil((x1 - x0) / dx / 2) + 1, ny = Math.ceil((y1 - y0) / dy / 2) + 1;
  for (let j = -ny; j <= ny; j++) {
    for (let i = -nx; i <= nx; i++) {
      const odd = Math.abs(j) % 2 === 1;
      const x = cx + i * dx + (hexGrid && odd ? dx / 2 : 0), y = cy + j * dy;
      out.push(shapeAt(kind, dx, bar, x, y, (i + j) % 2 === 0, unit));
    }
  }
  if (kind === "lattice") {
    // The checkerboard's other diamonds, between the grid points.
    for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) out.push(shapeAt(kind, cell, bar, cx + (i + 0.5) * dx, cy + (j + 0.5) * dy, true));
  }
  return out;
}

function shapeAt(kind: FretKind, cell: number, bar: number, x: number, y: number, even: boolean, unit?: Contour[]): Contour[] {
  switch (kind) {
    case "motif": {
      // The motif fills the cell less a bar across, and the row pitch (hexagonal rows, 0.866 cell) less
      // a bar down; each outline is a hole (islands inside it would fall out).
      if (!unit?.length) return [];
      let w = 0, h = 0;
      for (const c of unit) for (const [u, v] of c) { w = Math.max(w, Math.abs(u) * 2); h = Math.max(h, Math.abs(v) * 2); }
      const s = Math.min((cell - bar) / Math.max(w, 1e-6), (cell * Math.sqrt(3) / 2 - bar) / Math.max(h, 1e-6));
      return s * Math.max(w, h) > 1.5 ? unit.map((c) => c.map(([u, v]) => [x + u * s, y + v * s] as Pt)) : [];
    }
    case "lattice": {
      const h = (cell - bar * Math.SQRT2) / 2;
      return h > 0.6 ? [[[x, y - h], [x + h, y], [x, y + h], [x - h, y]]] : [];
    }
    case "circles": { const r = (cell - bar) / 2; return r > 0.6 ? [circle(x, y, r)] : []; }
    case "honeycomb": {
      // Flat-sided hexagons whose sides face their neighbours across a bar.
      const ri = (cell - bar) / 2, ro = ri / Math.cos(Math.PI / 6);
      return ri > 0.6 ? [regularPolygon(6, ro, 0, x, y)] : [];
    }
    case "stars": {
      const R = (cell - bar) / 2, r = R * 0.48;
      return R > 1 ? [at(poly(12, (a) => { const k = Math.round(a / (Math.PI / 6)) % 2 ? r : R; return [k * Math.sin(a), -k * Math.cos(a)]; }), x, y)] : [];
    }
    case "quatrefoil": {
      const R = (cell - bar) / 2;
      return R > 1 ? [at(poly(64, (a) => { const k = R * (0.8 + 0.2 * Math.cos(4 * a)); return [k * Math.cos(a), k * Math.sin(a)]; }), x, y)] : [];
    }
    case "floral": {
      // Six petals round a centre; bars between petals and between rosettes.
      // Petal tips stay a bar apart at the centre, and petals a bar apart side by side.
      const rr = (cell - bar) / 2, d = rr * 0.6, a = Math.min(rr * 0.38, d - 1.6 * bar), b = Math.min(rr * 0.16, Math.max(0, (d - bar) / 2) * 0.8);
      if (b < 0.5 || a < 1) return [];
      const petal = poly(28, (t) => [a * Math.cos(t), b * Math.sin(t)]);
      return Array.from({ length: 6 }, (_, k) => { const ang = (Math.PI / 3) * k; return at(turned(petal, ang), x + d * Math.cos(ang), y + d * Math.sin(ang)); });
    }
    case "leaves": {
      const L = (cell - bar) / 0.69, w = L * 0.38;
      if (w < 1) return [];
      const l = lens(L, w);
      return [at(even ? l : turned(l, Math.PI / 2), x, y)];
    }
    default: return [];
  }
}

/**
 * The pattern's holes in the rectangle x0..x1 × y0..y1, kept `bar` mm clear of its edges and of
 * every keep-out area; `inside` can reject points too (a curved outline). With `clip` (a window
 * such as a star, or any area: outlines and their holes) the pattern is cut to it, a bar inside its
 * edges and a bar clear of the keep-outs, so tiles are trimmed round a knob or a slot instead of
 * dropped and the window's shape reads even a few repeats across; pieces too small or too thin to
 * cut are dropped.
 */
export function fretHoles(spec: FretSpec, x0: number, y0: number, x1: number, y1: number, keep: KeepOut[] = [], inside?: (q: Pt) => boolean, clip?: Contour | Contour[]): Contour[] {
  if (spec.kind === "none" || !(spec.cell > 0) || x1 - x0 < spec.cell * 0.6 || y1 - y0 < spec.cell * 0.6) return [];
  const bar = Math.max(0.5, spec.bar), cell = Math.max(spec.cell, bar * 2.5);
  const ok = (q: Pt) => q[0] >= x0 + bar && q[0] <= x1 - bar && q[1] >= y0 + bar && q[1] <= y1 - bar
    && !keep.some((k) => q[0] > k.x0 - bar && q[0] < k.x1 + bar && q[1] > k.y0 - bar && q[1] < k.y1 + bar)
    && (!inside || inside(q));
  // A motif without its own tile repeats the library heart.
  const unit = spec.kind === "motif" && !spec.unit?.length ? motif("heart", 100) : spec.unit;
  const groups = tiles(spec.kind, cell, bar, x0, y0, x1, y1, unit);
  if (!clip) return groups.filter((g) => g.length && g.every((c) => c.every(ok))).flat();
  const region = typeof clip[0]?.[0] === "number" ? [clip as Contour] : (clip as Contour[]);
  let area = unionShapes(region, [], true);
  if (keep.length && area.length) area = differenceShapes(shapeContours(area), keep.map((k) => [[k.x0, k.y0], [k.x1, k.y0], [k.x1, k.y1], [k.x0, k.y1]] as Contour));
  const win = shapeContours(offsetShapes(area, -bar));
  if (!win.length) return [];
  const within = (q: Pt) => q[0] >= x0 + bar && q[0] <= x1 - bar && q[1] >= y0 + bar && q[1] <= y1 - bar && (!inside || inside(q));
  const minArea = Math.max(2 * bar * bar, 0.04 * cell * cell);
  const out: Contour[] = [];
  for (const g of groups) for (const c of g) {
    // A sliver at the window's edge would burn away: keep pieces with some body (or half their hole).
    const least = Math.min(minArea, 0.5 * Math.abs(signedArea(c)));
    for (const s of intersectShapes([c], win)) {
      if (Math.abs(signedArea(s.outer)) < least || !s.outer.every(within)) continue;
      if (!offsetShapes([makeShape(s.outer, [])], -bar * 0.3).length) continue;
      out.push(s.outer);
    }
  }
  return out;
}

/** A small picture of a pattern for a picker, in a 40 mm square. */
export function fretSample(kind: FretKind): Contour[] {
  return fretHoles({ kind, cell: 12, bar: 2 }, 0, 0, 40, 40);
}
