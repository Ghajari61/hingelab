import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layoutParts } from "../index";
import type { CutStyle, HingeCol, Lid, Model, Params, Pattern, Shape } from "../types";

const shapes: Shape[] = ["rect", "pill", "poly", "cyl"];
const lids: Lid[] = ["open", "fixed", "removable"];
const splits = [1, 2];
const patterns: Pattern[] = ["straight", "wave", "relief", "serpentine"];
const cutStyles: CutStyle[] = ["slot", "line"];

function make(shape: Shape, lid: Lid, split: number, pattern: Pattern, cutStyle: CutStyle): Params {
  const p = clone(DEFAULTS);
  p.shape = shape;
  p.lid = lid;
  p.split = split;
  p.pattern = pattern;
  p.cutStyle = cutStyle;
  if (shape === "pill") p.R = Math.min(p.W, p.D) / 2;
  return p;
}

const matrix: Params[] = [];
for (const shape of shapes)
  for (const lid of lids)
    for (const split of splits)
      for (const pattern of patterns)
        for (const cutStyle of cutStyles) matrix.push(make(shape, lid, split, pattern, cutStyle));

/** Split strip columns into hinge zones: columns inside a zone are exactly one pitch apart. */
function zonesOf(cols: HingeCol[], pitch: number): HingeCol[][] {
  const zones: HingeCol[][] = [];
  for (const c of cols) {
    const zone = zones[zones.length - 1];
    if (zone && Math.abs(c.x - zone[zone.length - 1].x - pitch) < 1e-6) zone.push(c);
    else zones.push([c]);
  }
  return zones;
}

function ok(p: Params): Model {
  const model = computeModel(p);
  if ("error" in model) throw new Error(`unexpected error: ${model.error}`);
  return model;
}

describe("B. invariants over every shape × lid × split × pattern × cut style", () => {
  it("covers 192 combinations", () => {
    expect(matrix).toHaveLength(192);
  });

  for (const p of matrix) {
    it(`${p.shape} / ${p.lid} / split ${p.split} / ${p.pattern} / ${p.cutStyle}`, () => {
      const model = ok(p);

      // bottom tabs match BASE slots
      let bottomTabVerts = 0;
      for (const part of model.parts) {
        if (part.kind !== "wall") continue;
        bottomTabVerts += part.outline.filter((q) => q[1] > model.hBody + p.T * 0.5).length;
      }
      const base = model.parts.find((part) => part.kind === "plate" && part.name === "BASE");
      if (!base || base.kind !== "plate") throw new Error("missing BASE plate");
      expect(bottomTabVerts / 2).toBe(base.slots.length);

      // strip length equals the neutral-axis perimeter (arcs shortened by stretch)
      const perimeter = model.core.edges.reduce((sum, e) => sum + e.len + e.sweep * model.rN / (1 + p.stretch / 100), 0);
      expect(Math.abs(perimeter - model.L)).toBeLessThanOrEqual(1e-6);

      // no hinge column within 0.3 mm of a tab vertex
      for (const part of model.parts) {
        if (part.kind !== "wall") continue;
        const tabXs = part.outline
          .filter((q) => q[1] > model.hBody + p.T * 0.5 || q[1] < -p.T * 0.5)
          .map((q) => q[0]);
        for (const col of part.cols) {
          for (const tx of tabXs) expect(Math.abs(col.x - tx)).toBeGreaterThanOrEqual(0.3);
        }
      }

      // every zone: odd column count, starting and ending with closed (top for serpentine)
      const endKind = p.pattern === "serpentine" ? "top" : "closed";
      const zones = zonesOf(model.cols, p.pitch);
      expect(zones.length).toBeGreaterThan(0);
      for (const zone of zones) {
        expect(zone.length % 2).toBe(1);
        expect(zone[0].kind).toBe(endKind);
        expect(zone[zone.length - 1].kind).toBe(endKind);
      }

      // SVG sanity
      const lay = layoutParts(model.parts, p.bedW, p.gap);
      const svg = exportSVG(model, lay, p);
      expect(svg).not.toContain("NaN");
      expect(svg).toMatch(/width="[\d.]+mm"/);
      expect(svg).toMatch(/height="[\d.]+mm"/);
      expect(svg).toContain('id="slots"');
      expect(svg).toContain('id="hinge"');
      expect(svg).toContain('id="outline"');
      if (p.labels && p.layers.labels.exp) expect(svg).toContain('id="labels"');
    });
  }
});

describe("C. error paths", () => {
  it("rejects a corner radius larger than half the width or depth", () => {
    const p = clone(DEFAULTS);
    p.R = p.D / 2 + 5;
    expect(computeModel(p)).toEqual({
      error: "Corner radius is larger than half the width or depth. Lower the radius or enlarge the box.",
    });
  });

  it("rejects a cylinder too small for its tab flats", () => {
    const p = clone(DEFAULTS);
    p.shape = "cyl";
    p.dia = 20;
    expect(computeModel(p)).toEqual({
      error: "Diameter is too small for this many tab flats. Increase the diameter or reduce the flats.",
    });
  });

  it("rejects kerf greater than or equal to the thickness", () => {
    const p = clone(DEFAULTS);
    p.K = p.T;
    expect(computeModel(p)).toEqual({ error: "Kerf must be between 0 and the material thickness." });
  });

  it("rejects spacing at or below slot width + 0.3 mm (slot style)", () => {
    const p = clone(DEFAULTS);
    p.cutStyle = "slot";
    p.pitch = p.slotW + 0.3;
    expect(computeModel(p)).toEqual({
      error: "Slit spacing is too tight for this slot width. Increase the spacing or narrow the slots.",
    });
  });

  it("rejects spacing at or below kerf + 0.3 mm (single line style)", () => {
    const p = clone(DEFAULTS);
    p.cutStyle = "line";
    p.pitch = p.K + 0.3;
    expect(computeModel(p)).toEqual({ error: "Slit spacing is too tight for this kerf. Increase the spacing." });
  });

  it("rejects a slot narrower than kerf + 0.05 mm", () => {
    const p = clone(DEFAULTS);
    p.slotW = p.K + 0.01;
    expect(computeModel(p)).toEqual({ error: "Slot width must be at least 0.05 mm wider than the kerf." });
  });

  // The prototype's serpentine-specific message is unreachable: any wall that short already fails
  // the general bridge-height check, which is what the user sees.
  it("rejects serpentine on a wall that is too short", () => {
    const p = clone(DEFAULTS);
    p.pattern = "serpentine";
    p.H = 2 * p.bridge + 6 + 2 * p.T - 0.5;
    expect(computeModel(p)).toEqual({
      error: "The box is too short for this bridge size. Increase height or reduce the bridge.",
    });
  });
});
