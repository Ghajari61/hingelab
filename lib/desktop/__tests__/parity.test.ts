import { describe, expect, it } from "vitest";
import { getPath } from "@/lib/generators/path";
import { convertForDesktop } from "../convert";
import { traceForDesktop } from "../trace";
import { allProducts, coerce, desktopCatalog, generateDesign } from "../products";
import type { GenerateResponse } from "../types";

const gen = async (req: object, plan: "free" | "pro" = "free") => {
  const r = await generateDesign(req, plan);
  return { status: r.status, body: r.body as GenerateResponse };
};

describe("desktop catalog: Letters and Parametric", () => {
  it("lists them apart from the products older apps know, as plain JSON", async () => {
    const c = await desktopCatalog();
    expect(c.products.map((p) => p.id)).not.toContain("letters");
    expect(c.more?.map((p) => p.id)).toEqual(["letters", "parametric"]);
    expect(JSON.parse(JSON.stringify(c.more))).toEqual(c.more);
    expect(JSON.stringify(c.more)).not.toMatch(/=>|function\s*\(/);
    for (const p of c.more!) {
      expect(p.presets.length, p.id).toBeGreaterThan(0);
      for (const s of p.sections) for (const f of s.fields) {
        if (f.kind === "number") expect(f.min, `${p.id} ${f.key}`).toBeLessThanOrEqual(f.max);
        if (f.default !== undefined) expect("v" in coerce(f, f.default), `${p.id} ${f.key}`).toBe(true);
        else expect(f.kind === "number" && !!f.auto, `${p.id} ${f.key} has no default`).toBe(true);
      }
    }
    expect(allProducts(c).length).toBe(c.products.length + 2);
  });
});

describe("desktop Letters", () => {
  it("builds the default design on Pro and holds it back on Free", async () => {
    const pro = await gen({ product: "letters" }, "pro");
    expect(pro.status, pro.body.error).toBe(200);
    expect(pro.body.svg).toMatch(/^<\?xml|^<svg/);
    expect(pro.body.watermark).toBe(false);
    expect(pro.body.fileName).toBe("Untitled letters.svg");
    expect(pro.body.form.hiddenSections).toEqual(expect.arrayContaining(["box", "joints", "hinge"]));
    const free = await gen({ product: "letters" });
    expect(free.status).toBe(403);
    expect(free.body.svg).toBeUndefined();
    expect(free.body.locked).toMatch(/single letter/);
  }, 60000);

  it("lets Free export a one-letter box, with the mark", async () => {
    const r = await gen({ product: "letters", params: { text: "S", mode: "box" } });
    expect(r.status, r.body.error ?? r.body.locked).toBe(200);
    expect(r.body.watermark).toBe(true);
    expect(r.body.svg).toContain("Made with HingeLab");
    expect(r.body.form.hiddenSections).toContain("solid");
  }, 60000);

  it("applies edits, marquee settings, Auto fields and presets on the server", async () => {
    const box = { text: "S", mode: "box" };
    const m = await gen({ product: "letters", params: box, change: { key: "marquee.enabled", value: true } });
    expect(getPath(m.body.params, "marquee.enabled")).toBe(true);
    expect(m.body.form.hidden).not.toContain("marquee.holeDia");
    const r = await gen({ product: "letters", params: box, change: { key: "minCornerRadius", value: 30 } });
    expect(r.body.params.minCornerRadius).toBe(30);
    const auto = await gen({ product: "letters", params: r.body.params, change: { key: "minCornerRadius", value: null } });
    expect(auto.body.params.minCornerRadius).toBe("auto");
    const big = await gen({ product: "letters", params: { ...box, size: 1e9 } });
    expect(big.body.params.size).toBe(2000);
    const two = await gen({ product: "letters", params: { ...box, mode: "stencil" }, change: { key: "bridgesPerIsland", value: "2" } }, "pro");
    expect(two.body.params.bridgesPerIsland).toBe(2);
    expect((await gen({ product: "letters", change: { key: "fontId", value: "comic-sans" } })).status).toBe(400);
    const pr = await gen({ product: "letters", preset: "love-box" }, "pro");
    expect(pr.status, pr.body.error).toBe(200);
    expect(pr.body.params.text).toBe("LOVE");
  }, 60000);

  it("sends a font uploaded on the website back to the website", async () => {
    const r = await gen({ product: "letters", params: { text: "S", mode: "box", fontId: "upload:abc" } });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/uploaded/);
  });

  it("sends the 3D model when asked for", async () => {
    const r = await gen({ product: "letters", params: { text: "S", mode: "box" }, model: true });
    expect(r.status).toBe(200);
    expect(r.body.model?.objects.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.body.model).length).toBeLessThan(800_000);
  }, 60000);
});

