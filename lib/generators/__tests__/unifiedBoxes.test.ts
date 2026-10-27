import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOXES } from "../boxes";
import { PAPERBOX } from "../paperbox";
import { PAPERBOX_PRESETS } from "../paperbox/presets";
import { GENERATOR_IDS, isGeneratorId } from "../ids";
import { loadGenerator } from "../registry";
import { CATALOGUE } from "../nav";
import { siteProducts } from "@/lib/site/products";
import { detectProject } from "@/lib/projects/file";
import { arrangeGenerator, genSVG } from "../output";
import { CTX } from "./ctx";
import { findGeneratorPreset } from "../presetLookup";
import { designFromChanges, generateDesign } from "@/lib/desktop/products";

describe("unified Boxes & Packaging", () => {
  it("offers one public product and removes Photo to Product", () => {
    for (const ids of [GENERATOR_IDS, siteProducts().map(p => p.id), CATALOGUE.map(p => p.slug)]) {
      expect(ids).toContain("boxes");
      expect(ids).not.toContain("paperbox");
      expect(ids).not.toContain("photoproduct");
    }
    expect(BOXES.name).toBe("Boxes & Packaging");
    expect(isGeneratorId("photoproduct")).toBe(false);
    expect(loadGenerator).not.toHaveProperty("photoproduct");
  });

  it("keeps all packaging presets, their exact settings and working pictures without id collisions", () => {
    expect(new Set(BOXES.presets.map(p => p.id)).size).toBe(BOXES.presets.length);
    for (const old of PAPERBOX_PRESETS) {
      const preset = BOXES.presets.find(p => p.id === `packaging-${old.id}`)!;
      expect(preset, old.id).toBeDefined();
      expect(BOXES.merge(preset.params), old.id).toEqual(PAPERBOX.merge(old.params));
      expect(existsSync(`public/presets/boxes/${preset.id}.svg`), preset.id).toBe(true);
    }
  });

  it("keeps legacy projects editable with the full combined controls and library", () => {
    const params = PAPERBOX.merge({ name: "Saved gift", T: 4, K: .2, design: "box", box: { width: 170, depth: 90, height: 65, lid: "pin" } });
    expect(PAPERBOX.merge(params)).toEqual(params);
    expect(PAPERBOX.sections).toEqual(BOXES.sections);
    expect(PAPERBOX.presets).toEqual(BOXES.presets);
    for (const preset of BOXES.presets) {
      expect(PAPERBOX.merge(preset.params), preset.id).toEqual(BOXES.merge(preset.params));
    }
    const bytes = new TextEncoder().encode(JSON.stringify({ product: "paperbox", version: 2, params }));
    expect(detectProject(bytes)).toMatchObject({ section: "paperbox", params });
    const a = arrangeGenerator(PAPERBOX, params, CTX);
    expect(a.result).not.toHaveProperty("error");
    expect(genSVG(PAPERBOX, a.params, a.lay!)).toMatch(/width="[\d.]+mm"/);
  });

  it("refuses removed product files explicitly instead of treating them as another product", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ product: "photoproduct", params: { name: "My old model" } }));
    expect(detectProject(bytes)).toEqual({ error: "Photo to Product has been removed from HingeLab. Your saved file has not been changed." });
  });

  it("resolves old preset links and desktop edits without a duplicate catalog entry", async () => {
    for (const preset of PAPERBOX_PRESETS) {
      expect(findGeneratorPreset(PAPERBOX, preset.id)?.id).toBe(`packaging-${preset.id}`);
    }
    const edited = await designFromChanges("paperbox", "tea-hinged", [{ key: "box.width", value: 190 }]);
    expect(edited.skipped).toEqual([]);
    expect(edited.params).toMatchObject({ box: { width: 190, lid: "pin" } });
    const generated = await generateDesign({ product: "paperbox", preset: "tea-hinged", change: { key: "box.width", value: 190 } }, "pro");
    expect(generated.status).toBe(200);
    expect(await generateDesign({ product: "photoproduct" }, "pro")).toMatchObject({ status: 400 });
  });
});
