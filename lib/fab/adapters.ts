/**
 * FabModel from each product's arranged layout. Generators and Parametric hand over their contours;
 * the Hinge Box and Letters hand over part boxes (their cut paths live in their own exporters).
 */
import type { Arranged } from "@/lib/fit/arrange";
import { placePoint } from "@/lib/generators/place";
import { kerfOf, type CutPart, type GenArranged } from "@/lib/generators/output";
import type { GenBase, GenOutput } from "@/lib/generators/types";
import type { BBox, Model as HingeModel, Params as HingeParams, Part as HingePart } from "@/lib/hinge";
import type { LetterModel, LetterParams, LetterPart } from "@/lib/letters";
import type { ParametricParams, SliceResult } from "@/lib/parametric/types";
import { fabModel, type FabModel } from "./model";

/** The assembled size from the parts' 3D placements (every corner through the thickness), mm. */
export function assembledSize(out: GenOutput, T: number): [number, number, number] | null {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const p of out.parts) {
    const pieces = p.views3d?.length ? p.views3d.map((v) => ({ outer: v.outer, place: v.place })) : p.place ? [{ outer: p.outer, place: p.place }] : [];
    const t = p.t ?? T;
    for (const pc of pieces) for (const [u, v] of pc.outer) for (const h of [0, t]) {
      const q = placePoint(pc.place, u, v, h);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
      any = true;
    }
  }
  return any ? [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] : null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function fabFromGenerator<P extends GenBase>(product: string, p: P, a: GenArranged<P>, materialName?: string): FabModel | null {
  if (!a.lay || "error" in a.result) return null;
  const [kx, ky] = kerfOf(a.params);
  const size = assembledSize(a.result.out, a.params.T);
  return fabModel<CutPart>({
    product, lay: a.lay, sheets: a.sheets, bed: { w: p.bedW, h: p.bedH },
    material: { name: materialName ?? a.result.out.materials?.main ?? `${a.params.T} mm sheet`, T: a.params.T, kx, ky },
    scale: a.fit?.scale ?? 1,
    assembled: size ? (size.map(r1) as [number, number, number]) : null,
    skip: (it) => it.i < 0,
    id: (pt) => pt.src.id, name: (pt) => pt.name,
    stock: (pt) => pt.src.stock ?? pt.tag,
    ops: (pt) => ({ outline: pt.outline, inner: pt.inner, cuts: pt.cuts, score: pt.score, engrave: pt.engrave }),
  });
}

export function fabFromHinge(p: HingeParams, a: Arranged<HingeParams, HingeModel, HingePart>): FabModel | null {
  if (!a.lay || "error" in a.result) return null;
  return fabModel<HingePart>({
    product: "hinge-box", lay: a.lay, sheets: a.sheets, bed: { w: p.bedW, h: p.bedH },
    material: { name: p.material, T: p.T, kx: p.K, ky: p.Ky ?? p.K }, scale: a.fit?.scale ?? 1,
    // The Hinge Box's W, D and H are outside sizes (lib/hinge/standardSizes.ts).
    assembled: a.params.shape === "cyl" ? [r1(a.params.dia), r1(a.params.dia), r1(a.params.H)] : [r1(a.params.W), r1(a.params.shape === "poly" ? a.params.W : a.params.D), r1(a.params.H)],
    id: (pt) => pt.name, name: (pt) => pt.name,
  });
}

export function fabFromLetters(p: LetterParams, a: Arranged<LetterParams, LetterModel, LetterPart>): FabModel | null {
  if (!a.lay || "error" in a.result) return null;
  return fabModel<LetterPart>({
    product: "letters", lay: a.lay, sheets: a.sheets, bed: { w: p.bedW, h: p.bedH },
    material: { name: p.material, T: p.T, kx: p.K, ky: p.K }, scale: a.fit?.scale ?? 1,
    id: (pt) => pt.name, name: (pt) => pt.name,
  });
}

type Pt2 = [number, number];
const placeOn = (c: Pt2[], a: number, x: number, y: number): Pt2[] => {
  const t = (a * Math.PI) / 180, k = Math.cos(t), s = Math.sin(t);
  return c.map(([u, v]) => [k * u - s * v + x, s * u + k * v + y]);
};
const boxOf = (cs: Pt2[][]): BBox => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

/** Parametric results carry their own sheets; each item places its part (cut paths, or the shape) by an angle and an offset. */
export function fabFromParametric(p: ParametricParams, r: SliceResult): FabModel {
  type Item = { bbox: BBox; id: string; name: string; outline: Pt2[][]; inner: Pt2[][]; score: Pt2[][] };
  const items: { pt: Item; i: number; w: number; h: number; ox: number; oy: number }[] = [];
  const rects: { x: number; y: number; w: number; h: number; label: string }[] = [];
  let y = 0;
  r.sheets.forEach((sh, si) => {
    rects.push({ x: 0, y, w: sh.width, h: sh.height, label: `Sheet ${si + 1} of ${r.sheets.length}` });
    for (const it of sh.items) {
      const part = r.parts.find((q) => q.id === it.partId);
      if (!part) continue;
      const pl = (cs: Pt2[][]) => cs.map((c) => placeOn(c, it.angle, it.x, it.y));
      const outline = pl(part.cut?.outline ?? [part.shape.outer, ...part.shape.holes]);
      const inner = pl(part.cut?.inner ?? part.innerCuts);
      const bbox = boxOf(outline);
      // The first outline is the outer; the rest are its holes.
      items.push({ pt: { bbox, id: part.id, name: part.id, outline: outline.slice(0, 1), inner: [...outline.slice(1), ...inner], score: pl(part.score ?? []) }, i: items.length, w: bbox.x1 - bbox.x0, h: bbox.y1 - bbox.y0, ox: 0, oy: y });
    }
    y += sh.height + 30;
  });
  const b = r.bounds;
  return fabModel({
    product: "parametric", lay: { items, width: Math.max(0, ...r.sheets.map((s) => s.width)), height: Math.max(0, y - 30) }, sheets: rects, bed: { w: p.material.sheetW, h: p.material.sheetH },
    material: { name: p.material.id, T: p.material.T, kx: p.material.K, ky: p.material.K },
    assembled: [r1(b.max[0] - b.min[0]), r1(b.max[1] - b.min[1]), r1(b.max[2] - b.min[2])],
    id: (pt) => pt.id, name: (pt) => pt.name,
    ops: (pt) => ({ outline: pt.outline, inner: pt.inner, cuts: [], score: pt.score, engrave: [] }),
  });
}
