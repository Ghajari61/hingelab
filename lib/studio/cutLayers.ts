import type { CutLayer, CutMode } from "./types";

/** LightBurn's layer colours C00–C29, so exported colours map 1:1 onto LightBurn layers. */
export const LAYER_COLORS = [
  "#000000", "#0000FF", "#FF0000", "#00E000", "#D0D000", "#FF8000", "#00E0E0", "#FF00FF", "#B4B4B4", "#0000A0",
  "#A00000", "#00A000", "#A0A000", "#C08000", "#00A0FF", "#A000A0", "#808080", "#7D87B9", "#BB7784", "#4A6FE3",
  "#D33F6A", "#8CD78C", "#F0B98D", "#F6C4E1", "#FA9ED4", "#500A78", "#B45A00", "#004754", "#86FA88", "#FFDB66",
] as const;

export const LAYER_COUNT = LAYER_COLORS.length;

export const layerCode = (i: number) => `C${String(i).padStart(2, "0")}`;

/** Default operation per layer: C00 engrave fill, C01 score, everything else cut. */
const DEFAULT_MODE = (i: number): CutMode => (i === 0 ? "fill" : i === 1 ? "score" : "cut");

const DEFAULT_NAMES: Record<number, string> = { 0: "Engrave", 1: "Score", 2: "Cut", 3: "Inner cuts" };

/** Starting settings for a 40–60 W CO₂ laser on 3 mm plywood; the material/machine presets refine them. */
export function defaultCutLayer(i: number): CutLayer {
  const mode = DEFAULT_MODE(i);
  return {
    index: i,
    name: DEFAULT_NAMES[i] ?? layerCode(i),
    color: LAYER_COLORS[i],
    mode,
    speed: mode === "fill" ? 250 : mode === "score" ? 150 : 12,
    power: mode === "fill" ? 30 : mode === "score" ? 20 : 65,
    passes: 1,
    interval: 0.1,
    air: mode === "cut",
    priority: mode === "fill" ? 0 : mode === "score" ? 1 : 2,
    output: true,
    show: true,
    kerf: 0,
  };
}

export const defaultCutLayers = (): CutLayer[] => LAYER_COLORS.map((_, i) => defaultCutLayer(i));

/** Index of the layer whose colour matches (case-insensitive), or -1. */
export function layerForColor(color: string): number {
  const c = color.trim().toUpperCase();
  return LAYER_COLORS.findIndex((x) => x === c);
}

/** Nearest LightBurn colour for an arbitrary CSS hex colour (used by SVG/DXF import). */
export function nearestLayer(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  let best = 0, bd = Infinity;
  LAYER_COLORS.forEach((c, i) => {
    const q = parseHex(c)!;
    const d = (q[0] - rgb[0]) ** 2 + (q[1] - rgb[1]) ** 2 + (q[2] - rgb[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
