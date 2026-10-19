/** The mini generator's engine (the Hinge Box geometry), loaded when the demo comes near the screen. */
import { sceneSVG } from "@/components/editor/scene3d";
import type { HeroShape } from "@/lib/site/hero";
import { heroParams, sheetFor, type Sheet } from "@/lib/site/samples";

export { sceneSVG, sheetFor, heroParams };

/** The size line and the readout under the demo. */
export function heroText(sheet: Sheet, shape: HeroShape, W: number, H: number) {
  const dims = shape === "cyl"
    ? `Ø${sheet.params.dia} × ${H} mm`
    : `${W} × ${shape === "poly" ? `${W} across flats` : sheet.params.D} × ${H} mm`;
  return { dims, readout: `${dims}, ${sheet.content.outline.length} parts on a ${Math.round(sheet.width)} × ${Math.round(sheet.height)} mm sheet of 3 mm birch.` };
}
