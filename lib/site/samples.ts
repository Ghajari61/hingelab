/**
 * Real boxes for the landing page, built with the same engine as the editor (no mock artwork).
 */
import { clone, computeModel, DEFAULTS, layerContent, layoutParts, type LayerContent, type Model, type Params } from "@/lib/hinge";
import { canUsePattern, canUseShape } from "@/lib/plans";

export type Sheet = { model: Model; params: Params; width: number; height: number; content: LayerContent };

export function sheetFor(p: Params): Sheet | null {
  const m = computeModel(p);
  if ("error" in m) return null;
  const lay = layoutParts(m.parts, p.bedW, p.gap);
  return { model: m, params: p, width: lay.width, height: lay.height, content: layerContent(m, lay, p) };
}

export { HERO_HEIGHT, HERO_SHAPES, HERO_WIDTH, type HeroShape } from "./hero";
import type { HeroShape } from "./hero";

/** The hero's mini generator: one shape and two sizes, everything else from the defaults. */
export function heroParams(shape: HeroShape, W: number, H: number): Params {
  const D = Math.round(W * 0.64);
  return {
    ...clone(DEFAULTS),
    shape,
    W,
    D,
    H,
    R: shape === "pill" ? D / 2 : Math.min(DEFAULTS.R, D / 2 - 6),
    dia: Math.round(W * 0.7),
    sides: 6,
    labels: false,
  };
}

export type Sample = { title: string; note: string; params: Params };

export const GALLERY: Sample[] = [
  {
    title: "Tea caddy",
    note: "Rounded box with a lift-off lid, Straight hinge, 3 mm birch.",
    params: { ...clone(DEFAULTS), W: 120, D: 80, H: 95, R: 22, labels: false },
  },
  {
    title: "Pencil pot",
    note: "Open cylinder with a Serpentine hinge that bends all the way round.",
    params: { ...clone(DEFAULTS), shape: "cyl", dia: 80, H: 100, lid: "open", pattern: "serpentine", slit: 30, labels: false },
  },
  {
    title: "Hexagon gift box",
    note: "Six sides, Relief hinge with round stress holes, removable lid.",
    params: { ...clone(DEFAULTS), shape: "poly", sides: 6, W: 110, H: 60, R: 16, pattern: "relief", labels: false },
  },
  {
    title: "Pill tin",
    note: "Stadium shape with a Wave hinge that hides the slits.",
    params: { ...clone(DEFAULTS), shape: "pill", W: 160, D: 70, R: 35, H: 45, pattern: "wave", slit: 18, labels: false },
  },
];

export function isProSample(p: Params): boolean {
  return !canUseShape("free", p.shape) || !canUsePattern("free", p.pattern);
}
