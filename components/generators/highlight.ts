import type { CutPart } from "@/lib/generators/output";
import type { Layout } from "@/lib/hinge/types";

const PAD = 4;

/** Frames round every laid-out copy of the parts in `ids`, and round the spot `at` (canvas overlay paths, mm). */
export function partFrames(lay: Layout<CutPart>, ids: string[], at?: { x0: number; y0: number; x1: number; y1: number }): { d: string; color: string; width: number }[] {
  const want = new Set(ids);
  const out: { d: string; color: string; width: number }[] = [];
  for (const { pt, ox, oy } of lay.items) {
    if (!want.has(pt.src.id) && !want.has(pt.id)) continue;
    const x0 = pt.bbox.x0 + ox - PAD, y0 = pt.bbox.y0 + oy - PAD, x1 = pt.bbox.x1 + ox + PAD, y1 = pt.bbox.y1 + oy + PAD;
    out.push({ d: `M${x0} ${y0}H${x1}V${y1}H${x0}Z`, color: "var(--accent)", width: 2.5 });
  }
  if (at) out.push({ d: `M${at.x0} ${at.y0}H${at.x1}V${at.y1}H${at.x0}Z`, color: "var(--err)", width: 2 });
  return out;
}
