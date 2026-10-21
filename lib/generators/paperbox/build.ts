/**
 * The paper box engine's dieline as the shell's parts: the outline and holes cut, slits and
 * perforations (as dashes) on the inner-cut layer, creases and half cuts on the score layer.
 */
import { cleanParams, getBoxStyle, type Dieline, type DielinePart, type Pt } from "@/lib/paperbox";
import { apply, assembled, foldFrames, markFolds, piece, tucked } from "@/lib/paperbox/fold";
import type { BuildContext, Contour, GenOutput, GenPart } from "../types";
import { decorate } from "./decorate";
import type { PaperBoxParams } from "./params";

export type PaperBoxOutput = GenOutput & { info?: { warnings: string[]; outer: [number, number, number]; inner: [number, number, number]; style: string } };

const inside = (q: Pt, poly: Pt[]) => {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
};
const middle = (c: Pt[]): Pt => [c.reduce((a, q) => a + q[0], 0) / c.length, c.reduce((a, q) => a + q[1], 0) / c.length];

const area = (c: Pt[]) => Math.abs(c.reduce((a, q, i) => { const r = c[(i + 1) % c.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;

/** A polyline in a repeating dash pattern: on, off, on, off... lengths, mm. */
export function dashPattern(pts: Pt[], pattern: number[]): Contour[] {
  const out: Contour[] = [];
  let k = 0, on = true, left = pattern[0], cur: Contour = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (d > 1e-9) {
      const s = Math.min(left, d), t = s / d;
      const q: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (on) cur.push(q);
      d -= s; left -= s; a = q;
      if (left <= 1e-9) {
        if (on && cur.length > 1) out.push(cur);
        k = (k + 1) % pattern.length; on = k % 2 === 0; left = pattern[k]; cur = [q];
      }
    }
  }
  if (on && cur.length > 1) out.push(cur);
  return out;
}

/** Distance from q to the segment a-b. */
const segDist = (q: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
};
/** A crease's middle on the face or on its edge. */
const onFace = (c: Pt[], poly: Pt[]) => {
  const m = middle(c);
  return inside(m, poly) || poly.some((q, i) => segDist(m, q, poly[(i + 1) % poly.length]) < 0.6);
};

/** A polyline as cut dashes `cut` long with `gap` between. */
export function dashes(pts: Pt[], cut: number, gap: number): Contour[] {
  const out: Contour[] = [];
  let on = true, left = cut, cur: Contour = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (d > 1e-9) {
      const s = Math.min(left, d), k = s / d;
      const q: Pt = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      if (on) cur.push(q);
      d -= s; left -= s; a = q;
      if (left <= 1e-9) {
        if (on && cur.length > 1) out.push(cur);
        on = !on; left = on ? cut : gap; cur = [q];
      }
    }
  }
  if (on && cur.length > 1) out.push(cur);
  return out;
}

export function toParts(d: Dieline, p: PaperBoxParams): GenPart[] {
  let x = 0;
  // In 3D the box is shown folded: each face its own piece, turned about its creases, with its
  // place at every fold amount (the fold slider) and where it goes when the view explodes.
  const folded = assembled(d.parts, d.poses, p.T);
  const frames = foldFrames(d.parts, d.poses, p.T);
  const free = d.parts.filter((q) => !d.poses?.some((o) => o.part === q.id));
  const apartOf = (dp: DielinePart): [number, number, number] => {
    const pose = d.poses?.find((o) => o.part === dp.id);
    if (pose) return pose.top !== undefined || pose.flip ? [0, 0, d.outer[2] * 0.8 + 30] : [d.outer[0] + 30, 0, 0];
    const i = free.indexOf(dp);
    return [(i - (free.length - 1) / 2) * 30, 0, 0];
  };
  return d.parts.map((dp: DielinePart) => {
    const closed = dp.paths.filter((q) => q.type === "cut" && q.closed);
    const outer = closed.reduce((a, b) => (area(b.pts) > area(a.pts) ? b : a), closed[0]);
    const xs = outer.pts.map((q) => q[0]), w = Math.max(...xs) - Math.min(...xs);
    const part: GenPart = {
      id: dp.id, name: dp.name,
      outer: outer.pts,
      holes: closed.filter((q) => q !== outer).map((q) => q.pts),
      cuts: [
        ...dp.paths.filter((q) => q.type === "cut" && !q.closed).map((q) => q.pts),
        ...dp.paths.filter((q) => q.type === "perforation").flatMap((q) => dashes(q.pts, Math.max(0.3, p.lines.perfCut), Math.max(0.3, p.lines.perfGap))),
      ],
      score: dp.paths.filter((q) => q.type === "crease" || q.type === "halfCut").flatMap((q) => (q.fold === "mountain" && p.lines.mountain === "dashdot" ? dashPattern(q.pts, [4, 1.5, 0.8, 1.5]) : [q.pts])),
      ...(dp.paths.some((q) => q.type === "engrave") ? { engrave: dp.paths.filter((q) => q.type === "engrave").map((q) => q.pts) } : {}),
      place: { x, y: 0, z: 0 },
    };
    const holes = part.holes, engrave = part.engrave ?? [];
    const creases = dp.paths.filter((q) => q.type === "crease");
    const mine = folded.map((f, i) => ({ ...f, i })).filter((f) => f.part === dp && !tucked(f.face));
    const apart = apartOf(dp);
    // Faces drift out from the box's middle as the view explodes.
    const mid = (face: (typeof mine)[number]) => { const c = middle(face.face.poly); return apply(face.m, [c[0], c[1], 0]); };
    const C = mine.length ? mine.map(mid).reduce((s, q) => [s[0] + q[0] / mine.length, s[1] + q[1] / mine.length, s[2] + q[2] / mine.length], [0, 0, 0]) : [0, 0, 0];
    part.views3d = dp.surface ? dp.surface.map((P) => { const q = piece(P); return { outer: q.outer, holes: [], place: { x: 0, y: 0, z: 0, m: q.m }, soft: true, apart }; }) : mine.map((f) => {
      const { face, m } = f;
      const own = (c: Pt[]) => inside(middle(c), face.poly);
      const e = engrave.filter(own);
      const c = mid(f), dir = [c[0] - C[0], c[1] - C[1], c[2] - C[2]], l = Math.hypot(...dir) || 1;
      const lines = creases.filter((q) => onFace(q.pts, face.poly)).map((q) => ({ pts: q.pts, mountain: q.fold === "mountain" }));
      return {
        outer: face.poly, holes: holes.filter(own), ...(e.length ? { engrave: e } : {}), place: { x: 0, y: 0, z: 0, m },
        frames: frames[f.i],
        apart: [apart[0] + (dir[0] / l) * 15, apart[1] + (dir[1] / l) * 15, apart[2] + (dir[2] / l) * 15] as [number, number, number],
        ...(lines.length ? { creases: lines } : {}),
      };
    });
    x += w + 20;
    return part;
  });
}

/** Builds the chosen style with the shell's board thickness. */
export function buildPaperBox(p: PaperBoxParams, ctx?: BuildContext): PaperBoxOutput {
  const style = getBoxStyle(p.style);
  if (!style) return { parts: [], stats: [], error: `Unknown box style "${p.style}".` };
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the board thickness." };
  const d = markFolds(style.build(cleanParams(style, { ...p.styles[style.id], paper: "custom", thickness: p.T })));
  const r = (v: number) => Math.round(v * 10) / 10;
  const extra = decorate(d, p.window, p.pattern, p.T, ctx);
  return {
    parts: toParts(d, p),
    stats: [
      { label: "Outside", value: `${d.outer.map(r).join(" × ")} mm` },
      { label: "Inside", value: `${d.inner.map(r).join(" × ")} mm` },
      { label: "Pieces", value: String(d.parts.length) },
      ...extra,
    ],
    assembly: d.assembly,
    info: { warnings: d.warnings, outer: d.outer, inner: d.inner, style: style.id },
  };
}
