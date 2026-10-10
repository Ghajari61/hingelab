/** Built-in presets of every generator: data only, so the start page can list them cheaply. */
import { CLOCK_PRESETS } from "./clock/presets";
import type { GeneratorId } from "./ids";
import type { GenPreset } from "./types";

export const GENERATOR_PRESETS: Record<GeneratorId, GenPreset<unknown>[]> = {
  clock: CLOCK_PRESETS as GenPreset<unknown>[],
};