describe("desktop Parametric", () => {
  it("slices a library shape on the server and sends the values the panel shows", async () => {
    const r = await gen({ product: "parametric", model: true }, "pro");
    expect(r.status, r.body.error ?? r.body.locked).toBe(200);
    expect(r.body.svg).toMatch(/<svg/);
    expect(r.body.form.values?.shape).toMatch(/^library:/);
    expect(typeof r.body.form.values?.T).toBe("number");
    expect(r.body.model?.objects.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.body.model).length).toBeLessThan(800_000);
  }, 120000);

  it("applies panel fields that are not paths, also when the app sends several at once", async () => {
    const start = (await gen({ product: "parametric" }, "pro")).body.params;
    const turned = await gen({ product: "parametric", params: start, change: { key: "rotY", value: 30 } }, "pro");
    expect(getPath(turned.body.params, "sourceSettings.transform.rotation.1")).toBe(30);
    expect(turned.body.form.values?.rotY).toBe(30);
    const many = await gen({ product: "parametric", params: { ...start, rotX: 15, shape: "library:sphere" } }, "pro");
    expect(getPath(many.body.params, "sourceSettings.transform.rotation.0")).toBe(15);
    expect(getPath(many.body.params, "source.id")).toBe("sphere");
    expect(many.body.params).not.toHaveProperty("rotX");
    expect(many.body.params).not.toHaveProperty("shape");
  }, 120000);

  it("keeps formula and text shapes for Pro, and builds text shaped on the server", async () => {
    const f = await gen({ product: "parametric", change: { key: "shape", value: "formula:heightfield" } });
    expect(f.status).toBe(403);
    expect(f.body.svg).toBeUndefined();
    const t = await gen({ product: "parametric", change: { key: "shape", value: "text" } }, "pro");
    expect(t.status, t.body.error).toBe(200);
    expect(getPath(t.body.params, "source.kind")).toBe("text");
  }, 120000);

  it("sends imported models and photos back to the website", async () => {
    const r = await gen({ product: "parametric", params: { source: { kind: "mesh", fileName: "x.stl", units: "mm", upAxis: "Y" } } }, "pro");
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/full editor/);
  });
});

describe("desktop export as DXF, PDF and LightBurn", () => {
  it("converts a design the server built", async () => {
    const svg = (await gen({ product: "hinge" }, "pro")).body.svg!;
    const dxf = convertForDesktop({ svg, format: "dxf", fileName: "Box.svg" });
    expect(dxf.status).toBe(200);
    expect(dxf.body.fileName).toBe("Box.dxf");
    expect(String(dxf.body.data)).toMatch(/^0\nSECTION\n[\s\S]*\nEOF\n$/);
    const pdf = convertForDesktop({ svg, format: "pdf", fileName: "Box.svg" });
    expect(pdf.body.base64).toBe(true);
    expect(Buffer.from(String(pdf.body.data), "base64").subarray(0, 5).toString()).toBe("%PDF-");
    const lb = convertForDesktop({ svg, format: "lbrn2", fileName: "..\\Box.svg" });
    expect(String(lb.body.data)).toContain("<LightBurnProject");
    expect(lb.body.fileName).toBe(".. Box.lbrn2");
  }, 60000);

  it("refuses anything else", () => {
    expect(convertForDesktop({ svg: "<svg></svg>", format: "exe" }).status).toBe(400);
    expect(convertForDesktop({ svg: "<html><svg></svg></html>", format: "dxf" }).status).toBe(422);
    expect(convertForDesktop({ svg: "x".repeat(5 * 1024 * 1024), format: "dxf" }).status).toBe(413);
    expect(convertForDesktop(null).status).toBe(400);
  });
});

