import type { Preset } from "@/lib/presets";
import { canUsePattern, canUseShape, type Plan } from "@/lib/plans";
import { clone, DEFAULTS } from "./defaults";
import { autoFit, withFittedLattice } from "./analysis";
import { computeModel } from "./model";
import type { Params } from "./types";

/** A preset over today's defaults (not `mergeParams`, which reads a missing `cutStyle` as an old project). */
export const hingePresetParams = (partial: Partial<Params>): Params => ({ ...clone(DEFAULTS), ...clone(partial) });

export type HingeVariant = { id: string; name: string; title: string; params: Partial<Params> };

/** Ready-made lattice settings shown as cards beside the pattern (each works with every pattern). */
export const HINGE_VARIANTS: HingeVariant[] = [
  { id: "standard", name: "Standard", title: "Default slit length, bridge and spacing", params: { slit: DEFAULTS.slit, bridge: DEFAULTS.bridge, pitch: DEFAULTS.pitch, cutStyle: "slot" } },
  { id: "fine", name: "Fine", title: "Shorter slits closer together: a smoother bend, more cutting", params: { slit: 20, bridge: 2.5, pitch: 2, cutStyle: "slot" } },
  { id: "flexible", name: "Flexible", title: "Long slits and thin bridges for tighter bends", params: { slit: 40, bridge: 2, pitch: 2.5, cutStyle: "slot" } },
  { id: "stiff", name: "Stiff", title: "Short slits and wide bridges for a firmer wall", params: { slit: 20, bridge: 4.5, pitch: 3.5, cutStyle: "slot" } },
  { id: "line", name: "Single line", title: "Each slit is one cut line instead of a slot (keeps the other settings)", params: { cutStyle: "line" } },
];

/** The variant the current settings match, or "" when they are custom. */
export function hingeVariantOf(p: Params): string {
  const hit = HINGE_VARIANTS.find((v) => Object.entries(v.params).every(([k, val]) => p[k as keyof Params] === val));
  return hit?.id ?? "";
}

export const HINGE_PATTERNS: Params["pattern"][] = ["straight", "wave", "relief", "serpentine", "honeycomb"];

/** Lattice keys "Randomise pattern" rewrites; everything else (size, material, sheet) stays. */
export const PATTERN_KEYS = ["pattern", "slit", "bridge", "pitch", "overrun", "stretch", "cutStyle", "slotW"] as const satisfies readonly (keyof Params)[];

/** A random pattern and lattice style from the ready-made ones, different from `p` where it can be. */
export function randomHingePattern(p: Params, allowed: (pattern: Params["pattern"]) => boolean = () => true, rnd: () => number = Math.random): Params {
  const pats = HINGE_PATTERNS.filter(allowed);
  const styles = HINGE_VARIANTS.filter((v) => v.id !== "line");
  const pick = <T,>(a: T[]) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  let next = p;
  for (let i = 0; i < 12; i++) {
    next = { ...p, ...Object.fromEntries(PATTERN_KEYS.map((k) => [k, DEFAULTS[k]])) };
    Object.assign(next, { pattern: pats.length ? pick(pats) : p.pattern }, pick(styles).params, rnd() < 0.25 ? { cutStyle: "line" } : {});
    if (PATTERN_KEYS.some((k) => next[k] !== p[k])) break;
  }
  return next;
}

type Rnd = () => number;
/** A box idea: its name and its settings, varied a little on every throw. */
type BoxIdea = { name: string; make: (between: (lo: number, hi: number, step?: number) => number, rnd: Rnd) => Partial<Params> };

