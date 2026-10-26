import type { Preset } from "@/lib/presets";
import { FORMULA_DEFAULTS, LEAF_CLOCK, PARAMETRIC_DEFAULTS, TEXT_DEFAULTS } from "./defaults";
import type { ShapeId, ShapeSpec } from "./shapes";
import type { FormulaSpec, LibraryId, ParametricParams } from "./types";
import { PATTERN_SOURCE_DEFAULTS, type PatternSource } from "./source/patternSpec";

export type ParametricCategory = "portraits" | "wall-art" | "nature" | "abstract" | "lamps" | "clocks" | "typography" | "radial" | "papercraft";

export const PARAMETRIC_CATEGORIES: { id: ParametricCategory; name: string }[] = [
  { id: "portraits", name: "Portraits & faces" },
  { id: "wall-art", name: "Wall art & waves" },
  { id: "nature", name: "Nature & flowers" },
  { id: "abstract", name: "Abstract & formula" },
  { id: "lamps", name: "Lamps & vessels" },
  { id: "clocks", name: "Clocks & frames" },
  { id: "typography", name: "Typography" },
  { id: "radial", name: "Radial & sunburst" },
  { id: "papercraft", name: "Papercraft" },
];

/** How the parts are drawn in the 3D view (a look only; the cut files are the same). */
export type Finish = "wood" | "dark" | "white";

export interface ParametricPreset extends Preset<ParametricParams> {
  category: ParametricCategory;
  /** Extra words for the design search. */
  tags?: string[];
  /** The 3D view's look when the design is opened from the gallery. */
  finish?: Finish;
}

/** 0.3 mm card for the folded presets. */
const CARD: ParametricParams["material"] = { ...PARAMETRIC_DEFAULTS.material, id: "custom", T: 0.3, K: 0.05 };

const lib = (id: LibraryId): ParametricParams["source"] => ({ kind: "library", id });
const fins = (over: Partial<ParametricParams["parallel"]>): ParametricParams["parallel"] => ({ ...PARAMETRIC_DEFAULTS.parallel, ...over });
/** Plain slats across the whole board, every fin row continuing as a slat. */
const SLAT_WALL: Partial<ParametricParams["parallel"]> = { backboard: "slats", fillEmptySlots: true, slatDepth: 8, backboardMargin: 10 };
const stack = (over: Partial<ParametricParams["stacked"]>): ParametricParams["stacked"] => ({ ...PARAMETRIC_DEFAULTS.stacked, ...over });
const radial = (over: Partial<ParametricParams["radial"]>): ParametricParams["radial"] => ({ ...PARAMETRIC_DEFAULTS.radial, ...over });
/** Wall art: a pattern source, cut as slats on lumber rails (or a slat board) from 6 mm birch. */
const BIRCH6: ParametricParams["material"] = { ...PARAMETRIC_DEFAULTS.material, id: "birch6", T: 6, K: 0.2 };
const wallArt = (src: Partial<PatternSource>, over: Partial<ParametricParams["parallel"]> = {}, material = BIRCH6): Partial<ParametricParams> => ({
  source: { ...PATTERN_SOURCE_DEFAULTS, resolution: 120, ...src },
  method: "parallel",
  parallel: fins({ backboard: "rails", fillEmptySlots: true, backboardMargin: 0, slatDepth: 10, spacing: 13, rails: { lumber: "1x2", count: 2, clearance: 0.5 }, ...over }),
  material,
});
const folded = (faces: number): Partial<ParametricParams> => ({ method: "folded", folded: { ...PARAMETRIC_DEFAULTS.folded, faces }, material: CARD });
const surface = (expression: string, w = 220, h = 160, base = 6): FormulaSpec => ({ ...FORMULA_DEFAULTS.heightfield, expression, domain: { x: [-w / 2, w / 2], y: [-h / 2, h / 2] }, base });
const burst = (expression: string, r0 = 20, r1 = 120): FormulaSpec => ({ ...FORMULA_DEFAULTS["radial-profile"], expression, domain: { x: [r0, r1], y: [0, 0] } });
const shape = (s: ShapeId, base: number, amp: number, extra: Partial<ShapeSpec> = {}): ShapeSpec => ({ shape: s, base, amp, waves: 1, phase: 0, ease: 1, ...extra });

