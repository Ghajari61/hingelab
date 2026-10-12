"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Box, Cake, ChevronDown, Clock, Hash, KeyRound, Layers, Package, Puzzle, QrCode, Shapes, Signpost, Trophy, Type } from "lucide-react";
import type { Params } from "@/lib/hinge";
import { HINGE_VARIANTS, hingeVariantOf, type HingeVariant } from "@/lib/hinge/presets";
import { GENERATOR_IDS, GENERATOR_INFO, isGeneratorId, type GeneratorId, type GeneratorInfo } from "@/lib/generators/ids";
import { canUsePattern, canUseShape, type Plan } from "@/lib/plans";
import type { GalleryGroup } from "@/components/shell/GalleryRail";

/** `locked`: a Pro feature the current plan can preview but not export or save. */
export type Opt = { v: string; text: string; title?: string; icon?: ReactNode; onClick: () => void; disabled?: boolean; soon?: string; locked?: boolean };

export type CoreProduct = "hinge" | "letters" | "parametric";
export type Product = CoreProduct | GeneratorId;
export const CORE_PRODUCTS: CoreProduct[] = ["hinge", "letters", "parametric"];
export const ALL_PRODUCTS: Product[] = [...CORE_PRODUCTS, ...GENERATOR_IDS];

const GEN_ICON: Record<GeneratorInfo["icon"], ReactNode> = {
  clock: <Clock size={16} aria-hidden />,
  puzzle: <Puzzle size={16} aria-hidden />,
  qr: <QrCode size={16} aria-hidden />,
  box: <Box size={16} aria-hidden />,
  cake: <Cake size={16} aria-hidden />,
  key: <KeyRound size={16} aria-hidden />,
  sign: <Signpost size={16} aria-hidden />,
  hash: <Hash size={16} aria-hidden />,
  trophy: <Trophy size={16} aria-hidden />,
};

export const PRODUCT_INFO: Record<Product, { name: string; icon: ReactNode }> = {
  hinge: { name: "Hinge Box", icon: <Package size={16} aria-hidden /> },
  letters: { name: "Letters", icon: <Type size={16} aria-hidden /> },
  parametric: { name: "Parametric", icon: <Layers size={16} aria-hidden /> },
  ...(Object.fromEntries(GENERATOR_IDS.map((id) => [id, { name: GENERATOR_INFO[id].name, icon: GEN_ICON[GENERATOR_INFO[id].icon] }])) as Record<GeneratorId, { name: string; icon: ReactNode }>),
};

/** Product switcher in the header: the three core products, then the generators in a menu. */
export function ProductTabs({ product, onProduct }: { product: Product; onProduct: (p: Product) => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  // On narrow screens the strip scrolls: fade the edges that hide tabs, and keep the current tab in view.
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const update = () => setMore({ start: el.scrollLeft > 1, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    const on = el.querySelector<HTMLElement>(':scope > button[aria-pressed="true"], .gen-menu > button[aria-pressed="true"]');
    if (on) {
      const a = el.getBoundingClientRect(), b = on.getBoundingClientRect();
      if (b.right > a.right) el.scrollLeft += b.right - a.right + 24;
      else if (b.left < a.left) el.scrollLeft -= a.left - b.left + 24;
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [product]);
  const gen = isGeneratorId(product) ? product : null;
  return (
    <div ref={strip} className={`iconseg product-tabs${more.start ? " more-start" : ""}${more.end ? " more-end" : ""}`} role="group" aria-label="Product">
      {CORE_PRODUCTS.map((p) => (
        <button key={p} type="button" aria-pressed={product === p} onClick={() => onProduct(p)}>
          {PRODUCT_INFO[p].icon}{PRODUCT_INFO[p].name}
        </button>
      ))}
      <div className="gen-menu" ref={box}>
        <button type="button" aria-pressed={!!gen} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {gen ? PRODUCT_INFO[gen].icon : <Shapes size={16} aria-hidden />}{gen ? PRODUCT_INFO[gen].name : "Generators"}<ChevronDown size={13} aria-hidden />
        </button>
        {open && (
          <div className="gen-dropdown" role="menu" aria-label="Generators">
            {GENERATOR_IDS.map((id) => (
              <button
                key={id} type="button" role="menuitem" aria-current={product === id || undefined}
                aria-label={GENERATOR_INFO[id].name} aria-describedby={`${menuId}-${id}`}
                onClick={() => { setOpen(false); onProduct(id); }}
              >
                <span className="gi">{PRODUCT_INFO[id].icon}</span>
                <span className="gt"><b>{GENERATOR_INFO[id].name}</b><small id={`${menuId}-${id}`}>{GENERATOR_INFO[id].blurb}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const LID_OPTS = (onLid: (v: string) => void): Opt[] => [
  { v: "open", text: "Open tray", title: "No lid", onClick: () => onLid("open") },
  { v: "fixed", text: "Fixed lid", title: "A lid joined to the walls", onClick: () => onLid("fixed") },
  { v: "removable", text: "Removable lid", title: "A lid with a lip that lifts off", onClick: () => onLid("removable") },
];

/** Hinge Box gallery: shape, lid and hinge pattern. */
export function hingeGroups({ params, plan = "pro", onShape, onLid, onPattern, onVariant }: {
  params: Params;
  plan?: Plan;
  onShape: (v: string) => void;
  onLid: (v: string) => void;
  onPattern: (v: string) => void;
  onVariant?: (v: HingeVariant) => void;
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
    ...(onVariant ? [{
      label: "Hinge style", name: "Hinge style", art: "variant", value: hingeVariantOf(params), cols: 3 as const,
      options: HINGE_VARIANTS.map((v) => ({ v: v.id, text: v.name, title: v.title, onClick: () => onVariant(v) })),
    }] : []),
  ];
}
