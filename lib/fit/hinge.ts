/**
 * Fit adapter for the Hinge Box. With Fit off it returns exactly the classic build and row layout,
 * so exports (and the golden SVGs) are unchanged.
 */
import { computeModel, layoutParts, type ComputeResult, type Model, type Params, type Part } from "@/lib/hinge";
import { arrangeFit, r1, type Arranged } from "./arrange";
import { cleanFit } from "./fitToSheets";

/**
 * Hinge Box at a scale: outer size and corner radius scale; material, hinge lattice and joints
 * stay. The radius never drops below T + 1 mm (the smallest the box accepts) unless it already was.
 */
export function scaleHinge(p: Params, s: number): Params {
  if (s === 1) return p;
  return { ...p, W: r1(p.W * s), D: r1(p.D * s), H: r1(p.H * s), dia: r1(p.dia * s), R: r1(Math.max(p.R * s, Math.min(p.R, p.T + 1))) };
}

export type HingeArranged = Arranged<Params, Model, Part>;

export function arrangeHinge(p: Params): Arranged<Params, Model, Part> {
  const fit = cleanFit(p.fit);
  if (fit.mode === "off") {
    const result: ComputeResult = computeModel(p);
    return { params: p, result, lay: "error" in result ? null : layoutParts(result.parts, p.bedW, p.gap), sheets: null, fit: null };
  }
  return arrangeFit<Params, Model, Part>(fit, { w: p.bedW, h: p.bedH, gap: p.gap }, (s) => {
    const q = scaleHinge(p, s);
    return { params: q, result: computeModel(q) };
  });
}
