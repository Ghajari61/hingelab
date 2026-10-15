import { AXIS_NAMES, clampStep, lenText, numberGrip, sizeGrips, type Grip } from "@/lib/three/grips";
import type { LetterParams } from "./types";

/**
 * The letters' 3D handles: a side or front face scales the text (its size follows the drag), the top
 * sets a box's depth.
 */
export function letterGrips(p: LetterParams, set: (p: LetterParams, record: boolean) => void, units: "mm" | "in"): Grip[] {
  const out = sizeGrips(["x", "z"], (axis, ext, d, done) => {
    const size = clampStep((p.size * (ext + d)) / Math.max(1, ext), 5, 2000, 0.1);
    set({ ...p, size }, done);
    return `${AXIS_NAMES[axis]} ${lenText((ext * size) / p.size, units)} · size ${lenText(size, units)}`;
  });
  if (p.mode === "box") {
    out.push(numberGrip("size-y+", "size", "y", { v0: p.depth, min: 10, max: 600, step: 0.1, set: (depth, done) => set({ ...p, depth }, done), show: (v) => `Depth ${lenText(v, units)}` }));
  }
  return out;
}
