import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layoutParts } from "../index";
import { HINGE_PRESETS, hingePresetParams, randomHingeBox } from "../presets";
import { lidSlotSize } from "../lidSlot";
import { hingeRequestError } from "@/lib/billing/validate";
import { generateDesign, hingeForm } from "@/lib/desktop/products";
import { FREE_PATTERNS, FREE_SHAPES } from "@/lib/plans";
import type { Model, Params, PlatePart } from "../types";

/** Repeatable dice for the tests. */
function seedrandom(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}

const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), over);
function model(over: Partial<Params> = {}): Model {
  const m = computeModel(box(over));
  if ("error" in m) throw new Error(m.error);
  return m;
}
const plate = (m: Model, name: string) => m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === name)!;
const span = (pts: [number, number][], i: 0 | 1) => Math.max(...pts.map((q) => q[i])) - Math.min(...pts.map((q) => q[i]));

describe("tissue and coin slots", () => {
  it("cuts a tissue slot through the lid and its lip, along the long side, sized to the box", () => {
    const p = box({ W: 250, D: 130, H: 95, R: 18, lidHole: "tissue" });
    const m = model(p);
    const { len, w } = lidSlotSize(p);
    expect(len).toBe(138);
    expect(w).toBe(34);
    for (const name of ["LID", "LID LIP"]) {
      const slot = plate(m, name).slots[0];
      expect(span(slot, 0)).toBeCloseTo(len - p.K, 6);
      expect(span(slot, 1)).toBeCloseTo(w - p.K, 6);
    }
    expect(m.issues.some((i) => /left out/.test(i.msg))).toBe(false);
  });

  it("turns the slot when the box is deeper than wide, and takes the user's size", () => {
    const slot = plate(model({ W: 120, D: 220, lidHole: "tissue", lidHoleD: 100, lidHoleW: 30 }), "LID").slots[0];
    expect(span(slot, 1)).toBeCloseTo(100 - DEFAULTS.K, 6);
    expect(span(slot, 0)).toBeCloseTo(30 - DEFAULTS.K, 6);
  });

  it("puts a narrow coin slot in a fixed lid, after the tab slots", () => {
    const m = model({ shape: "cyl", dia: 100, H: 120, lid: "fixed", lidHole: "coin" });
    const lid = plate(m, "LID"), base = plate(m, "BASE");
    expect(lid.slots).toHaveLength(base.slots.length + 1);
    const coin = lid.slots[lid.slots.length - 1];
    expect(span(coin, 0)).toBeCloseTo(32 - DEFAULTS.K, 6);
    expect(span(coin, 1)).toBeCloseTo(4 - DEFAULTS.K, 6);
  });

  it("leaves a slot out, with a warning, when it does not fit", () => {
    const m = model({ lidHole: "tissue", lidHoleD: 300 });
    expect(plate(m, "LID").slots).toHaveLength(0);
    expect(m.issues.some((i) => /tissue slot is too big/.test(i.msg))).toBe(true);
  });

  it("is checked on requests and written into the file", () => {
    expect(hingeRequestError(box({ lidHole: "tissue", lidHoleW: 30 }))).toBeNull();
    expect(hingeRequestError(box({ lidHole: "coin", lidHoleW: 0 }))).not.toBeNull();
    const p = box({ lidHole: "tissue" });
    const m = model(p);
    expect(exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p).match(/<path/g)!.length).toBeGreaterThan(5);
  });
});

describe("Randomise box", () => {
  it("makes whole new boxes that build, keeping the material and the sheet", () => {
    const rnd = seedrandom("boxes");
    const start = box({ material: "card2", T: 2, K: 0.2, bedW: 400, bedH: 300, gap: 4 });
    const names = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const q = randomHingeBox(start, "pro", rnd);
      names.add(q.name);
      expect(q).toMatchObject({ material: "card2", T: 2, K: 0.2, bedW: 400, bedH: 300, gap: 4 });
      expect(hingeRequestError(q), q.name).toBeNull();
      const m = computeModel(q);
      expect("error" in m ? `${q.name}: ${m.error}` : null).toBeNull();
      if (!("error" in m)) expect(m.analysis.verdict, q.name).not.toBe("err");
    }
    expect(names.size).toBeGreaterThanOrEqual(8);
  });

  it("gives Free accounts Free shapes and patterns only", () => {
    const rnd = seedrandom("free");
    for (let i = 0; i < 25; i++) {
      const q = randomHingeBox(box(), "free", rnd);
      expect(FREE_SHAPES).toContain(q.shape);
      expect(FREE_PATTERNS).toContain(q.pattern);
    }
  });

  it("is what the desktop app's Randomise does", async () => {
    const r = await generateDesign({ product: "hinge", params: box() as never, randomise: {} }, "pro");
    expect(r.status).toBe(200);
    const q = (r.body as unknown as { params: Params }).params;
    expect(q.name).not.toBe(DEFAULTS.name);
  });
});

describe("new presets and machine beds", () => {
  it("has the new box presets", () => {
    for (const id of ["tissue-box", "tissue-cube", "money-box", "cookie-jar", "honey-lantern", "watch-box"]) expect(HINGE_PRESETS.some((p) => p.id === id), id).toBe(true);
    const tissue = computeModel(hingePresetParams(HINGE_PRESETS.find((p) => p.id === "tissue-box")!.params));
    expect("error" in tissue ? tissue.error : (tissue.parts.find((x) => x.name === "LID") as PlatePart).slots.length).toBe(1);
  });

  it("the desktop app picks a machine bed and shows which one is set", async () => {
    expect(hingeForm(box({ bedW: 498, bedH: 319 })).values?.bed).toBe("bed-xtool-s1");
    expect(hingeForm(box({ bedW: 123, bedH: 456 })).values?.bed).toBe("custom");
    const r = await generateDesign({ product: "hinge", params: box() as never, change: { key: "bed", value: "bed-xtool-m1" } }, "pro");
    expect((r.body as unknown as { params: Params }).params).toMatchObject({ bedW: 385, bedH: 300 });
  });
});
