import type { Params } from "@/lib/hinge";
import { lenText, numberGrip, type Grip, type GripAxis } from "@/lib/three/grips";

/** Smallest sizes, as the editor's fields allow. */
const MIN = { W: 10, D: 10, H: 10, dia: 20 };

/**
 * The Hinge Box's 3D handles: a side face sets the width (or the diameter, or the size across a
 * polygon), the front or back the depth, the top the height. Whichever part is selected, they sit
 * on the whole box.
 */
export function hingeGrips(p: Params, set: (p: Params, record: boolean) => void, units: "mm" | "in"): Grip[] {
  const key = (axis: GripAxis): "W" | "D" | "H" | "dia" =>
    axis === "y" ? "H" : p.shape === "cyl" ? "dia" : axis === "z" && (p.shape === "rect" || p.shape === "pill") ? "D" : "W";
  const label = (k: "W" | "D" | "H" | "dia") => (k === "dia" ? "Diameter" : k === "H" ? "Height" : k === "D" ? "Depth" : p.shape === "poly" ? "Across" : "Width");
  const out: Grip[] = [];
  for (const axis of ["x", "z", "y"] as GripAxis[]) {
    const k = key(axis);
    for (const side of axis === "y" ? [1 as const] : [1 as const, -1 as const]) {
      out.push(numberGrip(`size-${axis}${side > 0 ? "+" : "-"}`, "size", axis, {
        v0: p[k], min: MIN[k], max: 5000, step: 0.1, side,
        set: (v, done) => set({ ...p, [k]: v }, done),
        show: (v) => `${label(k)} ${lenText(v, units)}`,
      }));
    }
  }
  return out;
}
