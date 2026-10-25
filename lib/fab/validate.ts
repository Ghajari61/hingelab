/**
 * Geometry checks on what is actually cut, shared by every product through the fabrication model:
 * paths that cannot close, outlines that cross themselves, lines cut twice, empty shapes, specks of
 * segments, very heavy parts, holes outside their part, pieces that drop out, narrow bridges, parts
 * that overlap or leave their sheet, and parts in a machine's keep-out regions. Each issue names its
 * parts and where it is (layout mm, every sheet stacked) so the canvas can frame it.
 */
import { differenceShapes, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { KeepOut } from "@/lib/materials/machines";
import { polyArea, type FabModel, type FabPart } from "./model";

type Pt = [number, number];
type Contour = Pt[];
export interface Box { x0: number; y0: number; x1: number; y1: number }

export type Severity = "blocking" | "warning" | "note";
export type FabCode =
  | "OPEN_PATH" | "SELF_INTERSECT" | "DUPLICATE_CUT" | "ZERO_AREA" | "SHORT_SEGMENTS" | "TOO_MANY_VERTICES"
  | "HOLE_OUTSIDE" | "LOOSE_ISLAND" | "NARROW" | "OVERLAP" | "OFF_SHEET" | "KEEP_OUT";

export interface FabIssue {
  code: FabCode;
  severity: Severity;
  message: string;
  /** Parts it is about (ids shared by a part's copies). */
  partIds: string[];
  /** Where the first case is, layout mm. */
  at?: Box;
  /** How many cases were found. */
  count: number;
}

export interface ValidateOptions {
  /** Narrowest bar the material holds, mm (0 or missing: not checked here). */
  minFeature?: number;
  /** Regions of the machine's bed that must stay clear, mm from each sheet's corner. */
  keepOut?: KeepOut[];
  /** Vertices one part may have before it is called heavy. */
  maxVertices?: number;
}

/** Segments shorter than this are repeated points, mm (polygon offsets leave 0.001 mm arc steps, which are fine). */
export const SPECK = 0.0001;
/** A self-crossing loop smaller than this across is a polygon offset's rounding twist, too small to cut, mm. */
const TWIST = 0.02;
/** Closed shapes smaller than this are empty, mm². */
export const EMPTY_AREA = 0.01;
/** Two lines closer than this are one on top of the other, mm; overlaps shorter than MIN_SHARED are ignored. */
const TOL = 0.02, MIN_SHARED = 0.5;
/** Lines cut twice for less than this in all are a note, not a warning, mm. */
const MINOR_SHARED = 2;
const MAX_VERTICES = 50_000;
const MAX_NARROW_PARTS = 150;

const SEVERITY: Record<FabCode, Severity> = {
  OPEN_PATH: "blocking", OVERLAP: "blocking", OFF_SHEET: "blocking", KEEP_OUT: "blocking",
  SELF_INTERSECT: "warning", DUPLICATE_CUT: "warning", ZERO_AREA: "warning", TOO_MANY_VERTICES: "warning", HOLE_OUTSIDE: "warning", NARROW: "warning",
  SHORT_SEGMENTS: "note", LOOSE_ISLAND: "note",
};

const around = ([x, y]: Pt, r = 2): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
const move = (b: Box, dx: number, dy: number): Box => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });
const overlaps = (a: Box, b: Box, e = 0) => a.x0 < b.x1 - e && a.x1 > b.x0 + e && a.y0 < b.y1 - e && a.y1 > b.y0 + e;
const boxOfPts = (c: Contour): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
};

/** Even-odd: is p inside the region these closed contours bound? */
export function insideRegion(p: Pt, cs: Contour[]): boolean {
  let n = 0;
  for (const c of cs) {
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const [xi, yi] = c[i], [xj, yj] = c[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) n++;
    }
  }
  return n % 2 === 1;
}

