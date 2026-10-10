/** Built-in presets of every generator: data only, so the start page can list them cheaply. */
import { BOXES_PRESETS } from "./boxes/presets";
import { CLOCK_PRESETS } from "./clock/presets";
import { PUZZLE_PRESETS } from "./puzzle/presets";
import { QR_PRESETS } from "./qr/presets";
import type { GeneratorId } from "./ids";
import type { GenPreset } from "./types";

export const GENERATOR_PRESETS: Record<GeneratorId, GenPreset<unknown>[]> = {
  clock: CLOCK_PRESETS as GenPreset<unknown>[],
  puzzle: PUZZLE_PRESETS as GenPreset<unknown>[],
  qr: QR_PRESETS as GenPreset<unknown>[],
  boxes: BOXES_PRESETS as GenPreset<unknown>[],
};
