import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layerContent, layoutParts } from "../index";
import { applyStandardSize, STANDARD_GROUPS, STANDARD_SIZES, standardSizeOf } from "../standardSizes";
import { baseTextShape } from "../baseText";
import { hingeTextContext } from "@/lib/billing/hingeText";
import { exportHingeForPlan } from "@/lib/billing/exportHinge";
import { hingeRequestError } from "@/lib/billing/validate";
import { generateDesign } from "@/lib/desktop/products";
import type { Model, Params, PlatePart } from "../types";

const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), over);
const build = (p: Params) => {
  const m = computeModel(p);
  if ("error" in m) throw new Error(`${p.name}: ${m.error}`);
  return { m: m as Model, lay: layoutParts(m.parts, p.bedW, p.gap) };
};

describe("standard box sizes", () => {
  it("has many sizes in every group, each with its own id", () => {
    expect(STANDARD_SIZES.length).toBeGreaterThanOrEqual(45);
    expect(new Set(STANDARD_SIZES.map((s) => s.id)).size).toBe(STANDARD_SIZES.length);
    for (const g of STANDARD_GROUPS) expect(STANDARD_SIZES.filter((s) => s.group === g).length, g).toBeGreaterThanOrEqual(5);
  });

  it.each(STANDARD_SIZES.map((s) => [s.id, s] as const))("%s builds and is recognised", (_id, s) => {
    for (const T of [3, 6]) {
      const p = applyStandardSize(box({ T, material: "custom" }), s);
      expect(hingeRequestError(p), s.id).toBeNull();
      build(p);
      expect(standardSizeOf(p)).toBe(s.id);
    }
  });

  it("fits the contents: the inside is the standard size whatever the thickness", () => {
    const poker = STANDARD_SIZES.find((s) => s.id === "cards-poker-1")!;
    for (const T of [2, 3, 4]) {
      const p = applyStandardSize(box({ T }), poker);
      expect(p.W - 2 * T).toBeCloseTo(92, 9);
      expect(p.D - 2 * T).toBeCloseTo(67, 9);
      // Base, lid and the lid's lip take three thicknesses off the height.
      expect(p.H - 3 * T).toBeCloseTo(20, 9);
    }
    const ring = applyStandardSize(box(), STANDARD_SIZES.find((s) => s.id === "ring-single")!);
    expect(ring).toMatchObject({ shape: "cyl", dia: 55 + 2 * DEFAULTS.T });
    expect(standardSizeOf(box())).toBe("");
  });

  it("keeps the material, pattern and sheet", () => {
    const start = box({ material: "card2", T: 2, K: 0.2, pattern: "wave", bedW: 400, bedH: 300 });
    const p = applyStandardSize(start, STANDARD_SIZES.find((s) => s.id === "tissue-regular")!);
    expect(p).toMatchObject({ material: "card2", T: 2, K: 0.2, pattern: "wave", bedW: 400, bedH: 300, lidHole: "tissue" });
  });
});

describe("text under the box", () => {
  it("engraves the text as filled vectors in the middle of the base, with the base label above it", async () => {
    const p = box({ baseText: "HingeLab Studio\nTel 0912 000 0000", baseTextSize: 5 });
    const ctx = await hingeTextContext(p);
    const { m, lay } = build(p);
    const L = layerContent(m, lay, p, ctx);
    expect(L.engrave).toHaveLength(1);
    expect(L.engrave![0]).toMatch(/^M[\d.]+,[\d.]+L/);
    const base = lay.items.find((it) => it.pt.name === "BASE")!;
    const label = L.labels.find((l) => l.text === "BASE")!;
    expect(label.y).toBeLessThan(base.oy - 5);
    const svg = exportSVG(m, lay, p, ctx);
    expect(svg).toContain('inkscape:label="00 Engraved text"');
    expect(svg).toContain("Cut order: engrave,");
    expect(svg.indexOf('id="engrave"')).toBeLessThan(svg.indexOf('id="outline"'));
  });

  it("shapes Persian, and shrinks long text to fit inside the walls", async () => {
    const p = box({ baseText: "کارگاه لیزر هینج‌لب\nتلفن ۰۹۱۲۰۰۰۰۰۰۰" });
    const ctx = await hingeTextContext(p);
    const { m } = build(p);
    const base = m.parts.find((q): q is PlatePart => q.name === "BASE")!;
    const fa = baseTextShape(p, base.edges, m.R - p.T, ctx)!;
    expect(fa.contours.length).toBeGreaterThan(10);
    expect(fa.missing).toEqual([]);
    const long = box({ baseText: "A very long line of text that will never fit under this small box", baseTextSize: 12 });
    const s = baseTextShape(long, base.edges, m.R - p.T, await hingeTextContext(long))!;
    expect(s.scale).toBeLessThan(1);
    expect(s.width).toBeLessThan(DEFAULTS.W - 2 * DEFAULTS.T - 6 + 1e-6);
  });

  it("leaves files without text as they were, and is checked on requests", async () => {
    const p = box();
    const { m, lay } = build(p);
    expect(exportSVG(m, lay, p, await hingeTextContext(p))).toBe(exportSVG(m, lay, p));
    expect(hingeRequestError(box({ baseText: "x".repeat(301) }))).not.toBeNull();
    expect(hingeRequestError(box({ baseText: "ok", baseTextFont: "comic-sans" }))).not.toBeNull();
    expect(hingeRequestError(box({ baseText: "ok", baseTextSize: 6, baseTextFont: "lalezar" }))).toBeNull();
  });

  it("is in the exported file and the desktop app's drawing", async () => {
    const p = box({ baseText: "Made by Sara" });
    const out = exportHingeForPlan(p, "pro", await hingeTextContext(p));
    expect(out.ok && out.svg).toContain('id="engrave"');
    const r = await generateDesign({ product: "hinge", params: box() as never, change: { key: "baseText", value: "Made by Sara" } }, "pro");
    expect(JSON.stringify(r.body)).toContain("Engraved text");
    const st = await generateDesign({ product: "hinge", params: box() as never, change: { key: "standard", value: "tissue-cube" } }, "pro");
    expect((st.body as unknown as { params: Params }).params).toMatchObject({ name: "Cube tissue box", W: 118, lidHole: "tissue" });
  });
});
