import type { Params } from "../hinge";
import { lenText, numberGrip, type Grip, type GripAxis } from "../three/grips";

export type HingeSizeKey = "W" | "D" | "H" | "dia";

/** Smallest sizes, as the editor's fields allow. */
const MIN: Record<HingeSizeKey, number> = { W: 10, D: 10, H: 10, dia: 20 };

/**
 * The Hinge Box's 3D handles: a side face sets the width (or the diameter, or the size across a
 * polygon), the front or back the depth, the top the height. Whichever part is selected, they sit
 * on the whole box. `setKey` writes the one setting a drag changes.
 */
export function hingeGrips(p: Params, setKey: (key: HingeSizeKey, v: number, done: boolean) => void, units: "mm" | "in"): Grip[] {
  const key = (axis: GripAxis): HingeSizeKey =>
    axis === "y" ? "H" : p.shape === "cyl" ? "dia" : axis === "z" && (p.shape === "rect" || p.shape === "pill") ? "D" : "W";
  const label = (k: HingeSizeKey) => (k === "dia" ? "Diameter" : k === "H" ? "Height" : k === "D" ? "Depth" : p.shape === "poly" ? "Across" : "Width");
  const out: Grip[] = [];
  for (const axis of ["x", "z", "y"] as GripAxis[]) {
    const k = key(axis);
    for (const side of axis === "y" ? [1 as const] : [1 as const, -1 as const]) {
      out.push(numberGrip(`size-${axis}${side > 0 ? "+" : "-"}`, "size", axis, {
        v0: p[k], min: MIN[k], max: 5000, step: 0.1, side,
        set: (v, done) => setKey(k, v, done),
        show: (v) => `${label(k)} ${lenText(v, units)}`,
      }));
    }
  }
  return out;
}
