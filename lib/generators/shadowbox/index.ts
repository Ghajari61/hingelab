import { MATERIALS } from "@/lib/hinge/defaults";
import { circle, ellipse, rect, regularPolygon } from "../geom";
import { shapeArt, shapeOutline } from "../shapes";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { motif, type MotifId } from "../motifs";
import { fitArt, namedFile } from "../util";
import { buildShadowBox, frameOutline, unitOpening, type ShadowBoxOutput } from "./build";
import { checkShadowBox } from "./check";
import {
  CELLS, FRAMES, HOLES, MAT_MM, OPENINGS, PALETTES, PATTERNS, PETALS, RIDGES, SHADOWBOX_DEFAULTS, SIZES, mergeShadowBox,
  type Cell, type FrameShape, type Hole, type Opening, type Pattern, type Ridge, type ShadowBoxParams,
} from "./params";
import { SHADOWBOX_PRESETS } from "./presets";

const r1 = (v: number) => Math.round(v * 10) / 10;

type Named<K extends string> = Record<K, string | [string, string]>;
/** Choice options from a name table; a pair is [label, tooltip]. */
const opts = <K extends string>(keys: readonly K[], names: Named<K>) =>
  keys.map((v) => { const n = names[v]; return typeof n === "string" ? { v, text: n } : { v, text: n[0], title: n[1] }; });

export const PATTERN_NAMES: Named<Pattern> = {
  tunnel: ["Tunnel", "One shape nested from the back to the front"], mandala: ["Mandala", "A ring of petals and dots round a middle shape"],
  sunburst: ["Sunburst", "Straight or curled rays"], landscape: ["Scene", "Layered hills, peaks, waves, a forest, clouds or a city"],
  lattice: ["Lattice", "A grid of holes"], flow: ["Flow", "Wavy stripes that widen toward the front"],
};
const OPENING_NAMES: Named<Opening> = {
  circle: "Circle", oval: "Oval", squircle: ["Squircle", "A square with soft, round corners"], polygon: "Polygon", star: "Star",
  flower: "Flower", wavy: ["Wavy", "A circle with a sine-wave edge"], orbit: ["Orbit", "Ellipses crossing in the middle"],
  heart: "Heart", arch: "Arch", drop: "Drop", frame: ["As frame", "Rings in the frame's own outline"],
};
const RIDGE_NAMES: Named<Ridge> = {
  hills: "Hills", mountains: "Peaks", waves: "Waves", zigzag: "Zigzag", dunes: "Dunes", skyline: "City", trees: "Forest", clouds: "Clouds",
  sine: ["Sine", "Smooth, even sine waves"],
};
const HOLE_NAMES: Named<Hole> = {
  circle: "Circle", moon: "Crescent", moonstar: ["Moon & star", "A crescent moon and a star"], star: "Star", sparkle: "Sparkle", heart: "Heart",
  sun: "Sun", snowflake: "Snowflake", tree: "Tree", leaf: "Leaf", house: "House", butterfly: "Butterfly", flower: "Flower", paw: "Paw", cloud: "Cloud",
};
const CELL_NAMES: Named<Cell> = { hex: "Honeycomb", circle: "Dots", oval: "Ovals", square: "Squares", diamond: "Diamonds", triangle: "Triangles" };
const FRAME_NAMES: Named<FrameShape> = {
  rect: "Rectangle", rounded: "Rounded", squircle: ["Squircle", "A square with soft, round corners"], circle: ["Circle", "A circle, or an oval when the width and height differ"],
  pill: ["Capsule", "Straight sides with round ends"], arch: "Arch", hexagon: "Hexagon", octagon: "Octagon", diamond: "Diamond", heart: "Heart",
  scalloped: "Scalloped", blossom: ["Blossom", "A circle with a soft wavy edge"], house: "House", shield: "Shield", cloud: "Cloud",
};
const label = <K extends string>(names: Named<K>, k: K) => { const n = names[k]; return typeof n === "string" ? n : n[0]; };

