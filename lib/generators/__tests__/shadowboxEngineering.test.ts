import { describe, expect, it } from "vitest";
import { SHADOWBOX } from "../shadowbox";
import { mergeShadowBox, FRAMES, PATTERNS } from "../shadowbox/params";
import { arrangeGenerator, genSVG } from "../output";
import { makeShape, differenceShapes } from "@/lib/letters/polygon";
import { pinHoles, screwHoles, ringCount, walls, drillPart, type Band } from "../shadowbox/enclosure";
import { bboxOf, rect, circle } from "../geom";
import type { ShadowBoxOutput } from "../shadowbox/build";
import { CTX } from "./ctx";

const p = (raw: Record<string, unknown> = {}) => mergeShadowBox({ cutter: { kind: "laser" }, T: 3, K: 0.15, ...raw });
const band: Band = { frame: rect(0, 0, 200, 160), win: rect(14, 14, 172, 132), width: 14, cx: 100, cy: 80 };
describe("shadow box engineering regressions", () => {
  it("preserves the editable topographic pattern and its reproducible seed", () => {
    const q = p({ design: { pattern: "topographic", count: 3, amp: 30, seed: 42 }, stack: { count: 6 } });
    expect(q.design.pattern).toBe("topographic");
    const a = SHADOWBOX.build(q, CTX);
    expect(a.error).toBeUndefined();
    expect(SHADOWBOX.build(q, CTX).parts).toEqual(a.parts);
    const b = SHADOWBOX.build({ ...q, design: { ...q.design, seed: 43 } }, CTX);
    expect(b.parts[1].holes).not.toEqual(a.parts[1].holes);
  });
  it("keeps alignment pins separate from back-board screws", () => {
    const q = p({ box: { pins: true, back: "screwed" } });
    const centre = (c: [number, number][]) => { const b = bboxOf([c]); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };
    for (const pin of pinHoles(q, band)) for (const screw of screwHoles(q, band).clear) {
      const a = centre(pin), b = centre(screw);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan((q.box.pin + q.box.screw) / 2 + 1.5);
    }
  });
  it("makes the light cavity deep enough for the selected cable", () => {
    const q = p({ light: { on: true, depth: 3, cable: 12 } });
    expect(ringCount(q) * q.T).toBeGreaterThanOrEqual(q.light.cable);
  });
  it("exports an edge cable opening as a notch instead of a hole outside the panel", () => {
    const q = p({ light: { cable: 8 } });
    const bottom = walls(q, bboxOf([band.frame]), 30, 2).find(pt => pt.id === "wall-bottom")!;
    expect(bottom.holes).toHaveLength(0);
    expect(bottom.outer.length).toBeGreaterThan(walls(q, bboxOf([band.frame]), 30, null)[1].outer.length);
  });
  it("does not turn a near-edge mounting hole into an open notch", () => {
    const pt = { id: "a", name: "a", outer: rect(0, 0, 20, 20), holes: [] };
    expect(drillPart(pt, circle(1, 10, 3))).toBe(pt);
  });
  it("never asks the user to glue a removable screwed back in place", () => {
    const q = p({ light: { on: true }, box: { back: "screwed" }, stack: { back: false } });
    const out = SHADOWBOX.build(q, CTX);
    expect(out.assembly?.join(" ")).not.toMatch(/Glue the \d+ light box rings into one stack on the back board/);
  });
  it.each(["T", "thin", "count", "width"])("rejects invalid %s before generating geometry", key => {
    const q = p();
    if (key === "T") q.T = 0;
    if (key === "thin") { q.T = 0.001; q.K = 0; }
    if (key === "count") q.stack.count = Infinity;
    if (key === "width") q.frame.width = NaN;
    expect(SHADOWBOX.build(q, CTX).error).toBeTruthy();
  });
  it("reports missing mounting holes rather than silently promising assembly", () => {
    const q = p({ frame: { border: 3 }, box: { pins: true, pin: 8 } });
    const out = SHADOWBOX.build(q, CTX) as ShadowBoxOutput;
    expect(SHADOWBOX.check(q, out).some(i => i.code === "MOUNTING_HOLES")).toBe(true);
  });
});

describe("shadow box option families and exports", () => {
  it.each(FRAMES)("builds every pattern inside the %s frame", shape => {
    for (const pattern of PATTERNS) {
      const q = p({ frame: { shape, width: 220, height: 200, border: 16 }, stack: { count: 5 }, design: { pattern, count: 5, pitch: 34 } });
      const out = SHADOWBOX.build(q, CTX);
      expect(out.error, `${shape}/${pattern}`).toBeUndefined();
      expect(out.parts.filter(pt => /^layer\d+$/.test(pt.id))).toHaveLength(5);
      for (const pt of out.parts) for (const c of [pt.outer, ...pt.holes]) {
        expect(c.length).toBeGreaterThanOrEqual(3);
        expect(c.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
      }
    }
  });
  it.each(SHADOWBOX.presets.slice(0, 12))("exports $id with millimetres and ordered assembly parts", preset => {
    const q = SHADOWBOX.merge(preset.params);
    const out = SHADOWBOX.build(q, CTX);
    expect(SHADOWBOX.check(q, out).filter(i => i.level !== "info")).toEqual([]);
    const arranged = arrangeGenerator(SHADOWBOX, q, CTX);
    expect(arranged.lay).toBeTruthy();
    const svg = genSVG(SHADOWBOX, q, arranged.lay!);
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(out.assembly?.join(" ")).toContain("Layer 1");
  });
  it("keeps untwisted topographic openings nested with deterministic contours", () => {
    const q = p({ stack: { count: 10, back: false }, design: { pattern: "topographic", count: 3, seed: 17, twist: 0, shiftX: 0, shiftY: 0, web: 0 } });
    const layers = SHADOWBOX.build(q, CTX).parts.filter(pt => /^layer\d+$/.test(pt.id));
    for (let i = 1; i < layers.length; i++) {
      const before = layers[i - 1].holes, after = layers[i].holes;
      // Polygon approximation and contour simplification may introduce sub-millimetre residuals.
      const residual = differenceShapes(before, after).reduce((sum, s) => sum + makeShape(s.outer, s.holes).area, 0);
      expect(residual).toBeLessThan(2);
    }
  });
});
