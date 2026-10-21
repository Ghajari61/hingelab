/**
 * The design generator: recipes that write ordinary Parametric settings (formula sources, a method
 * and its settings) from a few sliders and a seed. Nothing here is a new geometry path: a generated
 * design is exactly what a person could type into the Source and Method panels, so it saves, undoes,
 * exports and rebuilds on the server like any other design. The same recipe, sliders and seed always
 * give the same settings.
 */
import { FORMULA_DEFAULTS, PARAMETRIC_DEFAULTS } from "./defaults";
import { shapeExpression, type ShapeSpec } from "./shapes";
import type { FormulaSpec, ParametricParams } from "./types";
import { PATTERN_SOURCE_DEFAULTS, type PatternSource } from "./source/pattern";

export type RecipeId = "waves" | "ripples" | "terrain" | "dunes" | "spiral" | "interference" | "bubbles" | "petals" | "sunburst" | "leaf-clock" | "wave-wall" | "organic-wall" | "shelf-wall" | "dune-wall";
/** How a surface recipe is cut. Radial and clock recipes have their own method. */
export type BuildAs = "fins" | "slats" | "horizontal" | "layers" | "waffle";

export const BUILD_AS: { id: BuildAs; name: string; title: string }[] = [
  { id: "fins", name: "Fins", title: "Vertical fins on a shaped plate" },
  { id: "slats", name: "Slat wall", title: "Vertical fins on a full board of plain slats" },
  { id: "horizontal", name: "Horizontal", title: "Fins stacked bottom to top" },
  { id: "layers", name: "Layers", title: "Stacked contour layers" },
  { id: "waffle", name: "Waffle", title: "Two families of slotted ribs" },
];

export interface Knob {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** A choice shown as named buttons; the value is the option's index. */
  options?: string[];
}

export interface Recipe {
  id: RecipeId;
  name: string;
  blurb: string;
  kind: "surface" | "radial" | "curve" | "wall";
  knobs: Knob[];
  defaults: Record<string, number>;
}

export interface Design {
  recipe: RecipeId;
  knobs: Record<string, number>;
  seed: number;
  buildAs: BuildAs;
}

const SIZE: Knob = { id: "size", label: "Width", min: 160, max: 420, step: 10, unit: "mm" };
const SPACING: Knob = { id: "spacing", label: "Fin spacing", min: 5, max: 14, step: 0.5, unit: "mm" };
const FINS: Knob = { id: "fins", label: "Fins", min: 12, max: 30, step: 1 };
const RADIUS: Knob = { id: "radius", label: "Radius", min: 80, max: 170, step: 5, unit: "mm" };

