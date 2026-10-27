"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Box, Cake, Check, ChevronDown, Clock, Hash, KeyRound, Layers, Package, Puzzle, QrCode, Ruler, Shapes, Signpost, SquareStack, Tag, Trophy, Type } from "lucide-react";
import type { Params } from "@/lib/hinge";
import { DEFAULTS } from "@/lib/hinge/defaults";
import { HINGE_VARIANTS, hingeVariantOf, type HingeVariant } from "@/lib/hinge/presets";
import { GENERATOR_IDS, GENERATOR_INFO, isGeneratorId, type GeneratorId, type GeneratorInfo } from "@/lib/generators/ids";
import { canUsePattern, canUseShape, type Plan } from "@/lib/plans";
import type { GalleryGroup } from "@/components/shell/GalleryRail";
import { RandomMark } from "./ResetMark";

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
  layers: <SquareStack size={16} aria-hidden />,
  ruler: <Ruler size={16} aria-hidden />,
  tag: <Tag size={16} aria-hidden />,
};

export const PRODUCT_INFO: Record<Product, { name: string; icon: ReactNode }> = {
  hinge: { name: "Hinge Box", icon: <Package size={16} aria-hidden /> },
  letters: { name: "Letters", icon: <Type size={16} aria-hidden /> },
  parametric: { name: "Parametric", icon: <Layers size={16} aria-hidden /> },
  ...(Object.fromEntries(GENERATOR_IDS.map((id) => [id, { name: GENERATOR_INFO[id].name, icon: GEN_ICON[GENERATOR_INFO[id].icon] }])) as Record<GeneratorId, { name: string; icon: ReactNode }>),
};

/** A ready-made design's picture for each product (public/presets), shown in the product picker. */
export const PRODUCT_PICTURE: Record<Product, string> = {
  hinge: "/presets/hinge/gift-box.svg", letters: "/presets/letters/hello-sign.svg", parametric: "/presets/parametric/head-stack.svg",
  shadowbox: "/presets/shadowbox/star-tunnel.svg", boxes: "/presets/boxes/small-box.svg", paperbox: "/presets/paperbox/jewelry-6x6x3.svg",
  sign: "/presets/sign/welcome-arch.svg", topper: "/presets/topper/happy-birthday.svg", popup: "/presets/popup/spiral-trivet-bowl.svg", charm: "/presets/charm/family-baubles.svg", family: "/presets/family/family-crossword.svg",
  clock: "/presets/clock/wall-roman.svg", puzzle: "/presets/puzzle/kids-12.svg", qr: "/presets/qr/keychain.svg",
  keyrack: "/presets/keyrack/home-sweet-home.svg", tablenum: "/presets/tablenum/wedding-arch.svg", trophy: "/presets/trophy/star-award.svg",
  photoproduct: "/presets/photoproduct/studio-paw-ornament.svg",
  keychain: "/presets/keychain/name-rounded.svg",
};

const CORE_BLURB: Record<CoreProduct, string> = {
  hinge: "Living-hinge boxes, cabinets with doors, chests of drawers and lamp shades.",
  letters: "Letter boxes, solid signs and stencils from any text.",
  parametric: "Sliced sculptures: fins, layers, waffles and clocks.",
};

/**
 * Product picker in the header: one button with the open product; it opens a panel of pictures,
 * the three main products first and every generator after, to pick from.
 */
