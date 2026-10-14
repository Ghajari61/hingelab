import { describe, expect, it } from "vitest";
import { makeShape } from "@/lib/letters/polygon";
import { DEFAULTS, clone } from "@/lib/hinge/defaults";
import { TESTCARD_DEFAULTS } from "@/lib/generators/testcard/params";
import { ellipse, kerfAcross, kerfPoint, offsetShapesXY } from "../kerf";
import {
  cleanLibrary, cleanMaterial, fromBuiltIn, importMaterials, materialInfo, materialsFile, MAX_MATERIALS, saveMeasured, type UserMaterial,
} from "../library";
import { genWithMaterial, hingeWithMaterial } from "../apply";

const box = (s: { outer: [number, number][] }[]) => {
  const xs = s.flatMap((q) => q.outer.map((p) => p[0])), ys = s.flatMap((q) => q.outer.map((p) => p[1]));
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

const mine = (over: Partial<UserMaterial> = {}): UserMaterial => ({
  id: "my-abc123", name: "My birch", T: 2.9, kx: 0.14, ky: 0.18, minFeature: 1.2, like: "birch3", laser: {}, ...over,
});

describe("kerf by axis", () => {
  it("is kx across vertical edges, ky across horizontal ones and in between on a slant", () => {
    expect(kerfAcross([1, 0], 0.2, 0.4)).toBeCloseTo(0.1, 12);
    expect(kerfAcross([0, 1], 0.2, 0.4)).toBeCloseTo(0.2, 12);
    const d = kerfAcross([Math.SQRT1_2, Math.SQRT1_2], 0.2, 0.4);
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThan(0.2);
  });

  it("puts the ellipse point where its normal points", () => {
    const [px, py] = kerfPoint([1, 0], 0.2, 0.4);
    expect(px).toBeCloseTo(0.1, 12);
    expect(py).toBeCloseTo(0, 12);
    expect(kerfPoint([0, -1], 0.2, 0.4)[1]).toBeCloseTo(-0.2, 12);
    const e = ellipse(0, 0, 3, 1, 8);
    expect(e).toHaveLength(8);
    expect(Math.max(...e.map((p) => p[0]))).toBeCloseTo(3, 12);
    expect(Math.max(...e.map((p) => p[1]))).toBeCloseTo(1, 12);
  });

  it("grows a square by kx/2 left and right and ky/2 top and bottom", () => {
    const sq = [makeShape([[0, 0], [20, 0], [20, 20], [0, 20]], [])];
    const out = box(offsetShapesXY(sq, 0.1, 0.2, "miter"));
    expect(out.w).toBeCloseTo(20.2, 3);
    expect(out.h).toBeCloseTo(20.4, 3);
    const same = box(offsetShapesXY(sq, 0.15, 0.15, "miter"));
    expect(same.w).toBeCloseTo(20.3, 3);
    expect(same.h).toBeCloseTo(20.3, 3);
  });

  it("shrinks holes the same way", () => {
    const ring = [makeShape([[0, 0], [40, 0], [40, 40], [0, 40]], [[[10, 10], [10, 30], [30, 30], [30, 10]]])];
    const [s] = offsetShapesXY(ring, 0.1, 0.3, "miter");
    const hx = s.holes[0].map((p) => p[0]), hy = s.holes[0].map((p) => p[1]);
    expect(Math.max(...hx) - Math.min(...hx)).toBeCloseTo(19.8, 3);
    expect(Math.max(...hy) - Math.min(...hy)).toBeCloseTo(19.4, 3);
  });
});

describe("material library", () => {
  it("keeps a clean material and drops unusable ones", () => {
    expect(cleanMaterial(mine())).toEqual(mine());
    expect(cleanMaterial({ name: "", T: 3, kx: 0.1 })).toBeNull();
    expect(cleanMaterial({ name: "A", T: -1, kx: 0.1 })).toBeNull();
    expect(cleanMaterial({ name: "A", T: 3, kx: 9 })).toBeNull();
    const m = cleanMaterial({ name: "  <b>Oak</b>\u0001 ", T: 3, kx: 0.2, like: "nope", laser: { cut: { speed: 10, power: 60 }, score: { speed: 10 } } })!;
    expect(m.name).toBe("bOak/b");
    expect(m.ky).toBe(0.2);
    expect(m.like).toBe("custom");
    expect(m.id).toMatch(/^my-[a-z0-9]+$/);
    expect(m.laser).toEqual({ cut: { speed: 10, power: 60, passes: 1 } });
  });

  it("keeps each id once and at most the limit", () => {
    const many = Array.from({ length: MAX_MATERIALS + 5 }, (_, i) => mine({ id: `my-${i}`, name: `M${i}` }));
    expect(cleanLibrary([...many, mine({ id: "my-0" })])).toHaveLength(MAX_MATERIALS);
    expect(cleanLibrary("nope")).toEqual([]);
  });

  it("round-trips through a file and merges by id", () => {
    const file = materialsFile([mine()]);
    expect(JSON.parse(file)).toMatchObject({ app: "hingelab", kind: "materials", version: 1 });
    const r = importMaterials(file, [mine({ name: "Old name" }), mine({ id: "my-other", name: "Other" })]);
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r).toMatchObject({ added: 0, replaced: 1, skipped: 0 });
    expect(r.list.map((m) => m.name)).toEqual(["My birch", "Other"]);
    const bare = importMaterials(JSON.stringify([{ name: "New", T: 4, kx: 0.2 }, { name: "Bad" }]), []);
    expect(bare).toMatchObject({ added: 1, skipped: 1 });
    expect(importMaterials("{oops", [])).toEqual({ error: expect.stringMatching(/not JSON/) });
    expect(importMaterials(JSON.stringify({ kind: "presets" }), [])).toEqual({ error: expect.any(String) });
  });

  it("describes built-in and own materials the same way", () => {
    expect(materialInfo("birch3", [])).toMatchObject({ T: 3, kx: 0.15, ky: 0.15, user: false, laser: {} });
    expect(materialInfo("my-abc123", [mine()])).toMatchObject({ T: 2.9, kx: 0.14, ky: 0.18, minFeature: 1.2, gamma: 0.02, user: true });
    expect(materialInfo("nothing", [])).toBeNull();
    expect(fromBuiltIn("mdf3")).toMatchObject({ name: "My MDF 3 mm", T: 3, kx: 0.18, ky: 0.18, like: "mdf3" });
  });

  it("saves measured values into a copy of a built-in, never the built-in", () => {
    const r = saveMeasured([], "birch3", 3, 0.15, { kx: 0.12 });
    expect(r.created).toBe(true);
    expect(r.list[0]).toMatchObject({ name: "My Baltic birch plywood 3 mm", kx: 0.12, ky: 0.12 });
    const again = saveMeasured(r.list, r.id, 3, 0.12, { T: 2.85 });
    expect(again).toMatchObject({ created: false, id: r.id });
    expect(again.list).toHaveLength(1);
    expect(again.list[0]).toMatchObject({ T: 2.85, kx: 0.12 });
  });

  it("keeps a measured axis to itself on a material with two kerfs", () => {
    const r = saveMeasured([mine()], "my-abc123", 2.9, 0.14, { ky: 0.2 });
    expect(r.list[0]).toMatchObject({ kx: 0.14, ky: 0.2 });
    const both = saveMeasured([], "custom", 3, 0.2, { kx: 0.11, ky: 0.16 });
    expect(both.list[0]).toMatchObject({ kx: 0.11, ky: 0.16 });
  });
});

