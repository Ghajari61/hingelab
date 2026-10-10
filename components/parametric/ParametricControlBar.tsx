"use client";

import type { MethodId } from "@/lib/parametric";
import { parametricLocks, type Plan } from "@/lib/plans";
import { ProductTabs, Seg, type Opt, type Product } from "@/components/editor/ControlBar";

export function ParametricControlBar({ method, plan, onMethod, onProduct }: {
  method: MethodId;
  plan: Plan;
  onMethod: (m: MethodId) => void;
  onProduct: (p: Product) => void;
}) {
  const methods: Opt[] = [
    { v: "parallel", text: "Parallel fins", title: "Slices standing out of the wall, side by side", onClick: () => onMethod("parallel"),
      icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 13V5M7 13V2M11 13V3M15 13V6M1.5 13h15" /></svg> },
    { v: "stacked", text: "Stacked layers", title: "Layers glued on top of each other, lined up with dowels", onClick: () => onMethod("stacked"),
      icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M6 2.5h6M4 5.5h10M2.5 8.5h13M1.5 11.5h15" /></svg> },
    { v: "waffle", text: "Waffle", title: "Two crossing sets of ribs with half-lap joints", onClick: () => onMethod("waffle"),
      icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M5 1.5v11M9 1.5v11M13 1.5v11M1.5 4.5h15M1.5 9.5h15" /></svg> },
    { v: "radial", text: "Radial", title: "Fins round a central axis, held by slotted hub rings", onClick: () => onMethod("radial"),
      icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="9" cy="7" r="1.8" /><path d="M9 4.2V1M9 9.8V13M11.8 7H16M6.2 7H2M11 5l2.6-2.6M7 9l-2.6 2.6M11 9l2.6 2.6M7 5L4.4 2.4" /></svg> },
    { v: "curveNormal", text: "Along a curve", title: "Fins square to an oval or circle, built from formulas", onClick: () => onMethod("curveNormal"),
      icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><ellipse cx="9" cy="7" rx="3.4" ry="2.2" /><path d="M9 4.8V1M9 9.2V13M12.4 7H17M5.6 7H1M11.6 5.3l2.4-2M6.4 8.7l-2.4 2M11.6 8.7l2.4 2M6.4 5.3l-2.4-2" /></svg> },
  ].map((o) => ({ ...o, locked: parametricLocks(plan, { source: { kind: "library" }, method: o.v }).length > 0 }));
  return (
    <div className="controlbar">
      <Seg label="Method" name="Slicing method" value={method} options={methods} />
      <ProductTabs product="parametric" onProduct={onProduct} />
    </div>
  );
}
