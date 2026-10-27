import { mergeBoxes, type BoxesParams } from "../boxes/params";
import { mergeInto } from "../util";

/** Preserve the former packaging defaults when moving a preset into the shared library. */
export function packagingDefaults(raw: unknown): BoxesParams {
  const base = mergeBoxes({ name: "Wooden gift box", design: "box", box: {
    width: 120, depth: 90, height: 60, lid: "liftoff", clearance: .3, notch: false, pin: 3,
  } });
  return mergeBoxes(mergeInto(base, raw));
}
