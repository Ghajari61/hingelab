/** The paper box engine: pure geometry, no UI. Importing it registers every built-in style. */
import { BUILT_IN_STYLES } from "./styles";
import { registerBoxStyle } from "./registry";
for (const s of BUILT_IN_STYLES) registerBoxStyle(s);
export * from "./types";
export { registerBoxStyle, getBoxStyle, listBoxStyles, cleanParams, fieldsOf } from "./registry";
export { PAPERS, paperById, panelSizes } from "./paper";
export { toMM, fromMM, formatLength, MM_PER, type Unit } from "./units";
export { dielineSVG, layoutParts, partBox, LINE_STYLES, type SvgOptions } from "./svg";

import { cleanParams, getBoxStyle } from "./registry";
import type { Dieline } from "./types";

/** Builds a style by id from raw settings (checked against its schema). */
export function buildBox(styleId: string, raw: unknown): Dieline {
  const s = getBoxStyle(styleId);
  if (!s) throw new Error(`Unknown box style "${styleId}".`);
  return s.build(cleanParams(s, raw));
}
