/**
 * Strips longer than the bed (a big bag's gusset or wrapped body) are cut in two parts that overlap
 * by 20 mm and are stitched across with two rows before the bag is assembled. The split goes near
 * the middle, moved along until no fitting, zip slot or other large cut-out falls in the overlap.
 * Every stitch hole in the overlap is cut in both parts, since the seams there go through both.
 */
import { bboxOf } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { clipToRect } from "./boxbag";
import type { Pattern } from "./kit";
import { rect } from "../geom";

const OV = 20;

function clipLine(pl: Contour, x0: number, x1: number): Contour[] {
  const out: Contour[] = [];
  let cur: Pt[] = [];
  const inside = (q: Pt) => q[0] >= x0 && q[0] <= x1;
  const cross = (a: Pt, b: Pt, x: number): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1e-9)];
  for (let i = 0; i < pl.length; i++) {
    const q = pl[i];
    if (i > 0) {
      const a = pl[i - 1];
      if (inside(a) !== inside(q)) {
        const x = (inside(a) ? (q[0] > x1 ? x1 : x0) : (a[0] > x1 ? x1 : x0));
        const c = cross(a, q, x);
        if (inside(a)) { cur.push(c); out.push(cur); cur = []; } else cur = [c];
      }
    }
    if (inside(q)) cur.push(q);
  }
  if (cur.length > 1) out.push(cur);
  return out.filter((c) => c.length > 1);
}

const within = (c: Contour, x0: number, x1: number) => { const b = bboxOf([c]); return b.x0 >= x0 - 1e-6 && b.x1 <= x1 + 1e-6; };
const shift = (c: Contour, d: number): Contour => c.map(([x, y]) => [x - d, y] as Pt);

export function splitLong(pat: Pattern, maxLen: number, maxShort: number) {
  for (const part of [...pat.parts]) {
    const b = bboxOf([part.outer]), L = b.x1 - b.x0, H = b.y1 - b.y0;
    if (L <= maxLen || H > maxShort || L + OV > 2 * maxLen) continue;
    const fits = pat.fittings.get(part.id) ?? [];
    const big = part.holes.filter((h) => { const q = bboxOf([h]); return q.x1 - q.x0 > 6 && q.y1 - q.y0 > 6 || q.x1 - q.x0 > 12 || q.y1 - q.y0 > 12; });
    const ok = (c: number) => c + OV / 2 - b.x0 <= maxLen && b.x1 - (c - OV / 2) <= maxLen
      && !fits.some((f) => Math.abs(f.pt[0] - c) < OV / 2 + f.r + 2)
      && !big.some((h) => { const q = bboxOf([h]); return q.x1 > c - OV / 2 - 2 && q.x0 < c + OV / 2 + 2; });
    const mid0 = (b.x0 + b.x1) / 2;
    let mid = NaN;
    for (let d = 0; d < L / 3 && Number.isNaN(mid); d += 1) for (const c of [mid0 + d, mid0 - d]) if (ok(c)) { mid = c; break; }
    if (Number.isNaN(mid)) continue;
    const a0 = b.x0 - 1, a1 = mid + OV / 2, b0 = mid - OV / 2, b1 = b.x1 + 1, sh = b0;
    const A: GenPart = { ...part, name: `${part.name} (part 1)`, outer: clipToRect(part.outer, rect(a0, b.y0 - 1, a1 - a0, H + 2)) };
    const B: GenPart = { ...part, id: `${part.id}-2`, name: `${part.name} (part 2)`, outer: shift(clipToRect(part.outer, rect(b0, b.y0 - 1, b1 - b0, H + 2)), sh) };
    const keep = Math.max(pat.s.edge * 0.5, pat.s.hole + 0.8);
    A.holes = part.holes.filter((h) => within(h, a0, a1 - keep));
    B.holes = part.holes.filter((h) => within(h, b0 + keep, b1)).map((h) => shift(h, sh));
    A.score = (part.score ?? []).flatMap((s) => clipLine(s, a0, a1));
    B.score = (part.score ?? []).flatMap((s) => clipLine(s, b0, b1)).map((s) => shift(s, sh));
    if (part.engrave) { A.engrave = part.engrave.filter((h) => within(h, a0, a1)); B.engrave = part.engrave.filter((h) => within(h, b0, b1)).map((h) => shift(h, sh)); }
    if (part.cuts) { A.cuts = part.cuts.flatMap((s) => clipLine(s, a0, a1)); B.cuts = part.cuts.flatMap((s) => clipLine(s, b0, b1)).map((s) => shift(s, sh)); }
    if (part.views3d) {
      const cx = (v: { outer: Contour }) => { const q = bboxOf([v.outer]); return (q.x0 + q.x1) / 2; };
      A.views3d = part.views3d.filter((v) => cx(v) < mid);
      B.views3d = part.views3d.filter((v) => cx(v) >= mid).map((v) => {
        const m = v.place.m;
        // moving the outline by -sh in u moves the origin by +sh along the frame's u axis
        const m2 = m ? [m[0], m[1], m[2], m[3] + m[0] * sh, m[4], m[5], m[6], m[7] + m[4] * sh, m[8], m[9], m[10], m[11] + m[8] * sh] : m;
        return { ...v, outer: shift(v.outer, sh), place: { ...v.place, ...(m2 ? { m: m2 } : {}) } };
      });
    }
    if (part.place?.m) { const m = part.place.m; B.place = { ...part.place, m: [m[0], m[1], m[2], m[3] + m[0] * sh, m[4], m[5], m[6], m[7] + m[4] * sh, m[8], m[9], m[10], m[11] + m[8] * sh] }; }
    // the checks' records
    const recs = pat.holes.get(part.id) ?? [];
    pat.holes.set(A.id, recs.filter((r) => r.pt[0] + r.r <= a1 - keep));
    pat.holes.set(B.id, recs.filter((r) => r.pt[0] - r.r >= b0 + keep).map((r) => ({ ...r, pt: [r.pt[0] - sh, r.pt[1]] as Pt })));
    pat.fittings.set(A.id, fits.filter((f) => f.pt[0] <= a1));
    pat.fittings.set(B.id, fits.filter((f) => f.pt[0] >= b0).map((f) => ({ ...f, pt: [f.pt[0] - sh, f.pt[1]] as Pt })));
    const i = pat.parts.indexOf(part);
    pat.parts.splice(i, 1, A, B);
    for (const s of pat.seams) { const k = s.parts.indexOf(part.id); if (k >= 0) s.parts.splice(k + 1, 0, B.id); }
    // the joint: two rows across the overlap, through both parts
    const e = pat.s.edge, v0 = b.y0 + e + pat.s.pitch, v1 = b.y1 - e - pat.s.pitch;
    for (const xr of [mid - OV / 4, mid + OV / 4]) {
      // break each row where another line of holes crosses it
      const blocked = recs.filter((r) => Math.abs(r.pt[0] - xr) < pat.s.pitch * 1.2 && r.pt[1] > v0 && r.pt[1] < v1).map((r) => r.pt[1]).sort((a, c) => a - c);
      let from = v0;
      for (const v of [...blocked, Infinity]) {
        const to = Math.min(v1, v - pat.s.pitch * 1.5);
        if (to - from >= 2 * pat.s.pitch) pat.seam(`${part.name} joint`, [{ part: A, rows: [[[xr, from], [xr, to]]] }, { part: B, rows: [[[xr - sh, from], [xr - sh, to]]] }], { ticks: false });
        from = Math.max(from, v + pat.s.pitch * 1.5);
        if (from >= v1) break;
      }
    }
    pat.steps.unshift(`${part.name} is longer than the bed, so it is cut in two parts: overlap them by ${OV} mm at the joint, glue, and stitch the two rows across first.`);
  }
}

