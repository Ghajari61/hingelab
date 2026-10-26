import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { PHOTO_DITHERS, PHOTO_LOOKS, type Paper, type PhotoDither, type PhotoLook } from "@/lib/imaging/photoSpec";
import { isImageDataURL } from "@/lib/security/svg";
import type { ShapeKind } from "../shapes";
import type { MotifId } from "../motifs";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
import { isPictureText } from "./picPath";

export const PATTERNS = ["tunnel", "mandala", "sunburst", "landscape", "lattice", "flow", "topographic", "picture"] as const;
export type Pattern = (typeof PATTERNS)[number];
export const OPENINGS = ["circle", "oval", "squircle", "polygon", "star", "flower", "wavy", "orbit", "heart", "arch", "drop", "frame"] as const;
export type Opening = (typeof OPENINGS)[number];
export const PETALS = ["drop", "leaf", "diamond", "circle"] as const;
export type Petal = (typeof PETALS)[number];
export const RIDGES = ["hills", "mountains", "waves", "zigzag", "dunes", "skyline", "trees", "clouds", "sine"] as const;
export type Ridge = (typeof RIDGES)[number];
export const FROMS = ["bottom", "top", "both"] as const;
export type From = (typeof FROMS)[number];
export const CELLS = ["hex", "circle", "oval", "square", "diamond", "triangle"] as const;
export type Cell = (typeof CELLS)[number];
/** Frame outlines: the shared plate shapes plus two soft ones drawn here. */
export const FRAMES = [
  "rect", "rounded", "squircle", "circle", "pill", "arch", "hexagon", "octagon", "diamond",
  "heart", "scalloped", "blossom", "house", "shield", "cloud",
] as const satisfies readonly (ShapeKind | "squircle" | "blossom")[];
export type FrameShape = (typeof FRAMES)[number];
/** Shapes of the light hole: a circle or a motif silhouette. */
export const HOLES = ["circle", "moon", "moonstar", "star", "sparkle", "heart", "sun", "snowflake", "tree", "leaf", "house", "butterfly", "flower", "paw", "cloud"] as const satisfies readonly ("circle" | MotifId)[];
export type Hole = (typeof HOLES)[number];
export const PLACES = ["bottom", "middle", "top"] as const;
export type Place = (typeof PLACES)[number];
/** Built-in silhouettes for the picture pattern (four drawn here, the rest shared motifs). */
export const SAMPLES = ["cat", "fish", "bird", "pear", "butterfly", "heart", "tree", "leaf", "paw", "house", "moonstar", "flower"] as const;
export type Sample = (typeof SAMPLES)[number];
export const PIC_MODES = ["levels", "scale", "grow"] as const;
export type PicMode = (typeof PIC_MODES)[number];
/** Paper pieces the cut-outs leave loose: left out, bridged to the frame, or cut as parts to glue on. */
export const LOOSE = ["drop", "bridge", "parts"] as const;
export type Loose = (typeof LOOSE)[number];
/** Engraving resolutions: a 0.2, 0.1 or 0.08 mm line interval. */
export const DPIS = ["127", "254", "318"] as const;
export type Dpi = (typeof DPIS)[number];
export const MOUNTS = ["board", "slot"] as const;
export type Mount = (typeof MOUNTS)[number];
export const BACKS = ["none", "glued", "screwed"] as const;
export type Back = (typeof BACKS)[number];
export const HANGS = ["none", "keyhole", "stand"] as const;
export type HangKind = (typeof HANGS)[number];
/** Longest stored photo, characters of its data URL (an engraving at 0.1 mm across a 10 in window fits). */
export const MAX_PHOTO_CHARS = 1_200_000;

/** Standard shadow box frames: the layers are 3 mm smaller than the frame's opening so they drop in. */
export const SIZES = {
  "6x6": { text: "6 × 6 in", w: 149, h: 149 },
  "8x8": { text: "8 × 8 in", w: 200, h: 200 },
  "10x10": { text: "10 × 10 in", w: 251, h: 251 },
  "5x7": { text: "5 × 7 in", w: 124, h: 175 },
  "7x5": { text: "7 × 5 in", w: 175, h: 124 },
  "8x10": { text: "8 × 10 in", w: 200, h: 251 },
  "10x8": { text: "10 × 8 in", w: 251, h: 200 },
  a5: { text: "A5", w: 145, h: 207 },
} as const;
export type SizeId = keyof typeof SIZES | "custom";

