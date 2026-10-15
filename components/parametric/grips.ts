import type { ParametricParams } from "@/lib/parametric";
import { lenText, ratioSetting, type Grip, type GripAxis, type GripSet } from "@/lib/three/grips";

const AXIS_INDEX: Record<GripAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/**
 * The source model's 3D handles: the scale gizmo scales it as a whole (its set size, or its scale),
 * a ring turns it about that axis. The model's axes are the 3D views' (y up).
 */
export function parametricGrips(p: ParametricParams, edit: (f: (q: ParametricParams) => void, record: boolean) => void, units: "mm" | "in"): GripSet {
  const t = p.sourceSettings.transform, target = p.sourceSettings.targetSize;
  const size = target
    ? ratioSetting("target", ["x", "y", "z"], { v0: target.value, min: 10, max: 3000, step: 0.1 }, (v) => `Size ${lenText(v, units)}`)
    : ratioSetting("scale", ["x", "y", "z"], { v0: t.uniformScale, min: 0.01, max: 100, step: 0.001 }, (v) => `Scale ${v}×`);
  const grips: Grip[] = [];
  for (const axis of ["x", "y", "z"] as GripAxis[]) {
    const i = AXIS_INDEX[axis], r0 = t.rotation[i];
    grips.push({
      id: `turn-${axis}`, kind: "turn", axis,
      start: () => (d, done) => {
        const r = Math.max(-360, Math.min(360, Math.round(r0 + d)));
        edit((q) => { q.sourceSettings.transform.rotation[i] = r; }, done);
        return `Turn ${axis.toUpperCase()} ${r}°`;
      },
    });
  }
  return {
    size: {
      settings: [size],
      write: ({ target: v, scale }) => edit((q) => {
        if (v !== undefined && q.sourceSettings.targetSize) q.sourceSettings.targetSize.value = v;
        if (scale !== undefined) q.sourceSettings.transform.uniformScale = scale;
      }, true),
    },
    grips,
  };
}
