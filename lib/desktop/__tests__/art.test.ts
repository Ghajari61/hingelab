import { describe, expect, it } from "vitest";
import type { Art } from "@/lib/ai/art";
import { artGrips } from "../artGrips";
import { artGeometry } from "../art";
import { sizeResult } from "@/lib/three/grips";
import { desktopCatalog, generateDesign } from "../products";
import type { GenerateResponse } from "../types";

/** Two 3 mm parts side by side: a plate with a round hole and an engraved star, and a plain bar. */
const ART: Art = {
  name: "Two part stand", summary: "A test.", width: 110, height: 40, material: "3 mm birch plywood", thickness: 3,
  shapes: [
    { layer: "cut", d: "M0 0H50V40H0Z" },
    { layer: "cut", d: "M20 20A5 5 0 1 0 30 20A5 5 0 1 0 20 20Z" },
    { layer: "cut", d: "M60 0H110V40H60Z" },
    { layer: "engrave", d: "M5 5H15V15H5Z" },
    { layer: "score", d: "M65 20H105" },
  ],
  texts: [], notes: [],
};

async function gen(req: Record<string, unknown>, plan: "free" | "pro" = "pro") {
  const r = await generateDesign({ product: "art", ...req }, plan);
  return { status: r.status, body: r.body as GenerateResponse & { error?: string } };
}

describe("AI drawing in the desktop workspace", () => {
  it("is in the catalog beside the products, not among them", async () => {
    const c = await desktopCatalog();
    expect(c.art?.id).toBe("art");
    expect(c.products.some((p) => p.id === "art")).toBe(false);
  });

  it("builds the drawing at its own size with the designer's material", async () => {
    const { status, body } = await gen({ params: { art: ART, name: "My stand" } });
    expect(status).toBe(200);
    expect(body.params).toMatchObject({ width: 110, material: "birch3", T: 3, mirror: false, engrave: true, score: true, name: "My stand" });
    expect([body.width, body.height]).toEqual([110, 40]);
    expect(body.svg).toContain('width="110mm"');
    expect(body.svg).toMatch(/<g id="engrave"[^>]*>.*<g id="score"[^>]*>.*<g id="cut"/);
    expect(body.stats.find((s) => s.label === "Parts")?.value).toBe("2");
    expect(body.fileName).toBe("My stand.svg");
    expect(body.issues).toEqual([]);
    expect(body.watermark).toBe(false);
  });

  it("watermarks on the free plan", async () => {
    const { body } = await gen({ params: { art: ART } }, "free");
    expect(body.watermark).toBe(true);
    expect(body.svg).not.toBe((await gen({ params: { art: ART } })).body.svg);
  });

  it("sets the height and keeps the proportions, and reports the height back", async () => {
    const { body } = await gen({ params: { art: ART }, change: { key: "height", value: 80 } });
    expect(body.params.width).toBe(220);
    expect(body.form.values?.height).toBe(80);
    expect([body.width, body.height]).toEqual([220, 80]);
  });

  it("scales a selected part from its 3D handles through the width", () => {
    const written: unknown[] = [];
    const g = artGrips({ width: 110, T: 3 }, (key, value) => written.push([key, value]), "mm");
    const r = sizeResult(g!.size!, { x: 110, y: 3, z: 40 }, { x: 2, y: 2, z: 2 });
    expect(r.values.width).toBe(220);
    g!.size!.write(r.values);
    expect(written).toEqual([["width", 220]]);
    expect(artGrips({}, () => {}, "mm")).toBeUndefined();
  });

  it("scales the whole drawing with the width and warns that the slots grew", async () => {
    const { body } = await gen({ params: { art: ART }, change: { key: "width", value: 220 } });
    expect([body.width, body.height]).toEqual([220, 80]);
    expect(body.svg).toContain('width="220mm"');
    const slots = body.issues.find((i) => i.code === "slots");
    expect(slots?.fixes.map((f) => f.id)).toEqual(["thickness", "size"]);
    const fixed = await gen({ params: body.params, fix: { code: "slots", id: "thickness" } });
    expect(fixed.body.params).toMatchObject({ T: 6, material: "birch6", width: 220 });
    expect(fixed.body.issues.some((i) => i.code === "slots")).toBe(false);
    const back = await gen({ params: body.params, fix: { code: "slots", id: "size" } });
    expect(back.body.params.width).toBe(110);
  });

  it("checks the material against the slots", async () => {
    const { body } = await gen({ params: { art: ART }, change: { key: "material", value: "acr5" } });
    expect(body.params).toMatchObject({ material: "acr5", T: 5 });
    expect(body.issues.find((i) => i.code === "slots")?.fixes[0].label).toBe("Use 3 mm material");
    const auto = await gen({ params: body.params, autofix: true });
    expect(auto.body.params).toMatchObject({ T: 3, material: "acr3" });
    expect(auto.body.applied).toEqual(["Use 3 mm material"]);
  });

  it("mirrors left to right", async () => {
    const plain = (await gen({ params: { art: ART } })).body.svg!;
    const flipped = (await gen({ params: { art: ART, mirror: true } })).body.svg!;
    expect(plain).toContain('<g id="engrave" fill="#000000" fill-rule="evenodd" stroke="none"><path d="M5 5');
    expect(flipped).toContain('<g id="engrave" fill="#000000" fill-rule="evenodd" stroke="none"><path d="M105 5');
  });

  it("leaves out layers that are turned off, never the cuts", async () => {
    const { body } = await gen({ params: { art: ART, engrave: false, score: false } });
    expect(body.svg).not.toContain('id="engrave"');
    expect(body.svg).not.toContain('id="score"');
    expect(body.svg).toContain('id="cut"');
  });

  it("finds the parts, their holes and their engraving", () => {
    const g = artGeometry(ART.shapes);
    expect(g.parts).toHaveLength(2);
    const plate = g.parts.find((p) => p.outer.every(([x]) => x <= 50))!;
    expect(plate.holes).toHaveLength(1);
    expect(plate.engrave).toHaveLength(1);
    expect(g.openCuts).toBe(0);
    expect(artGeometry([{ layer: "cut", d: "M0 0L10 10" }]).openCuts).toBe(1);
  });

  it("sends the parts in 3D in the chosen thickness", async () => {
    const { body } = await gen({ params: { art: ART }, model: true });
    const slabs = body.model!.objects.filter((o) => o.kind === "slab" && !o.noMeasure);
    expect(slabs).toHaveLength(2);
    const thick = await gen({ params: { art: ART, material: "birch6", T: 6 }, model: true });
    const depth = (b: GenerateResponse) => Math.max(...b.model!.objects.map((o) => (o.kind === "slab" ? o.depth : 0)));
    expect(depth(body)).toBe(3);
    expect(depth(thick.body)).toBe(6);
  });

  it("rejects a drawing it cannot read, unknown settings and presets", async () => {
    expect((await gen({ params: { art: { name: "x" } } })).status).toBe(400);
    expect((await gen({})).status).toBe(400);
    expect((await gen({ params: { art: ART }, change: { key: "K", value: 0.2 } })).status).toBe(400);
    expect((await gen({ preset: "x" })).status).toBe(400);
  });

  it("keeps a renamed drawing's name in the file", async () => {
    const { body } = await gen({ params: { art: ART }, change: { key: "name", value: "Desk\u0007 stand" } });
    expect(body.params.name).toBe("Desk stand");
    expect(body.svg).toContain("<title>Desk stand</title>");
  });
});