/** Paper colours from the back layer to the front one (previews only). */
export const PALETTES = {
  sunset: { name: "Sunset", stops: ["#3B1E54", "#9B3675", "#F06C4E", "#FFC15E", "#FFF1C9"] },
  ocean: { name: "Ocean", stops: ["#0B2545", "#13315C", "#1D7EA8", "#8DD3E8", "#E8F7FB"] },
  forest: { name: "Forest", stops: ["#0F2A1D", "#2D6A4F", "#74C69D", "#D8F3DC"] },
  rose: { name: "Rose", stops: ["#590D22", "#A4133C", "#FF4D6D", "#FFB3C1", "#FFF0F3"] },
  lavender: { name: "Lavender", stops: ["#2E1A47", "#6A4C93", "#B79CED", "#EDE7F6"] },
  night: { name: "Night", stops: ["#0B0C2A", "#1F2A6B", "#4F6BB0", "#A9C2EE"] },
  autumn: { name: "Autumn", stops: ["#3D1308", "#9E2A2B", "#E09F3E", "#F7D08A"] },
  kraft: { name: "Kraft", stops: ["#5B3D22", "#9C7350", "#C9A27A", "#F3E3C8"] },
  mono: { name: "Greys", stops: ["#2B2B2B", "#8C8C8C", "#F2F2F2"] },
  snow: { name: "White", stops: ["#5F7389", "#B8C4CF", "#E9EEF2", "#FFFFFF"] },
  rainbow: { name: "Rainbow", stops: ["#6A4C93", "#1982C4", "#8AC926", "#FFCA3A", "#FF595E"] },
  mint: { name: "Mint", stops: ["#073B3A", "#0B6E4F", "#21A179", "#9FE2BF", "#E9FBF2"] },
  gold: { name: "Gold", stops: ["#2B1D08", "#7A5A1A", "#D4AF37", "#F5E6A8"] },
  coral: { name: "Coral", stops: ["#5C2A2A", "#B5523B", "#E07A5F", "#F2CC8F", "#FBF0E4"] },
  desert: { name: "Desert", stops: ["#4A2C17", "#7F4F24", "#B08968", "#DDB892", "#F3E9DC"] },
  candy: { name: "Candy", stops: ["#3A0CA3", "#7209B7", "#F72585", "#FFAFCC", "#FFF0F6"] },
  pastel: { name: "Pastel", stops: ["#7D8BC4", "#B8A9E3", "#F4B6C2", "#FBD9B9", "#FFF6E5"] },
  sage: { name: "Sage", stops: ["#3F4F44", "#6B8068", "#A3B899", "#D6E2CC", "#F6F8F1"] },
} as const;
export type PaletteId = keyof typeof PALETTES;
export const isPalette = (v: unknown): v is PaletteId => typeof v === "string" && v in PALETTES;

/** Cricut and similar blade cutters: the cutting area of a 12 × 12 in mat (11.5 in square). */
export const MAT_MM = 292;

