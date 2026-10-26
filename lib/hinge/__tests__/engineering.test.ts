import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layoutParts } from "../index";
import type { Params } from "../types";
import { HINGE_PRESETS, hingePresetParams } from "../presets";
import { FIELDS } from "@/components/editor/fields";

const box = (p: Partial<Params> = {}): Params => ({ ...clone(DEFAULTS), ...p });
const model = (p: Partial<Params> = {}) => {
  const m = computeModel(box(p));
  if ("error" in m) throw new Error(m.error);
  return m;
};

describe("fabrication boundary regressions", () => {
  it.each(["back", "front"] as const)("rejects collapsed %s flip slots with directional kerf", flipSide => {
    expect(computeModel(box({ lid: "flip", flipSide, Ky: 0.9 }))).toHaveProperty("error");
  });
  it("checks the honeycomb lid's separate slot lattice", () => {
    expect(computeModel(box({ lid: "flip", pattern: "honeycomb", slotW: 9.3, pitch: 5.4, K: 0.9 }))).toHaveProperty("error");
  });
  it("rejects reversed tab sockets instead of exporting them", () => {
    expect(computeModel(box({ slotClr: -3 }))).toHaveProperty("error");
  });
  it("omits a small round opening that directional kerf would invert", () => {
    const m = model({ lidHole: "knob", lidHoleD: 0.8, Ky: 1 });
    const lid = m.parts.find(p => p.name === "LID");
    expect(lid && "slots" in lid ? lid.slots : null).toEqual([]);
    expect(m.issues.some(i => /hole.*left out/i.test(i.msg))).toBe(true);
  });
  it.each(["capH", "flipBand", "divH", "baseHoleD"] as const)("rejects non-finite %s from imported parameters", field => {
    expect(computeModel(box({ [field]: Infinity }))).toHaveProperty("error");
  });
  it("keeps the base intact where a centred divider needs its tab socket", () => {
    const before = model({ divX: 1 });
    const after = model({ divX: 1, baseHole: "hole", baseHoleD: 20 });
    expect(after.parts.find(p => p.name === "BASE")).toEqual(before.parts.find(p => p.name === "BASE"));
    expect(after.issues.some(i => /base opening.*divider/i.test(i.msg))).toBe(true);
  });
  it("allows an opening clear of two offset dividers", () => {
    const m = model({ divX: 2, baseHole: "hole", baseHoleD: 10 });
    expect(m.issues.some(i => /base opening.*divider/i.test(i.msg))).toBe(false);
  });
  it.each(["acr2", "acr3", "acr5", "mirror3"])("explains brittle hinge material %s", material => {
    expect(model({ material }).issues.some(i => /acrylic.*crack/i.test(i.msg))).toBe(true);
  });
  it("compensates hanging keyholes on both machine axes", () => {
    const holes = (Ky: number) => {
      const base = model({ hangHoles: true, Ky }).parts.find(p => p.name === "BASE")!;
      return "slots" in base ? base.slots.slice(-2) : [];
    };
    const a = holes(0.15), b = holes(0.45);
    expect(a).toHaveLength(2);
    const height = (points: [number, number][]) => Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1]));
    for (let i = 0; i < 2; i++) expect(height(a[i]) - height(b[i])).toBeCloseTo(0.3, 6);
  });
});

describe("supported option families", () => {
  it("hides hole dimensions retained from a previous lid on an open box", () => {
    const p = box({ lid: "open", lidHole: "tissue" });
    for (const id of ["lidHoleD", "lidHoleW"]) expect(FIELDS.find(f => f.id === id)!.show!(p)).toBe(false);
  });
  const shapes = ["rect", "pill", "poly", "cyl"] as const;
  const lids = ["open", "fixed", "removable", "flip", "cap"] as const;
  const patterns = ["straight", "wave", "relief", "serpentine", "honeycomb"] as const;
  const cases = shapes.flatMap(shape => lids.flatMap(lid => patterns.map(pattern => ({ shape, lid, pattern }))));
  it.each(cases)("exports $shape / $lid / $pattern", options => {
    const p = box({ ...options, W: 200, D: 150, H: 90, R: 30, dia: 160, sides: 6,
      slit: 40, bridge: 2, ...(options.pattern === "honeycomb" ? { slotW: 9.3, pitch: 5.4 } : {}) });
    const m = model(p);
    const svg = exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p);
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svg).toContain('id="outline"');
  });
  it.each(["back", "front", "left", "right"] as const)("exports directional %s hinges in both cut styles", flipSide => {
    for (const cutStyle of ["slot", "line"] as const) {
      const p = box({ lid: "flip", flipSide, cutStyle, Ky: 0.25, W: 200, D: 150 });
      const m = model(p);
      expect(exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p)).not.toMatch(/NaN|Infinity/);
    }
  });
  it.each(["none", "finger", "knob", "tissue", "coin", "rim", "lamp"] as const)("exports $0 lid openings with steps and windows", lidHole => {
    for (const lid of ["fixed", "removable", "flip", "cap"] as const) {
      const p = box({ lid, lidHole, lidSteps: 2, lidWindow: lidHole === "rim", W: 200, D: 150, H: 90, R: 30 });
      const m = model(p);
      expect(exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p)).not.toMatch(/NaN|Infinity/);
    }
  });
  it.each([1, 2, 3, 4])("builds %i drawers with every pull", drawers => {
    for (const drawerPull of ["none", "finger", "knob"] as const) {
      const m = model({ drawers, drawerPull, W: 200, D: 250, H: 160, R: 24, slit: 40, bridge: 2 });
      expect(m.drawerPlaces).toHaveLength(drawers);
    }
  });
});

describe("catalogue fabrication exports", () => {
  it.each(HINGE_PRESETS)("builds editable $id with finite millimetre SVG", preset => {
    const p = hingePresetParams(preset.params);
    const m = model(p);
    const svg = exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p);
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svg).toMatch(/width="[\d.]+mm"/);
    for (const part of m.parts) {
      expect(part.bbox.x1 - part.bbox.x0, part.name).toBeGreaterThan(0);
      expect(part.bbox.y1 - part.bbox.y0, part.name).toBeGreaterThan(0);
    }
  });
});
