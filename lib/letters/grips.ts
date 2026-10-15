import { lenText, mmSetting, ratioSetting, type GripSet, type SizeSetting } from "@/lib/three/grips";
import type { LetterParams } from "./types";

/**
 * The letters' scale gizmo: X and Z scale the text (its size grows with them), Y sets a letter box's
 * depth.
 */
export function letterGrips(p: LetterParams, set: (p: LetterParams, record: boolean) => void, units: "mm" | "in"): GripSet {
  const settings: SizeSetting[] = [ratioSetting("size", ["x", "z"], { v0: p.size, min: 5, max: 2000, step: 0.1 }, (v) => `Size ${lenText(v, units)}`)];
  if (p.mode === "box") settings.push(mmSetting("depth", ["y"], { v0: p.depth, min: 10, max: 600, step: 0.1 }, (v) => `Depth ${lenText(v, units)}`));
  return { size: { settings, write: (values) => set({ ...p, ...values }, true) } };
}
