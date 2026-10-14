/**
 * Presets the start page and `?preset=` links read, kept small for the editor shell. Most generators list
 * every preset; Shadow Box (120 designs) loads a few featured cards after the page, with no settings:
 * the generator editor takes those from the generator's own presets.
 */
import { BOXES_PRESETS } from "./boxes/presets";
import { CLOCK_PRESETS } from "./clock/presets";
import { KEYRACK_PRESETS } from "./keyrack/presets";
import { PUZZLE_PRESETS } from "./puzzle/presets";
import { QR_PRESETS } from "./qr/presets";
import { SIGN_PRESETS } from "./sign/presets";
import { TABLENUM_PRESETS } from "./tablenum/presets";
import { TROPHY_PRESETS } from "./trophy/presets";
import { TOPPER_PRESETS } from "./topper/presets";
import type { GeneratorId } from "./ids";
import type { GenPreset } from "./types";

export const START_PRESETS: Record<GeneratorId, GenPreset<unknown>[]> = {
  clock: CLOCK_PRESETS as GenPreset<unknown>[],
  puzzle: PUZZLE_PRESETS as GenPreset<unknown>[],
  qr: QR_PRESETS as GenPreset<unknown>[],
  boxes: BOXES_PRESETS as GenPreset<unknown>[],
  topper: TOPPER_PRESETS as GenPreset<unknown>[],
  keyrack: KEYRACK_PRESETS as GenPreset<unknown>[],
  sign: SIGN_PRESETS as GenPreset<unknown>[],
  tablenum: TABLENUM_PRESETS as GenPreset<unknown>[],
  trophy: TROPHY_PRESETS as GenPreset<unknown>[],
  shadowbox: [],
};

export interface LazyStart {
  /** Presets the generator editor has. */
  count: number;
  /** The first card's picture, for the generator's tile. */
  cover: string;
  load: () => Promise<GenPreset<unknown>[]>;
}

export const START_LAZY: Partial<Record<GeneratorId, LazyStart>> = {
  shadowbox: {
    count: 120,
    cover: "star-tunnel",
    load: () => import("./shadowbox/featured").then((m) => m.SHADOWBOX_FEATURED.map((c) => ({ ...c, params: {} }))),
  },
};
