/**
 * An edge-lit LED base, cut in layers: a solid bottom plate, one or more channel layers with a pocket
 * for an LED strip (or a USB LED board) and a notch for its lead out of the back, and a top plate with
 * a slot the acrylic panel stands in. The panel's edge sits right over the LEDs, so its engraving glows.
 * Used by the Sign and Trophy generators.
 */
import { differenceShapes } from "@/lib/letters/polygon";
import { rect } from "../geom";
import { orient } from "../shapes";
import type { Contour } from "../types";

/** Room under the slot for a 10 mm LED strip or USB LED board and its lead, mm. */
export const LED_CAVITY = 6;
/** Pocket width front to back, mm (fits a 10 mm strip with a little play). */
export const LED_POCKET = 12;
/** Width of the notch the lead leaves through, mm. */
export const LED_NOTCH = 8;
/** Narrowest wall that holds round the pocket, mm. */
export const LED_WALL = 8;
/** Clearance added to the slot, mm: a snug push fit for acrylic. */
export const LED_FIT = 0.15;

/** Channel layers that give the LEDs room, for layers `t` thick. */
export const ledChannels = (t: number): number => Math.max(1, Math.ceil(LED_CAVITY / Math.max(0.5, t) - 0.01));

/** Pocket width front to back for a slot `slotW` wide. */
export const ledPocket = (slotW: number): number => Math.max(LED_POCKET, slotW + 6);

/**
 * A channel layer: `outline` (depth `D`, y down, front at 0) with a pocket from x0 to x1 centred
 * under the slot at depth `cy`, and a notch from the pocket out through the back edge.
 */
export function ledChannel(outline: Contour, x0: number, x1: number, cy: number, pocket: number, D: number): { outer: Contour; holes: Contour[] } {
  const cx = (x0 + x1) / 2;
  const cut = [orient(rect(x0, cy - pocket / 2, x1 - x0, pocket)), orient(rect(cx - LED_NOTCH / 2, cy, LED_NOTCH, D - cy + 5))];
  const s = differenceShapes([orient(outline)], cut);
  const big = s.reduce((a, b) => (b.area > a.area ? b : a));
  return { outer: big.outer, holes: big.holes };
}
