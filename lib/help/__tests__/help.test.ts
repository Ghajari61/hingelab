import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARTICLES, FIELD_SOURCES, articleBySlug, fieldGroup, helpIndex } from "@/lib/help";
import { searchHelp } from "@/lib/help/search";
import { LEGACY_ANCHORS, RAIL_HELP, SECTION_HELP, TIPS_HELP, type HelpProduct } from "@/lib/help/sections";
import { ALL_GENERATORS } from "@/lib/generators/all";
import { generatorHelpMap } from "@/lib/generators/helpMap";
import { GENERATOR_IDS } from "@/lib/generators/ids";

const PRODUCTS: HelpProduct[] = ["hinge", "letters", "parametric"];
const ALL = [...PRODUCTS, ...GENERATOR_IDS];

describe("help centre", () => {
  it("has unique slugs and every link points at an article", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const links = [
      ...PRODUCTS.flatMap((p) => [...Object.values(SECTION_HELP[p]), ...Object.values(RAIL_HELP[p]), TIPS_HELP[p]]),
      ...ALL_GENERATORS.flatMap((d) => { const m = generatorHelpMap(d); return [...Object.values(m.section), ...Object.values(m.rail), m.tips]; }),
      ...Object.values(LEGACY_ANCHORS),
      ...ARTICLES.flatMap((a) => a.related ?? []),
    ];
    for (const s of links) expect(articleBySlug(s), s).toBeDefined();
  });

  it("explains every field of every product and generator", () => {
    for (const p of ALL) {
      const { fields, help } = FIELD_SOURCES[p];
      expect(fields.length, p).toBeGreaterThan(0);
      for (const f of fields) {
        expect(help[f.id], `${p}.${f.id}`).toBeTruthy();
        expect(help[f.id], `${p}.${f.id}`).toMatch(/\.$/);
      }
    }
  });

  it("lists every field in some article", () => {
    const groups = ARTICLES.flatMap((a) => a.fields ?? []);
    for (const p of ALL) {
      const own = new Set(groups.filter((g) => g.product === p).flatMap((g) => g.secs));
      const shared = new Set(groups.filter((g) => g.alsoFor?.includes(p as HelpProduct)).flatMap((g) => fieldGroup(g).map((f) => f.id)));
      for (const f of FIELD_SOURCES[p].fields) expect(own.has(f.sec) || shared.has(f.id), `${p}.${f.id} (${f.sec})`).toBe(true);
    }
  });

  it("generates option entries with units and ranges", () => {
    const dims = fieldGroup({ product: "hinge", secs: ["secDims"] });
    const sides = dims.find((f) => f.id === "sides")!;
    expect(sides.range).toBe("3 to 12");
    const w = dims.find((f) => f.id === "W")!;
    expect(w).toMatchObject({ unit: "mm", range: "10 mm or more" });
    expect(w.help).toMatch(/outside width/);
    const face = fieldGroup({ product: "clock", secs: ["face"] });
    expect(face.find((f) => f.id === "face.size")).toMatchObject({ unit: "mm", range: "80 to 1200 mm" });
    expect(face.find((f) => f.id === "face.shape")!.range).toMatch(/Round, Square, Polygon/);
  });

  it("has every image it shows", () => {
    for (const a of ARTICLES) for (const img of a.images ?? []) {
      expect(existsSync(join(process.cwd(), "public", img.src)), `${a.slug}: ${img.src}`).toBe(true);
      expect(img.alt).toBeTruthy();
    }
  });

  it("finds articles by words in their title, keywords, options and text", () => {
    const index = helpIndex();
    expect(searchHelp(index, "kerf")[0].slug).toBe("material-and-kerf");
    expect(searchHelp(index, "auto-fix")[0].slug).toBe("checks-and-fixes");
    expect(searchHelp(index, "serpentine").map((e) => e.slug)).toContain("hinge-pattern");
    expect(searchHelp(index, "hub radius").map((e) => e.slug)).toContain("parametric-method");
    expect(searchHelp(index, "marquee holes")[0].slug).toBe("letters-box");
    expect(searchHelp(index, "quartz movement")[0].slug).toBe("clock");
    expect(searchHelp(index, "zzqx")).toEqual([]);
    expect(searchHelp(index, "  ")).toEqual([]);
  });
});