const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** Where two segments properly cross (each strictly through the other), or null. Touching does not count. */
function crossing(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), cd = Math.hypot(d[0] - c[0], d[1] - c[1]);
  const e1 = 1e-9 * cd, e2 = 1e-9 * ab;
  if (!((d1 > e1 && d2 < -e1) || (d1 < -e1 && d2 > e1))) return null;
  if (!((d3 > e2 && d4 < -e2) || (d3 < -e2 && d4 > e2))) return null;
  const t = d1 / (d1 - d2);
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Segments of closed contours, bucketed on a grid for crossing tests. */
class SegGrid {
  private cells = new Map<string, number[]>();
  readonly segs: { a: Pt; b: Pt; c: number; i: number; n: number }[] = [];
  constructor(private size: number) {}
  private keys(a: Pt, b: Pt): string[] {
    const s = this.size;
    const i0 = Math.floor(Math.min(a[0], b[0]) / s), i1 = Math.floor(Math.max(a[0], b[0]) / s);
    const j0 = Math.floor(Math.min(a[1], b[1]) / s), j1 = Math.floor(Math.max(a[1], b[1]) / s);
    const out: string[] = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(`${i},${j}`);
    return out;
  }
  add(c: Contour, ci: number) {
    const n = c.length;
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % n];
      const k = this.segs.push({ a, b, c: ci, i, n }) - 1;
      for (const key of this.keys(a, b)) { const l = this.cells.get(key); if (l) l.push(k); else this.cells.set(key, [k]); }
    }
  }
  /** The first crossing between two segments `pair` accepts (and `keep` keeps), or null. */
  first(pair: (s: SegGrid["segs"][number], t: SegGrid["segs"][number]) => boolean, keep: (s: SegGrid["segs"][number], t: SegGrid["segs"][number]) => boolean = () => true): Pt | null {
    for (const list of this.cells.values()) {
      for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
        const s = this.segs[list[x]], t = this.segs[list[y]];
        if (!pair(s, t)) continue;
        const hit = crossing(s.a, s.b, t.a, t.b);
        if (hit && keep(s, t)) return hit;
      }
    }
    return null;
  }
  /** Crossings of a segment with any stored one. */
  hits(a: Pt, b: Pt): boolean {
    for (const key of this.keys(a, b)) for (const k of this.cells.get(key) ?? []) if (crossing(a, b, this.segs[k].a, this.segs[k].b)) return true;
    return false;
  }
}