/** Cut-out sizes and counts each pattern starts from when it is picked. */
const PATTERN_START: Record<Pattern, Partial<ShadowBoxParams["design"]>> = {
  tunnel: { min: 18, max: 118 },
  mandala: { min: 25, max: 110, count: 10 },
  sunburst: { min: 22, max: 100, count: 16 },
  landscape: { min: 34, max: 84, count: 3, amp: 24 },
  lattice: { min: 25, max: 95, pitch: 20 },
  flow: { min: 25, max: 85, count: 7, waves: 3, amp: 30, swirl: 90 },
};
const CURVED: Opening[] = ["polygon", "star", "flower", "wavy", "orbit"];
/** A capsule on a square frame would be a plain circle, so it turns landscape (a standard 7 × 5 in when that size was picked). */
const pickFrame = (p: ShadowBoxParams, v: string): ShadowBoxParams => {
  const f = { ...p.frame, shape: v as FrameShape };
  if (v === "pill" && Math.abs(f.width - f.height) < 1) Object.assign(f, f.size === "custom" ? { height: Math.round(f.width * 0.62) } : { width: SIZES["7x5"].w, height: SIZES["7x5"].h });
  return { ...p, frame: f };
};

const isPat = (p: ShadowBoxParams, ...ks: Pattern[]) => ks.includes(p.design.pattern);
const withDesign = (p: ShadowBoxParams, d: Partial<ShadowBoxParams["design"]>): ShadowBoxParams => ({ ...p, design: { ...p.design, ...d } });
const shaped = (p: ShadowBoxParams) => isPat(p, "tunnel", "mandala");
const hasPhoto = (p: ShadowBoxParams) => !!p.photo.image;
const CORNERED: FrameShape[] = ["rect", "rounded", "arch", "hexagon", "octagon", "diamond", "house", "shield"];

