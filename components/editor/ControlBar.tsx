"use client";

import type { ReactNode } from "react";
import type { Params } from "@/lib/hinge";
import { canUsePattern, canUseShape, type Plan } from "@/lib/plans";
import { LockIcon } from "@/components/billing/Lock";

/** `locked`: a Pro feature the current plan can preview but not export or save. */
export type Opt = { v: string; text: string; title?: string; icon?: ReactNode; onClick: () => void; disabled?: boolean; soon?: string; locked?: boolean };

export function Seg({ label, name, value, options }: {
  label: string;
  name: string;
  value: string;
  options: Opt[];
}) {
  return (
    <div className="cb-group">
      <span className="cb-label">{label}</span>
      <div className="iconseg" role="group" aria-label={name}>
        {options.map((o) => (
          <button key={o.v} type="button" data-v={o.v} title={o.locked ? `${o.title ?? o.text} (Pro)` : o.title} aria-pressed={value === o.v} disabled={o.disabled} onClick={o.onClick} className={o.locked ? "locked" : undefined}>
            {o.icon}{o.text}{o.locked && <LockIcon />}{o.soon && <span className="soon">{o.soon}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export type Product = "hinge" | "letters";

/** Product switcher shown at the right end of every control bar. */
export function ProductTabs({ product, onProduct }: { product: Product; onProduct: (p: Product) => void }) {
  return (
    <div className="cb-group product-tabs">
      <span className="cb-label">Product</span>
      <div className="iconseg" role="group" aria-label="Product">
        <button type="button" aria-pressed={product === "hinge"} onClick={() => onProduct("hinge")}>Hinge Box</button>
        <button type="button" aria-pressed={product === "letters"} onClick={() => onProduct("letters")}>Letters</button>
      </div>
    </div>
  );
}

export function ControlBar({ params, plan = "pro", onShape, onLid, onPattern, onProduct }: {
  params: Params;
  plan?: Plan;
  onShape: (v: string) => void;
  onLid: (v: string) => void;
  onPattern: (v: string) => void;
  onProduct: (p: Product) => void;
}) {
  const shapeOpts: Opt[] = [
    { v: "rect", text: "Rounded", title: "Rounded rectangle", onClick: () => onShape("rect"), icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="15" height="11" rx="3.5" /></svg> },
    { v: "pill", text: "Pill", title: "Stadium / pill", onClick: () => onShape("pill"), icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="2" width="15" height="10" rx="5" /></svg> },
    { v: "poly", text: "Polygon", title: "Rounded polygon", onClick: () => onShape("poly"), icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M8 1.5l5.6 3.25v6.5L8 14.5l-5.6-3.25v-6.5z" /></svg> },
    { v: "cyl", text: "Cylinder", title: "Cylinder", onClick: () => onShape("cyl"), icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.3" /></svg> },
  ];
  const shape = shapeOpts.map((o) => ({ ...o, locked: !canUseShape(plan, o.v as Params["shape"]) }));
  const lid: Opt[] = [
    { v: "open", text: "Open tray", onClick: () => onLid("open") },
    { v: "fixed", text: "Fixed lid", onClick: () => onLid("fixed") },
    { v: "removable", text: "Removable lid", onClick: () => onLid("removable") },
  ];
  const patOpts: Opt[] = [
    { v: "straight", text: "Straight", title: "Straight lattice", onClick: () => onPattern("straight"), icon: <svg width="18" height="14" viewBox="0 0 18 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3 1v5M3 8v5M7 1v12M11 1v5M11 8v5M15 1v12" /></svg> },
    { v: "wave", text: "Wave", title: "Wave lattice: parallel waves, constant bar width", onClick: () => onPattern("wave"), icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M4 1c-2 2 2 4 0 6s2 4 0 6M9 1c-2 2 2 4 0 6s2 4 0 6M14 1c-2 2 2 4 0 6s2 4 0 6" /></svg> },
    { v: "relief", text: "Relief", title: "Lattice with round relief holes at every cut end", onClick: () => onPattern("relief"), icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M5 3.5v7M12 0v4.5M12 9.5V14" /><circle cx="5" cy="3" r="1.1" /><circle cx="5" cy="11" r="1.1" /><circle cx="12" cy="5" r="1.1" /><circle cx="12" cy="9" r="1.1" /></svg> },
    { v: "serpentine", text: "Serpentine", title: "Serpentine: cuts from alternating edges, for very tight bends", onClick: () => onPattern("serpentine"), icon: <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M3 0v10.5M7 3.5V14M11 0v10.5M15 3.5V14" /></svg> },
  ];
  const pat = patOpts.map((o) => ({ ...o, locked: !canUsePattern(plan, o.v as Params["pattern"]) }));
  return (
    <div className="controlbar">
      <Seg label="Shape" name="Box shape" value={params.shape} options={shape} />
      <div className="cb-sep" />
      <Seg label="Lid" name="Lid type" value={params.lid} options={lid} />
      <div className="cb-sep" />
      <Seg label="Pattern" name="Hinge pattern" value={params.pattern} options={pat} />
      <ProductTabs product="hinge" onProduct={onProduct} />
    </div>
  );
}