const gridSize = (cs: Contour[]) => {
  let n = 0;
  const b = cs.reduce<Box>((acc, c) => { n += c.length; const q = boxOfPts(c); return { x0: Math.min(acc.x0, q.x0), y0: Math.min(acc.y0, q.y0), x1: Math.max(acc.x1, q.x1), y1: Math.max(acc.y1, q.y1) }; }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  return Math.max(0.5, Math.sqrt(((b.x1 - b.x0) * (b.y1 - b.y0)) / Math.max(1, n)) * 2);
};

/** Where a closed contour crosses itself (non-neighbouring edges), or null. */
export function selfCrossing(c: Contour): Pt | null {
  if (c.length < 4) return null;
  const g = new SegGrid(gridSize([c]));
  g.add(c, 0);
  return g.first((s, t) => { const d = Math.abs(s.i - t.i); return d > 1 && d !== s.n - 1; }, (s, t) => {
    // The smaller of the two loops the crossing makes: a rounding twist when it is tiny.
    const [i, j] = s.i < t.i ? [s.i, t.i] : [t.i, s.i], n = c.length;
    const loop = j - i <= n - (j - i) ? c.slice(i + 1, j + 1) : [...c.slice(j + 1), ...c.slice(0, i + 1)];
    const b = boxOfPts(loop);
    return Math.max(b.x1 - b.x0, b.y1 - b.y0) >= TWIST;
  });
}

interface Line { a: Pt; b: Pt; owner: number; theta: number; rho: number; s0: number; s1: number }
const ANGLE_STEP = 0.01, BUCKETS = Math.round(Math.PI / ANGLE_STEP);

/**
 * Pairs of contours with lines on top of each other (the laser cuts there twice), as owner pairs with
 * the shared length and a point on it. Lines are bucketed by direction and distance from the origin,
 * so only near-parallel, near-collinear segments are compared.
 */
export function sharedLines(contours: { c: Contour; closed: boolean }[], tol = TOL): { a: number; b: number; len: number; at: Pt }[] {
  const buckets = new Map<string, Line[]>(), lines: Line[] = [];
  contours.forEach(({ c, closed }, owner) => {
    const n = closed ? c.length : c.length - 1;
    for (let i = 0; i < n; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      dx /= len; dy /= len;
      if (dy < 0 || (dy === 0 && dx < 0)) { dx = -dx; dy = -dy; }
      let theta = Math.atan2(dy, dx);
      if (Math.round(theta / ANGLE_STEP) >= BUCKETS) { dx = -dx; dy = -dy; theta -= Math.PI; }
      const rho = a[0] * -dy + a[1] * dx;
      const sa = a[0] * dx + a[1] * dy, sb = b[0] * dx + b[1] * dy;
      const l: Line = { a, b, owner, theta, rho, s0: Math.min(sa, sb), s1: Math.max(sa, sb) };
      lines.push(l);
      const key = `${Math.round(theta / ANGLE_STEP)}|${Math.round(rho / (tol * 2))}`;
      const list = buckets.get(key);
      if (list) list.push(l); else buckets.set(key, [l]);
    }
  });
  const shared = new Map<string, { len: number; at: Pt }>();
  for (const s of lines) {
    const ti = Math.round(s.theta / ANGLE_STEP), ri = Math.round(s.rho / (tol * 2));
    const dx = Math.cos(s.theta), dy = Math.sin(s.theta);
    const dist = (p: Pt) => Math.abs(p[0] * -dy + p[1] * dx - s.rho);
    for (let dt = -1; dt <= 1; dt++) {
      let t = ti + dt, flip = false;
      if (t < 0) { t += BUCKETS; flip = true; } else if (t >= BUCKETS) { t -= BUCKETS; flip = true; }
      for (let dr = -1; dr <= 1; dr++) {
        for (const q of buckets.get(`${t}|${(flip ? -ri : ri) + dr}`) ?? []) {
          if (q.owner <= s.owner) continue;
          if (dist(q.a) > tol || dist(q.b) > tol) continue;
          const qa = q.a[0] * dx + q.a[1] * dy, qb = q.b[0] * dx + q.b[1] * dy;
          const lo = Math.max(s.s0, Math.min(qa, qb)), hi = Math.min(s.s1, Math.max(qa, qb));
          if (hi - lo <= tol) continue;
          const key = `${s.owner}|${q.owner}`, m = (lo + hi) / 2, r = shared.get(key);
          const at: Pt = [m * dx - s.rho * dy, m * dy + s.rho * dx];
          if (r) r.len += hi - lo; else shared.set(key, { len: hi - lo, at });
        }
      }
    }
  }
  return [...shared].filter(([, v]) => v.len >= MIN_SHARED).map(([k, v]) => { const [a, b] = k.split("|").map(Number); return { a, b, len: v.len, at: v.at }; });
}

/** Specks: segments shorter than SPECK (repeated points). */
export const specks = (c: Contour, closed: boolean) => {
  let n = 0;
  const m = closed ? c.length : c.length - 1;
  for (let i = 0; i < m; i++) { const a = c[i], b = c[(i + 1) % c.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < SPECK) n++; }
  return n;
};

/** Does opening the part by w (in by w/2, out again) remove a piece larger than w²: a bar, tab or spike narrower than w? */
export function narrowAt(outline: Contour[], inner: Contour[], w: number): Pt | null {
  const shape = unionShapes([...outline, ...inner], [], true);
  const opened = offsetShapes(offsetShapes(shape, -w / 2), w / 2);
  const lost = differenceShapes(shapeContours(shape), shapeContours(opened)).filter((s) => s.area > w * w);
  return lost.length ? lost[0].outer[0] : null;
}

interface Found { parts: Set<string>; names: Set<string>; at?: Box; count: number; len: number }

export function validateFab(m: FabModel, o: ValidateOptions = {}): FabIssue[] {
  const found = new Map<FabCode, Found>();
  const note = (code: FabCode, pt: FabPart, at?: Box, n = 1, len = 0) => {
    const f = found.get(code) ?? { parts: new Set(), names: new Set(), count: 0, len: 0 };
    f.parts.add(pt.id); f.names.add(pt.name); f.count += n; f.len += len;
    f.at ??= at;
    found.set(code, f);
  };
  const seen = new Set<string>();
  const maxV = o.maxVertices ?? MAX_VERTICES;
  let narrowChecked = 0;

  for (const pt of m.parts) {
    const ops = pt.ops;
    // The geometry of a part is the same on every copy: check it once.
    if (!ops || seen.has(pt.id)) continue;
    seen.add(pt.id);
    const abs = (p: Pt): Pt => [p[0] + pt.ox, p[1] + pt.oy];
    const closed = [...ops.outline, ...ops.inner];
    let vertices = 0;
    for (const c of closed) {
      vertices += c.length;
      if (c.length < 3) { note("OPEN_PATH", pt, c.length ? around(abs(c[0])) : move(pt.box, pt.ox, pt.oy)); continue; }
      // A figure of eight can have no signed area: it crosses itself, it is not empty.
      const x = c.length <= maxV ? selfCrossing(c) : null;
      if (x) note("SELF_INTERSECT", pt, around(abs(x)));
      else if (Math.abs(polyArea(c)) < EMPTY_AREA) { note("ZERO_AREA", pt, around(abs(c[0]))); continue; }
      const sp = specks(c, true);
      if (sp) note("SHORT_SEGMENTS", pt, around(abs(c[0])), sp);
    }
    for (const c of ops.cuts) { vertices += c.length; const sp = specks(c, false); if (sp) note("SHORT_SEGMENTS", pt, around(abs(c[0])), sp); }
    if (vertices > maxV) note("TOO_MANY_VERTICES", pt, move(pt.box, pt.ox, pt.oy));
    // A hole's edge lies in material: inside an odd number of the part's other closed contours.
    for (const h of ops.inner) if (h.length >= 3 && !insideRegion(h[0], closed.filter((c) => c !== h))) note("HOLE_OUTSIDE", pt, around(abs(h[0])));
    for (const c of ops.outline.slice(1)) if (c.length >= 3 && ops.inner.some((h) => h.length >= 3 && insideRegion(c[0], [h]))) note("LOOSE_ISLAND", pt, around(abs(c[0])));
    if (o.minFeature && o.minFeature > 0 && narrowChecked++ < MAX_NARROW_PARTS) {
      const at = narrowAt(ops.outline, ops.inner, o.minFeature);
      if (at) note("NARROW", pt, around(abs(at), Math.max(2, o.minFeature)));
    }
  }

  // Placement: every copy on its sheet.
  for (const s of m.sheets) {
    const on = m.parts.filter((p) => p.sheet === s.index);
    const sheetBox: Box = { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h };
    const boxes = on.map((p) => move(p.box, p.ox, p.oy));
    on.forEach((p, i) => {
      const b = boxes[i];
      // A part larger than its sheet is the sheet check's (TOO_BIG); this is a part placed off it.
      if (!s.oversize && p.w <= s.w + 0.01 && p.h <= s.h + 0.01 && (b.x0 < sheetBox.x0 - 0.01 || b.y0 < sheetBox.y0 - 0.01 || b.x1 > sheetBox.x1 + 0.01 || b.y1 > sheetBox.y1 + 0.01)) note("OFF_SHEET", p, b);
      for (const k of o.keepOut ?? []) {
        const kb: Box = { x0: s.x + k.x, y0: s.y + k.y, x1: s.x + k.x + k.w, y1: s.y + k.y + k.h };
        if (overlaps(b, kb)) note("KEEP_OUT", p, kb);
      }
    });
    // Overlaps: parts whose boxes meet, then their material (even-odd of every closed contour, so a
    // part nested in another's hole is fine).
    const order = on.map((_, i) => i).sort((a, c) => boxes[a].x0 - boxes[c].x0);
    for (let x = 0; x < order.length; x++) {
      const i = order[x], A = on[i];
      if (!A.ops) continue;
      for (let y = x + 1; y < order.length; y++) {
        const j = order[y], B = on[j];
        if (boxes[j].x0 >= boxes[i].x1) break;
        if (!B.ops || !overlaps(boxes[i], boxes[j], 0.01)) continue;
        const at = partsOverlap(A, B);
        if (at) { note("OVERLAP", A, around(at)); note("OVERLAP", B, undefined, 0); }
      }
    }
    // Lines cut twice, across every part on the sheet.
    const cs: { c: Contour; closed: boolean; part: FabPart }[] = [];
    for (const p of on) if (p.ops) {
      const mv = (c: Contour) => c.map(([x, y]) => [x + p.ox, y + p.oy] as Pt);
      for (const c of [...p.ops.outline, ...p.ops.inner]) cs.push({ c: mv(c), closed: true, part: p });
      for (const c of p.ops.cuts) cs.push({ c: mv(c), closed: false, part: p });
    }
    for (const d of sharedLines(cs)) { note("DUPLICATE_CUT", cs[d.a].part, around(d.at), 1, d.len); if (cs[d.b].part !== cs[d.a].part) note("DUPLICATE_CUT", cs[d.b].part, undefined, 0); }
  }

  const out: FabIssue[] = [];
  for (const [code, f] of found) out.push({ code, severity: code === "DUPLICATE_CUT" && f.len < MINOR_SHARED ? "note" : SEVERITY[code], message: message(code, f, o), partIds: [...f.parts], ...(f.at ? { at: f.at } : {}), count: f.count });
  const rank = { blocking: 0, warning: 1, note: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** A point where two placed parts' material overlaps, or null. */
function partsOverlap(A: FabPart, B: FabPart): Pt | null {
  const mv = (p: FabPart) => [...p.ops!.outline, ...p.ops!.inner].map((c) => c.map(([x, y]) => [x + p.ox, y + p.oy] as Pt));
  const a = mv(A), b = mv(B);
  const g = new SegGrid(gridSize(b));
  b.forEach((c, i) => g.add(c, i));
  for (const c of a) for (let i = 0; i < c.length; i++) {
    const p = c[i], q = c[(i + 1) % c.length];
    if (g.hits(p, q)) return p;
  }
  for (const c of a) if (c.length && insideRegion(c[0], b)) return c[0];
  for (const c of b) if (c.length && insideRegion(c[0], a)) return c[0];
  return null;
}

function message(code: FabCode, f: Found, o: ValidateOptions): string {
  const names = [...f.names];
  const who = names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
  const n = f.count, s = n === 1 ? "" : "s";
  switch (code) {
    case "OPEN_PATH": return `${n} cut outline${s} with fewer than three corners cannot close (${who}).`;
    case "SELF_INTERSECT": return `${n} outline${s} cross${n === 1 ? "es" : ""} itself, so the inside and the kerf are unclear (${who}).`;
    case "DUPLICATE_CUT": return `${Math.round(f.len * 10) / 10} mm of lines lie on top of each other and are cut twice${f.len < MINOR_SHARED ? "" : ", scorching the edge"} (${who}).`;
    case "ZERO_AREA": return `${n} closed shape${s} enclose${n === 1 ? "s" : ""} no area: the laser traces a line for nothing (${who}).`;
    case "SHORT_SEGMENTS": return `${n} repeated point${s} (segments under ${SPECK} mm) slow the machine down (${who}).`;
    case "TOO_MANY_VERTICES": return `Very detailed parts (over ${(o.maxVertices ?? MAX_VERTICES).toLocaleString("en")} points each) slow LightBurn and the controller (${who}).`;
    case "HOLE_OUTSIDE": return `${n} inner cut${s} lie${n === 1 ? "s" : ""} outside ${n === 1 ? "its" : "their"} part (${who}).`;
    case "LOOSE_ISLAND": return `${n} piece${s} sit${n === 1 ? "s" : ""} inside a hole of ${n === 1 ? "its" : "their"} part and will drop out: glue ${n === 1 ? "it" : "them"} in or add a bridge (${who}).`;
    case "NARROW": return `Features narrower than the ${o.minFeature} mm your material holds may break or burn away (${who}).`;
    case "OVERLAP": return `Parts overlap on the sheet, so cutting one spoils the other (${who}).`;
    case "OFF_SHEET": return `Parts run past the sheet's edge (${who}).`;
    case "KEEP_OUT": return `Parts sit in a keep-out region of your machine's bed (${who}).`;
  }
}
