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
  { name: "Pencil cup", make: (b, r) => ({ ...(r() < 0.5 ? { shape: "cyl", dia: b(72, 90, 2) } : { shape: "poly", sides: 6, W: b(76, 92, 2), R: b(10, 14, 1) }), H: b(95, 115, 5), lid: "open" }) },
  { name: "Planter", make: (b, r) => ({ shape: "poly", sides: [5, 6, 8][Math.floor(r() * 3)], W: b(130, 180, 10), R: b(14, 22, 2), H: b(100, 150, 10), lid: "open", baseRing: true }) },
  { name: "Lantern", make: (b, r) => ({ shape: "cyl", dia: b(80, 110, 5), H: b(110, 150, 10), lid: "open", pattern: r() < 0.6 ? "honeycomb" : "wave" }) },
  { name: "Card deck box", make: (b) => ({ W: b(98, 102, 1), D: b(70, 74, 1), H: b(42, 48, 1), R: b(14, 18, 1), lid: "removable", lidHole: "finger" }) },
  { name: "Watch box", make: (b) => ({ shape: "pill", W: b(140, 180, 10), D: b(60, 75, 5), H: b(45, 60, 5), lid: "removable", lidLipScore: true }) },
  { name: "Tea box", make: (b) => ({ W: b(170, 190, 5), D: b(100, 120, 5), H: b(80, 95, 5), R: b(24, 32, 2), lid: "removable", lidHole: "finger" }) },
  { name: "Gift box", make: (b) => ({ W: b(120, 200, 10), D: b(80, 140, 10), H: b(50, 100, 10), R: b(16, 34, 2), lid: "removable", lidOver: b(3, 5, 1) }) },
  { name: "Desk tray", make: (b, r) => ({ shape: r() < 0.5 ? "pill" : "rect", W: b(200, 260, 10), D: b(90, 120, 10), R: b(24, 40, 2), H: b(45, 65, 5), lid: "open", baseRing: true }) },
  { name: "Sweet bowl", make: (b) => ({ shape: "poly", sides: b(10, 12, 1), W: b(140, 180, 10), R: b(16, 24, 2), H: b(55, 75, 5), lid: "open" }) },
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
  { id: "tissue-box", name: "Tissue box", note: "250 × 130 × 95 mm, tissue slot in a lift-off lid", params: { name: "Tissue box", W: 250, D: 130, H: 95, R: 18, lidHole: "tissue", lidLipScore: true } },
  { id: "tissue-cube", name: "Cube tissue box", note: "120 mm cube for pop-up tissues", params: { name: "Cube tissue box", W: 120, D: 120, H: 130, R: 24, lidHole: "tissue", pattern: "wave" } },
  { id: "money-box", name: "Money box", note: "Round, closed, with a coin slot", params: { name: "Money box", shape: "cyl", dia: 100, H: 120, lid: "fixed", lidHole: "coin" } },
  { id: "cookie-jar", name: "Cookie jar", note: "Tall cylinder, knob on the lid", params: { name: "Cookie jar", shape: "cyl", dia: 140, H: 150, lidHole: "knob", lidOver: 3, pattern: "wave" } },
  { id: "ring-box", name: "Ring box", note: "Small round box for a ring", params: { name: "Ring box", shape: "cyl", dia: 65, H: 42, cylFlats: 5 } },
  { id: "honey-lantern", name: "Honeycomb lantern", note: "Open cylinder for an LED tealight", params: { name: "Honeycomb lantern", shape: "cyl", dia: 95, H: 130, lid: "open", pattern: "honeycomb" } },
  { id: "watch-box", name: "Watch box", note: "Pill box with a scored lid lip", params: { name: "Watch box", shape: "pill", W: 160, D: 70, H: 55, lidLipScore: true, pattern: "relief" } },
  { id: "pent-planter", name: "Pentagon planter", note: "Five sides with a support ring", params: { name: "Pentagon planter", shape: "poly", sides: 5, W: 150, R: 18, H: 120, lid: "open", baseRing: true } },
  { id: "desk-tray", name: "Desk tray", note: "Long open tray for pens and clips", params: { name: "Desk tray", shape: "pill", W: 230, D: 100, H: 55, lid: "open", baseRing: true } },
  { id: "sweet-bowl", name: "Sweet bowl", note: "Twelve-sided low bowl", params: { name: "Sweet bowl", shape: "poly", sides: 12, W: 160, R: 20, H: 65, lid: "open", pattern: "wave" } },
  { id: "oct-jewel", name: "Octagon jewellery box", note: "Eight sides, knob and overhang", params: { name: "Octagon jewellery box", shape: "poly", sides: 8, W: 130, R: 14, H: 55, lidHole: "knob", lidOver: 3 } },
];