const BOX_IDEAS: BoxIdea[] = [
  { name: "Tissue box", make: (b) => ({ W: b(235, 260, 5), D: b(120, 135, 5), H: b(85, 105, 5), R: b(14, 24, 2), lid: "removable", lidHole: "tissue" }) },
  { name: "Cube tissue box", make: (b) => { const w = b(112, 126, 2); return { W: w, D: w, H: b(120, 135, 5), R: b(18, 28, 2), lid: "removable", lidHole: "tissue" }; } },
  { name: "Money box", make: (b, r) => ({ ...(r() < 0.5 ? { shape: "cyl", dia: b(90, 120, 5) } : { shape: "rect", W: b(100, 130, 5), D: b(80, 100, 5), R: b(18, 28, 2) }), H: b(110, 140, 5), lid: "fixed", lidHole: "coin" }) },
  { name: "Jewellery box", make: (b, r) => ({ shape: "poly", sides: r() < 0.5 ? 6 : 8, W: b(100, 140, 5), R: b(12, 18, 1), H: b(45, 65, 5), lid: "removable", lidHole: "knob", lidOver: b(2, 4, 1) }) },
  { name: "Ring box", make: (b) => ({ shape: "cyl", dia: b(60, 75, 5), H: b(38, 48, 2), lid: "removable", cylFlats: 5 }) },
  { name: "Cookie jar", make: (b) => ({ shape: "cyl", dia: b(120, 160, 10), H: b(130, 170, 10), lid: "removable", lidHole: "knob", lidOver: b(2, 5, 1) }) },
  { name: "Pen holder", make: (b, r) => ({ ...(r() < 0.5 ? { shape: "rect", W: b(84, 96, 2), D: b(66, 76, 2), R: b(16, 22, 2) } : { shape: "cyl", dia: b(76, 90, 2) }), H: b(100, 120, 5), lid: "fixed", lidHole: "rim", lidHoleW: b(11, 15, 1) }) },
  { name: "Pencil cup", make: (b, r) => ({ ...(r() < 0.5 ? { shape: "cyl", dia: b(72, 90, 2) } : { shape: "poly", sides: 6, W: b(76, 92, 2), R: b(10, 14, 1) }), H: b(95, 115, 5), lid: "open" }) },
  { name: "Planter", make: (b, r) => ({ shape: "poly", sides: [5, 6, 8][Math.floor(r() * 3)], W: b(130, 180, 10), R: b(14, 22, 2), H: b(100, 150, 10), lid: "open", baseRing: true }) },
  { name: "Lantern", make: (b, r) => ({ shape: "cyl", dia: b(80, 110, 5), H: b(110, 150, 10), lid: "open", pattern: r() < 0.6 ? "honeycomb" : "wave" }) },
  { name: "Card deck box", make: (b) => ({ W: b(98, 102, 1), D: b(70, 74, 1), H: b(42, 48, 1), R: b(14, 18, 1), lid: "removable", lidHole: "finger" }) },
  { name: "Watch box", make: (b) => ({ shape: "pill", W: b(140, 180, 10), D: b(60, 75, 5), H: b(45, 60, 5), lid: "removable", lidLipScore: true }) },
  { name: "Tea box", make: (b) => ({ W: b(170, 190, 5), D: b(100, 120, 5), H: b(80, 95, 5), R: b(24, 32, 2), lid: "removable", lidHole: "finger", divX: b(0, 2) }) },
  { name: "Tea chest", make: (b) => ({ W: b(200, 240, 10), D: b(130, 160, 10), H: b(75, 95, 5), R: b(18, 28, 2), lid: "removable", lidHole: "finger", divX: b(2, 3), divY: 1 }) },
  { name: "Organiser tray", make: (b, r) => ({ shape: r() < 0.5 ? "rect" : "pill", W: b(200, 260, 10), D: b(110, 150, 10), R: b(20, 34, 2), H: b(45, 60, 5), lid: "open", divX: b(1, 3), divY: b(0, 1), divH: b(30, 40, 5) }) },
  { name: "Jewellery organiser", make: (b) => ({ W: b(170, 200, 10), D: b(110, 130, 10), H: b(50, 60, 5), R: b(14, 20, 2), lid: "removable", lidHole: "knob", divX: b(2, 3), divY: b(1, 2), lidLipScore: true }) },
  { name: "Gift box", make: (b) => ({ W: b(120, 200, 10), D: b(80, 140, 10), H: b(50, 100, 10), R: b(16, 34, 2), lid: "removable", lidOver: b(3, 5, 1) }) },
  { name: "Desk tray", make: (b, r) => ({ shape: r() < 0.5 ? "pill" : "rect", W: b(200, 260, 10), D: b(90, 120, 10), R: b(24, 40, 2), H: b(45, 65, 5), lid: "open", baseRing: true }) },
  { name: "Sweet bowl", make: (b) => ({ shape: "poly", sides: b(10, 12, 1), W: b(140, 180, 10), R: b(16, 24, 2), H: b(55, 75, 5), lid: "open" }) },
  { name: "Flip-top box", make: (b) => ({ W: b(150, 200, 10), D: b(110, 140, 5), H: b(60, 85, 5), R: b(18, 28, 2), lid: "flip", lidHole: "finger" }) },
  { name: "Pencil case", make: (b) => ({ shape: "pill", W: b(200, 230, 10), D: b(80, 90, 5), H: b(45, 55, 5), lid: "flip", slit: 40, bridge: 2 }) },
  { name: "Book box", make: (b) => ({ W: b(150, 180, 10), D: b(210, 240, 10), H: b(50, 70, 5), R: b(14, 18, 2), lid: "flip", flipSide: "left", lidOver: b(3, 5, 1), slit: 40, bridge: 2 }) },
  { name: "Mini cabinet", make: (b) => ({ W: b(170, 200, 10), D: b(220, 260, 10), H: b(110, 140, 10), R: b(16, 22, 2), lid: "flip", flipSide: "left", lidHole: "knob", divY: b(1, 3), upright: true, split: 2, fit: { mode: "auto", sheets: 1 } }) },
  { name: "Wall cabinet", make: (b) => ({ W: b(180, 210, 10), D: b(240, 280, 10), H: b(100, 120, 10), R: b(16, 20, 2), lid: "flip", flipSide: "left", lidHole: "knob", divY: b(2, 3), hangHoles: true, upright: true, split: 2, fit: { mode: "auto", sheets: 1 } }) },
  { name: "Chest of drawers", make: (b) => ({ W: b(160, 210, 10), D: b(160, 220, 10), H: b(130, 170, 10), R: b(12, 18, 2), drawers: b(2, 4), split: 2, fit: { mode: "auto", sheets: 1 } }) },
  { name: "Shoebox", make: (b) => ({ W: b(180, 220, 10), D: b(120, 150, 10), H: b(80, 100, 5), R: b(14, 20, 2), lid: "cap", capH: b(30, 40, 5), split: 2, fit: { mode: "auto", sheets: 1 } }) },
  { name: "Hat box", make: (b) => ({ shape: "cyl", dia: b(150, 190, 10), H: b(110, 140, 10), lid: "cap", capH: b(40, 50, 5), split: 2, fit: { mode: "auto", sheets: 1 } }) },
  { name: "Stepped jewellery box", make: (b) => ({ W: b(140, 170, 10), D: b(100, 120, 5), H: b(55, 70, 5), R: b(18, 24, 2), lidSteps: b(1, 2), lidHole: "knob", lidOver: b(2, 4, 1) }) },
  { name: "Display box", make: (b) => ({ W: b(160, 200, 10), D: b(110, 140, 10), H: b(50, 70, 5), R: b(18, 24, 2), lidHole: "rim", lidHoleW: b(14, 18, 1), lidWindow: true }) },
  { name: "Lamp shade", make: (b) => ({ shape: "cyl", dia: b(150, 190, 10), H: b(150, 180, 10), lid: "fixed", lidHole: "lamp", baseHole: "rim", baseHoleW: b(12, 16, 1), split: 2, fit: { mode: "auto", sheets: 1 } }) },
];

