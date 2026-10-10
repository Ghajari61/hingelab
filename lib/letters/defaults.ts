import { DEFAULTS as HINGE, bendAnalysis } from "@/lib/hinge";
import type { Params } from "@/lib/hinge";
import type { LetterParams } from "./types";

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
  lidGap: HINGE.lidGap,
  bedW: HINGE.bedW,
  bedH: HINGE.bedH,
  gap: HINGE.gap,
  labels: false,
  layers: {
    outline: { vis: true, exp: true },
    slots: { vis: true, exp: true },
    hinge: { vis: true, exp: true },
    labels: { vis: true, exp: true },
  },
};

/** Feature size below which strokes get a warning. */
export const minFeatureOf = (p: LetterParams) => p.minFeature ?? (p.mode === "box" ? 2 * p.T + 6 : 2);

/** Width of weld and stencil bridges. */
export const bridgeWidthOf = (p: LetterParams) => p.stencilBridge ?? Math.max(2, p.T);

/** The Hinge Box parameter set the shared hinge functions expect. */
export function hingeParamsOf(p: LetterParams): Params {
  return {
    ...HINGE,
    lid: p.lid, material: p.material, T: p.T, K: p.K, cutStyle: p.cutStyle, slotW: p.slotW, pattern: p.pattern,
    slit: p.slit, bridge: p.bridge, pitch: p.pitch, overrun: p.overrun, stretch: p.stretch, tabW: p.tabW,
    slotClr: p.slotClr, lidGap: p.lidGap, bedW: p.bedW, bedH: p.bedH, gap: p.gap, labels: p.labels, layers: p.layers,
  };
}

/** Wall height between the plates. */
export const wallHeightOf = (p: LetterParams) => (p.lid === "open" ? p.depth - p.T : p.depth - 2 * p.T);

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