const sections: SectionSpec<ShadowBoxParams>[] = [
  {
    id: "design", title: "Pattern", open: true,
    help: "The geometric pattern cut through the layers: it grows from the back layer to the front one.",
    fields: [
      {
        kind: "choice", key: "design.pattern", label: "Pattern", rail: true,
        help: "Tunnel nests one shape; Mandala rings it with petals and dots; Sunburst cuts rays; Scene cuts layered ridges of hills, peaks, waves, a forest, clouds or a city; Lattice cuts a grid of holes; Flow cuts wavy stripes.",
        options: opts(PATTERNS, PATTERN_NAMES),
        apply: (p, v) => withDesign(p, { pattern: v as Pattern, ...PATTERN_START[v as Pattern] }),
      },
      {
        kind: "choice", key: "design.opening", label: "Cut-out", rail: true, show: shaped,
        help: "The shape of each layer's cut-out (the middle of a mandala). As frame repeats the frame's own outline as even rings.",
        options: opts(OPENINGS, OPENING_NAMES),
        apply: (p, v) => withDesign(p, { ...(shaped(p) ? {} : { pattern: "tunnel", ...PATTERN_START.tunnel }), opening: v as Opening }),
      },
      { kind: "number", key: "design.sides", label: "Points", unit: "", min: 3, max: 16, step: 1, int: true, show: (p) => shaped(p) && CURVED.includes(p.design.opening), help: "Corners of the polygon, points of the star, petals of the flower, waves round the wavy circle or ellipses of the orbit." },
      { kind: "number", key: "design.inner", label: "Inner size", unit: "%", min: 5, max: 95, step: 1, show: (p) => (shaped(p) && ["star", "flower", "wavy", "orbit"].includes(p.design.opening)) || isPat(p, "sunburst"), help: "How deep a star's, flower's or wavy circle's notches go, how wide the orbit's ellipses are, or how wide the sunburst's rays are." },
      { kind: "number", key: "design.count", label: "Stripes", unit: "", min: 3, max: 48, step: 1, int: true, show: (p) => isPat(p, "flow"), help: "Wavy stripes down the window." },
      { kind: "number", key: "design.waves", label: "Waves", unit: "", min: 1, max: 12, step: 1, int: true, show: (p) => isPat(p, "flow"), help: "Waves along each stripe, across the window." },
      { kind: "number", key: "design.amp", label: "Wave height", unit: "%", min: 0, max: 80, step: 1, show: (p) => isPat(p, "flow"), help: "How far the stripes swing up and down." },
      { kind: "number", key: "design.swirl", label: "Drift", unit: "deg", min: -180, max: 180, step: 1, show: (p) => isPat(p, "flow"), help: "Slides the waves along from the back layer to the front one, so the stripes ripple in depth." },
      { kind: "choice", key: "design.petal", label: "Petals", show: (p) => isPat(p, "mandala"), options: PETALS.map((v) => ({ v, text: v[0].toUpperCase() + v.slice(1) })), help: "The shape of the mandala's petals." },
      { kind: "number", key: "design.count", label: "Count", unit: "", min: 3, max: 48, step: 1, int: true, show: (p) => isPat(p, "mandala", "sunburst", "landscape"), help: "Petals around a mandala, rays of a sunburst, or bumps across a landscape's front ridge (ridges further back have more)." },
      { kind: "number", key: "design.swirl", label: "Swirl", unit: "deg", min: -180, max: 180, step: 1, show: (p) => isPat(p, "sunburst"), help: "Curls the rays into a spiral." },
      {
        kind: "choice", key: "design.ridge", label: "Scene", rail: true, show: (p) => isPat(p, "landscape"),
        help: "The line along the top of each scene layer: rolling hills, mountain peaks, sea waves, zigzags, sand dunes, a city, a pine forest or puffy clouds.",
        options: opts(RIDGES, RIDGE_NAMES),
        apply: (p, v) => withDesign(p, { ...(isPat(p, "landscape") ? {} : { pattern: "landscape", ...PATTERN_START.landscape }), ridge: v as Ridge }),
      },
      { kind: "choice", key: "design.from", label: "Rises from", show: (p) => isPat(p, "landscape"), options: [{ v: "bottom", text: "Bottom" }, { v: "top", text: "Top", title: "Hangs down like clouds or a cave roof" }, { v: "both", text: "Both", title: "A canyon" }], help: "Where the paper of each layer sits: under the ridge, above it, or both." },
      { kind: "number", key: "design.amp", label: "Ridge height", unit: "%", min: 0, max: 80, step: 1, show: (p) => isPat(p, "landscape"), help: "How tall the bumps are, as a share of the window's height." },
      { kind: "number", key: "design.seed", label: "Variation", unit: "", min: 0, max: 99999, step: 1, int: true, random: true, show: (p) => isPat(p, "landscape"), help: "Picks a different random set of peaks, trees, clouds and buildings." },
      {
        kind: "choice", key: "design.cell", label: "Cells", rail: true, show: (p) => isPat(p, "lattice"),
        help: "The holes of the lattice.",
        options: opts(CELLS, CELL_NAMES),
        apply: (p, v) => withDesign(p, { ...(isPat(p, "lattice") ? {} : { pattern: "lattice", ...PATTERN_START.lattice }), cell: v as Cell }),
      },
      { kind: "number", key: "design.pitch", label: "Cell size", unit: "mm", min: 8, max: 80, step: 0.5, show: (p) => isPat(p, "lattice"), help: "Distance between the holes' centres." },
      { kind: "number", key: "design.fade", label: "Fade", unit: "%", min: -100, max: 100, step: 1, show: (p) => isPat(p, "lattice"), help: "Holes grow toward the middle (positive) or toward the edge (negative)." },
    ],
  },
  {
    id: "text", title: "Words", open: true,
    help: "A name, date or short message cut into the front layer, standing on a paper bar across the window.",
    fields: [
      { kind: "text", key: "text.text", label: "Text", maxLength: 40, placeholder: "Sweet dreams", help: "The words on the front layer; leave it empty for none." },
      { kind: "font", key: "text.fontId", label: "Font", sample: (p) => p.text.text || "Aa", show: (p) => !!p.text.text.trim(), help: "The typeface: bold joined scripts and heavy capitals cut best from paper." },
      { kind: "number", key: "text.size", label: "Text size", unit: "mm", min: 8, max: 60, step: 0.5, show: (p) => !!p.text.text.trim(), help: "Height of the capital letters; words too wide for the window shrink to fit." },
      { kind: "choice", key: "text.place", label: "Place", show: (p) => !!p.text.text.trim(), options: [{ v: "bottom", text: "Bottom" }, { v: "middle", text: "Middle" }, { v: "top", text: "Top" }], help: "Where the words sit in the window." },
    ],
  },
  {
    id: "photo", title: "Photo", open: true,
    help: "A photo on the back board, seen through every layer: a portrait, a pet, a place or a wedding picture framed by the paper cut.",
    fields: [
      { kind: "image", key: "photo.image", aspectKey: "photo.aspect", color: true, label: "Photo", help: "A photo (JPEG, PNG or WebP) printed on the back board; the back layer becomes a plain board and the photo takes the place of the light hole." },
      { kind: "number", key: "photo.zoom", label: "Photo zoom", unit: "%", min: 100, max: 300, step: 5, show: hasPhoto, help: "Enlarges the photo from the middle; 100 % just fills the window." },
      { kind: "number", key: "photo.x", label: "Move across", unit: "%", min: -100, max: 100, step: 1, show: hasPhoto, help: "Slides the photo left (negative) or right (positive) to choose which part shows, when it is wider than the window." },
      { kind: "number", key: "photo.y", label: "Move down", unit: "%", min: -100, max: 100, step: 1, show: hasPhoto, help: "Slides the photo up (negative) or down (positive) to choose which part shows, when it is taller than the window." },
    ],
  },
  {
    id: "light", title: "Light hole", open: false, show: (p) => !hasPhoto(p),
    help: "A hole in the back board that glows when a light sits behind the box: a moon, a sun or a little motif.",
    fields: [
      { kind: "toggle", key: "design.moon", label: "Light hole", help: "Cuts a hole in the back layer: in the sky of a scene, or in the middle of the other patterns." },
      { kind: "choice", key: "design.hole", label: "Light shape", rail: true, show: (p) => p.design.moon, options: opts(HOLES, HOLE_NAMES), apply: (p, v) => withDesign(p, { moon: true, hole: v as Hole }), help: "The shape of the light hole." },
      { kind: "number", key: "design.holeSize", label: "Hole size", unit: "%", min: 5, max: 45, step: 1, show: (p) => p.design.moon, help: "Size of the light hole, as a share of the window's smaller side." },
    ],
  },
  {
    id: "depth", title: "Layers and depth", open: true,
    help: "How many layers there are and how the cut-outs change from the back to the front.",
    fields: [
      { kind: "number", key: "stack.count", label: "Layers", unit: "", min: 2, max: 20, step: 1, int: true, help: "Layers in the stack, including the back board." },
      { kind: "toggle", key: "stack.back", label: "Plain back board", show: (p) => !hasPhoto(p), help: "The back layer is uncut (apart from the light hole), so the box has a background." },
      { kind: "number", key: "design.min", label: "Back cut-out", unit: "%", min: 0, max: 150, step: 1, help: "Size of the cut-out on the back pattern layer, as a share of the window." },
      { kind: "number", key: "design.max", label: "Front cut-out", unit: "%", min: 5, max: 200, step: 1, help: "Size of the cut-out on the front layer. Over 100% leaves only the corners of the window." },
      { kind: "number", key: "design.twist", label: "Twist", unit: "deg", min: -45, max: 45, step: 0.5, help: "Turns each layer's pattern a little more than the one behind it: a spiral." },
      { kind: "number", key: "design.rotate", label: "Turn", unit: "deg", min: -180, max: 180, step: 1, help: "Turns the whole pattern." },
      { kind: "number", key: "design.shiftX", label: "Vanishing point X", unit: "%", min: -90, max: 90, step: 1, show: (p) => !isPat(p, "landscape", "flow"), help: "Moves the back cut-outs left or right, so the tunnel runs off at an angle." },
      { kind: "number", key: "design.shiftY", label: "Vanishing point Y", unit: "%", min: -90, max: 90, step: 1, show: (p) => !isPat(p, "landscape", "flow"), help: "Moves the back cut-outs up or down." },
      { kind: "toggle", key: "design.stretch", label: "Stretch to the window", show: shaped, help: "Cut-outs stretch to the window's width and height instead of keeping their shape." },
    ],
  },
  {
    id: "frame", title: "Frame", open: true,
    help: "The outline every layer shares and the solid border around the pattern.",
    fields: [
      { kind: "choice", key: "frame.shape", label: "Frame", rail: true, options: opts(FRAMES, FRAME_NAMES), apply: pickFrame, help: "The outline of every layer." },
      {
        kind: "choice", key: "frame.size", label: "Frame size",
        options: [...Object.entries(SIZES).map(([v, s]) => ({ v, text: s.text, title: `Layers ${s.w} × ${s.h} mm` })), { v: "custom", text: "Custom" }],
        apply: (p, v) => (v in SIZES ? { ...p, frame: { ...p.frame, width: SIZES[v as keyof typeof SIZES].w, height: SIZES[v as keyof typeof SIZES].h } } : p),
        help: "Sizes the layers to drop into a standard shadow box frame (3 mm smaller than its opening), or set your own width and height.",
      },
      { kind: "number", key: "frame.width", label: "Width", unit: "mm", min: 60, max: 1000, step: 1, help: "Width of the layers." },
      { kind: "number", key: "frame.height", label: "Height", unit: "mm", min: 60, max: 1000, step: 1, help: "Height of the layers." },
      { kind: "number", key: "frame.border", label: "Border", unit: "mm", min: 2, max: 150, step: 0.5, help: "The solid band around every layer that holds it together and takes the glue or foam." },
      { kind: "number", key: "frame.corner", label: "Corner radius", unit: "mm", min: 0, max: 80, step: 0.5, show: (p) => CORNERED.includes(p.frame.shape), help: "Rounds the frame's corners." },
    ],
  },
  {
    id: "build", title: "Cutting and stacking", open: false,
    help: "What cuts the layers and what keeps them apart.",
    fields: [
      {
        kind: "choice", key: "cutter.kind", label: "Cutter",
        help: "Blade (Cricut and similar cutters) cuts card with no kerf on a 12 × 12 in mat. Laser uses the material and bed in the sheet settings.",
        options: [{ v: "blade", text: "Blade (Cricut)" }, { v: "laser", text: "Laser" }],
        apply: (p, v) => {
          if (v === "blade") return { ...p, cutter: { kind: "blade" }, material: "custom", T: 0.5, K: 0, bedW: MAT_MM, bedH: MAT_MM, gap: 3 };
          const m = MATERIALS.card2;
          return { ...p, cutter: { kind: "laser" }, material: "card2", T: m.T ?? 2, K: m.K ?? 0.2, bedW: 600, bedH: 400, gap: 4 };
        },
      },
      { kind: "choice", key: "stack.spacer", label: "Spacers", options: [{ v: "none", text: "Foam tape" }, { v: "frames", text: "Spacer frames", title: "Border rings cut from the same sheet" }], help: "Keep the layers apart with foam tape, or cut spacer frames from the same sheet and glue them between the layers." },
      { kind: "number", key: "stack.gap", label: "Foam thickness", unit: "mm", min: 0, max: 20, step: 0.5, show: (p) => p.stack.spacer === "none", help: "Thickness of the foam tape between layers (for the depth and the 3D view)." },
      { kind: "number", key: "stack.per", label: "Frames per gap", unit: "", min: 1, max: 4, step: 1, int: true, show: (p) => p.stack.spacer === "frames", help: "Spacer frames between each pair of layers: more makes a deeper box." },
      { kind: "number", key: "design.web", label: "Narrowest bridge", unit: "mm", min: 0, max: 10, step: 0.1, help: "Paper narrower than this between cut-outs is cut away, so nothing too thin to hold is left." },
    ],
  },
  {
    id: "look", title: "Colours", open: false,
    help: "The paper colours in the preview, from the back layer to the front one.",
    fields: [
      { kind: "choice", key: "look.palette", label: "Colours", rail: true, options: Object.entries(PALETTES).map(([v, x]) => ({ v, text: x.name })), help: "A colour for every layer, shading from the back to the front. Cut each layer from that colour of card." },
      { kind: "toggle", key: "look.reverse", label: "Reverse colours", help: "Puts the light colours at the back and the dark ones at the front." },
    ],
  },
];

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  const ring = (cs: Contour[]) => { const [o, ...h] = fitArt(cs, 36); return [{ d: [o, ...h].join(" "), fill: true }]; };
  if (key === "frame.shape") {
    if (v !== "squircle" && v !== "blossom") return shapeArt(v as Exclude<FrameShape, "squircle" | "blossom">);
    return [{ d: fitArt([frameOutline(v, 36, 36, 0)], 38)[0], fill: true }];
  }
  if (key === "look.palette") return [0, 1, 2, 3].map((i) => ({ d: fitArt([rect(-20, -14, 40, 28), rect(-20 + i * 10, -14, 10, 28)], 36)[1], fill: i % 2 === 0 }));
  if (key === "design.pattern") {
    const box = rect(-1.2, -1.2, 2.4, 2.4);
    switch (v as Pattern) {
      case "tunnel": return ring([box, ...[1, 0.75, 0.5, 0.25].map((s) => rect(-s, -s, 2 * s, 2 * s))]);
      case "mandala": return ring([box, ...Array.from({ length: 8 }, (_, i) => regularPolygon(4, 0.45, i * 45, 0.6 * Math.sin((i * Math.PI) / 4), -0.6 * Math.cos((i * Math.PI) / 4))), circle(0, 0, 0.3, 0.02)]);
      case "sunburst": return ring([box, ...Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5; return [[0.15 * Math.sin(a), -0.15 * Math.cos(a)], [Math.sin(a - 0.14), -Math.cos(a - 0.14)], [Math.sin(a + 0.14), -Math.cos(a + 0.14)]] as Contour; })]);
      case "landscape": return ring([box, [[-1, -1], [1, -1], [1, 0.1], [0.5, -0.5], [0, 0.2], [-0.5, -0.7], [-1, 0]]]);
      case "lattice": return art("design.cell", "hex");
      case "flow": return ring([box, ...[-0.7, 0, 0.7].map((y) => {
        const top: [number, number][] = [], bot: [number, number][] = [];
        for (let i = 0; i <= 24; i++) { const x = -1.2 + (2.4 * i) / 24, c = y + 0.22 * Math.sin(x * Math.PI * 1.3); top.push([x, c - 0.16]); bot.push([x, c + 0.16]); }
        return [...top, ...bot.reverse()] as Contour;
      })]);
    }
  }
  if (key === "design.opening") {
    const o = v === "frame" ? shapeOutline("rounded", 2, 2, 0.3).map(([x, y]) => [x - 1, y - 1] as [number, number]) : unitOpening(v as Exclude<Opening, "frame">, 6, 0.5);
    return ring([rect(-1.3, -1.3, 2.6, 2.6), o]);
  }
  if (key === "design.hole") return v === "circle" ? ring([rect(-1.3, -1.3, 2.6, 2.6), circle(0, 0, 0.8, 0.02)]) : ring([rect(-1.3, -1.3, 2.6, 2.6), ...motif(v as MotifId, 1.7)]);
  if (key === "design.ridge" && v === "trees") {
    const pts: [number, number][] = [[0, 30]];
    for (const [x, h] of [[8, 14], [22, 6], [36, 12], [50, 4]]) pts.push([x - 6, 30], [x - 2, 22], [x - 4, 22], [x, h], [x + 4, 22], [x + 2, 22], [x + 6, 30]);
    return ring([[...pts, [60, 30], [60, 34], [0, 34]]]);
  }
  if (key === "design.ridge") {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const f = v === "zigzag" ? 1 - 4 * Math.abs(((u * 3) % 1) - 0.5) : v === "waves" ? 1 - 2 * Math.pow(Math.abs(Math.sin(Math.PI * u * 3)), 0.7) : v === "skyline" ? [0.2, -0.4, 0.8, 0.1, -0.2, 0.6][Math.floor(u * 5.99)] : v === "mountains" ? 1 - 2 * Math.abs(((u * 2.2) % 1) - 0.5) * 2 : v === "sine" ? Math.sin(u * Math.PI * 5) : v === "clouds" ? 2 * Math.sqrt(Math.max(0, 1 - (2 * ((u * 3) % 1) - 1) ** 2)) - 1 : Math.sin(u * Math.PI * (v === "dunes" ? 3 : 2));
      pts.push([u * 60, 20 - f * 8]);
    }
    return ring([[...pts, [60, 34], [0, 34]]]);
  }
  if (key === "design.cell") {
    const cs: Contour[] = [rect(-2, -2, 40, 28)];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      const cx = 4 + x * 10 + (v === "hex" || v === "circle" ? (y % 2) * 5 : 0), cy = 4 + y * 8;
      cs.push(v === "oval" ? ellipse(cx, cy, 2.2, 3.4, 24) : v === "circle" ? circle(cx, cy, 3, 0.2) : v === "hex" ? regularPolygon(6, 3.4, 0, cx, cy) : v === "square" ? rect(cx - 3, cy - 3, 6, 6) : v === "diamond" ? regularPolygon(4, 3.8, 0, cx, cy) : regularPolygon(3, 3.6, (x + y) % 2 ? 180 : 0, cx, cy));
    }
    return ring(cs);
  }
  return [];
}