describe("picking a material", () => {
  it("sets the hinge box's thickness, kerfs, stiffness and narrowest bar", () => {
    const p = hingeWithMaterial(clone(DEFAULTS), "my-abc123", materialInfo("my-abc123", [mine()]));
    expect(p).toMatchObject({ material: "my-abc123", T: 2.9, K: 0.14, Ky: 0.18, gamma: 0.02, minFeature: 1.2 });
    const back = hingeWithMaterial(p, "mdf3", materialInfo("mdf3", []));
    expect(back).toMatchObject({ material: "mdf3", T: 3, K: 0.18 });
    expect("Ky" in back || "gamma" in back || "minFeature" in back).toBe(false);
    const one = hingeWithMaterial(clone(DEFAULTS), "my-abc123", materialInfo("my-abc123", [mine({ ky: 0.14 })]));
    expect(one.Ky).toBeUndefined();
  });

  it("sets a generator's sheet kerfs and narrowest feature", () => {
    const p = genWithMaterial(clone(TESTCARD_DEFAULTS), "my-abc123", materialInfo("my-abc123", [mine()]));
    expect(p).toMatchObject({ material: "my-abc123", T: 2.9, K: 0.14, sheet: { kerfXY: true, kerfY: 0.18, minFeature: 1.2, nest: "box" } });
    const back = genWithMaterial(p, "birch3", materialInfo("birch3", []));
    expect(back).toMatchObject({ T: 3, K: 0.15, sheet: { kerfXY: false, minFeature: 0 } });
    const custom = genWithMaterial(p, "custom", materialInfo("custom", []));
    expect(custom).toMatchObject({ material: "custom", T: 2.9, K: 0.14 });
  });
});
