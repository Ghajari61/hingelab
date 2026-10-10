/**
 * True-shape packing for arrangeFit, kept apart from arrange.ts so products that only pack boxes
 * do not load the outline nester and Clipper.
 */
import { bboxOfContours } from "@/lib/letters/polygon";
import type { Contour } from "@/lib/letters/types";
import { nestOutlines, rotatePoint } from "@/lib/nest/outline";
import type { Packed, SheetSpec } from "./fitToSheets";

const pid = (i: number) => String(i).padStart(4, "0");

/** Packs parts by their outlines (true shape), turning them by the angles allowed for each. */
export function outlinePacker<P extends { outline: Contour[] }>(angles: (pt: P) => number[]) {
  return (parts: P[], s: SheetSpec): Packed => {
    const res = nestOutlines(parts.map((pt, i) => ({ id: pid(i), outline: pt.outline, angles: angles(pt) })), { w: s.w, h: s.h, margin: s.margin, gap: s.gap });
    // The nester places part-local points; the layout wants the top-left of the turned part's box.
    const box = (i: number, a: number) => bboxOfContours(parts[i].outline.map((c) => c.map((q) => rotatePoint(q, a))));
    return {
      sheets: res.sheets.map((sh) => ({
        w: sh.w, h: sh.h, oversize: sh.oversize,
        items: sh.items.map((it) => { const b = box(Number(it.id), it.angle); return { id: it.id, angle: it.angle, x: it.x + b.x0, y: it.y + b.y0 }; }),
      })),
      tooBig: res.tooBig,
    };
  };
}
