import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import type { ShapeKind } from "../shapes";
import { JOB_EXTRAS, SHEET_EXTRAS, type GenBase } from "../types";
import { mergeInto } from "../util";

export const PATTERNS = ["tunnel", "mandala", "sunburst", "landscape", "lattice"] as const;
export type Pattern = (typeof PATTERNS)[number];
export const OPENINGS = ["circle", "polygon", "star", "flower", "heart", "arch", "drop", "frame"] as const;
export type Opening = (typeof OPENINGS)[number];
export const PETALS = ["drop", "leaf", "diamond", "circle"] as const;
export type Petal = (typeof PETALS)[number];
export const RIDGES = ["hills", "mountains", "waves", "zigzag", "dunes", "skyline"] as const;
export type Ridge = (typeof RIDGES)[number];
export const FROMS = ["bottom", "top", "both"] as const;
export type From = (typeof FROMS)[number];
export const CELLS = ["hex", "circle", "square", "diamond", "triangle"] as const;
export type Cell = (typeof CELLS)[number];
export const FRAMES = ["rect", "rounded", "circle", "arch", "hexagon", "octagon", "heart", "diamond", "scalloped", "house", "shield", "cloud"] as const satisfies readonly ShapeKind[];
export type FrameShape = (typeof FRAMES)[number];

/** Paper colours from the back layer to the front one (previews only). */
export const PALETTES = {
  sunset: { name: "Sunset", stops: ["#3B1E54", "#9B3675", "#F06C4E", "#FFC15E", "#FFF1C9"] },
  ocean: { name: "Ocean", stops: ["#0B2545", "#13315C", "#1D7EA8", "#8DD3E8", "#E8F7FB"] },
  forest: { name: "Forest", stops: ["#0F2A1D", "#2D6A4F", "#74C69D", "#D8F3DC"] },
  rose: { name: "Rose", stops: ["#590D22", "#A4133C", "#FF4D6D", "#FFB3C1", "#FFF0F3"] },
  lavender: { name: "Lavender", stops: ["#2E1A47", "#6A4C93", "#B79CED", "#EDE7F6"] },
  night: { name: "Night sky", stops: ["#0B0C2A", "#1F2A6B", "#4F6BB0", "#A9C2EE"] },
  autumn: { name: "Autumn", stops: ["#3D1308", "#9E2A2B", "#E09F3E", "#F7D08A"] },
  kraft: { name: "Kraft", stops: ["#5B3D22", "#9C7350", "#C9A27A", "#F3E3C8"] },
  mono: { name: "Greys", stops: ["#2B2B2B", "#8C8C8C", "#F2F2F2"] },
  snow: { name: "White paper", stops: ["#5F7389", "#B8C4CF", "#E9EEF2", "#FFFFFF"] },
  rainbow: { name: "Rainbow", stops: ["#6A4C93", "#1982C4", "#8AC926", "#FFCA3A", "#FF595E"] },
  mint: { name: "Mint", stops: ["#073B3A", "#0B6E4F", "#21A179", "#9FE2BF", "#E9FBF2"] },
  gold: { name: "Gold", stops: ["#2B1D08", "#7A5A1A", "#D4AF37", "#F5E6A8"] },
  coral: { name: "Coral", stops: ["#5C2A2A", "#B5523B", "#E07A5F", "#F2CC8F", "#FBF0E4"] },
  desert: { name: "Desert", stops: ["#4A2C17", "#7F4F24", "#B08968", "#DDB892", "#F3E9DC"] },
  candy: { name: "Candy", stops: ["#3A0CA3", "#7209B7", "#F72585", "#FFAFCC", "#FFF0F6"] },
} as const;
export type PaletteId = keyof typeof PALETTES;
export const isPalette = (v: unknown): v is PaletteId => typeof v === "string" && v in PALETTES;

/** Cricut and similar blade cutters: the cutting area of a 12 × 12 in mat (11.5 in square). */
export const MAT_MM = 292;

export interface ShadowBoxParams extends GenBase {
  cutter: { kind: "laser" | "blade" };
  frame: { shape: FrameShape; width: number; height: number; border: number; corner: number };
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
    /** Curl of the sunburst's rays, degrees. */
    swirl: number;
    /** Narrowest paper left between cut-outs, mm. */
    web: number;
    /** Openings stretch with the window instead of keeping their shape. */
    stretch: boolean;
    /** A round light hole in the back layer (moon or sun). */
    moon: boolean;
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
  sheet: { ...SHEET_EXTRAS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  cutter: { kind: "blade" },
  frame: { shape: "rounded", width: 200, height: 200, border: 12, corner: 8 },
  stack: { count: 10, back: true, spacer: "none", gap: 2, per: 1 },
  design: {
    pattern: "tunnel", opening: "star", sides: 6, inner: 55, petal: "drop",
    ridge: "mountains", from: "bottom", amp: 18, seed: 7, count: 12,
    cell: "hex", pitch: 18, fade: 40,
    min: 18, max: 118, twist: 6, rotate: 0, shiftX: 0, shiftY: 0, swirl: 0,
    web: 1.5, stretch: false, moon: false,
  },
  look: { palette: "sunset", reverse: false },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const oneOf = <T extends string>(list: readonly T[], v: string, d: T): T => ((list as readonly string[]).includes(v) ? (v as T) : d);

export function mergeShadowBox(raw: unknown): ShadowBoxParams {
  const d = SHADOWBOX_DEFAULTS;
  const p = mergeInto(clone(d), raw);
  p.cutter.kind = p.cutter.kind === "laser" ? "laser" : "blade";
  p.frame.shape = oneOf(FRAMES, p.frame.shape, d.frame.shape);
  p.stack.spacer = p.stack.spacer === "frames" ? "frames" : "none";
  p.stack.count = clamp(Math.round(p.stack.count), 2, 20);
  p.stack.per = clamp(Math.round(p.stack.per), 1, 4);
  const g = p.design;
  g.pattern = oneOf(PATTERNS, g.pattern, d.design.pattern);
  g.opening = oneOf(OPENINGS, g.opening, d.design.opening);
  g.petal = oneOf(PETALS, g.petal, d.design.petal);
  g.ridge = oneOf(RIDGES, g.ridge, d.design.ridge);
  g.from = oneOf(FROMS, g.from, d.design.from);
  g.cell = oneOf(CELLS, g.cell, d.design.cell);
  g.sides = clamp(Math.round(g.sides), 3, 16);
  g.count = clamp(Math.round(g.count), 3, 48);
  g.seed = clamp(Math.round(g.seed), 0, 99999);
  if (!isPalette(p.look.palette)) p.look.palette = d.look.palette;
  return p;
}