/** Turns a matrix's frame a quarter turn: new (x', y') = (y, xm - x). */
const turnM = (m: number[], xm: number) => [m[1], -m[0], m[2], m[3] + m[0] * xm, m[5], -m[4], m[6], m[7] + m[4] * xm, m[9], -m[8], m[10], m[11] + m[8] * xm];

/**
 * Parts taller than the bed's short side that fit it lying down (a back panel that runs on into a
 * flap) are turned a quarter turn in their own frame, with their 3D placement turned to match.
 */
export function turnTall(pat: Pattern, maxShort: number, maxLen: number) {
  for (const part of pat.parts) {
    const b = bboxOf([part.outer]), w = b.x1 - b.x0, h = b.y1 - b.y0;
    if (h <= maxShort || w > maxShort || h > maxLen) continue;
    const xm = b.x1;
    const T = (c: Contour): Contour => c.map(([x, y]) => [y, xm - x] as Pt);
    part.outer = T(part.outer);
    part.holes = part.holes.map(T);
    if (part.score) part.score = part.score.map(T);
    if (part.cuts) part.cuts = part.cuts.map(T);
    if (part.engrave) part.engrave = part.engrave.map(T);
    if (part.place?.m) part.place = { ...part.place, m: turnM(part.place.m, xm) };
    if (part.views3d) part.views3d = part.views3d.map((v) => ({ ...v, outer: T(v.outer), holes: v.holes.map(T), ...(v.score ? { score: v.score.map(T) } : {}), place: v.place.m ? { ...v.place, m: turnM(v.place.m, xm) } : v.place }));
    const recs = pat.holes.get(part.id);
    if (recs) pat.holes.set(part.id, recs.map((r) => ({ ...r, pt: [r.pt[1], xm - r.pt[0]] as Pt, ...(r.t ? { t: [r.t[1], -r.t[0]] as Pt } : {}) })));
    const fits = pat.fittings.get(part.id);
    if (fits) pat.fittings.set(part.id, fits.map((f) => ({ ...f, pt: [f.pt[1], xm - f.pt[0]] as Pt })));
  }
}
