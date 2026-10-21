/**
 * Wall-art pattern settings: the kinds, styles, defaults and the cleaning of saved or sent settings.
 * Kept apart from the mesh code (pattern.ts) so the editor's defaults and the server checks stay light.
 */
export type WavePattern = "sine" | "ridge" | "perlin" | "ripple" | "mountain" | "attractors" | "image";
export type WallStyle = "relief" | "organic" | "shelf";
export const WAVE_PATTERNS: Record<WavePattern, string> = {
  sine: "Sine waves", ridge: "Ridge curve", perlin: "Perlin noise", ripple: "Radial ripple", mountain: "Mountain ridge", attractors: "Attractor points", image: "Your picture",
};
export const WALL_STYLES: Record<WallStyle, string> = { relief: "Wave relief", organic: "Organic edge", shelf: "Wave shelf" };

/** A level shelf: from x0 to x1 across (0..1), centred at y down (0..1), h tall (0..1), at `level` of the depth. */
export interface Shelf { x0: number; x1: number; y: number; h: number; level: number }
/** A point that pushes the surface out (s > 0) or pulls it in (s < 0), s from -1 to 1. */
export interface Attractor { x: number; y: number; s: number }

export interface PatternSource {
  kind: "pattern";
  pattern: WavePattern;
  style: WallStyle;
  /** The piece's width and height, mm. */
  width: number;
  height: number;
  /** Deepest the pattern stands off its base, and the base under it, mm. */
  depth: number;
  base: number;
  /** How much of the depth the pattern uses, %: less keeps it shallower above a raised floor. */
  amplitude: number;
  /** Sine: waves across the piece, their direction (degrees, 0 = across), and a cross wave's share, %. */
  waves: number;
  angle: number;
  cross: number;
  /** Ridge: the crest's curve (points 0..1) and its width, % of the height. */
  curve: [number, number][];
  ridgeWidth: number;
  /** Noise and mountain: feature size, mm; seed; octaves. Attractors: their reach, mm. */
  scale: number;
  seed: number;
  octaves: number;
  /** Ripple: its middle (0..1). */
  center: [number, number];
  points: Attractor[];
  /** Your picture: its name (the brightness map is sent with the request); dark is deep unless inverted. */
  fileName?: string;
  invert: boolean;
  /** Organic edge: how far the top and bottom borders follow the wave, % of the height. */
  edge: number;
  shelves: Shelf[];
  /** Grid cells along the long side (16 to 256). */
  resolution: number;
}

export const PATTERN_SOURCE_DEFAULTS: PatternSource = {
  kind: "pattern", pattern: "sine", style: "relief", width: 600, height: 400, depth: 60, base: 6, amplitude: 100,
  waves: 3, angle: 0, cross: 20, curve: [[0.05, 0.62], [0.35, 0.3], [0.65, 0.7], [0.95, 0.38]], ridgeWidth: 25,
  scale: 140, seed: 7, octaves: 4, center: [0.5, 0.5], points: [{ x: 0.3, y: 0.4, s: 1 }, { x: 0.72, y: 0.62, s: -0.7 }],
  invert: false, edge: 25, shelves: [{ x0: 0.12, x1: 0.52, y: 0.42, h: 0.08, level: 0.8 }], resolution: 160,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const unitPt = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? [clamp(v[0], 0, 1), clamp(v[1], 0, 1)] : null);

/** Settings from a request or a file, every value in range (lists capped), the rest the defaults. */
export function cleanPatternSource(raw: unknown): PatternSource {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof PatternSource, unknown>>;
  const d = PATTERN_SOURCE_DEFAULTS;
  const curve = Array.isArray(r.curve) ? r.curve.slice(0, 32).map(unitPt).filter((q): q is [number, number] => !!q) : d.curve;
  const points = Array.isArray(r.points) ? r.points.slice(0, 24).flatMap((q) => {
    const o = (q && typeof q === "object" ? q : {}) as Partial<Attractor>;
    return typeof o.x === "number" && typeof o.y === "number" ? [{ x: num(o.x, 0, 1, 0.5), y: num(o.y, 0, 1, 0.5), s: num(o.s, -1, 1, 1) }] : [];
  }) : d.points;
  const shelves = Array.isArray(r.shelves) ? r.shelves.slice(0, 8).flatMap((q) => {
    const o = (q && typeof q === "object" ? q : {}) as Partial<Shelf>;
    const x0 = num(o.x0, 0, 1, 0), x1 = num(o.x1, 0, 1, 1);
    return x1 - x0 > 0.01 ? [{ x0, x1, y: num(o.y, 0, 1, 0.5), h: num(o.h, 0.01, 0.5, 0.08), level: num(o.level, 0, 1, 0.8) }] : [];
  }) : d.shelves;
  return {
    kind: "pattern",
    pattern: typeof r.pattern === "string" && r.pattern in WAVE_PATTERNS ? (r.pattern as WavePattern) : d.pattern,
    style: typeof r.style === "string" && r.style in WALL_STYLES ? (r.style as WallStyle) : d.style,
    width: num(r.width, 50, 3000, d.width), height: num(r.height, 50, 3000, d.height),
    depth: num(r.depth, 1, 300, d.depth), base: num(r.base, 0, 50, d.base), amplitude: num(r.amplitude, 0, 100, d.amplitude),
    waves: num(r.waves, 0.2, 40, d.waves), angle: num(r.angle, -180, 180, d.angle), cross: num(r.cross, 0, 100, d.cross),
    curve: curve.length >= 2 ? curve : d.curve, ridgeWidth: num(r.ridgeWidth, 2, 100, d.ridgeWidth),
    scale: num(r.scale, 10, 2000, d.scale), seed: Math.round(num(r.seed, 0, 1e6, d.seed)), octaves: Math.round(num(r.octaves, 1, 6, d.octaves)),
    center: unitPt(r.center) ?? d.center, points,
    ...(typeof r.fileName === "string" ? { fileName: r.fileName.slice(0, 200) } : {}),
    invert: r.invert === true, edge: num(r.edge, 0, 45, d.edge), shelves, resolution: Math.round(num(r.resolution, 16, 256, d.resolution)),
  };
}

