/** Built-in presets of every generator, settings included (the start page uses the smaller START_PRESETS). */
import { SHADOWBOX_PRESETS } from "./shadowbox/presets";
import { START_PRESETS } from "./startPresets";
import type { GeneratorId } from "./ids";
import type { GenPreset } from "./types";

export const GENERATOR_PRESETS: Record<GeneratorId, GenPreset<unknown>[]> = {
  ...START_PRESETS,
  shadowbox: SHADOWBOX_PRESETS as GenPreset<unknown>[],
};
