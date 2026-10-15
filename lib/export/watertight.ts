/**
 * Cut lines that lie on top of each other (touching parts packed with no gap, a slot on a part's
 * edge, a path that runs back over itself) would be cut twice: the second pass burns the edge and
 * widens the kerf. This finds every stretch of cut line already covered by an earlier one, within
 * EPS, and leaves it out of the later path, so each line is cut once. Paths with nothing shared are
 * left exactly as written.
 */
import { ap, type M, type P } from "./dxf";
import { readScene, type Poly, type Scene, type SceneItem, type SceneLayer } from "./scene";
import { sceneSVG } from "./sheets";

/** Lines closer than this are the same line, mm. */
export const EPS = 0.01;
/** Pieces of line shorter than this are not kept, mm. */
const MIN_PIECE = 0.02;
const ANGLE_STEP = 2e-4;

/** Stroked layers that are cut (not engraved or scored). */
export const isCutLayer = (l: SceneLayer) => !l.fill && !/engrave|score|label|mark|made with|picture|guide/i.test(l.label);

/** A segment from a to b on the line at angle th (direction u, turned to point right) and offset d. */
interface Line { a: P; b: P; u: P; th: number; d: number; ta: number; tb: number; t0: number; t1: number }

const r4 = (v: number) => Math.round(v * 10000) / 10000;

function lineOf(a: P, b: P): Line | null {
  let ux = b[0] - a[0], uy = b[1] - a[1];
  const len = Math.hypot(ux, uy);
  if (len < 1e-9) return null;
  ux /= len; uy /= len;
  if (ux < 0 || (ux === 0 && uy < 0)) { ux = -ux; uy = -uy; }
  const ta = ux * a[0] + uy * a[1], tb = ux * b[0] + uy * b[1];
  return { a, b, u: [ux, uy], th: Math.atan2(uy, ux), d: -uy * a[0] + ux * a[1], ta, tb, t0: Math.min(ta, tb), t1: Math.max(ta, tb) };
}

/** Earlier lines by direction and offset, with their extent. */
class Covered {
  private m = new Map<string, Line[]>();
  private keys(th: number, d: number): string[] {
    const out: string[] = [];
    const kt = Math.round(th / ANGLE_STEP), kd = Math.round(d / EPS);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(`${kt + i}:${kd + j}`);
    // Nearly vertical lines may have been turned the other way round.
    if (Math.abs(th) > Math.PI / 2 - 4 * ANGLE_STEP) {
      const ft = Math.round((th > 0 ? th - Math.PI : th + Math.PI) / ANGLE_STEP), fd = Math.round(-d / EPS);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(`${ft + i}:${fd + j}`);
    }
    return out;
  }
  add(l: Line) {
    const k = `${Math.round(l.th / ANGLE_STEP)}:${Math.round(l.d / EPS)}`;
    const list = this.m.get(k);
    if (list) list.push(l); else this.m.set(k, [l]);
  }
  /** Stretches of `l` (in its own t) that earlier lines cover, sorted. */
  over(l: Line): [number, number][] {
    const out: [number, number][] = [];
    const seen = new Set<Line>();
    for (const k of this.keys(l.th, l.d)) for (const q of this.m.get(k) ?? []) {
      if (seen.has(q)) continue;
      seen.add(q);
      // Both of q's end points must lie on l (within EPS).
      const off = (p: P) => Math.abs(-l.u[1] * p[0] + l.u[0] * p[1] - l.d);
      if (off(q.a) > EPS || off(q.b) > EPS) continue;
      const s0 = l.u[0] * q.a[0] + l.u[1] * q.a[1], s1 = l.u[0] * q.b[0] + l.u[1] * q.b[1];
      const a = Math.max(l.t0, Math.min(s0, s1)), b = Math.min(l.t1, Math.max(s0, s1));
      if (b - a > EPS) out.push([a, b]);
    }
    return out.sort((x, y) => x[0] - y[0]);
  }
}

