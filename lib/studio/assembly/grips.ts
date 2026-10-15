import { lenText, type Grip, type GripAxis } from "@/lib/three/grips";

type V3 = [number, number, number];

/** World axes of the 3D views (y up, z to the front) as the assembly's (z up, y to the back): index and sign. */
const ASM_AXIS: Record<GripAxis, [0 | 1 | 2, 1 | -1]> = { x: [0, 1], y: [2, 1], z: [1, -1] };

let drags = 0;

/**
 * Handles on a selected part: arrows move it, rings turn it in quarter turns. `set` is given a tag
 * that is the same for every edit of one drag, so a drag is one undo step.
 */
export function assemblyGrips(move: V3, turn: V3, set: (patch: { move?: V3; turn?: V3 }, drag: string) => void, units: "mm" | "in"): Grip[] {
  const out: Grip[] = [];
  for (const axis of ["x", "y", "z"] as GripAxis[]) {
    const [i, sign] = ASM_AXIS[axis];
    out.push({
      id: `move-${axis}`, kind: "move", axis, part: true,
      start: () => {
        const tag = `asm-grip-${++drags}`;
        return (d) => {
          const m = [...move] as V3;
          m[i] = Math.round((move[i] + sign * d) * 10) / 10;
          set({ move: m }, tag);
          return `Move ${axis.toUpperCase()} ${d >= 0 ? "+" : "−"}${lenText(Math.abs(d), units)}`;
        };
      },
    });
    out.push({
      id: `turn-${axis}`, kind: "turn", axis, part: true,
      start: () => {
        const tag = `asm-grip-${++drags}`;
        return (d) => {
          const q = Math.round(d / 90) * 90;
          const t = [...turn] as V3;
          t[i] = (((turn[i] + sign * q) % 360) + 360) % 360;
          set({ turn: t }, tag);
          return `Turn ${axis.toUpperCase()} ${q}°`;
        };
      },
    });
  }
  return out;
}
