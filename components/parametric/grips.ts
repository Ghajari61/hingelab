import type { ParametricParams } from "@/lib/parametric";
import { AXIS_NAMES, clampStep, lenText, sizeGrips, type Grip, type GripAxis } from "@/lib/three/grips";

const AXIS_INDEX: Record<GripAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/**
 * The source model's 3D handles: a face scales it (its set size, or its scale), a ring turns it
 * about that axis. The model's axes are the 3D views' (y up).
 */
export function parametricGrips(p: ParametricParams, edit: (f: (q: ParametricParams) => void, record: boolean) => void, units: "mm" | "in"): Grip[] {
  const t = p.sourceSettings.transform, target = p.sourceSettings.targetSize;
  const out = sizeGrips(["x", "z", "y"], (axis, ext, d, done) => {
    const s = Math.max(0.05, (ext + d) / Math.max(1, ext));
    edit((q) => {
      if (q.sourceSettings.targetSize && target) q.sourceSettings.targetSize.value = clampStep(target.value * s, 10, 3000, 0.1);
      else q.sourceSettings.transform.uniformScale = clampStep(t.uniformScale * s, 0.01, 100, 0.001);
    }, done);
    return `${AXIS_NAMES[axis]} ${lenText(ext * s, units)}`;
  });
  for (const axis of ["x", "y", "z"] as GripAxis[]) {
    const i = AXIS_INDEX[axis], r0 = t.rotation[i];
    out.push({
      id: `turn-${axis}`, kind: "turn", axis,
      start: () => (d, done) => {
        const r = Math.max(-360, Math.min(360, Math.round(r0 + d)));
        edit((q) => { q.sourceSettings.transform.rotation[i] = r; }, done);
        return `Turn ${axis.toUpperCase()} ${r}°`;
      },
    });
  }
  return out;
}
