"use client";

import type { ReactNode } from "react";
import { Layers, Package, Type } from "lucide-react";
import type { Params } from "@/lib/hinge";
import { canUsePattern, canUseShape, type Plan } from "@/lib/plans";
import type { GalleryGroup } from "@/components/shell/GalleryRail";

/** `locked`: a Pro feature the current plan can preview but not export or save. */
export type Opt = { v: string; text: string; title?: string; icon?: ReactNode; onClick: () => void; disabled?: boolean; soon?: string; locked?: boolean };

export type Product = "hinge" | "letters" | "parametric";

export const PRODUCT_INFO: Record<Product, { name: string; icon: ReactNode }> = {
  hinge: { name: "Hinge Box", icon: <Package size={16} aria-hidden /> },
  letters: { name: "Letters", icon: <Type size={16} aria-hidden /> },
  parametric: { name: "Parametric", icon: <Layers size={16} aria-hidden /> },
};

/** Product switcher in the header. */
export function ProductTabs({ product, onProduct }: { product: Product; onProduct: (p: Product) => void }) {
  return (
    <div className="iconseg product-tabs" role="group" aria-label="Product">
      {(Object.keys(PRODUCT_INFO) as Product[]).map((p) => (
        <button key={p} type="button" aria-pressed={product === p} onClick={() => onProduct(p)}>
          {PRODUCT_INFO[p].icon}{PRODUCT_INFO[p].name}
        </button>
      ))}
    </div>
  );
}

export const LID_OPTS = (onLid: (v: string) => void): Opt[] => [
  { v: "open", text: "Open tray", title: "No lid", onClick: () => onLid("open") },
  { v: "fixed", text: "Fixed lid", title: "A lid joined to the walls", onClick: () => onLid("fixed") },
  { v: "removable", text: "Removable lid", title: "A lid with a lip that lifts off", onClick: () => onLid("removable") },
];

/** Hinge Box gallery: shape, lid and hinge pattern. */
export function hingeGroups({ params, plan = "pro", onShape, onLid, onPattern }: {
  params: Params;
  plan?: Plan;
  onShape: (v: string) => void;
  onLid: (v: string) => void;
  onPattern: (v: string) => void;
}): GalleryGroup[] {
  const shape: Opt[] = [
    { v: "rect", text: "Rounded", title: "Rounded rectangle", onClick: () => onShape("rect") },
    { v: "pill", text: "Pill", title: "Stadium / pill", onClick: () => onShape("pill") },
    { v: "poly", text: "Polygon", title: "Rounded polygon", onClick: () => onShape("poly") },
    { v: "cyl", text: "Cylinder", title: "Cylinder", onClick: () => onShape("cyl") },
  ].map((o) => ({ ...o, locked: !canUseShape(plan, o.v as Params["shape"]) }));
  const pattern: Opt[] = [
    { v: "straight", text: "Straight", title: "Straight lattice", onClick: () => onPattern("straight") },
    { v: "wave", text: "Wave", title: "Wave lattice: parallel waves, constant bar width", onClick: () => onPattern("wave") },
    { v: "relief", text: "Relief", title: "Lattice with round relief holes at every cut end", onClick: () => onPattern("relief") },
    { v: "serpentine", text: "Serpentine", title: "Serpentine: cuts from alternating edges, for very tight bends", onClick: () => onPattern("serpentine") },
  ].map((o) => ({ ...o, locked: !canUsePattern(plan, o.v as Params["pattern"]) }));
  return [
    { label: "Shape", name: "Box shape", art: "shape", value: params.shape, options: shape },
    { label: "Lid", name: "Lid type", art: "lid", value: params.lid, options: LID_OPTS(onLid), cols: 3 },
    { label: "Hinge pattern", name: "Hinge pattern", art: "pattern", value: params.pattern, options: pattern },
  ];
}