export interface ShadowBoxParams extends GenBase {
  cutter: { kind: "laser" | "blade" };
  frame: { shape: FrameShape; size: SizeId; width: number; height: number; border: number; corner: number };
  stack: {
    /** Layers, back to front. */
    count: number;
    /** The back layer is a plain board (with the light hole, if any). */
    back: boolean;
    /** Between layers: foam tape (`gap` mm thick) or spacer frames cut from the sheet. */
    spacer: "none" | "frames";
    gap: number;
    /** Spacer frames between two layers. */
    per: number;
    /** Spacer frame width, mm (0: the frame's border). */
    spacerW: number;
  };
  /** A light box behind the layers: rings deep enough for an LED strip, a cable notch and a diffuser. */
  light: {
    on: boolean;
    /** Room for the LED strip, mm (rounded up to whole rings). */
    depth: number;
    /** Cable notch width and the hole in the box's bottom wall, mm. */
    cable: number;
    diffuser: boolean;
    /** Diffuser thickness, mm. */
    diffT: number;
  };
  /** Round the stack: back board, hanging, a finger-jointed box and alignment aids. */
  box: {
    back: Back;
    /** Screw size, mm. */
    screw: number;
    hang: HangKind;
    /** Keyhole head diameter, mm. */
    head: number;
    walls: boolean;
    /** Walls stand this far in front of the front layer, mm. */
    lip: number;
    /** Finger width of the walls' joints, mm. */
    finger: number;
    /** Pin holes through every part, and their diameter, mm. */
    pins: boolean;
    pin: number;
    /** Layer numbers scored on the border. */
    numbers: boolean;
  };
  design: {
    pattern: Pattern;
    opening: Opening;
    /** Corners, star points or petals of the opening. */
    sides: number;
    /** Star and flower inner size, or ray width, %. */
    inner: number;
    petal: Petal;
    ridge: Ridge;
    from: From;
    /** Ridge height, % of the window. */
    amp: number;
    seed: number;
    /** Petals, rays or ridge bumps. */
    count: number;
    cell: Cell;
    /** Lattice cell size, mm. */
    pitch: number;
    /** Lattice holes grow toward the middle (positive) or the edge (negative), %. */
    fade: number;
    /** Opening size on the back and front pattern layers, % of the window. */
    min: number;
    max: number;
    /** Turn added on every layer, and the first layer's turn, degrees. */
    twist: number;
    rotate: number;
    /** Where the back openings sit (the vanishing point), % of the window from its middle. */
    shiftX: number;
    shiftY: number;
    /** Waves along each flow stripe. */
    waves: number;
    /** Curl of the sunburst's rays, or the drift of the flow's waves from back to front, degrees. */
    swirl: number;
    /** Narrowest paper left between cut-outs, mm. */
    web: number;
    /** What happens to paper pieces the cut-outs leave loose. */
    loose: Loose;
    /** Width of the bridges that hold loose pieces, mm. */
    bridge: number;
    /** Openings stretch with the window instead of keeping their shape. */
    stretch: boolean;
    /** A light hole in the back layer (moon, sun or a motif). */
    moon: boolean;
    hole: Hole;
    /** Light hole size, % of the window's smaller side. */
    holeSize: number;
  };
  /**
   * Words cut into a layer, standing on a paper bar across the window, or engraved on it. `layer` counts
   * from the back (Layer 1); 0 is the front layer.
   */
  text: { text: string; fontId: string; size: number; place: Place; layer: number; engrave: boolean };
  /**
   * A photo on the back board, seen through every layer: the image as printed or engraved (a data URL,
   * "" for none), its width / height, a zoom (100 % just covers the window) and a shift of the crop,
   * % of the spare room. The image is made from the original kept on this device (`src`) in `look`.
   */
  photo: {
    image: string;
    aspect: number;
    zoom: number;
    x: number;
    y: number;
    /** The original's id on this device ("" when only the image is known), its file name and the image's long side, px. */
    src: string;
    name: string;
    px: number;
    look: PhotoLook;
    /** −100 to 100. */
    bright: number;
    contrast: number;
    /** Tones of a posterised photo. */
    tones: number;
    dither: PhotoDither;
    /** Engraving resolution, dots per inch. */
    dpi: Dpi;
    /** The background is made white; `tol` is how far from its colour still counts, %. */
    bg: boolean;
    tol: number;
    /** Printed or engraved on the back board, or a print slid into a holder behind the layers. */
    mount: Mount;
    /** Paper for the photo print (PDF). */
    paper: Paper;
  };
  /**
   * The picture pattern's source and how it becomes layers. `levels` holds the traced outlines (see
   * picture.ts; "" uses the sample shape) and `image` a small grey preview of what was traced.
   */
  picture: {
    image: string;
    aspect: number;
    levels: string;
    /** File name of the traced picture or SVG, for the panel. */
    name: string;
    sample: Sample;
    mode: PicMode;
    /** Brightness cut-offs of the back and front pattern layers (levels), and of the silhouette, %. */
    dark: number;
    light: number;
    cut: number;
    /** Light parts are deep (levels), or the light parts are the silhouette. */
    invert: boolean;
    /** The silhouette stays as paper and the window around it is cut away. */
    paper: boolean;
    /** Levels: 100 % covers the window; grow: 100 % fills it. */
    size: number;
    /** Shift, % of the spare room (levels) or of half the window (grow). */
    x: number;
    y: number;
    /** Growth from one layer to the next, mm. */
    step: number;
    /** Cut-out details narrower than this are left uncut, mm. */
    detail: number;
    /** A word or a few letters used as the shape instead of the sample ("" for none), and its font. */
    word: string;
    wordFont: string;
  };
  look: { palette: PaletteId; reverse: boolean };
}

