import { AXIS_NAMES, lenText, numberGrip, sizeGrips, type Grip, type GripAxis, type GripKind } from "@/lib/three/grips";
import { getPath, setPath } from "./path";
import type { AnyGenerator, GenBase, NumberSpec } from "./types";

/** A number setting a 3D handle drags: size handles sit on both faces (only the top for y). */
export interface GripSpec {
  kind: GripKind;
  axis: GripAxis;
  key: string;
  /** Setting change per mm (or degree) dragged. */
  k?: number;
  /** Size: the far face only. */
  one?: boolean;
}

const dims = (d: string, depth = true): GripSpec[] => [
  { kind: "size", axis: "x", key: `${d}.width` },
  ...(depth ? [{ kind: "size" as const, axis: "z" as const, key: `${d}.depth` }] : []),
  { kind: "size", axis: "y", key: `${d}.height` },
];

/** Designs whose handles set their own settings; the rest are sized as a whole with `scale`. */
const SPECS: Record<string, (p: GenBase & Record<string, unknown>) => GripSpec[]> = {
  boxes: (p) => {
    switch (p.design as string) {
      case "hex": return [{ kind: "size", axis: "x", key: "hex.width" }, { kind: "size", axis: "z", key: "hex.width" }, { kind: "size", axis: "y", key: "hex.height" }];
      case "sign": return dims("sign", false);
      case "frame": return [{ kind: "size", axis: "x", key: "frame.photoW" }, { kind: "size", axis: "y", key: "frame.photoH" }];
      case "stand": return [...dims("stand", false), { kind: "turn", axis: "x", key: "stand.angle" }];
      case "keys": return [...dims("keys", false), { kind: "size", axis: "z", key: "keys.reach", one: true }];
      default: return dims(p.design as string);
    }
  },
};

export function numberField(def: AnyGenerator, key: string): NumberSpec<unknown> | undefined {
  for (const s of def.sections) for (const f of s.fields) if (f.kind === "number" && f.key === key) return f as NumberSpec<unknown>;
  return undefined;
}

/**
 * A generator's 3D handles. `size` is the assembled design's size (x, y, z) in mm: designs sized as a
 * whole get no handle along an axis thinner than a few sheets (a flat clock is not made thicker).
 */
export function generatorGrips<P extends GenBase>(def: AnyGenerator, p: P, set: (p: P, record: boolean) => void, units: "mm" | "in", size: [number, number, number] | null): Grip[] {
  const spec = SPECS[def.id];
  if (spec) {
    const out: Grip[] = [];
    for (const g of spec(p as never)) {
      const f = numberField(def, g.key), v0 = getPath(p, g.key);
      if (!f || typeof v0 !== "number") continue;
      const show = (v: number) => `${f.label} ${f.unit === "mm" ? lenText(v, units) : f.unit === "deg" ? `${v}°` : v}`;
      const sides = g.kind !== "size" || g.one || g.axis === "y" ? [1 as const] : [1 as const, -1 as const];
      for (const side of sides) {
        out.push(numberGrip(`${g.kind}-${g.axis}${side > 0 ? "+" : "-"}-${g.key}`, g.kind, g.axis, {
          v0, min: f.min, max: f.max, step: f.step, k: g.k, side,
          set: (v, done) => set(setPath(p, g.key, v), done),
          show,
        }));
      }
    }
    return out;
  }
  if (!def.scale || !size) return [];
  const axes = (["x", "z", "y"] as GripAxis[]).filter((a) => size["xyz".indexOf(a)] > 4 * p.T);
  return sizeGrips(axes, (axis, ext, d, done) => {
    const s = Math.max(0.2, Math.min(5, (ext + d) / Math.max(1, ext)));
    set(s === 1 ? p : def.scale!(p, s), done);
    return `${AXIS_NAMES[axis]} ${lenText(ext * s, units)}`;
  });
}