/** A dark disc on white, one grey byte a pixel, in base64. */
function disc(side: number): string {
  const b = Buffer.alloc(side * side, 255);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) if (Math.hypot(x - side / 2, y - side / 2) < side / 3) b[y * side + x] = 20;
  return b.toString("base64");
}

describe("desktop pictures in generators", () => {
  it("lists grey and traced pictures, never colour photos", async () => {
    const c = await desktopCatalog();
    const pics = (id: string) => c.products.find((p) => p.id === id)!.sections.flatMap((s) => s.pictures ?? []);
    // The engraved photo, and the cut-out pattern's own motif (a traced picture).
    expect(pics("puzzle")).toEqual([
      expect.objectContaining({ key: "engrave.image", mode: "grey", aspectKey: "engrave.aspect" }),
      expect.objectContaining({ key: "pattern.art.image", mode: "trace" }),
    ]);
    const sb = pics("shadowbox");
    expect(sb.find((f) => f.key === "picture.image")).toMatchObject({ mode: "trace", levels: "picture.levels", name: "picture.name" });
    expect(sb.some((f) => f.key === "photo.image")).toBe(false);
    expect(JSON.stringify(c.products)).not.toMatch(/traced here, in your browser|never uploaded/);
    const kind = c.products.find((p) => p.id === "sign")!.sections.flatMap((s) => s.fields).find((f) => f.key === "motif.kind")!;
    expect(kind.kind === "choice" && kind.pictureOptions?.map((o) => o.v)).toEqual(["picture"]);
    expect("v" in coerce(kind, "picture")).toBe(true);
    expect(pics("sign").map((f) => f.key)).toContain("motif.art.image");
  });

  it("traces a picture and an SVG into outlines a design uses", async () => {
    const raster = traceForDesktop({ kind: "raster", width: 120, height: 120, grey: disc(120) });
    expect(raster.status).toBe(200);
    const t = raster.body as { levels: string; aspect: number };
    expect(t.aspect).toBe(1);
    expect(t.levels.split("|").length).toBeGreaterThan(1);
    const svg = traceForDesktop({ kind: "svg", text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100"/></svg>' });
    expect(svg.status).toBe(200);
    expect((svg.body as { aspect: number }).aspect).toBeCloseTo(2, 3);
    const r = await gen({ product: "shadowbox", params: { stack: { count: 5 }, design: { pattern: "picture" }, picture: { levels: t.levels, aspect: t.aspect, name: "disc", mode: "levels" } } }, "pro");
    expect(r.status, r.body.error).toBe(200);
    expect(getPath(r.body.params, "picture.levels")).toBe(t.levels);
  }, 60000);

  it("refuses pictures it cannot trace", () => {
    expect(traceForDesktop({ kind: "raster", width: 601, height: 10, grey: "" }).status).toBe(400);
    expect(traceForDesktop({ kind: "raster", width: 10, height: 10, grey: disc(9) }).status).toBe(400);
    expect(traceForDesktop({ kind: "raster", width: 2, height: 2, grey: "<script>" }).status).toBe(400);
    expect(traceForDesktop({ kind: "svg", text: '<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="9" y2="9" stroke="#000"/></svg>' }).status).toBe(422);
    expect(traceForDesktop({ kind: "svg", text: "x".repeat(3 * 1024 * 1024) }).status).toBe(413);
    expect(traceForDesktop({ kind: "gif" }).status).toBe(400);
  });
});

describe("desktop generators carry the Free mark like the Hinge Box", () => {
  it("watermarks a Free sign and keeps Pro clean", async () => {
    const free = await gen({ product: "sign" });
    expect(free.status, free.body.error ?? free.body.locked).toBe(200);
    expect(free.body.watermark).toBe(true);
    expect(free.body.svg).toContain("Made with HingeLab");
    const pro = await gen({ product: "sign" }, "pro");
    expect(pro.body.watermark).toBe(false);
    expect(pro.body.svg).not.toContain("Made with HingeLab");
  }, 60000);
});