export const SHADOWBOX_DEFAULTS: ShadowBoxParams = {
  name: "Shadow box",
  material: "custom",
  T: 0.5,
  K: 0,
  bedW: MAT_MM,
  bedH: MAT_MM,
  gap: 3,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  cutter: { kind: "blade" },
  frame: { shape: "rounded", size: "8x8", width: 200, height: 200, border: 12, corner: 8 },
  stack: { count: 10, back: true, spacer: "none", gap: 2, per: 1, spacerW: 0 },
  light: { on: false, depth: 12, cable: 6, diffuser: true, diffT: 3 },
  box: { back: "none", screw: 3, hang: "none", head: 8, walls: false, lip: 3, finger: 10, pins: false, pin: 3, numbers: false },
  design: {
    pattern: "tunnel", opening: "star", sides: 6, inner: 55, petal: "drop",
    ridge: "mountains", from: "bottom", amp: 18, seed: 7, count: 12,
    cell: "hex", pitch: 18, fade: 40,
    min: 18, max: 118, twist: 6, rotate: 0, shiftX: 0, shiftY: 0, swirl: 0, waves: 3,
    web: 1.5, loose: "drop", bridge: 2, stretch: false, moon: false, hole: "circle", holeSize: 18,
  },
  text: { text: "", fontId: "lobster", size: 20, place: "bottom", layer: 0, engrave: false },
  photo: {
    image: "", aspect: 1.5, zoom: 100, x: 0, y: 0, src: "", name: "", px: 0,
    look: "colour", bright: 0, contrast: 0, tones: 4, dither: "floyd", dpi: "254", bg: false, tol: 18, mount: "board", paper: "a4",
  },
  picture: {
    image: "", aspect: 1, levels: "", name: "", sample: "cat", mode: "grow",
    dark: 20, light: 80, cut: 50, invert: false, paper: false, size: 45, x: 0, y: 0, step: 6, detail: 1.5,
    word: "", wordFont: "archivo-black",
  },
  look: { palette: "sunset", reverse: false },
};