/** Settings a random box keeps: the material, the machine and the sheet are the user's. */
const KEEP_KEYS = ["material", "T", "K", "Ky", "gamma", "minFeature", "tabW", "slotClr", "lidGap", "bedW", "bedH", "gap", "fit", "layers", "labels", "testStrip"] as const satisfies readonly (keyof Params)[];

/** The same box with only Free shapes: a rounded rectangle of about the same size. */
function freeShape(q: Params): Params {
  if (q.shape === "rect") return q;
  const w = q.shape === "cyl" ? q.dia : q.W, d = q.shape === "cyl" || q.shape === "poly" ? w : q.D;
  return { ...q, shape: "rect", W: w, D: d, R: Math.round(Math.min(w, d) * (q.shape === "pill" ? 0.45 : 0.3)) };
}

/**
 * A whole new box from the ideas (tissue box, money box, lantern and the rest): shape, size, lid,
 * opening, pattern and lattice, varied a little each time. Material, kerf and sheet stay. Free
 * accounts get Free shapes and patterns only. Falls back to a new pattern when nothing builds.
 */
export function randomHingeBox(p: Params, plan: Plan = "pro", rnd: Rnd = Math.random): Params {
  const between = (lo: number, hi: number, step = 1) => lo + step * Math.floor(rnd() * (Math.floor((hi - lo) / step) + 1));
  const pick = <T,>(a: readonly T[]) => a[Math.min(a.length - 1, Math.floor(rnd() * a.length))];
  const ideas = BOX_IDEAS.filter((i) => i.name !== p.name);
  const kept = Object.fromEntries(KEEP_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, clone(p[k])]));
  for (let i = 0; i < 30; i++) {
    const idea = pick(ideas);
    let q: Params = { ...clone(DEFAULTS), ...idea.make(between, rnd), ...kept, name: idea.name } as Params;
    if (!canUseShape(plan, q.shape)) q = freeShape(q);
    const ownPattern = q.pattern !== DEFAULTS.pattern && canUsePattern(plan, q.pattern) ? q.pattern : undefined;
    q = randomHingePattern(q, (x) => canUsePattern(plan, x), rnd);
    if (ownPattern) q.pattern = ownPattern;
    if (q.lid === "removable" && q.lidLipScore === undefined && rnd() < 0.35) q.lidLipScore = true;
    if (rnd() < 0.5) q.seamFingers = false;
    const m = computeModel(q);
    if ("error" in m) continue;
    if (m.analysis.verdict === "err") {
      const fit = autoFit(q, m.hBody, m.rN);
      if (!fit.ok) continue;
      q = withFittedLattice(q, fit.q);
      const again = computeModel(q);
      if ("error" in again || again.analysis.verdict === "err") continue;
    }
    if (m.issues.some((x) => /left out/.test(x.msg))) continue;
    return q;
  }
  return randomHingePattern(p, (x) => canUsePattern(plan, x), rnd);
}

