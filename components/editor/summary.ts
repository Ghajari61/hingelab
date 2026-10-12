import type { Model, Params } from "@/lib/hinge";
import { fmtLen, type Units } from "./format";

/** Outside size of a Hinge Box, e.g. "140 mm × 90 mm × 70 mm". */
export function hingeSize(p: Params, units: Units): string {
  return p.shape === "cyl"
    ? `Ø${fmtLen(p.dia, units)} × ${fmtLen(p.H, units)}`
    : `${fmtLen(p.W, units)} × ${p.shape === "poly" ? p.sides + " sides" : fmtLen(p.D, units)} × ${fmtLen(p.H, units)}`;
}

export function shapeKind(p: Params): string {
  return ({ rect: "Rounded box", pill: "Pill box", poly: `${p.sides}-sided box`, cyl: "Cylinder" })[p.shape];
}

export interface HingeMeta { title: string; kind: string; dims: string; pat: string }

/**
 * Header texts for the menubar and the Dimensions and Hinge Pattern sections. Everything follows
 * the current settings, also while they do not build; only the slit count needs a model, so it
 * keeps the last one until the box builds again.
 */
export function hingeMeta(p: Params, model: Model | null, prev: HingeMeta | null, units: Units): HingeMeta {
  return {
    title: p.name,
    kind: shapeKind(p),
    dims: hingeSize(p, units),
    pat: model ? `${model.analysis.columns} slits` : prev?.pat ?? "",
  };
}