/** The standard size these outer dimensions match, or "custom". */
export function sizeOf(w: number, h: number): SizeId {
  for (const [id, s] of Object.entries(SIZES)) if (s.w === w && s.h === h) return id as SizeId;
  return "custom";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const oneOf = <T extends string>(list: readonly T[], v: string, d: T): T => ((list as readonly string[]).includes(v) ? (v as T) : d);
const cleanName = (v: unknown) => String(v ?? "").replace(/[^\p{L}\p{N}\p{Zs}_.,()+-]/gu, "").slice(0, 80);

export function mergeShadowBox(raw: unknown): ShadowBoxParams {
  const d = SHADOWBOX_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  p.cutter.kind = p.cutter.kind === "laser" ? "laser" : "blade";
  p.frame.shape = oneOf(FRAMES, p.frame.shape, d.frame.shape);
  p.stack.spacer = p.stack.spacer === "frames" ? "frames" : "none";
  p.stack.count = clamp(Math.round(p.stack.count), 2, 20);
  p.stack.per = clamp(Math.round(p.stack.per), 1, 4);
  p.stack.spacerW = clamp(p.stack.spacerW, 0, 60);
  const l = p.light;
  l.on = l.on === true;
  l.diffuser = l.diffuser === true;
  l.depth = clamp(l.depth, 3, 60);
  l.cable = clamp(l.cable, 0, 20);
  l.diffT = clamp(l.diffT, 0.1, 6);
  const bx = p.box;
  bx.back = oneOf(BACKS, bx.back, d.box.back);
  bx.hang = oneOf(HANGS, bx.hang, d.box.hang);
  bx.screw = clamp(bx.screw, 1.5, 8);
  bx.head = clamp(bx.head, 4, 16);
  bx.walls = bx.walls === true;
  bx.lip = clamp(bx.lip, 0, 30);
  bx.finger = clamp(bx.finger, 4, 40);
  bx.pins = bx.pins === true;
  bx.pin = clamp(bx.pin, 1, 8);
  bx.numbers = bx.numbers === true;
  const g = p.design;
  g.pattern = oneOf(PATTERNS, g.pattern, d.design.pattern);
  g.opening = oneOf(OPENINGS, g.opening, d.design.opening);
  g.petal = oneOf(PETALS, g.petal, d.design.petal);
  g.ridge = oneOf(RIDGES, g.ridge, d.design.ridge);
  g.from = oneOf(FROMS, g.from, d.design.from);
  g.cell = oneOf(CELLS, g.cell, d.design.cell);
  g.sides = clamp(Math.round(g.sides), 3, 16);
  g.waves = clamp(Math.round(g.waves), 1, 12);
  g.count = clamp(Math.round(g.count), 3, g.pattern === "topographic" ? 12 : 48);
  g.seed = clamp(Math.round(g.seed), 0, 99999);
  g.hole = oneOf(HOLES, g.hole, d.design.hole);
  g.holeSize = clamp(g.holeSize, 5, 45);
  p.frame.size = sizeOf(p.frame.width, p.frame.height);
  const t = p.text;
  t.text = String(t.text ?? "").slice(0, 40);
  t.size = clamp(t.size, 8, 60);
  t.place = oneOf(PLACES, t.place, d.text.place);
  t.layer = clamp(Math.round(t.layer), 0, p.stack.count);
  t.engrave = t.engrave === true;
  const ph = p.photo;
  if (typeof ph.image !== "string" || (ph.image && !isImageDataURL(ph.image)) || ph.image.length > MAX_PHOTO_CHARS) ph.image = "";
  ph.aspect = Number.isFinite(ph.aspect) && ph.aspect > 0 ? clamp(ph.aspect, 0.1, 10) : d.photo.aspect;
  ph.zoom = clamp(ph.zoom, 100, 300);
  ph.x = clamp(ph.x, -100, 100);
  ph.y = clamp(ph.y, -100, 100);
  ph.src = typeof ph.src === "string" && /^[a-z0-9-]{1,40}$/.test(ph.src) ? ph.src : "";
  ph.name = cleanName(ph.name);
  ph.px = Number.isFinite(ph.px) ? clamp(Math.round(ph.px), 0, 10000) : 0;
  ph.look = oneOf(PHOTO_LOOKS, ph.look, d.photo.look);
  ph.bright = clamp(ph.bright, -100, 100);
  ph.contrast = clamp(ph.contrast, -100, 100);
  ph.tones = clamp(Math.round(ph.tones), 2, 8);
  ph.dither = oneOf(PHOTO_DITHERS, ph.dither, d.photo.dither);
  ph.dpi = oneOf(DPIS, ph.dpi, d.photo.dpi);
  ph.bg = ph.bg === true;
  ph.tol = clamp(ph.tol, 2, 60);
  ph.mount = oneOf(MOUNTS, ph.mount, d.photo.mount);
  ph.paper = ph.paper === "letter" ? "letter" : "a4";
  g.loose = oneOf(LOOSE, g.loose, d.design.loose);
  g.bridge = clamp(g.bridge, 0.5, 10);
  const pc = p.picture;
  if (!isPictureText(pc.levels)) pc.levels = "";
  if (typeof pc.image !== "string" || (pc.image && !isImageDataURL(pc.image))) pc.image = "";
  pc.name = cleanName(pc.name);
  pc.aspect = Number.isFinite(pc.aspect) && pc.aspect > 0 ? clamp(pc.aspect, 0.1, 10) : d.picture.aspect;
  pc.sample = oneOf(SAMPLES, pc.sample, d.picture.sample);
  pc.mode = oneOf(PIC_MODES, pc.mode, d.picture.mode);
  pc.dark = clamp(pc.dark, 0, 100);
  pc.light = clamp(pc.light, 0, 100);
  pc.cut = clamp(pc.cut, 0, 100);
  pc.size = clamp(pc.size, 10, 300);
  pc.x = clamp(pc.x, -100, 100);
  pc.y = clamp(pc.y, -100, 100);
  pc.step = clamp(pc.step, 0, 40);
  pc.detail = clamp(pc.detail, 0, 10);
  pc.word = String(pc.word ?? "").slice(0, 12);
  if (typeof pc.wordFont !== "string" || !pc.wordFont) pc.wordFont = d.picture.wordFont;
  if (!isPalette(p.look.palette)) p.look.palette = d.look.palette;
  return p;
}