export const RECIPES: Recipe[] = [
  {
    id: "waves", name: "Waves", blurb: "Parallel waves at any angle, gently bent", kind: "surface",
    knobs: [SIZE, { id: "amp", label: "Wave height", min: 3, max: 25, step: 1, unit: "mm" }, { id: "length", label: "Wavelength", min: 15, max: 90, step: 1, unit: "mm" }, { id: "angle", label: "Angle", min: 0, max: 180, step: 5, unit: "°" }, { id: "bend", label: "Bend", min: 0, max: 1, step: 0.05 }, SPACING],
    defaults: { size: 240, amp: 12, length: 45, angle: 30, bend: 0.4, spacing: 7 },
  },
  {
    id: "ripples", name: "Ripples", blurb: "Rings spreading from one to three drops", kind: "surface",
    knobs: [SIZE, { id: "amp", label: "Ring height", min: 3, max: 20, step: 1, unit: "mm" }, { id: "length", label: "Ring spacing", min: 6, max: 30, step: 1, unit: "mm" }, { id: "drops", label: "Drops", min: 1, max: 3, step: 1 }, { id: "fade", label: "Fade", min: 0, max: 1, step: 0.05 }, SPACING],
    defaults: { size: 240, amp: 10, length: 14, drops: 2, fade: 0.5, spacing: 7 },
  },
  {
    id: "terrain", name: "Terrain", blurb: "Hills or ridged mountains from seeded noise", kind: "surface",
    knobs: [SIZE, { id: "height", label: "Height", min: 10, max: 50, step: 1, unit: "mm" }, { id: "scale", label: "Feature size", min: 30, max: 150, step: 5, unit: "mm" }, { id: "rough", label: "Roughness", min: 0, max: 1, step: 0.05 }, { id: "ridges", label: "Ridges", min: 0, max: 1, step: 0.05 }, SPACING],
    defaults: { size: 260, height: 30, scale: 80, rough: 0.5, ridges: 0.5, spacing: 8 },
  },
  {
    id: "dunes", name: "Dunes", blurb: "Wind-blown ridges with soft crests", kind: "surface",
    knobs: [SIZE, { id: "height", label: "Height", min: 5, max: 30, step: 1, unit: "mm" }, { id: "length", label: "Dune spacing", min: 15, max: 60, step: 1, unit: "mm" }, { id: "angle", label: "Wind", min: 0, max: 180, step: 5, unit: "°" }, { id: "wobble", label: "Wobble", min: 0, max: 1, step: 0.05 }, SPACING],
    defaults: { size: 260, height: 14, length: 32, angle: 100, wobble: 0.5, spacing: 7 },
  },
  {
    id: "spiral", name: "Spiral", blurb: "Arms winding out from the centre", kind: "surface",
    knobs: [SIZE, { id: "arms", label: "Arms", min: 2, max: 8, step: 1 }, { id: "wind", label: "Winding", min: 4, max: 24, step: 1, unit: "mm" }, { id: "height", label: "Height", min: 8, max: 30, step: 1, unit: "mm" }, { id: "fade", label: "Fade", min: 0, max: 1, step: 0.05 }, SPACING],
    defaults: { size: 240, arms: 4, wind: 10, height: 16, fade: 0.5, spacing: 7 },
  },
  {
    id: "interference", name: "Interference", blurb: "Overlapping ripples from several sources", kind: "surface",
    knobs: [SIZE, { id: "sources", label: "Sources", min: 2, max: 4, step: 1 }, { id: "length", label: "Wavelength", min: 6, max: 20, step: 1, unit: "mm" }, { id: "amp", label: "Height", min: 4, max: 16, step: 1, unit: "mm" }, SPACING],
    defaults: { size: 240, sources: 2, length: 9, amp: 8, spacing: 7 },
  },
  {
    id: "bubbles", name: "Bubbles", blurb: "Round domes of different sizes", kind: "surface",
    knobs: [SIZE, { id: "count", label: "Bubbles", min: 5, max: 18, step: 1 }, { id: "bubble", label: "Bubble size", min: 12, max: 45, step: 1, unit: "mm" }, { id: "dome", label: "Roundness", min: 0.3, max: 1, step: 0.05 }, SPACING],
    defaults: { size: 240, count: 10, bubble: 28, dome: 0.7, spacing: 7 },
  },
  {
    id: "petals", name: "Flower", blurb: "Radial fins rising in petals", kind: "radial",
    knobs: [RADIUS, { id: "petals", label: "Petals", min: 3, max: 12, step: 1 }, { id: "height", label: "Height", min: 10, max: 40, step: 1, unit: "mm" }, { id: "sharp", label: "Sharpness", min: 1, max: 6, step: 0.5 }, { id: "where", label: "Petal position", min: 0.2, max: 0.8, step: 0.05 }, FINS],
    defaults: { radius: 120, petals: 5, height: 26, sharp: 2, where: 0.45, fins: 30 },
  },
  {
    id: "sunburst", name: "Sunburst", blurb: "Rays that rise at the centre and ripple outwards", kind: "radial",
    knobs: [RADIUS, { id: "height", label: "Height", min: 10, max: 40, step: 1, unit: "mm" }, { id: "falloff", label: "Falloff", min: 0.5, max: 3, step: 0.1 }, { id: "rings", label: "Ripples", min: 0, max: 8, step: 1 }, { id: "lobes", label: "Lobes", min: 0, max: 8, step: 1 }, FINS],
    defaults: { radius: 120, height: 24, falloff: 1.2, rings: 3, lobes: 3, fins: 30 },
  },
  {
    id: "leaf-clock", name: "Clock", blurb: "Fins round a clock insert, cut to an outline", kind: "curve",
    knobs: [
      { id: "fins", label: "Fins", min: 30, max: 90, step: 1 }, { id: "guide", label: "Ring width", min: 90, max: 170, step: 5, unit: "mm" },
      { id: "length", label: "Fin length", min: 40, max: 160, step: 5, unit: "mm" }, { id: "waves", label: "Waves", min: 0, max: 8, step: 1 },
      { id: "depth", label: "Wave depth", min: 0, max: 0.5, step: 0.05 }, { id: "twist", label: "Twist", min: 0, max: 30, step: 1, unit: "°" },
      { id: "outline", label: "Outline", min: 0, max: 4, step: 1, options: ["None", "Leaf", "Star", "Heart", "Oval"] },
    ],
    defaults: { fins: 56, guide: 120, length: 90, waves: 0, depth: 0.2, twist: 12, outline: 1 },
  },
  ...wallRecipes(),
];

