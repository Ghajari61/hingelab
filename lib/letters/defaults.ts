import { FRET_KINDS } from "@/lib/generators/fretwork";
import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { bendAnalysis } from "@/lib/hinge/analysis";
import type { Params } from "@/lib/hinge";
import type { LetterCutout, LetterParams } from "./types";

export const LETTER_DEFAULTS: LetterParams = {
  name: "Untitled letters",
  text: "Sam",
  fontId: "fredoka",
  direction: "auto",
  sizeMode: "capHeight",
  size: 150,
  letterSpacing: 0,
  weld: "word",
  mode: "solid",

  thicken: 0,
  minFeature: null,

  depth: 60,
  lid: "removable",
  wallStyle: "hinge",
  facetTol: 1,
  panelMin: 15,
  minCornerRadius: "auto",
  smallIslands: "flat",
  stackIslands: false,
  islandArea: 400,
  marquee: { enabled: false, holeDia: 12, spacing: 40, margin: 6 },
  wallMaxLength: null,

  stencilBridge: null,
  bridgesPerIsland: 1,
  weldDots: false,
  sheetMargin: 20,

  material: HINGE.material,
  T: HINGE.T,
  K: HINGE.K,
  cutStyle: HINGE.cutStyle,
  slotW: HINGE.slotW,
  pattern: HINGE.pattern,
  // Longer slits than the Hinge Box: letter curves are tight, and the corner radius follows the lattice.
  slit: 40,
  bridge: HINGE.bridge,
  pitch: HINGE.pitch,
  overrun: HINGE.overrun,
  stretch: HINGE.stretch,
  tabW: HINGE.tabW,
  slotClr: HINGE.slotClr,
  baseRim: 0,
  lidGap: HINGE.lidGap,
  bedW: HINGE.bedW,
  bedH: HINGE.bedH,
  gap: HINGE.gap,
  labels: false,
  fit: { mode: "off", sheets: 1 },
  layers: {
    outline: { vis: true, exp: true },
    slots: { vis: true, exp: true },
    hinge: { vis: true, exp: true },
    labels: { vis: true, exp: true },
  },
};

/**
 * The removed "Persian sign" sample. A local draft that is still that sample (the name and the
 * word, whatever else was changed) opens as a new design instead.
 */
export function retiredLetterSample(p: { name?: string; text?: string } | null | undefined): boolean {
  return p?.name === "Persian sign" && (p.text ?? "").trim() === "سلام";
}

/** Saved or sent settings over the defaults; nested groups merge key by key. */
export function mergeLetterParams(partial?: Partial<LetterParams> | null): LetterParams {
  const base = clone(LETTER_DEFAULTS);
  if (!partial) return base;
  const out = Object.assign(base, partial, {
    layers: Object.assign(clone(LETTER_DEFAULTS.layers), partial.layers || {}),
    marquee: Object.assign(clone(LETTER_DEFAULTS.marquee), partial.marquee || {}),
  });
  const cut = cleanCutout(partial.cutout);
  if (cut) out.cutout = cut; else delete out.cutout;
  return out;
}

const CUTOUT_KINDS = FRET_KINDS.filter((k): k is LetterCutout["kind"] => k !== "none" && k !== "motif" && k !== "tile");
/** Letter-box pattern kinds (a motif needs a tile, which letters do not pick). */
export const LETTER_CUTOUT_KINDS: readonly LetterCutout["kind"][] = CUTOUT_KINDS;
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
/** A saved or sent pattern, or none for anything that is not one. */
export function cleanCutout(raw: unknown): LetterCutout | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<LetterCutout>;
  if (!CUTOUT_KINDS.includes(r.kind as LetterCutout["kind"])) return undefined;
  return { kind: r.kind!, on: r.on === "lid" || r.on === "base" ? r.on : "both", cell: num(r.cell, 6, 80, 16), bar: num(r.bar, 1, 15, 3) };
}

/** Feature size below which strokes get a warning. */
export const minFeatureOf = (p: LetterParams) => p.minFeature ?? (p.mode === "box" ? 2 * p.T + 6 : 2);

/** Width of weld and stencil bridges. */
export const bridgeWidthOf = (p: LetterParams) => p.stencilBridge ?? Math.max(2, p.T);

/** The Hinge Box parameter set the shared hinge functions expect. */
export function hingeParamsOf(p: LetterParams): Params {
  return {
    ...HINGE,
    seamFingers: false,
    lid: p.lid, material: p.material, T: p.T, K: p.K, cutStyle: p.cutStyle, slotW: p.slotW, pattern: p.pattern,
    slit: p.slit, bridge: p.bridge, pitch: p.pitch, overrun: p.overrun, stretch: p.stretch, tabW: p.tabW,
    slotClr: p.slotClr, lidGap: p.lidGap, bedW: p.bedW, bedH: p.bedH, gap: p.gap, labels: p.labels, layers: p.layers,
  };
}

/** Wall height between the plates. */
export const wallHeightOf = (p: LetterParams) => (p.lid === "open" ? p.depth - p.T : p.depth - 2 * p.T);

/** Layers each flat small piece is cut in: one, or enough to stack to the box depth. */
export const stackLayersOf = (p: LetterParams) => (p.stackIslands ? Math.max(1, Math.round(p.depth / p.T)) : 1);

/** Longest wall strip before it is split. */
export const wallMaxLengthOf = (p: LetterParams) => p.wallMaxLength ?? p.bedW - 20;

/**
 * Corner radius for rounding the letters. Hinge walls: the lattice's smallest bend radius × 1.3,
 * plus T/2 from the centerline to the plate edge. Flat panels need no rounding.
 */
export function cornerRadiusOf(p: LetterParams) {
  if (typeof p.minCornerRadius === "number") return p.minCornerRadius;
  if (p.wallStyle === "faceted") return 0;
  return bendAnalysis(hingeParamsOf(p), wallHeightOf(p), 1).rMin * 1.3 + p.T / 2;
}

/**
 * Radius for concave corners and counters. The wall stands on the material side, so its centerline
 * runs T/2 outside a concave edge and bends T/2 wider than the edge, where a convex edge bends T/2
 * tighter. A concave edge therefore needs T less than cornerRadiusOf.
 */
export const concaveRadiusOf = (p: LetterParams) => Math.max(0, cornerRadiusOf(p) - p.T);
