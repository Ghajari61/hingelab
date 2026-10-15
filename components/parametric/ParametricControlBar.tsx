"use client";

import type { MethodId } from "@/lib/parametric";
import { PARAMETRIC_DEFAULTS } from "@/lib/parametric/defaults";
import { parametricLocks, type Plan } from "@/lib/plans";
import type { Opt } from "@/components/editor/ControlBar";
import type { GalleryGroup } from "@/components/shell/GalleryRail";

/** Parametric gallery: the slicing method. */
export function methodGroups({ method, plan, onMethod }: {
  method: MethodId;
  plan: Plan;
  onMethod: (m: MethodId) => void;
}): GalleryGroup[] {
  const methods: Opt[] = [
    { v: "parallel", text: "Parallel fins", title: "Slices standing out of the wall, side by side", onClick: () => onMethod("parallel") },
    { v: "stacked", text: "Stacked layers", title: "Layers glued on top of each other, lined up with dowels", onClick: () => onMethod("stacked") },
    { v: "waffle", text: "Waffle", title: "Two crossing sets of ribs with half-lap joints", onClick: () => onMethod("waffle") },
    { v: "radial", text: "Radial", title: "Fins round a central axis, held by slotted hub rings", onClick: () => onMethod("radial") },
    { v: "curveNormal", text: "Along a curve", title: "Fins square to an oval or circle, built from formulas", onClick: () => onMethod("curveNormal") },
    { v: "folded", text: "Folded", title: "Papercraft: the model's faces unfolded into nets of card with glue tabs", onClick: () => onMethod("folded") },
  ].map((o) => ({ ...o, locked: parametricLocks(plan, { source: { kind: "library" }, method: o.v }).length > 0 }));
  return [{ label: "Method", name: "Slicing method", art: "method", value: method, options: methods, home: PARAMETRIC_DEFAULTS.method }];
}