/** Wall-art recipes: a pattern source cut as slats on lumber rails (or a slat board). */
function wallRecipes(): Recipe[] {
  const W: Knob = { id: "width", label: "Width", min: 300, max: 700, step: 10, unit: "mm" };
  const D: Knob = { id: "depth", label: "Depth", min: 20, max: 90, step: 1, unit: "mm" };
  const S: Knob = { id: "spacing", label: "Slat spacing", min: 9, max: 18, step: 0.5, unit: "mm" };
  const waves: Knob = { id: "waves", label: "Waves", min: 1, max: 8, step: 0.5 };
  return [
    { id: "wave-wall", name: "Wave wall", blurb: "Slats on rails, a sine swell across them", kind: "wall", knobs: [W, D, waves, { id: "angle", label: "Angle", min: -60, max: 60, step: 5, unit: "°" }, { id: "cross", label: "Cross wave", min: 0, max: 60, step: 5, unit: "%" }, S], defaults: { width: 500, depth: 55, waves: 3, angle: 10, cross: 20, spacing: 13 } },
    { id: "organic-wall", name: "Organic edge", blurb: "Its top and bottom follow the wave", kind: "wall", knobs: [W, D, waves, { id: "edge", label: "Edge", min: 10, max: 45, step: 1, unit: "%" }, S], defaults: { width: 520, depth: 50, waves: 2.5, edge: 30, spacing: 13 } },
    { id: "shelf-wall", name: "Wave shelf", blurb: "A wave with a level shelf set into it", kind: "wall", knobs: [W, D, waves, { id: "shelf", label: "Shelf width", min: 20, max: 70, step: 5, unit: "%" }, S], defaults: { width: 560, depth: 60, waves: 2, shelf: 40, spacing: 13 } },
    { id: "dune-wall", name: "Dune noise", blurb: "Rolling Perlin noise, a different landscape every seed", kind: "wall", knobs: [W, D, { id: "scale", label: "Feature size", min: 60, max: 300, step: 10, unit: "mm" }, { id: "octaves", label: "Detail", min: 1, max: 5, step: 1 }, S], defaults: { width: 480, depth: 45, scale: 150, octaves: 3, spacing: 12 } },
  ];
}

export const recipeOf = (id: RecipeId): Recipe => RECIPES.find((r) => r.id === id) ?? RECIPES[0];

/* ---------- Seeded randomness ---------- */