export const HINGE_PRESETS: Preset<Params>[] = [
  // Contemporary collection. Dimensions stay editable; no automatic scaling of the product.
  { id: "capsule-valet", name: "Capsule valet", note: "Soft pill silhouette with three open compartments for everyday carry", params: { name: "Capsule valet", shape: "pill", W: 240, D: 100, H: 50, lid: "open", divX: 2, slit: 40, bridge: 2, split: 2, bedW: 900, bedH: 600 } },
  { id: "ribbon-desk", name: "Ribbon desk organiser", note: "Continuous rounded ribbon around three tall stationery bays", params: { name: "Ribbon desk organiser", W: 220, D: 110, H: 105, R: 28, lid: "open", divX: 2, slit: 40, bridge: 2, split: 2, bedW: 900, bedH: 600 } },
  { id: "zen-capsule", name: "Zen capsule", note: "Pill-shaped keepsake with a shallow cap and a layered crown", params: { name: "Zen capsule", shape: "pill", W: 180, D: 100, H: 65, lid: "cap", capH: 28, lidSteps: 1, lidStepIn: 6, slit: 40, bridge: 2, split: 2, bedW: 900, bedH: 600 } },
  { id: "folio-case", name: "Folio presentation case", note: "Book-opening cover with a generous curved spine and recessed finger pull", params: { name: "Folio presentation case", W: 190, D: 240, H: 65, R: 28, lid: "flip", flipSide: "left", lidHole: "finger", lidOver: 3, slit: 40, bridge: 2, split: 2, bedW: 900, bedH: 600 } },
  { id: "gallery-hex", name: "Gallery hex", note: "Rounded hexagonal display box with a framed clear insert", params: { name: "Gallery hex", shape: "poly", sides: 6, W: 160, H: 70, R: 24, lidHole: "rim", lidHoleW: 16, lidWindow: true, slit: 40, bridge: 2, bedW: 900, bedH: 600 } },
  { id: "duo-drawers", name: "Duo desk chest", note: "Two rounded drawers with finger pulls in a compact upright case", params: { name: "Duo desk chest", W: 180, D: 180, H: 140, R: 24, drawers: 2, drawerPull: "finger", slit: 40, bridge: 2, split: 2, bedW: 900, bedH: 600 } },
  { id: "wave-tissue", name: "Wave tissue cover", note: "Flowing hinge texture, lift-off refill lid and an elongated dispensing slot", params: { name: "Wave tissue cover", W: 240, D: 140, H: 90, R: 28, pattern: "wave", lidHole: "tissue", lidHoleD: 120, lidHoleW: 35, slit: 40, bridge: 2, split: 2, bedW: 900, bedH: 600 } },
  { id: "contour-canister", name: "Contour canister", note: "Tall cylindrical storage with a stepped cap; add a liner for contents", params: { name: "Contour canister", shape: "cyl", dia: 100, H: 150, lid: "cap", capH: 35, lidSteps: 2, lidStepIn: 6, slit: 40, bridge: 2, bedW: 900, bedH: 600 } },
  { id: "woven-cache", name: "Woven cache", note: "Broad capsule curves, honeycomb walls and a fine hinge band in the cover", params: { name: "Woven cache", shape: "pill", W: 270, D: 180, H: 70, pattern: "honeycomb", slotW: 9.3, pitch: 5.4, lid: "flip", lidHole: "finger", split: 2, bedW: 900, bedH: 600 } },
  { id: "ritual-tray", name: "Ritual tea chest", note: "Six compartments under a stepped lift-off lid; intended for wrapped sachets", params: { name: "Ritual tea chest", W: 220, D: 160, H: 65, R: 28, divX: 2, divY: 1, lidSteps: 1, lidStepIn: 6, lidHole: "knob", slit: 40, bridge: 2, split: 2, bedW: 900, bedH: 600 } },
  { id: "gift-box", name: "Gift box", note: "140 × 90 × 70 mm, lift-off lid", params: { name: "Gift box" } },
  { id: "card-box", name: "Card deck box", note: "Fits a deck of playing cards", params: { name: "Card deck box", W: 100, D: 72, H: 45, R: 18 } },
  { id: "tea-box", name: "Tea box", note: "Large rounded box for tea bags", params: { name: "Tea box", W: 180, D: 110, H: 85, R: 30 } },
  { id: "pencil-cup", name: "Pencil cup", note: "Open round cup, 80 mm across", params: { name: "Pencil cup", shape: "cyl", dia: 80, H: 100, lid: "open" } },
  { id: "keepsake", name: "Round keepsake", note: "Wide cylinder with a lid", params: { name: "Round keepsake", shape: "cyl", dia: 120, H: 60 } },
  { id: "pill-tin", name: "Pill tin", note: "Long box with round ends", params: { name: "Pill tin", shape: "pill", W: 160, D: 60, H: 40, R: 30 } },
  { id: "hex-jewel", name: "Hexagon jewellery box", note: "Six sides, lift-off lid", params: { name: "Hexagon jewellery box", shape: "poly", sides: 6, W: 120, H: 50 } },
  { id: "oct-planter", name: "Octagon planter", note: "Eight sides, open top", params: { name: "Octagon planter", shape: "poly", sides: 8, W: 160, H: 120, lid: "open" } },
  { id: "wave-box", name: "Wave hinge box", note: "Decorative wave pattern", params: { name: "Wave hinge box", pattern: "wave", W: 150, D: 100, H: 70, R: 28 } },
  { id: "serpentine-cup", name: "Serpentine cup", note: "Very flexible hinge, tight bends", params: { name: "Serpentine cup", shape: "cyl", dia: 70, H: 90, lid: "open", pattern: "serpentine" } },
  { id: "relief-box", name: "Relief-cut box", note: "Stress-relief slits, stiffer walls", params: { name: "Relief-cut box", pattern: "relief", W: 130, D: 130, H: 60, R: 30 } },
  { id: "card-prototype", name: "Cardboard prototype", note: "2 mm chipboard, try a size first", params: { name: "Cardboard prototype", material: "card2", T: 2, K: 0.2 } },
  { id: "tissue-box", name: "Tissue box", note: "250 × 130 × 95 mm, tissue slot in a lift-off lid", params: { name: "Tissue box", W: 250, D: 130, H: 95, R: 22, lidHole: "tissue", lidLipScore: true, split: 2, fit: { mode: "auto", sheets: 1 } } },
  { id: "tissue-cube", name: "Cube tissue box", note: "120 mm cube for pop-up tissues", params: { name: "Cube tissue box", W: 120, D: 120, H: 130, R: 24, lidHole: "tissue", pattern: "wave" } },
  { id: "money-box", name: "Money box", note: "Round, closed, with a coin slot", params: { name: "Money box", shape: "cyl", dia: 100, H: 120, lid: "fixed", lidHole: "coin" } },
  { id: "cookie-jar", name: "Cookie jar", note: "Tall cylinder, knob on the lid", params: { name: "Cookie jar", shape: "cyl", dia: 140, H: 150, lidHole: "knob", lidOver: 3, pattern: "wave" } },
  { id: "ring-box", name: "Ring box", note: "Small round box for a ring", params: { name: "Ring box", shape: "cyl", dia: 65, H: 42, cylFlats: 5 } },
  { id: "moroccan-lantern", name: "Moroccan lantern", note: "Open cylinder with quatrefoil walls, for an LED tealight", params: { name: "Moroccan lantern", W: 120, D: 120, R: 30, H: 150, lid: "open", fret: "quatrefoil", fretOn: "walls", fretCell: 16, fretBar: 3 } },
  { id: "floral-jewel", name: "Floral jewellery box", note: "Floral fretwork lid and walls, lift-off lid", params: { name: "Floral jewellery box", W: 180, D: 110, H: 70, R: 26, fret: "floral", fretCell: 14, fretBar: 2.5, lidLipScore: false } },
  { id: "pen-holder-rim", name: "Rounded pen holder", note: "90 × 70 × 110 mm, open top with a 13 mm rim", params: { name: "Rounded pen holder", W: 90, D: 70, H: 110, R: 20, lid: "fixed", lidHole: "rim", lidHoleW: 13 } },
  { id: "honey-lantern", name: "Honeycomb lantern", note: "200 mm open cylinder for an LED candle", params: { name: "Honeycomb lantern", shape: "cyl", dia: 200, H: 130, lid: "open", pattern: "honeycomb", split: 2, fit: { mode: "auto", sheets: 1 } } },
  { id: "watch-box", name: "Watch box", note: "Pill box with a scored lid lip", params: { name: "Watch box", shape: "pill", W: 160, D: 70, H: 55, lidLipScore: true, pattern: "relief" } },
  { id: "pent-planter", name: "Pentagon planter", note: "Five sides with a support ring", params: { name: "Pentagon planter", shape: "poly", sides: 5, W: 150, R: 22, H: 120, lid: "open", baseRing: true } },
  { id: "desk-tray", name: "Desk tray", note: "Long open tray for pens and clips", params: { name: "Desk tray", shape: "pill", W: 230, D: 100, H: 55, lid: "open", baseRing: true, divX: 2, divH: 35 } },
  { id: "tea-chest", name: "Tea chest", note: "Six compartments under a lift-off lid", params: { name: "Tea chest", W: 220, D: 150, H: 85, R: 22, lidHole: "finger", divX: 2, divY: 1, split: 2, fit: { mode: "auto", sheets: 1 } } },
  { id: "jewel-organiser", name: "Jewellery organiser", note: "Twelve small compartments", params: { name: "Jewellery organiser", W: 190, D: 120, H: 55, R: 16, lidHole: "knob", divX: 3, divY: 2, lidLipScore: true } },
  { id: "sweet-bowl", name: "Sweet bowl", note: "Twelve-sided low bowl", params: { name: "Sweet bowl", shape: "poly", sides: 12, W: 160, R: 20, H: 65, lid: "open", pattern: "wave" } },
  { id: "oct-jewel", name: "Octagon jewellery box", note: "Eight sides, knob and overhang", params: { name: "Octagon jewellery box", shape: "poly", sides: 8, W: 130, R: 14, H: 55, lidHole: "knob", lidOver: 3 } },
  // ---- flip-top lids: one plate with a living-hinge band
  { id: "flip-top-box", name: "Flip-top box", note: "Lid with a hinge band at the back, finger hole at the front", params: { name: "Flip-top box", W: 160, D: 115, H: 70, R: 24, lid: "flip", lidHole: "finger" } },
  { id: "pencil-case", name: "Pencil case", note: "Long pill case with a flip-top lid", params: { name: "Pencil case", shape: "pill", W: 220, D: 80, H: 50, lid: "flip", slit: 40, bridge: 2, lidOver: 2 } },
  { id: "glasses-case", name: "Glasses case", note: "Pill case, lid hinged along the back", params: { name: "Glasses case", shape: "pill", W: 175, D: 75, H: 50, lid: "flip", slit: 40, bridge: 2, lidHole: "finger" } },
  { id: "book-box", name: "Book box", note: "Opens like a book: cover hinged on the left", params: { name: "Book box", W: 170, D: 230, H: 60, R: 14, lid: "flip", flipSide: "left", lidOver: 4, slit: 40, bridge: 2, split: 2, fit: { mode: "auto", sheets: 1 } } },
  { id: "cigar-box", name: "Cigar box", note: "Wide flip-top box with an overhanging lid and a knob", params: { name: "Cigar box", W: 230, D: 160, H: 65, R: 18, lid: "flip", lidHole: "knob", lidOver: 3, split: 2, fit: { mode: "auto", sheets: 1 }, slit: 40, bridge: 2 } },
  // ---- cabinets: the box stood on its side, the flip lid as its door
  { id: "mini-cabinet", name: "Mini cabinet", note: "Door hinged on the left, two shelves", params: { name: "Mini cabinet", W: 180, D: 240, H: 130, R: 18, lid: "flip", flipSide: "left", lidHole: "knob", divY: 2, upright: true, split: 2, fit: { mode: "auto", sheets: 1 }, slit: 40, bridge: 2 } },
  { id: "wall-cabinet", name: "Wall cabinet", note: "Hangs on two screws: door, three shelves", params: { name: "Wall cabinet", W: 200, D: 280, H: 110, R: 16, lid: "flip", flipSide: "left", lidHole: "knob", divY: 3, hangHoles: true, upright: true, split: 2, fit: { mode: "auto", sheets: 1 }, slit: 40, bridge: 2 } },
  { id: "display-cabinet", name: "Display cabinet", note: "Framed glass door and two shelves, to hang on a wall", params: { name: "Display cabinet", W: 190, D: 250, H: 110, R: 20, lid: "flip", flipSide: "left", lidHole: "rim", lidHoleW: 16, lidWindow: true, divY: 2, hangHoles: true, upright: true, split: 2, fit: { mode: "auto", sheets: 1 } } },
  { id: "flap-cabinet", name: "Flap-door wall cabinet", note: "Door hinged at the top, one shelf: spices or keys", params: { name: "Flap-door wall cabinet", W: 260, D: 190, H: 100, R: 18, lid: "flip", flipSide: "back", lidHole: "finger", divY: 1, hangHoles: true, upright: true, split: 2, fit: { mode: "auto", sheets: 1 }, slit: 40, bridge: 2 } },
  // ---- chests of drawers
  { id: "desk-drawers", name: "Desk drawers", note: "Two drawers with knob holes", params: { name: "Desk drawers", W: 200, D: 160, H: 170, R: 14, drawers: 2, split: 2, fit: { mode: "auto", sheets: 1 }, slit: 40, bridge: 2 } },
  { id: "jewel-chest", name: "Jewellery chest", note: "Three drawers with finger holes", params: { name: "Jewellery chest", W: 170, D: 210, H: 150, R: 16, drawers: 3, drawerPull: "finger", split: 2, fit: { mode: "auto", sheets: 1 }, slit: 40, bridge: 2 } },
  { id: "craft-drawers", name: "Craft drawers", note: "Four shallow drawers for beads and bits", params: { name: "Craft drawers", W: 150, D: 170, H: 130, R: 15, drawers: 4, split: 2, fit: { mode: "auto", sheets: 1 }, slit: 40, bridge: 2 } },
  // ---- cap lids
  { id: "shoebox", name: "Shoebox gift box", note: "A cap lid slips over the top", params: { name: "Shoebox gift box", W: 200, D: 140, H: 90, R: 16, lid: "cap", capH: 35, split: 2, fit: { mode: "auto", sheets: 1 }, slit: 40, bridge: 2 } },
  { id: "hat-box", name: "Round hat box", note: "Cylinder with a deep cap lid", params: { name: "Round hat box", shape: "cyl", dia: 180, H: 130, lid: "cap", capH: 45, split: 2, fit: { mode: "auto", sheets: 1 } } },
  { id: "tea-tin", name: "Tea tin", note: "Tall cylinder, cap lid with a knob", params: { name: "Tea tin", shape: "cyl", dia: 95, H: 140, lid: "cap", capH: 45, lidHole: "knob" } },
  { id: "stepped-keepsake", name: "Stepped keepsake", note: "Round box with a two-step cap", params: { name: "Stepped keepsake", shape: "cyl", dia: 130, H: 75, lid: "cap", capH: 30, lidSteps: 2, lidHole: "knob" } },
  // ---- stepped and windowed lids
  { id: "stepped-jewel", name: "Stepped jewellery box", note: "Lift-off lid with two stacked steps", params: { name: "Stepped jewellery box", W: 160, D: 115, H: 65, R: 22, lidSteps: 2, lidStepIn: 7, lidHole: "knob", lidOver: 3 } },
  { id: "display-box", name: "Display box", note: "Lift-off lid with a framed clear window", params: { name: "Display box", W: 180, D: 130, H: 60, R: 22, lidHole: "rim", lidHoleW: 16, lidWindow: true, slit: 40, bridge: 2 } },
  // ---- lamps and planters
  { id: "pendant-shade", name: "Pendant lamp shade", note: "Open bottom, E27 holder hole in the top", params: { name: "Pendant lamp shade", shape: "cyl", dia: 180, H: 170, lid: "fixed", lidHole: "lamp", baseHole: "rim", baseHoleW: 14, pattern: "honeycomb", slotW: 9.3, pitch: 5.4, split: 2, fit: { mode: "auto", sheets: 1 } } },
  { id: "table-lamp", name: "Table lamp", note: "Quatrefoil walls, cord hole in the base, open top", params: { name: "Table lamp", W: 130, D: 130, H: 200, R: 32, lid: "fixed", lidHole: "rim", lidHoleW: 14, baseHole: "hole", baseHoleD: 10, fret: "quatrefoil", fretOn: "walls", fretCell: 16, fretBar: 3, split: 2, fit: { mode: "auto", sheets: 1 } } },
  { id: "drain-planter", name: "Planter with drain hole", note: "Six sides, support ring, a hole to drain", params: { name: "Planter with drain hole", shape: "poly", sides: 6, W: 170, R: 22, H: 130, lid: "open", baseRing: true, baseHole: "hole", baseHoleD: 12 } },
];