type CurveShapes = { finLength?: ShapeSpec; finHeight?: ShapeSpec; twist?: ShapeSpec; outline?: ShapeSpec };

/**
 * A clock or frame along a curve, with its shape specs (so the shape buttons recognise them) and the formulas
 * `shapeExpression` writes for them, kept literal so the start screen does not load the shape writer (a test checks they match).
 */
function curve(over: Partial<ParametricParams["curveNormal"]>, specs: CurveShapes, formulas: { [K in keyof CurveShapes]: string }): Partial<ParametricParams> {
  const cn: ParametricParams["curveNormal"] = { ...PARAMETRIC_DEFAULTS.curveNormal, ...over };
  if (formulas.finLength) cn.finLength = formulas.finLength;
  if (formulas.finHeight) cn.finHeight = formulas.finHeight;
  if (formulas.twist) cn.twist = formulas.twist;
  if (formulas.outline) cn.outerBoundary = { kind: "formula", expression: formulas.outline };
  return { method: "curveNormal", curveNormal: cn, shapes: specs };
}

export const PARAMETRIC_PRESETS: ParametricPreset[] = [
  {"id":"studio-wave-relief","category":"wall-art","tags":["wave","sine"],"name":"Cross-current relief","note":"Cross-current relief: editable dimensions and construction settings. Sine relief as parallel fins","params":{"name":"Cross-current relief","source":{"kind":"library","id":"wave-panel"},"parallel":fins({spacing:10,axis:"Y"})}},
  {"id":"studio-atlas-stack","category":"nature","tags":["mountains","contour","topographic","map","layers"],"name":"Atlas contour sculpture","note":"Atlas contour sculpture: editable dimensions and construction settings. The mountains as stacked contour layers","params":{"name":"Atlas contour sculpture","source":{"kind":"library","id":"terrain"},"method":"stacked","stacked":{"axis":"Z","dowels":true,"dowelCount":2,"registrationMarks":true,"hollow":false,"shell":8}}},
  {"id":"studio-fluted-vessel","category":"lamps","tags":["vase","radial"],"name":"Fluted display vessel","note":"Fluted display vessel: editable dimensions and construction settings. Profile fins round the axis","params":{"name":"Fluted display vessel","source":{"kind":"library","id":"vase"},"method":"radial","radial":{"axis":"Y","axisPoint":null,"count":24,"angleRange":[0,360],"innerRadius":20,"hubPlates":1,"hubWidth":20,"profileSource":"mesh"}}},
  // Portraits & faces
  {
    id: "slat-portrait", category: "portraits", finish: "dark", tags: ["face", "veil", "hair", "slats", "slat wall", "fins", "featured"],
    name: "Veiled portrait slat wall", note: "A face behind sweeping strands, fins on a full slat board",
    params: { name: "Veiled portrait slat wall", source: lib("veiled-face-cc0"), parallel: fins({ ...SLAT_WALL, spacing: 6 }) },
  },
  {
    id: "slat-portrait-fine", category: "portraits", finish: "white", tags: ["face", "veil", "hair", "slats", "fine"],
    name: "Veiled portrait, fine fins", note: "The same portrait in closer, shallower slats",
    params: { name: "Veiled portrait, fine fins", source: lib("veiled-face-cc0"), parallel: fins({ ...SLAT_WALL, spacing: 5, slatDepth: 6, backboardMargin: 5 }) },
  },
  { id: "head-fins", category: "portraits", tags: ["face", "head"], name: "Head in fins", note: "Abstract head, parallel fins", params: { name: "Head in fins" } },
  {
    id: "serene-fins", category: "portraits", tags: ["face", "eyes closed", "plate"],
    name: "Serene face", note: "Calm face with closed eyes, fins on a shaped plate",
    params: { name: "Serene face", source: lib("face-cc0"), parallel: fins({ spacing: 8 }) },
  },
  {
    id: "serene-slats", category: "portraits", finish: "dark", tags: ["face", "slats", "slat wall"],
    name: "Serene face slat wall", note: "The face rising out of a wide slat board",
    params: { name: "Serene face slat wall", source: lib("face-cc0"), parallel: fins({ ...SLAT_WALL, spacing: 6, backboardMargin: 40 }) },
  },
  {
    id: "serene-horizontal", category: "portraits", tags: ["face", "horizontal"],
    name: "Face in horizontal fins", note: "Fins stacked bottom to top",
    params: { name: "Face in horizontal fins", source: lib("face-cc0"), parallel: fins({ axis: "Y", spacing: 8 }) },
  },
  {
    id: "profile-slats", category: "portraits", tags: ["face", "profile", "side", "slats"],
    name: "Profile slat wall", note: "A face in profile on plain slats",
    params: { name: "Profile slat wall", source: lib("profile-face-cc0"), parallel: fins({ ...SLAT_WALL, spacing: 6 }) },
  },
  {
    id: "profile-stack", category: "portraits", tags: ["face", "profile", "layers", "topographic"],
    name: "Stacked profile", note: "Topographic layers of a face in profile",
    params: { name: "Stacked profile", source: lib("profile-face-cc0"), method: "stacked", stacked: stack({ axis: "Z" }) },
  },
  { id: "head-stack", category: "portraits", tags: ["face", "layers"], name: "Stacked head", note: "Topographic layers", params: { name: "Stacked head", method: "stacked", stacked: stack({ axis: "Z" }) } },

  // Wall art & waves
  { id: "wave-fins", category: "wall-art", tags: ["wave", "sine"], name: "Wave wall panel", note: "Sine relief as parallel fins", params: { name: "Wave wall panel", source: lib("wave-panel") } },
  { id: "ripple-fins", category: "wall-art", tags: ["ripple", "rings"], name: "Ripple panel", note: "Rings fading from the centre", params: { name: "Ripple panel", source: lib("ripple") } },
  {
    id: "ocean-fins", category: "wall-art", tags: ["sea", "wave", "water"],
    name: "Ocean wave", note: "A rolling swell in vertical fins",
    params: { name: "Ocean wave", source: lib("ocean-wave"), parallel: fins({ spacing: 9 }) },
  },
  {
    id: "diagonal-slats", category: "wall-art", tags: ["wave", "diagonal", "slats"],
    name: "Diagonal wave slats", note: "Waves at 45° running across a slat wall",
    params: { name: "Diagonal wave slats", source: lib("diagonal-waves"), parallel: fins({ ...SLAT_WALL, spacing: 7 }) },
  },
  {
    id: "sound-fins", category: "wall-art", tags: ["audio", "music", "voice", "waveform"],
    name: "Sound wave", note: "An audio waveform, one fin per bar",
    params: { name: "Sound wave", source: lib("sound-wave"), parallel: fins({ spacing: 10 }) },
  },
  {
    id: "flow-slats", category: "wall-art", tags: ["marble", "organic", "slats"],
    name: "Flow lines", note: "Marbled ridges on a slat board",
    params: { name: "Flow lines", source: lib("flow-lines"), parallel: fins({ ...SLAT_WALL, spacing: 7 }) },
  },
  {
    id: "hex-fins", category: "wall-art", tags: ["hexagon", "honeycomb", "geometric"],
    name: "Honeycomb domes", note: "Hexagon domes in horizontal fins",
    params: { name: "Honeycomb domes", source: lib("hex-bumps"), parallel: fins({ ...SLAT_WALL, axis: "Y", spacing: 8 }) },
  },
  {
    id: "mandala-fins", category: "wall-art", tags: ["mandala", "round", "pattern"],
    name: "Mandala", note: "Rings of petals and beads",
    params: { name: "Mandala", source: lib("mandala"), parallel: fins({ ...SLAT_WALL, spacing: 7 }) },
  },
  {
    id: "heart-fins", category: "wall-art", tags: ["love", "heart", "valentine"],
    name: "Puffy heart", note: "A heart in fins on a heart-shaped plate",
    params: { name: "Puffy heart", source: lib("heart"), parallel: fins({ spacing: 8 }) },
  },
  { id: "wa-ocean-swell", category: "wall-art", tags: ["wave", "slats", "rails", "laserburn"], name: "Ocean swell on rails", note: "Sine swell across 6 mm slats on two 1x2 rails", params: { name: "Ocean swell on rails", ...wallArt({ width: 560, height: 360, depth: 55, waves: 3, angle: 12, cross: 25 }) } },
  { id: "wa-diagonal-dunes", category: "wall-art", tags: ["wave", "diagonal", "dunes"], name: "Diagonal dunes", note: "Waves at 35° on a slat board", params: { name: "Diagonal dunes", ...wallArt({ width: 520, height: 340, depth: 45, waves: 4, angle: 35, cross: 0 }, { backboard: "slats", backboardMargin: 10 }) } },
  { id: "wa-ridge-river", category: "wall-art", tags: ["ridge", "curve", "river"], name: "River ridge", note: "A crest that winds along your curve", params: { name: "River ridge", ...wallArt({ pattern: "ridge", width: 600, height: 360, depth: 60, ridgeWidth: 22 }) } },
  { id: "wa-topography", category: "wall-art", tags: ["noise", "perlin", "terrain", "topography"], name: "Topography", note: "Rolling Perlin noise, like a contour map", params: { name: "Topography", ...wallArt({ pattern: "perlin", width: 540, height: 360, depth: 50, scale: 160, octaves: 4, seed: 42 }) } },
  { id: "wa-ripple-pond", category: "wall-art", tags: ["ripple", "rings", "water"], name: "Ripple pond", note: "Rings spreading from a point you place", params: { name: "Ripple pond", ...wallArt({ pattern: "ripple", width: 500, height: 380, depth: 40, waves: 3, center: [0.42, 0.45] }) } },
  { id: "wa-mountains", category: "wall-art", tags: ["mountain", "range", "landscape", "organic"], name: "Mountain range", note: "A ridged skyline whose top follows the peaks", params: { name: "Mountain range", ...wallArt({ pattern: "mountain", style: "organic", width: 620, height: 340, depth: 60, edge: 22, scale: 180, seed: 9 }) } },
  { id: "wa-push-pull", category: "wall-art", tags: ["attractor", "points", "bubbles"], name: "Push and pull", note: "Points that push the surface out or pull it in", params: { name: "Push and pull", ...wallArt({ pattern: "attractors", width: 480, height: 360, depth: 50, scale: 110, points: [{ x: 0.28, y: 0.4, s: 1 }, { x: 0.7, y: 0.3, s: 0.7 }, { x: 0.58, y: 0.72, s: -0.8 }] }) } },
  { id: "wa-organic-swell", category: "wall-art", tags: ["organic", "edge", "wave"], name: "Organic edge swell", note: "The top and bottom ride the wave", params: { name: "Organic edge swell", ...wallArt({ style: "organic", width: 560, height: 380, depth: 50, waves: 2.5, edge: 30 }) } },
  { id: "wa-wave-shelf", category: "wall-art", tags: ["shelf", "wave", "functional"], name: "Wave shelf", note: "A level shelf set into a wave, for a plant or a photo", params: { name: "Wave shelf", ...wallArt({ style: "shelf", width: 600, height: 400, depth: 70, waves: 2, shelves: [{ x0: 0.3, x1: 0.7, y: 0.45, h: 0.07, level: 0.9 }] }) } },
  { id: "wa-double-shelf", category: "wall-art", tags: ["shelf", "wave", "functional"], name: "Two-shelf wave", note: "Two level shelves at different heights", params: { name: "Two-shelf wave", ...wallArt({ style: "shelf", width: 640, height: 440, depth: 70, waves: 2.5, shelves: [{ x0: 0.1, x1: 0.45, y: 0.32, h: 0.07, level: 0.85 }, { x0: 0.55, x1: 0.9, y: 0.68, h: 0.07, level: 0.85 }] }) } },
  { id: "wa-tall-wave", category: "wall-art", tags: ["tall", "narrow", "wave"], name: "Tall wave panel", note: "A narrow upright wave on one 1x3 rail", params: { name: "Tall wave panel", ...wallArt({ width: 280, height: 560, depth: 45, waves: 2, angle: 80, cross: 15 }, { rails: { lumber: "1x3", count: 1, clearance: 0.5 } }) } },
  { id: "wa-quarter-inch", category: "wall-art", tags: ["1/4 inch", "plywood", "rails"], name: "Quarter-inch wave", note: "1/4\" birch slats on two 1x4 rails", params: { name: "Quarter-inch wave", ...wallArt({ width: 600, height: 400, depth: 60, waves: 2.5, angle: -15, cross: 30 }, { spacing: 14, rails: { lumber: "1x4", count: 2, clearance: 0.5 } }, { ...BIRCH6, id: "birch14", T: 6.35 }) } },
  {
    id: "star-fins", category: "wall-art", tags: ["star", "geometric"],
    name: "Ridged star", note: "Five ridged arms in horizontal fins",
    params: { name: "Ridged star", source: lib("star"), parallel: fins({ axis: "Y", spacing: 8 }) },
  },

  // Nature & flowers
  {
    id: "terrain-fins", category: "nature", tags: ["mountains", "landscape", "terrain"],
    name: "Mountain range", note: "Ridged peaks in vertical fins",
    params: { name: "Mountain range", source: lib("terrain"), parallel: fins({ spacing: 9 }) },
  },
  {
    id: "terrain-stack", category: "nature", tags: ["mountains", "contour", "topographic", "map", "layers"],
    name: "Contour map", note: "The mountains as stacked contour layers",
    params: { name: "Contour map", source: lib("terrain"), method: "stacked", stacked: stack({ axis: "Z", dowelCount: 3 }) },
  },
  {
    id: "dunes-fins", category: "nature", tags: ["sand", "desert", "dunes"],
    name: "Sand dunes", note: "Wind-blown dunes in horizontal fins",
    params: { name: "Sand dunes", source: lib("sand-dunes"), parallel: fins({ ...SLAT_WALL, axis: "Y", spacing: 7 }) },
  },
  {
    id: "rose-fins", category: "nature", tags: ["flower", "rose", "petals"],
    name: "Rose", note: "Layered petals on a round plate",
    params: { name: "Rose", source: lib("rose"), parallel: fins({ spacing: 8 }) },
  },
  {
    id: "lotus-fins", category: "nature", tags: ["flower", "lotus", "petals"],
    name: "Lotus", note: "Pointed petals in two rings",
    params: { name: "Lotus", source: lib("lotus"), parallel: fins({ spacing: 8 }) },
  },
  {
    id: "shell-fins", category: "nature", tags: ["shell", "spiral", "nautilus", "sea"],
    name: "Spiral shell", note: "Logarithmic spiral ridges",
    params: { name: "Spiral shell", source: lib("shell-spiral"), parallel: fins({ spacing: 8 }) },
  },
  {
    id: "moon-fins", category: "nature", tags: ["moon", "craters", "space"],
    name: "Full moon", note: "Craters in horizontal fins",
    params: { name: "Full moon", source: lib("moon"), parallel: fins({ axis: "Y", spacing: 8 }) },
  },
  {
    id: "pebbles-fins", category: "nature", tags: ["stones", "river", "zen"],
    name: "River pebbles", note: "Smooth stones in vertical fins",
    params: { name: "River pebbles", source: lib("pebbles"), parallel: fins({ ...SLAT_WALL, spacing: 8 }) },
  },

  // Abstract & formula
  { id: "dunes", category: "abstract", tags: ["formula", "surface"], name: "Formula dunes", note: "Height field from a formula", params: { name: "Formula dunes", source: FORMULA_DEFAULTS.heightfield } },
  {
    id: "interference", category: "abstract", tags: ["formula", "ripples", "waves", "physics"],
    name: "Interference", note: "Two ripple sources overlapping",
    params: { name: "Interference", source: surface("9*(cos(sqrt((x + 45)^2 + y^2)/8) + cos(sqrt((x - 45)^2 + y^2)/8))*exp(-sqrt(x^2 + y^2)/160)"), parallel: fins({ spacing: 8 }) },
  },
  {
    id: "noise-hills", category: "abstract", tags: ["formula", "noise", "hills", "organic"],
    name: "Noise hills", note: "Two octaves of seeded noise",
    params: { name: "Noise hills", source: surface("22*noise2(x/70 + 3.1, y/70 - 1.7) + 7*noise2(x/24 + 9.2, y/24 + 4.4)"), parallel: fins({ axis: "Y", spacing: 8 }) },
  },
  {
    id: "egg-crate", category: "abstract", tags: ["formula", "waffle", "grid", "bumps"],
    name: "Egg-crate grid", note: "Bumps and dips as a waffle on the wall",
    params: { name: "Egg-crate grid", source: surface("12*sin(x/18)*sin(y/18)", 200, 160, 6), method: "waffle", waffle: { ...PARAMETRIC_DEFAULTS.waffle, familyAxes: ["X", "Y"], spacingA: 22, spacingB: 22 } },
  },
  {
    id: "ribbons", category: "abstract", tags: ["formula", "ribbons", "twist", "slats"],
    name: "Twisted ribbons", note: "Bent waves on a slat board",
    params: { name: "Twisted ribbons", source: surface("13*sin(x/19 + 2.6*sin(y/38))", 220, 170), parallel: fins({ ...SLAT_WALL, axis: "Y", spacing: 7 }) },
  },
  {
    id: "spiral-surface", category: "abstract", tags: ["formula", "spiral", "galaxy"],
    name: "Spiral galaxy", note: "Five arms winding out from the centre",
    params: { name: "Spiral galaxy", source: surface("16*(0.5 + 0.5*cos(5*atan2(y, x) + sqrt(x^2 + y^2)/10))*exp(-sqrt(x^2 + y^2)/110)", 220, 220, 6), parallel: fins({ ...SLAT_WALL, spacing: 7 }) },
  },

  // Lamps & vessels
  { id: "sphere-waffle", category: "lamps", tags: ["sphere", "globe", "waffle"], name: "Waffle sphere", note: "Two families of slotted ribs", params: { name: "Waffle sphere", source: lib("sphere"), method: "waffle" } },
  { id: "vase-stack", category: "lamps", tags: ["vase", "layers"], name: "Stacked vase", note: "Layers glued on dowels", params: { name: "Stacked vase", source: lib("vase"), method: "stacked" } },
  { id: "vase-radial", category: "lamps", tags: ["vase", "radial"], name: "Radial vase", note: "Profile fins round the axis", params: { name: "Radial vase", source: lib("vase"), method: "radial", radial: radial({ axis: "Y" }) } },
  { id: "turned-vase", category: "lamps", tags: ["vase", "formula", "layers"], name: "Formula vase", note: "Turned profile, stacked", params: { name: "Formula vase", source: FORMULA_DEFAULTS.revolution, method: "stacked" } },
  {
    id: "globe-lamp", category: "lamps", tags: ["lamp", "shade", "pendant", "globe"],
    name: "Globe lamp shade", note: "Upright fins between two hub rings",
    params: { name: "Globe lamp shade", source: lib("globe-lamp"), method: "radial", radial: radial({ axis: "Y", count: 32, innerRadius: 30, hubPlates: 2, hubWidth: 16 }) },
  },
  {
    id: "teardrop-lamp", category: "lamps", tags: ["lamp", "shade", "pendant", "teardrop"],
    name: "Teardrop pendant", note: "Radial fins round a teardrop",
    params: { name: "Teardrop pendant", source: lib("teardrop-lamp"), method: "radial", radial: radial({ axis: "Y", count: 24, innerRadius: 24, hubPlates: 2, hubWidth: 14 }) },
  },
  {
    id: "bell-stack", category: "lamps", tags: ["lamp", "bell", "layers", "hollow"],
    name: "Bell lamp", note: "Hollow rings stacked into a bell",
    params: { name: "Bell lamp", source: lib("bell-lamp"), method: "stacked", stacked: stack({ hollow: true, shell: 10, dowelCount: 3 }) },
  },
  {
    id: "bulb-vase", category: "lamps", tags: ["vase", "layers", "hollow"],
    name: "Bulb vase", note: "Round belly and slim neck, hollow layers",
    params: { name: "Bulb vase", source: lib("bulb-vase"), method: "stacked", stacked: stack({ hollow: true, shell: 9, dowelCount: 3 }) },
  },

  // Clocks & frames
  { id: "leaf-clock", category: "clocks", tags: ["clock", "leaf"], name: "Leaf wall clock", note: "Fins along an oval, clock insert", params: { name: "Leaf wall clock", method: "curveNormal", curveNormal: LEAF_CLOCK } },
  {
    id: "sunburst-clock", category: "clocks", tags: ["clock", "sun", "star", "sunburst"],
    name: "Sunburst clock", note: "Twelve star points round a clock insert",
    params: {
      name: "Sunburst clock",
      ...curve({ guide: { kind: "circle", d: 110 }, count: 60, centerFeature: "clock-insert", clockInsertDia: 60 }, {
        finLength: shape("constant", 140, 0), finHeight: shape("arch", 4, 18), twist: shape("constant", 0, 0), outline: shape("star", 170, 0.4, { waves: 12 }),
      }, {
        finLength: "140", finHeight: "4 + 18*sin(pi*s/L)", twist: "0", outline: "170*(1 - 0.4 + 0.4*abs(cos(6*phi))^2)",
      }),
    },
  },
  {
    id: "heart-clock", category: "clocks", tags: ["clock", "heart", "love"],
    name: "Heart clock", note: "Fins round an oval, cut to a heart",
    params: {
      name: "Heart clock",
      ...curve({ guide: { kind: "ellipse", w: 120, h: 96 }, count: 54, centerFeature: "clock-insert", clockInsertDia: 60 }, {
        finLength: shape("constant", 200, 0), finHeight: shape("arch", 5, 15), twist: shape("constant", 0, 0), outline: shape("heart", 150, 0.6),
      }, {
        finLength: "200", finHeight: "5 + 15*sin(pi*s/L)", twist: "0",
        outline: "150*(1 + 0.6*((2 - 2*sin(phi) + sin(phi)*sqrt(abs(cos(phi)))/(sin(phi) + 1.4))/2 - 1))",
      }),
    },
  },
  {
    id: "ripple-clock", category: "clocks", tags: ["clock", "wave", "twist"],
    name: "Ripple clock", note: "Wavy fin lengths with a twist",
    params: {
      name: "Ripple clock",
      ...curve({ guide: { kind: "ellipse", w: 130, h: 86 }, count: 64, centerFeature: "clock-insert", clockInsertDia: 60 }, {
        finLength: shape("sine", 70, 18, { waves: 6 }), finHeight: shape("arch", 4, 16), twist: shape("sine", 0, 10, { waves: 2 }),
      }, {
        finLength: "70 + 18*sin(12*pi*t)", finHeight: "4 + 16*sin(pi*s/L)", twist: "10*sin(4*pi*t)",
      }),
    },
  },
  {
    id: "mirror-frame", category: "clocks", tags: ["mirror", "frame", "round"],
    name: "Round mirror frame", note: "Twisting fins round a mirror opening",
    params: {
      name: "Round mirror frame",
      ...curve({ guide: { kind: "circle", d: 220 }, count: 88, centerFeature: "mirror" }, {
        finLength: shape("constant", 46, 0), finHeight: shape("arch", 4, 14), twist: shape("sine", 0, 18, { waves: 3 }),
      }, {
        finLength: "46", finHeight: "4 + 14*sin(pi*s/L)", twist: "18*sin(6*pi*t)",
      }),
    },
  },

  // Typography
  { id: "name-sculpture", category: "typography", tags: ["text", "name", "rounded"], name: "Name sculpture", note: "Rounded 3D text, parallel fins", params: { name: "Name sculpture", source: TEXT_DEFAULTS } },
  {
    id: "love-fins", category: "typography", tags: ["text", "love", "sign", "flat"],
    name: "LOVE sign", note: "Heavy flat letters in fins",
    params: { name: "LOVE sign", source: { ...TEXT_DEFAULTS, text: "LOVE", font: "archivo-black", size: 110, depth: 30, profile: "flat" }, parallel: fins({ spacing: 7 }) },
  },
  {
    id: "home-horizontal", category: "typography", tags: ["text", "home", "rounded", "horizontal"],
    name: "HOME in horizontal fins", note: "Rounded letters sliced bottom to top",
    params: { name: "HOME in horizontal fins", source: { ...TEXT_DEFAULTS, text: "HOME", font: "fredoka", size: 120, depth: 36 }, parallel: fins({ axis: "Y", spacing: 7 }) },
  },
  {
    id: "monogram-stack", category: "typography", tags: ["text", "letter", "initial", "monogram", "layers"],
    name: "Stacked monogram", note: "One rounded letter in layers",
    params: { name: "Stacked monogram", source: { ...TEXT_DEFAULTS, text: "A", font: "baloo2", size: 200, depth: 36 }, method: "stacked", stacked: stack({ axis: "Z" }) },
  },

  // Radial & sunburst
  { id: "torus-radial", category: "radial", tags: ["ring", "torus"], name: "Radial torus", note: "Fins around a hub", params: { name: "Radial torus", source: lib("torus"), method: "radial" } },
  {
    id: "sunburst", category: "radial", tags: ["sun", "sunburst", "formula"],
    name: "Sunburst", note: "Fins drawn from a radial formula",
    params: { name: "Sunburst", source: FORMULA_DEFAULTS["radial-profile"], method: "radial", radial: radial({ count: 30, profileSource: "formula" }) },
  },
  {
    id: "petal-burst", category: "radial", tags: ["flower", "petals", "formula"],
    name: "Petal burst", note: "Fin heights rise and fall in five petals",
    params: { name: "Petal burst", source: burst("6 + 26*exp(-((s - 45)/28)^2)*abs(cos(2.5*theta))"), method: "radial", radial: radial({ count: 30, profileSource: "formula" }) },
  },
  {
    id: "wave-burst", category: "radial", tags: ["wave", "spiral", "formula"],
    name: "Spiral wave burst", note: "Waves that wind round the centre",
    params: { name: "Spiral wave burst", source: burst("6 + 16*(0.5 + 0.5*sin(s/9 + 3*theta))*(1 - s/110)"), method: "radial", radial: radial({ count: 30, profileSource: "formula" }) },
  },
  {
    id: "rose-radial", category: "radial", tags: ["flower", "rose", "radial"],
    name: "Radial rose", note: "The rose sliced round its centre",
    params: { name: "Radial rose", source: lib("rose"), method: "radial", radial: radial({ count: 24, innerRadius: 22 }) },
  },

  // Papercraft
  { id: "folded-sphere", category: "papercraft", tags: ["paper", "card", "ball"], name: "Papercraft ball", note: "80 faces folded from card", params: { name: "Papercraft ball", source: lib("sphere"), ...folded(80) } },
  { id: "folded-head", category: "papercraft", tags: ["paper", "card", "face"], name: "Folded head", note: "Low-poly relief in card", params: { name: "Folded head", ...folded(150) } },
  { id: "folded-heart", category: "papercraft", tags: ["paper", "card", "heart", "love"], name: "Low-poly heart", note: "A puffy heart folded from card", params: { name: "Low-poly heart", source: lib("heart"), ...folded(120) } },
  { id: "folded-globe", category: "papercraft", tags: ["paper", "card", "lamp"], name: "Low-poly lamp", note: "The globe lamp as card nets", params: { name: "Low-poly lamp", source: lib("globe-lamp"), ...folded(100) } },
  { id: "folded-face", category: "papercraft", tags: ["paper", "card", "face", "mask"], name: "Low-poly face", note: "The serene face in 200 card facets", params: { name: "Low-poly face", source: lib("face-cc0"), ...folded(200) } },
];
