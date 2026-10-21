import { describe, expect, it } from "vitest";
import { exportParametricForPlan } from "@/lib/billing/exportParametric";
import { parametricRequestError } from "@/lib/billing/validate";
import { parametricIssues } from "@/lib/issues/parametric";
import { parametricLocks } from "@/lib/plans";
import { finSpacingOf, mergeParametricParams } from "../defaults";
import { computeParametric, loadSource } from "../engine";
import { packDepth } from "../source/relief";
import { brightnessMap, cleanPatternSource, patternGrid, PATTERN_SOURCE_DEFAULTS, WAVE_PATTERNS, WALL_STYLES, type PatternSource, type WavePattern, type WallStyle } from "../source/pattern";
import type { ParametricParams } from "../types";
import { manifold } from "./helpers";

const wall = (src: Partial<PatternSource> = {}, more: Partial<ParametricParams> = {}): ParametricParams => {
  const p = mergeParametricParams({ source: { ...PATTERN_SOURCE_DEFAULTS, width: 300, height: 200, depth: 30, resolution: 64, ...src }, method: "parallel", ...more });
  p.parallel.backboard = "slats";
  p.parallel.fillEmptySlots = true;
  p.parallel.spacing = 12;
  return p;
};
const picture = () => {
  const w = 40, h = 30, rgba = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const o = (j * w + i) * 4, v = Math.round((i / (w - 1)) * 255); rgba[o] = rgba[o + 1] = rgba[o + 2] = v; rgba[o + 3] = 255; }
  return packDepth(brightnessMap(rgba, w, h));
};

describe("Parametric wall-art patterns", () => {
  const PATTERNS = Object.keys(WAVE_PATTERNS) as WavePattern[];
  it.each(PATTERNS)("%s: a closed relief the slicer cuts into slats", async (pattern) => {
    const p = wall({ pattern });
    const file = pattern === "image" ? picture() : undefined;
    const src = await loadSource(p, file);
    expect(src.openEdges).toBe(0);
    const r = computeParametric(p, src, await manifold());
    expect(r.parts.filter((q) => q.kind === "fin" || q.kind === "slat").length).toBeGreaterThan(10);
  }, 60000);

  it.each(Object.keys(WALL_STYLES) as WallStyle[])("%s style builds", async (style) => {
    const p = wall({ style, pattern: "sine" });
    const src = await loadSource(p);
    expect(src.openEdges).toBe(0);
  }, 60000);

  it("sine: the waves across the piece rise and fall as many times as asked", () => {
    const g = patternGrid(cleanPatternSource({ ...PATTERN_SOURCE_DEFAULTS, waves: 4, cross: 0, angle: 0, resolution: 128 }));
    const row = Array.from({ length: g.nx + 1 }, (_, i) => g.heights[Math.round(g.ny / 2) * (g.nx + 1) + i]);
    let peaks = 0;
    for (let i = 1; i < row.length - 1; i++) if (row[i] > row[i - 1] && row[i] >= row[i + 1]) peaks++;
    expect(peaks).toBe(4);
    expect(Math.max(...row) - Math.min(...row)).toBeGreaterThan(PATTERN_SOURCE_DEFAULTS.depth * 0.9);
  });

  it("organic edge: the top and bottom borders follow the wave; shelves are flat and level", () => {
    const g = patternGrid(cleanPatternSource({ ...PATTERN_SOURCE_DEFAULTS, style: "organic", edge: 40, resolution: 96 }));
    const cut = g.inside.reduce((n, v) => n + (v ? 0 : 1), 0);
    expect(cut).toBeGreaterThan(g.nx * 2);
    expect(g.inside.reduce((n, v) => n + v, 0)).toBeGreaterThan(g.nx * g.ny * 0.5);
    const sh = { x0: 0.2, x1: 0.6, y: 0.5, h: 0.1, level: 0.9 };
    const s = cleanPatternSource({ ...PATTERN_SOURCE_DEFAULTS, style: "shelf", shelves: [sh], resolution: 100 });
    const k = patternGrid(s), at = (u: number, v: number) => k.heights[Math.round(v * k.ny) * (k.nx + 1) + Math.round(u * k.nx)];
    const level = s.base + s.depth * 0.9;
    for (const u of [0.25, 0.4, 0.55]) expect(at(u, 0.5)).toBeCloseTo(level, 4);
  });

  it("a shelf narrower than two slats is flagged, and the fix widens it", () => {
    const p = wall({ style: "shelf", shelves: [{ x0: 0.4, x1: 0.45, y: 0.5, h: 0.1, level: 0.8 }] });
    const issues = parametricIssues(p, { parts: [], sheets: [], warnings: [], stats: {} } as never);
    const shelf = issues.find((i) => i.code === "SHELF_NARROW")!;
    expect(shelf).toBeDefined();
    const fixed = shelf.fixes[0].apply(p);
    const src = fixed.source as PatternSource;
    expect((src.shelves[0].x1 - src.shelves[0].x0) * src.width).toBeGreaterThanOrEqual(3 * finSpacingOf(fixed) - 1e-6);
    expect(parametricIssues(fixed, { parts: [], sheets: [], warnings: [], stats: {} } as never).some((i) => i.code === "SHELF_NARROW")).toBe(false);
  });

  it("your picture: needs its brightness map, dark is deep, and the server leaves it to the browser", async () => {
    const p = wall({ pattern: "image", fileName: "waves.png" });
    await expect(loadSource(p)).rejects.toThrow(/brightness/);
    const g = patternGrid(p.source as PatternSource, picture());
    const row = Math.round(g.ny / 2) * (g.nx + 1);
    expect(g.heights[row]).toBeGreaterThan(g.heights[row + g.nx]);
    const r = await exportParametricForPlan(p, { kind: "zip" }, "pro", await manifold());
    expect(r.ok).toBe(false);
  });

  it("settings are cleaned; a pattern is free to design", () => {
    const s = cleanPatternSource({ kind: "pattern", pattern: "zigzag", width: 1e9, curve: [[2, -1], "x", [0.5, 0.5]], points: Array.from({ length: 50 }, () => ({ x: 0.5, y: 0.5, s: 5 })), resolution: 9999 });
    expect(s.pattern).toBe("sine");
    expect(s.width).toBe(3000);
    expect(s.curve).toEqual([[1, 0], [0.5, 0.5]]);
    expect(s.points).toHaveLength(24);
    expect(s.points[0].s).toBe(1);
    expect(s.resolution).toBe(256);
    const p = wall();
    expect(parametricRequestError(p)).toBeNull();
    expect(parametricRequestError({ ...p, source: { ...p.source, width: -5 } as PatternSource })).not.toBeNull();
    expect(parametricLocks("free", p)).toEqual([]);
    expect(parametricLocks("free", { ...p, source: { kind: "image" } })).not.toEqual([]);
  });
});
