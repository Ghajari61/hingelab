/**
 * Picking a material for a design: its thickness and kerf, a separate Y kerf when the material has
 * one, the narrowest feature it holds and (Hinge Box) the stiffness of what it bends like. A
 * built-in material clears what only a measured one has.
 */
import type { Params } from "@/lib/hinge/types";
import type { GenBase } from "@/lib/generators/types";
import type { MaterialInfo } from "./library";

const differs = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) > 1e-9;

export function hingeWithMaterial(p: Params, id: string, m: MaterialInfo | null): Params {
  const next: Params = { ...p, material: id };
  delete next.Ky;
  delete next.gamma;
  delete next.minFeature;
  if (!m) return next;
  if (m.T != null) next.T = m.T;
  if (m.kx != null) next.K = m.kx;
  if (differs(m.kx, m.ky)) next.Ky = m.ky!;
  if (m.user) next.gamma = m.gamma;
  if (m.minFeature > 0) next.minFeature = m.minFeature;
  return next;
}

export function genWithMaterial<P extends GenBase>(p: P, id: string, m: MaterialInfo | null): P {
  const sheet = { ...(p.sheet ?? {}) } as NonNullable<GenBase["sheet"]>;
  const next = { ...p, material: id, sheet };
  sheet.kerfXY = false;
  sheet.minFeature = 0;
  if (!m) return next;
  if (m.T != null) next.T = m.T;
  if (m.kx != null) next.K = m.kx;
  if (differs(m.kx, m.ky)) { sheet.kerfXY = true; sheet.kerfY = m.ky!; }
  sheet.minFeature = m.minFeature;
  return next;
}