/** [t0, t1] without the covered stretches; null when nothing is covered. */
function keep(t0: number, t1: number, cov: [number, number][]): [number, number][] | null {
  if (!cov.length) return null;
  const out: [number, number][] = [];
  let at = t0;
  for (const [a, b] of cov) {
    if (a - at >= MIN_PIECE) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (t1 - at >= MIN_PIECE) out.push([at, t1]);
  return out;
}

/** A path's straight runs after leaving out what is covered; null when it keeps everything. */
function trim(poly: Poly, cov: Covered, register: boolean): Poly[] | null {
  const pts = poly.pts;
  const n = pts.length;
  const segs: [P, P][] = [];
  for (let i = 0; i + 1 < n; i++) segs.push([pts[i], pts[i + 1]]);
  if (poly.closed && n > 2 && Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) > 1e-9) segs.push([pts[n - 1], pts[0]]);
  let changed = false;
  const pieces: [P, P][] = [];
  const mine: Line[] = [];
  for (const [a, b] of segs) {
    const l = lineOf(a, b);
    if (!l) { pieces.push([a, b]); continue; }
    const k = register ? null : keep(l.t0, l.t1, cov.over(l));
    mine.push(l);
    if (!k) { pieces.push([a, b]); continue; }
    changed = true;
    // Kept stretches as points, in the segment's own direction (a to b).
    const at = (t: number): P => { const f = (t - l.ta) / (l.tb - l.ta); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
    const ps = k.map(([s, e]) => (l.ta <= l.tb ? [at(s), at(e)] : [at(e), at(s)]) as [P, P]);
    if (l.ta > l.tb) ps.reverse();
    pieces.push(...ps);
  }
  for (const l of mine) cov.add(l);
  if (!changed) return null;
  // Join pieces that meet into runs.
  const runs: P[][] = [];
  for (const [s, e] of pieces) {
    const last = runs[runs.length - 1];
    const end = last?.[last.length - 1];
    if (end && Math.hypot(end[0] - s[0], end[1] - s[1]) < 1e-6) last.push(e);
    else runs.push([s, e]);
  }
  // A closed path's last run carries on into its first.
  if (poly.closed && runs.length > 1) {
    const first = runs[0], last = runs[runs.length - 1], end = last[last.length - 1];
    if (Math.hypot(end[0] - first[0][0], end[1] - first[0][1]) < 1e-6) { runs[0] = [...last, ...first.slice(1)]; runs.pop(); }
  }
  return runs.filter((r) => r.length > 1).map((r) => ({ pts: r, closed: false }));
}

function invert(m: M): M {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 1, 0, 0];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

const pathOf = (polys: Poly[], back: M) =>
  polys.map((p) => p.pts.map((q, i) => { const [x, y] = ap(back, q); return `${i ? "L" : "M"}${r4(x)} ${r4(y)}`; }).join(" ") + (p.closed ? " Z" : "")).join(" ");

export interface Merged {
  scene: Scene;
  /** Length of cut line left out because an earlier line already cuts it, mm. */
  removed: number;
}

const lengthOf = (polys: Poly[]) => polys.reduce((s, p) => {
  let L = 0;
  for (let i = 0; i + 1 < p.pts.length; i++) L += Math.hypot(p.pts[i + 1][0] - p.pts[i][0], p.pts[i + 1][1] - p.pts[i][1]);
  if (p.closed && p.pts.length > 2) L += Math.hypot(p.pts[0][0] - p.pts[p.pts.length - 1][0], p.pts[0][1] - p.pts[p.pts.length - 1][1]);
  return s + L;
}, 0);

/** The scene with each shared stretch of cut line cut once (by the first path, in cut order). */
export function mergeSharedCuts(scene: Scene): Merged {
  const cov = new Covered();
  const cut = scene.layers.map(isCutLayer);
  // Elements with text or pictures are written as they are: their lines go in first and are kept.
  const fixed = (it: SceneItem) => it.texts.length > 0 || it.images.length > 0;
  scene.layers.forEach((l, i) => { if (cut[i]) for (const it of l.items) if (fixed(it)) for (const p of it.polys) trim(p, cov, true); });
  let removed = 0;
  const layers = scene.layers.map((l, li) => {
    if (!cut[li]) return l;
    const back = invert(l.m ?? [1, 0, 0, 1, 0, 0]);
    let touched = false;
    const items = l.items.map((it) => {
      if (fixed(it)) return it;
      let changed = false;
      const polys = it.polys.flatMap((p) => { const t = trim(p, cov, false); if (!t) return [p]; changed = true; return t; });
      if (!changed) return it;
      touched = true;
      removed += lengthOf(it.polys) - lengthOf(polys);
      return { ...it, polys, raw: polys.length ? `<path d="${pathOf(polys, back)}"/>` : "" };
    });
    return touched ? { ...l, items: items.filter((it) => it.raw) } : l;
  });
  return removed > 0 ? { scene: { ...scene, layers }, removed } : { scene, removed: 0 };
}

/** An editor's SVG with shared cut lines cut once; the same text when nothing is shared. */
export function watertightSVG(svg: string): { svg: string; removed: number } {
  const m = mergeSharedCuts(readScene(svg));
  if (!m.removed) return { svg, removed: 0 };
  const all = { x: 0, y: 0, w: m.scene.W, h: m.scene.H };
  return { svg: sceneSVG(m.scene, [all], { rect: all, sheet: null, mirror: false }), removed: m.removed };
}

export const mergedNote = (removed: number) => `${Math.round(removed)} mm of cut line that touching parts share is cut once, not twice.`;
