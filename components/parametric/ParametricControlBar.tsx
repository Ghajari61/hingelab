"use client";

import type { MethodId } from "@/lib/parametric";
import { ProductTabs, Seg, type Opt, type Product } from "@/components/editor/ControlBar";

export function ParametricControlBar({ method, onMethod, onProduct }: {
  method: MethodId;
  onMethod: (m: MethodId) => void;
  onProduct: (p: Product) => void;
}) {
  const methods: Opt[] = [
    { v: "parallel", text: "Parallel fins", title: "Slices standing out of the wall, side by side", onClick: () => onMethod("parallel"),
      icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 13V5M7 13V2M11 13V3M15 13V6M1.5 13h15" /></svg> },
    { v: "stacked", text: "Stacked layers", title: "Horizontal layers glued on top of each other", onClick: () => onMethod("stacked"), disabled: true, soon: "soon" },
    { v: "waffle", text: "Waffle", title: "Two crossing sets of ribs with half-lap joints", onClick: () => onMethod("waffle"), disabled: true, soon: "soon" },
    { v: "radial", text: "Radial", title: "Fins around a central axis", onClick: () => onMethod("radial"), disabled: true, soon: "soon" },
    { v: "curveNormal", text: "Along a curve", title: "Fins square to a curve", onClick: () => onMethod("curveNormal"), disabled: true, soon: "soon" },
  ];
  return (
    <div className="controlbar">
      <Seg label="Method" name="Slicing method" value={method} options={methods} />
      <ProductTabs product="parametric" onProduct={onProduct} />
    </div>
  );
}
