/**
 * Server-side checks on export requests before any geometry is built. The editors keep every value
 * inside these ranges; a request outside them was made by hand, so it is refused (400) rather than
 * quietly changed, and the server never spends minutes on a box a kilometre wide.
 */
import { PARAM_FIELDS } from "@/components/parametric/fields";
import type { Params } from "@/lib/hinge";
import { honeyLattice } from "@/lib/hinge/hinge";
import { MAX_BASE_LINES, MAX_BASE_TEXT } from "@/lib/hinge/baseText";
import { BUNDLED_FONTS } from "@/lib/letters/fontList";
import { FRET_NAMES } from "@/lib/generators/fretwork";
import { isFretMotif, isFretShape } from "@/lib/hinge/fret";
import { cleanBoardPattern, cleanRails } from "@/lib/parametric/backboard";
import { cleanPatternSource } from "@/lib/parametric/source/pattern";
import type { ParametricParams } from "@/lib/parametric";
import { RELIEF_IDS } from "@/lib/parametric/source/reliefs";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const HINGE_ENUMS: Partial<Record<keyof Params, readonly string[]>> = {
  shape: ["rect", "pill", "poly", "cyl"],
  lid: ["open", "fixed", "removable"],
  pattern: ["straight", "wave", "relief", "serpentine", "honeycomb"],
  cutStyle: ["slot", "line"],
};

/** Settings added later: optional, but in range when present. */
const HINGE_OPTIONAL: Partial<Record<keyof Params, [number, number]>> = {
  Ky: [0, 5], lidOver: [0, 100], lidHoleD: [0, 500], lidHoleW: [1, 200], gamma: [0.001, 1], minFeature: [0, 50], baseRingW: [3, 80],
  divX: [0, 8], divY: [0, 8], divH: [0, 3000], baseTextSize: [1.5, 40], fretCell: [6, 80], fretBar: [1, 15], fretSize: [20, 100],
};

/** [min, max] per Hinge Box number; the minimums are the editor's, the maximums are generous. */
export const HINGE_RANGES: Partial<Record<keyof Params, [number, number]>> = {
  W: [10, 3000], D: [10, 3000], H: [10, 3000], R: [0, 1500], dia: [20, 3000],
  sides: [3, 12], cylFlats: [3, 16], T: [0.5, 100], K: [0, 5],
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
  for (const [k, [lo, hi]] of Object.entries(HINGE_OPTIONAL) as [keyof Params, [number, number]][]) {
    const v = p[k];
    if (v !== undefined && (!finite(v) || v < lo || v > hi)) return `${k} must be a number between ${lo} and ${hi}.`;
  }
  if (p.lidHole !== undefined && !["none", "finger", "knob", "tissue", "coin", "rim"].includes(p.lidHole)) return "Invalid value for lidHole.";
  if (p.lidLip !== undefined && typeof p.lidLip !== "boolean") return "Invalid value for lidLip.";
  if (p.lidLipScore !== undefined && typeof p.lidLipScore !== "boolean") return "Invalid value for lidLipScore.";
  if (p.baseRing !== undefined && typeof p.baseRing !== "boolean") return "Invalid value for baseRing.";
  if (p.seamFingers !== undefined && typeof p.seamFingers !== "boolean") return "Invalid value for seamFingers.";
  if (p.baseText !== undefined && (typeof p.baseText !== "string" || p.baseText.length > MAX_BASE_TEXT || p.baseText.split("\n").length > MAX_BASE_LINES)) return `The text under the box is limited to ${MAX_BASE_TEXT} characters on ${MAX_BASE_LINES} lines.`;
  if (p.baseTextFont !== undefined && !BUNDLED_FONTS.some((f) => f.id === p.baseTextFont)) return "Invalid value for baseTextFont.";
  if (p.fret !== undefined && (!(p.fret in FRET_NAMES) || p.fret === "tile")) return "Invalid value for fret.";
  if (p.fretOn !== undefined && !["both", "lid", "walls"].includes(p.fretOn)) return "Invalid value for fretOn.";
  if (p.fretMotif !== undefined && !isFretMotif(p.fretMotif)) return "Invalid value for fretMotif.";
  if (p.fretShape !== undefined && !isFretShape(p.fretShape)) return "Invalid value for fretShape.";
  if (p.fretMark !== undefined && !["cut", "engrave", "score"].includes(p.fretMark)) return "Invalid value for fretMark.";
  const around = p.shape === "cyl" ? Math.PI * p.dia : 2 * (p.W + (p.shape === "poly" ? p.W : p.D));
  const columns = around / p.pitch;
  const lattice = honeyLattice(p);
  const rows = p.H / Math.max(lattice.slit + lattice.bridge, 1);
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
  } else if (s.kind === "pattern") {
    // Every number and list is clamped on merge; a source that cleans to something else was not one.
    if (JSON.stringify(cleanPatternSource(s)) !== JSON.stringify(s)) return "Invalid wall-art pattern.";
  }
  if (p.parallel.boardPattern !== undefined && !cleanBoardPattern(p.parallel.boardPattern)) return "Invalid board pattern.";
  if (!["none", "plate", "slats", "rails"].includes(p.parallel.backboard)) return "Invalid backboard.";
  if (p.parallel.rails !== undefined && JSON.stringify(cleanRails(p.parallel.rails)) !== JSON.stringify(p.parallel.rails)) return "Invalid rails.";
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
