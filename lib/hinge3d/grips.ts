import type { Params } from "../hinge";
import { lenText, mmSetting, type GripAxis, type GripSet } from "../three/grips";

export type HingeSizeKey = "W" | "D" | "H" | "dia";

/** Smallest sizes, as the editor's fields allow. */
const MIN: Record<HingeSizeKey, number> = { W: 10, D: 10, H: 10, dia: 20 };

/**
 * The Hinge Box's scale gizmo: X sets the width (or the diameter, or the size across a polygon), Z
 * the depth, Y the height; a diameter or a polygon's size grows on X and Z together. Whichever part
 * is selected, it sizes the whole box. `write` gets the changed settings when a drag ends.
 */
export function hingeGrips(p: Params, write: (patch: Partial<Record<HingeSizeKey, number>>) => void, units: "mm" | "in"): GripSet {
  const key = (axis: GripAxis): HingeSizeKey =>
    axis === "y" ? "H" : p.shape === "cyl" ? "dia" : axis === "z" && (p.shape === "rect" || p.shape === "pill") ? "D" : "W";
  const label = (k: HingeSizeKey) => (k === "dia" ? "Diameter" : k === "H" ? "Height" : k === "D" ? "Depth" : p.shape === "poly" ? "Across" : "Width");
  const axes = new Map<HingeSizeKey, GripAxis[]>();
  for (const a of ["x", "z", "y"] as GripAxis[]) axes.set(key(a), [...(axes.get(key(a)) ?? []), a]);
  return {
    size: {
      settings: [...axes].map(([k, on]) => mmSetting(k, on, { v0: p[k], min: MIN[k], max: 5000, step: 0.1 }, (v) => `${label(k)} ${lenText(v, units)}`)),
      write: (values) => write(values as Partial<Record<HingeSizeKey, number>>),
    },
  };
}
