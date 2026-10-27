/**
 * A test-only design: two plain strips of a known width, cut upright, to check the kerf is applied
 * once in every export format.
 */
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { rect } from "@/lib/generators/geom";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase, type GeneratorDef } from "@/lib/generators/types";
import { mergeInto } from "@/lib/generators/util";

export interface StripParams extends GenBase { width: number; length: number }

const DEFAULTS: StripParams = {
  name: "Strips", material: "birch3", T: HINGE.T, K: HINGE.K, bedW: 600, bedH: 400, gap: 4,
  fit: { ...FIT_OFF }, sheet: { ...SHEET_DEFAULTS }, job: { ...JOB_EXTRAS }, layers: clone(HINGE.layers),
  width: 10, length: 40,
};

export const STRIPS: GeneratorDef<StripParams> = {
  id: "boxes",
  name: "Strips",
  version: 1,
  defaults: () => clone(DEFAULTS),
  merge: (raw) => mergeInto(clone(DEFAULTS), raw),
  sections: [],
  presets: [],
  build: (p) => ({
    parts: [0, 1].map((i) => ({ id: `strip-${i + 1}`, name: `Strip ${i + 1}`, outer: rect(0, 0, p.width, p.length), holes: [], upright: true, place: { x: i * (p.width + 8), y: 0, z: 0 } })),
    stats: [],
  }),
  check: () => [],
  fileName: () => "strips",
  summary: (p) => `${p.width} mm strips`,
  help: { intro: [], tips: [] },
};
