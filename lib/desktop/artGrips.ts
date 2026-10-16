/**
 * Handles on a selected part of an AI drawing. Every axis scales the whole drawing through its
 * width; the height follows. The thin axis is the sheet thickness, so it has no handle.
 * Relative imports only: the desktop UI bundle does not resolve the `@/` alias.
 */
import { lenText, ratioSetting, type GripSet } from "../three/grips";

const MIN_W = 5;
const MAX_W = 3000;

export function artGrips(
  params: { width?: unknown; T?: unknown },
  change: (key: string, value: unknown, immediate: boolean) => void,
  units: "mm" | "in",
): GripSet | undefined {
  const width = typeof params.width === "number" && params.width > 0 ? params.width : 0;
  if (!width) return undefined;
  const T = typeof params.T === "number" ? params.T : 3;
  return {
    size: {
      settings: [ratioSetting("width", ["x", "y", "z"], { v0: width, min: MIN_W, max: MAX_W, step: 1 }, (v) => `Width ${lenText(v, units)}`)],
      write: ({ width: next }) => { if (typeof next === "number" && next !== width) change("width", next, true); },
      uniform: true,
      thin: 4 * T,
    },
  };
}