export function rng(seed: number): () => number {
  let a = Math.imul(Math.round(seed) ^ 0x2545f491, 0x9e3779b1);
  a ^= a >>> 16;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed from the clock and Math.random (not deterministic, by design). */
export const newSeed = () => 1 + Math.floor(Math.random() * 999_998);

const snap = (k: Knob, v: number) => {
  const s = Math.round((v - k.min) / k.step) * k.step + k.min;
  return Math.round(Math.min(k.max, Math.max(k.min, s)) * 1000) / 1000;
};

/* ---------- Formula text ---------- */

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};
/** `x - a` written without "- -". */
const minus = (sym: string, a: number) => (a < 0 ? `${sym} + ${n(-a)}` : a > 0 ? `${sym} - ${n(a)}` : sym);
const plusTerm = (a: number) => (a < 0 ? ` - ${n(-a)}` : ` + ${n(a)}`);

/* ---------- Recipes ---------- */

const surfaceSource = (expression: string, w: number, h: number, base: number): FormulaSpec => ({
  ...FORMULA_DEFAULTS.heightfield, expression, domain: { x: [-w / 2, w / 2], y: [-h / 2, h / 2] }, base, resolution: 160,
});

function surfaceExpression(id: RecipeId, k: Record<string, number>, w: number, h: number, r: () => number): string {
  const rr = (lo: number, hi: number) => lo + (hi - lo) * r();
  switch (id) {
    case "waves": {
      const a = ((k.angle + rr(-6, 6)) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      const L = k.length / (2 * Math.PI), bendL = rr(1.4, 2.6) * k.length;
      return `${n(k.amp)}*sin((${n(c)}*x${plusTerm(s)}*y)/${n(L)} + ${n(k.bend * 3)}*sin((${n(-s)}*x${plusTerm(c)}*y)/${n(bendL / (2 * Math.PI))} + ${n(rr(0, 6.28))}))`;
    }
    case "ripples": {
      const drops = Math.round(k.drops), terms: string[] = [];
      const fade = 40 + (1 - k.fade) * 400;
      for (let i = 0; i < drops; i++) {
        const cx = drops === 1 ? rr(-0.1, 0.1) * w : rr(-0.32, 0.32) * w, cy = drops === 1 ? rr(-0.1, 0.1) * h : rr(-0.3, 0.3) * h;
        const d = `sqrt((${minus("x", cx)})^2 + (${minus("y", cy)})^2)`;
        terms.push(`cos(${d}/${n(k.length / (2 * Math.PI))})*exp(-${d}/${n(fade)})`);
      }
      return `${n(k.amp / Math.sqrt(drops))}*(${terms.join(" + ")})`;
    }
    case "terrain": {
      const S = k.scale, ox = rr(-50, 50), oy = rr(-50, 50);
      const o = (f: number, dx: number, dy: number) => `noise2(x/${n(S / f)}${plusTerm(ox + dx)}, y/${n(S / f)}${plusTerm(oy + dy)})`;
      const fbm = `(${o(1, 0, 0)} + ${n(0.5 * k.rough)}*${o(2.1, 17.3, 5.1)} + ${n(0.25 * k.rough)}*${o(4.3, -8.7, 21.9)})`;
      return `${n(k.height / 2)}*(${n(1 - k.ridges)}*${fbm} + ${n(k.ridges)}*(1 - 2*abs(${fbm})))`;
    }
    case "dunes": {
      const a = (k.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), ox = rr(-40, 40), oy = rr(-40, 40);
      const u = `(${n(c)}*x${plusTerm(s)}*y)`;
      const warp = `${n(k.wobble * 2.5)}*noise2(x/${n(k.length * 2.4)}${plusTerm(ox)}, y/${n(k.length * 2.4)}${plusTerm(oy)})`;
      return `${n(k.height)}*(0.5 + 0.5*sin(${u}/${n(k.length / (2 * Math.PI))} + ${warp}))^1.6`;
    }
    case "spiral": {
      const fade = 60 + (1 - k.fade) * 300, ph = rr(0, 6.28);
      return `${n(k.height)}*(0.5 + 0.5*cos(${Math.round(k.arms)}*atan2(y, x) + sqrt(x^2 + y^2)/${n(k.wind)}${plusTerm(ph)}))*exp(-sqrt(x^2 + y^2)/${n(fade)})`;
    }
    case "interference": {
      const count = Math.round(k.sources), terms: string[] = [];
      for (let i = 0; i < count; i++) {
        const t = (i / count) * 2 * Math.PI + rr(-0.5, 0.5), rad = rr(0.15, 0.3) * Math.min(w, h);
        const d = `sqrt((${minus("x", rad * Math.cos(t))})^2 + (${minus("y", rad * Math.sin(t))})^2)`;
        terms.push(`cos(${d}/${n(k.length * rr(0.9, 1.1))})`);
      }
      return `${n((k.amp * 2) / count)}*(${terms.join(" + ")})*exp(-sqrt(x^2 + y^2)/${n(Math.max(w, h))})`;
    }
    case "bubbles": {
      const count = Math.round(k.count), domes: string[] = [];
      const placed: [number, number, number][] = [];
      for (let tries = 0; placed.length < count && tries < count * 40; tries++) {
        const R = k.bubble * rr(0.45, 1.1);
        const x = rr(-w / 2 + R, w / 2 - R), y = rr(-h / 2 + R, h / 2 - R);
        if (placed.some(([px, py, pr]) => Math.hypot(px - x, py - y) < 0.8 * (pr + R))) continue;
        placed.push([x, y, R]);
      }
      for (const [x, y, R] of placed) domes.push(`sqrt(max(0, ${n(R * R)} - (${minus("x", x)})^2 - (${minus("y", y)})^2))`);
      return `${n(k.dome)}*max(0, ${domes.join(", ")})`;
    }
    default:
      return "0";
  }
}

function surfaceDesign(d: Design, r: () => number): Partial<ParametricParams> {
  const k = d.knobs, w = k.size, h = Math.round(w * (d.recipe === "spiral" || d.recipe === "bubbles" ? 0.8 : 0.7));
  const base = d.buildAs === "slats" ? 1.5 : d.buildAs === "layers" ? 3 : 6;
  const source = surfaceSource(surfaceExpression(d.recipe, k, w, h, r), w, h, base);
  const parallel = (over: Partial<ParametricParams["parallel"]>) => ({ ...PARAMETRIC_DEFAULTS.parallel, spacing: k.spacing, ...over });
  switch (d.buildAs) {
    case "slats": return { source, method: "parallel", parallel: parallel({ backboard: "slats", fillEmptySlots: true, slatDepth: 8, backboardMargin: 10 }) };
    case "horizontal": return { source, method: "parallel", parallel: parallel({ axis: "Y" }) };
    case "layers": return { source, method: "stacked", stacked: { ...PARAMETRIC_DEFAULTS.stacked, axis: "Z", dowelCount: 3 } };
    case "waffle": {
      const s = Math.max(15, Math.round(k.spacing * 3));
      return { source, method: "waffle", waffle: { ...PARAMETRIC_DEFAULTS.waffle, familyAxes: ["X", "Y"], spacingA: s, spacingB: s } };
    }
    default: return { source, method: "parallel", parallel: parallel({}) };
  }
}

function wallDesign(d: Design, r: () => number): Partial<ParametricParams> {
  const k = d.knobs, w = k.width, h = Math.round(w * 0.62);
  const base: PatternSource = { ...PATTERN_SOURCE_DEFAULTS, width: w, height: h, depth: k.depth, seed: d.seed % 100_000 };
  const source: PatternSource = d.recipe === "organic-wall" ? { ...base, style: "organic", waves: k.waves, edge: k.edge, angle: Math.round((r() - 0.5) * 30) }
    : d.recipe === "shelf-wall" ? { ...base, style: "shelf", waves: k.waves, shelves: [{ x0: 0.5 - k.shelf / 200, x1: 0.5 + k.shelf / 200, y: 0.35 + 0.3 * r(), h: 0.07, level: 0.85 }] }
    : d.recipe === "dune-wall" ? { ...base, pattern: "perlin", scale: k.scale, octaves: Math.round(k.octaves) }
    : { ...base, waves: k.waves, angle: k.angle, cross: k.cross };
  const parallel = { ...PARAMETRIC_DEFAULTS.parallel, spacing: k.spacing, backboard: (d.buildAs === "fins" ? "rails" : "slats") as "rails" | "slats", fillEmptySlots: true, slatDepth: 10, backboardMargin: 0 };
  return { source, method: "parallel", parallel, material: { ...PARAMETRIC_DEFAULTS.material, id: "birch6", T: 6, K: 0.2 } };
}

function radialDesign(d: Design, r: () => number): Partial<ParametricParams> {
  const k = d.knobs, r0 = PARAMETRIC_DEFAULTS.radial.innerRadius, L = k.radius - r0;
  const rr = (lo: number, hi: number) => lo + (hi - lo) * r();
  let expression: string;
  if (d.recipe === "petals") {
    const c = k.where * L, wd = L * rr(0.22, 0.32);
    expression = `5 + ${n(k.height)}*exp(-((${minus("s", c)})/${n(wd)})^2)*abs(cos(${n(k.petals / 2)}*theta${plusTerm(rr(0, 1))}))^${n(k.sharp)}`;
  } else {
    const rings = Math.round(k.rings), lobes = Math.round(k.lobes);
    const ripple = rings ? `*(0.8 + 0.2*cos(${n((rings * 2 * Math.PI) / L)}*s${plusTerm(rr(0, 6.28))}))` : "";
    const lobe = lobes ? `*(0.78 + 0.22*cos(${lobes}*theta${plusTerm(rr(0, 6.28))}))` : "";
    expression = `4 + ${n(k.height)}*max(0, 1 - s/${n(L)})^${n(k.falloff)}${ripple}${lobe}`;
  }
  const source: FormulaSpec = { ...FORMULA_DEFAULTS["radial-profile"], expression, domain: { x: [r0, k.radius], y: [0, 0] } };
  return { source, method: "radial", radial: { ...PARAMETRIC_DEFAULTS.radial, count: Math.round(k.fins), profileSource: "formula" } };
}

function curveDesign(d: Design, r: () => number): Partial<ParametricParams> {
  const k = d.knobs, gw = k.guide, gh = Math.round(gw * (0.6 + 0.25 * r()));
  const outline = Math.round(k.outline);
  const finLength: ShapeSpec = k.waves > 0 && k.depth > 0
    ? { shape: "sine", base: k.length, amp: Math.round(k.length * k.depth), waves: Math.round(k.waves), phase: 0, ease: 1 }
    : { shape: "constant", base: k.length, amp: 0, waves: 1, phase: 0, ease: 1 };
  const finHeight: ShapeSpec = { shape: "arch", base: 4, amp: Math.round(12 + 8 * r()), waves: 1, phase: 0, ease: 1 };
  const twist: ShapeSpec = k.twist > 0 ? { shape: "sine", base: 0, amp: Math.round(k.twist), waves: 1 + Math.floor(r() * 2), phase: 0, ease: 1 } : { shape: "constant", base: 0, amp: 0, waves: 1, phase: 0, ease: 1 };
  const reach = gw / 2 + 0.55 * k.length;
  const outlines: (ShapeSpec | null)[] = [
    null,
    { shape: "leaf", base: Math.round(reach * 1.15), amp: 0.45, waves: 1, phase: 0, ease: 1 },
    { shape: "star", base: Math.round(reach * 1.1), amp: 0.35, waves: 5 + 2 * Math.floor(r() * 4), phase: 0, ease: 1 },
    { shape: "heart", base: Math.round(reach), amp: 0.6, waves: 1, phase: 0, ease: 1 },
    { shape: "ellipse", base: Math.round(reach), amp: 0.3, waves: 1, phase: 0, ease: 1 },
  ];
  const o = outlines[outline] ?? null;
  const shapes: ParametricParams["shapes"] = { finLength, finHeight, twist, ...(o ? { outline: o } : {}) };
  const cn: ParametricParams["curveNormal"] = {
    ...PARAMETRIC_DEFAULTS.curveNormal,
    guide: { kind: "ellipse", w: gw, h: gh }, count: Math.round(k.fins),
    finLength: shapeExpression("finLength", finLength), finHeight: shapeExpression("finHeight", finHeight), twist: shapeExpression("twist", twist),
    outerBoundary: o ? { kind: "formula", expression: shapeExpression("outline", o) } : { kind: "none" },
    centerFeature: "clock-insert", clockInsertDia: 60,
  };
  return { method: "curveNormal", curveNormal: cn, shapes };
}

/** The settings a design writes (lay them over the defaults with `mergeParametricParams`). */
export function designParams(d: Design): Partial<ParametricParams> {
  const recipe = recipeOf(d.recipe);
  const k: Record<string, number> = {};
  for (const knob of recipe.knobs) k[knob.id] = snap(knob, d.knobs[knob.id] ?? recipe.defaults[knob.id]);
  const fixed: Design = { ...d, knobs: k };
  const r = rng(d.seed);
  const body = recipe.kind === "surface" ? surfaceDesign(fixed, r) : recipe.kind === "wall" ? wallDesign(fixed, r) : recipe.kind === "radial" ? radialDesign(fixed, r) : curveDesign(fixed, r);
  return { name: designName(fixed), ...body };
}

export function designName(d: Design): string {
  const recipe = recipeOf(d.recipe);
  const how = recipe.kind === "surface" ? ` ${BUILD_AS.find((b) => b.id === d.buildAs)?.name.toLowerCase() ?? "fins"}` : recipe.kind === "wall" ? (d.buildAs === "fins" ? " on rails" : " slat wall") : "";
  return `${recipe.name}${how} #${d.seed}`;
}

export const defaultDesign = (recipe: RecipeId, seed = 1): Design => ({ recipe, knobs: { ...recipeOf(recipe).defaults }, seed, buildAs: "fins" });

/** A random design: any recipe (or the given one), sliders anywhere in their range, and a way to cut it. */
export function randomDesign(seed: number, recipe?: RecipeId): Design {
  const r = rng(seed * 7 + 3);
  const rec = recipe ? recipeOf(recipe) : RECIPES[Math.floor(r() * RECIPES.length)];
  const knobs: Record<string, number> = {};
  for (const k of rec.knobs) knobs[k.id] = snap(k, k.id === "size" ? k.min + (k.max - k.min) * (0.15 + 0.5 * r()) : k.min + (k.max - k.min) * r());
  const ways: BuildAs[] = ["fins", "fins", "slats", "slats", "horizontal", "layers", "waffle"];
  return { recipe: rec.id, knobs, seed, buildAs: rec.kind === "surface" ? ways[Math.floor(r() * ways.length)] : "fins" };
}

/** Nearby designs: the same recipe and cut with a new seed and sliders nudged by up to a sixth of their range. */
export function variations(d: Design, count: number): Design[] {
  const rec = recipeOf(d.recipe);
  return Array.from({ length: count }, (_, i) => {
    const seed = ((d.seed + 7919 * (i + 1)) % 999_998) + 1;
    const r = rng(seed * 13 + 5);
    const knobs: Record<string, number> = {};
    for (const k of rec.knobs) {
      const v = d.knobs[k.id] ?? rec.defaults[k.id];
      knobs[k.id] = k.options || k.id === "size" || k.id === "spacing" ? v : snap(k, v + (r() - 0.5) * ((k.max - k.min) / 3));
    }
    return { ...d, knobs, seed };
  });
}
