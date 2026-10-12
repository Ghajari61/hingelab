/**
 * Server-side checks on export requests before any geometry is built. The editors keep every value
 * inside these ranges; a request outside them was made by hand, so it is refused (400) rather than
 * quietly changed, and the server never spends minutes on a box a kilometre wide.
 */
import { PARAM_FIELDS } from "@/components/parametric/fields";
import type { Params } from "@/lib/hinge";
import type { ParametricParams } from "@/lib/parametric";
import { RELIEF_IDS } from "@/lib/parametric/source/reliefs";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const HINGE_ENUMS: Partial<Record<keyof Params, readonly string[]>> = {
  shape: ["rect", "pill", "poly", "cyl"],
  lid: ["open", "fixed", "removable"],
  pattern: ["straight", "wave", "relief", "serpentine"],
  cutStyle: ["slot", "line"],
};

/** [min, max] per Hinge Box number; the minimums are the editor's, the maximums are generous. */
export const HINGE_RANGES: Partial<Record<keyof Params, [number, number]>> = {
  W: [10, 3000], D: [10, 3000], H: [10, 3000], R: [0, 1500], dia: [20, 3000],
  sides: [3, 12], cylFlats: [3, 16], T: [0.5, 50], K: [0, 5],
  slotW: [0, 50], slit: [3, 3000], bridge: [0.5, 500], pitch: [0.5, 500], overrun: [0, 500], stretch: [0, 8],
  tabW: [3, 1000], slotClr: [-0.5, 50], lidGap: [0, 50], split: [1, 8],
  bedW: [50, 10000], bedH: [50, 10000], gap: [0, 1000],
};

/** Upper bound on hinge slits in one request (a 300 mm cylinder with the finest hinge is ~160 000). */
const MAX_HINGE_SLITS = 400_000;

export function hingeRequestError(p: Params): string | null {
  if (typeof p.name !== "string" || p.name.length > 200) return "Invalid box name.";
  for (const [k, allowed] of Object.entries(HINGE_ENUMS)) {
    if (!allowed!.includes(p[k as keyof Params] as string)) return `Invalid value for ${k}.`;
  }
  for (const [k, [lo, hi]] of Object.entries(HINGE_RANGES) as [keyof Params, [number, number]][]) {
    const v = p[k];
    if (!finite(v) || v < lo || v > hi) return `${k} must be a number between ${lo} and ${hi}.`;
  }
  const around = p.shape === "cyl" ? Math.PI * p.dia : 2 * (p.W + (p.shape === "poly" ? p.W : p.D));
  const columns = around / p.pitch;
  const rows = p.H / Math.max(p.slit + p.bridge, 1);
  if (columns * rows > MAX_HINGE_SLITS) return "This hinge has too many slits to build on the server. Use a larger slit spacing or a smaller box.";
  return null;
}

const METHODS = ["parallel", "stacked", "waffle", "radial", "curveNormal", "folded"];
const LIBRARY: string[] = ["sphere", "torus", "abstract-head-cc0", "wave-panel", "ripple", "vase", ...RELIEF_IDS];
const MAX_EXPRESSION = 2000;
/** Fields whose presets go past the editor's own range (card sculptures are 0.3 mm). */
const PARAMETRIC_BOUNDS: Record<string, [number, number]> = { T: [0.1, 25] };

/** Every editor number in range (only the fields that apply to this design), plus the knobs the editor has no field for. */
export function parametricRequestError(p: ParametricParams): string | null {
  if (typeof p.name !== "string" || p.name.length > 200) return "Invalid sculpture name.";
  if (!METHODS.includes(p.method)) return "Unknown method.";
  const s = p.source;
  if (s.kind === "library") {
    if (!LIBRARY.includes(s.id)) return "Unknown library shape.";
    if (s.detail !== undefined && !(Number.isInteger(s.detail) && s.detail >= 0 && s.detail <= 6)) return "Invalid shape detail.";
  } else if (s.kind === "formula") {
    if (typeof s.expression !== "string" || s.expression.length > MAX_EXPRESSION) return "Invalid formula.";
  }
  for (const f of [p.curveNormal.finLength, p.curveNormal.finHeight, p.curveNormal.twist]) {
    if (typeof f !== "string" || f.length > MAX_EXPRESSION) return "Invalid formula.";
  }
  for (const f of PARAM_FIELDS) {
    let v: number;
    try {
      if (f.show && !f.show(p)) continue;
      v = f.get(p);
    } catch {
      // Photo and text fields have no `show`; their getters throw for other sources.
      continue;
    }
    const [lo, hi] = PARAMETRIC_BOUNDS[f.id] ?? [f.min ?? -Infinity, f.max ?? Infinity];
    if (!finite(v) || v < lo || v > hi) return `${f.label} is out of range.`;
  }
  return null;
}