function scaleShadowBox(p: ShadowBoxParams, s: number): ShadowBoxParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    frame: { ...p.frame, width: k(p.frame.width), height: k(p.frame.height), border: k(p.frame.border), corner: k(p.frame.corner) },
    design: { ...p.design, pitch: k(p.design.pitch) },
    text: { ...p.text, size: k(p.text.size) },
  };
}

/**
 * Rail cards: a few untwisted layers, so each card shows its own choice clearly instead of the busy
 * default tunnel.
 */
function railPreview(key: string, p: ShadowBoxParams, value: string): ShadowBoxParams {
  if (key === "frame.shape") p = pickFrame(p, value);
  const d = (design: Partial<ShadowBoxParams["design"]>, count: number, more: Partial<ShadowBoxParams> = {}): ShadowBoxParams =>
    ({ ...p, ...more, stack: { ...p.stack, count }, design: { ...p.design, twist: 0, rotate: 0, ...design } });
  switch (key) {
    case "design.pattern": return d({ amp: 26, pitch: 34, sides: 5, inner: 50 }, 6);
    case "design.opening": return d({ pattern: "tunnel", min: 22, max: 100, sides: 6, inner: 50 }, 5);
    case "design.ridge": return d({ pattern: "landscape", ...PATTERN_START.landscape, count: 2, amp: 30 }, 5);
    case "design.cell": return d({ pattern: "lattice", min: 40, max: 90, pitch: 40, fade: 30 }, 4);
    case "design.hole": return d({ pattern: "tunnel", opening: "circle", min: 120, max: 130, moon: true, holeSize: 45 }, 2, { look: { palette: "night", reverse: false } });
    // The frame alone: a dark border ring over a light back board, so the card shows the outline and nothing else.
    case "frame.shape": return d({ pattern: "tunnel", opening: "circle", min: 300, max: 300 }, 2, { look: { palette: "sunset", reverse: true } });
    // Bands of every colour in order, like a swatch strip, from the back (top) to the front (bottom).
    case "look.palette": return d({ pattern: "landscape", ridge: "sine", from: "bottom", min: 10, max: 82, count: 3, amp: 22, seed: 3 }, 6, { frame: { ...p.frame, shape: "rounded" } });
    default: return p;
  }
}