export function ProductTabs({ product, onProduct }: { product: Product; onProduct: (p: Product) => void }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    const selected = box.current?.querySelector<HTMLElement>('.pp-tile[aria-current="true"]') ?? box.current?.querySelector<HTMLElement>('.pp-tile');
    selected?.focus({ preventScroll: true });
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const tile = (p: Product) => (
    <button
      key={p} type="button" className="pp-tile" aria-current={product === p || undefined}
      onClick={() => { setOpen(false); if (p !== product) onProduct(p); }}
    >
      <span className="pp-pic">
        <span className="pp-icon">{PRODUCT_INFO[p].icon}</span>
        <img src={PRODUCT_PICTURE[p]} alt="" width={150} height={100} loading="lazy" />
        {product === p && <span className="pp-selected" aria-hidden><Check size={13} /></span>}
      </span>
      <span className="pp-name">{PRODUCT_INFO[p].name}</span>
      <small>{isGeneratorId(p) ? GENERATOR_INFO[p].blurb : CORE_BLURB[p as CoreProduct]}</small>
    </button>
  );
  return (
    <div className="product-picker" ref={box}>
      <button
        ref={trigger} type="button" className="pp-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pp-thumb"><img src={PRODUCT_PICTURE[product]} alt="" width={36} height={24} /></span>
        {PRODUCT_INFO[product].name}<ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="pp-panel" id={panelId} role="dialog" aria-label="Choose what to make">
          <div className="pp-head"><span>Choose what to make</span><span className="pp-count">{ALL_PRODUCTS.length} products</span></div>
          <div className="pp-grid">{ALL_PRODUCTS.map(tile)}</div>
        </div>
      )}
    </div>
  );
}

export const LID_OPTS = (onLid: (v: string) => void): Opt[] => [
  { v: "open", text: "Open tray", title: "No lid", onClick: () => onLid("open") },
  { v: "fixed", text: "Fixed lid", title: "A lid joined to the walls", onClick: () => onLid("fixed") },
  { v: "removable", text: "Removable lid", title: "A lid with a lip that lifts off", onClick: () => onLid("removable") },
];

/** The Hinge Box's lids: the shared three, a flip-top lid and a cap. */
export const HINGE_LID_OPTS = (onLid: (v: string) => void): Opt[] => [
  ...LID_OPTS(onLid),
  { v: "flip", text: "Flip-top lid", title: "One plate with a living-hinge band: it swings open, and makes a cabinet door when the box stands up", onClick: () => onLid("flip") },
  { v: "cap", text: "Cap lid", title: "A shallow box that slips over the top, like a shoebox or hat-box lid", onClick: () => onLid("cap") },
];

/** Hinge Box gallery: shape, lid and hinge pattern. */
export function hingeGroups({ params, plan = "pro", onShape, onLid, onPattern, onVariant, onRandom }: {
  params: Params;
  plan?: Plan;
  onShape: (v: string) => void;
  onLid: (v: string) => void;
  onPattern: (v: string) => void;
  onVariant?: (v: HingeVariant) => void;
  /** A random pattern and lattice style (the box keeps its size). */
  onRandom?: () => void;
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
    { v: "honeycomb", text: "Honeycomb", title: "Honeycomb: nested hexagon cells, a stiff, even bend for large radii", onClick: () => onPattern("honeycomb") },
  ].map((o) => ({ ...o, locked: !canUsePattern(plan, o.v as Params["pattern"]) }));
  return [
    { label: "Shape", name: "Box shape", art: "shape", value: params.shape, options: shape, home: DEFAULTS.shape },
    // A chest of drawers is open at the front: picking a lid turns it back into a box.
    { label: "Lid", name: "Lid type", art: "lid", value: params.drawers ? "open" : params.lid, options: HINGE_LID_OPTS(onLid), cols: 3, home: DEFAULTS.lid },
    { label: "Hinge pattern", name: "Hinge pattern", art: "pattern", value: params.pattern, options: pattern, home: DEFAULTS.pattern, tools: onRandom && <RandomMark label="Pattern" onRandom={onRandom} /> },
    ...(onVariant ? [{
      label: "Hinge style", name: "Hinge style", art: "variant", value: hingeVariantOf(params), cols: 3 as const,
      options: HINGE_VARIANTS.map((v) => ({ v: v.id, text: v.name, title: v.title, onClick: () => onVariant(v) })),
    }] : []),
  ];
}