export const SHADOWBOX: GeneratorDef<ShadowBoxParams> = {
  id: "shadowbox",
  name: "Shadow Box",
  version: 1,
  defaults: () => mergeShadowBox({}),
  merge: mergeShadowBox,
  sections,
  presets: SHADOWBOX_PRESETS,
  build: (p, ctx) => buildShadowBox(p, ctx),
  check: (p, out) => checkShadowBox(p, out as ShadowBoxOutput),
  fonts: (p) => (p.text.text.trim() ? [p.text.fontId] : []),
  batch: () => "text.text",
  scale: scaleShadowBox,
  art,
  railPreview,
  fileName: (p) => namedFile("shadow-box", p.name, p.design.pattern),
  summary: (p) => `${label(PATTERN_NAMES, p.design.pattern)} shadow box · ${p.stack.count} layers · ${Math.round(p.frame.width)} × ${Math.round(p.frame.height)} mm`,
  help: {
    intro: [
      "The Shadow Box generator makes layered 3D paper-cut art: a stack of frames with the same outline whose geometric cut-outs grow from the back layer to the front one, so the finished piece looks deep when the layers are stacked with foam tape or spacer frames between them.",
      "Pick a pattern (a tunnel of nested circles, polygons, stars, flowers, hearts or arches; a mandala of petals and dots; a sunburst of straight or curled rays; a scene of hills, peaks, waves, dunes, a pine forest, clouds or a city; or a lattice of holes; or flowing wavy stripes, ovals, squircles, sine-wave circles and crossed ellipses for softer looks), then set the number of layers, how much the cut-outs grow, a twist for spirals and a vanishing point for tunnels that run off at an angle. It comes with 120 ready-made designs.",
      "Make it personal: put a photo on the back board so the layers frame it, put a name, date or short message on the front layer in any font, cut a light hole shaped like a crescent, a star, a heart or another motif into the back board, and size the layers for a standard 6 × 6, 8 × 8, 10 × 10, 5 × 7 or 8 × 10 in frame.",
      "It starts set for a Cricut or similar blade cutter: the layers are drawn on 12 × 12 in mats with no kerf, one SVG for all the layers. Choose Laser to cut card or thin plywood on a laser bed with kerf compensation.",
    ],
    tips: [
      "Cut each layer from a different shade of card; the Colours section previews the shading from back to front.",
      "Foam tape 1 to 3 mm thick between the layers gives the strongest depth; spacer frames make a stiffer box from one sheet.",
      "Keep the narrowest bridge at 1.5 mm or more for card, and a little more for a laser, so the pattern does not tear or char.",
      "A light hole in the back board and a small LED puck light behind it turns the box into a night light.",
      "For words on the front layer, pick a bold font and a size of 18 mm or more so the letters stay strong in paper; a name and date makes a popular nursery or wedding gift.",
      "Front cut-outs over 100% leave just the corners of the window, which frames a round tunnel nicely.",
      "For a photo, a tunnel or a frame-shaped cut-out with a large back cut-out leaves the face clear; set the zoom and move it so the part you want sits in the middle.",
    ],
    keywords: ["shadow box", "photo frame", "picture", "3d paper cut", "papercraft", "layered paper art", "cricut", "svg layers", "light box", "mandala", "tunnel", "geometric art", "personalized name", "night light"],
  },
};

export { SHADOWBOX_DEFAULTS };
