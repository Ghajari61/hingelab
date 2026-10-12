import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertDocument, createDocument } from "@/lib/studio/doc";
import { mul, nodePaths, transformSubpaths } from "@/lib/studio/geom";
import { importSvg, parseXml, type XmlEl } from "@/lib/studio/svgImport";
import type { Mat, SceneNode } from "@/lib/studio/types";
import { GENERATOR_IDS } from "@/lib/generators/ids";
import built from "../built.json";
import { TEMPLATE_BY_ID, TEMPLATES, templateCategories, templateFile, templateThumb } from "../catalog";
import { fileLabel, templateDocument } from "../open";
import { TEMPLATE_PRESETS } from "../presets";
import { searchTemplates } from "../search";
import { buildStudioTemplate, STUDIO_TEMPLATES } from "../studio";
import { TEMPLATE_CATEGORIES } from "../types";

const PUB = join(process.cwd(), "public");
const publicPath = (url: string) => join(PUB, ...url.split("/").filter(Boolean));
const read = (url: string) => readFileSync(publicPath(url), "utf8");

const bundled = TEMPLATES.flatMap((t) => (t.files ?? []).map((f) => ({ t, f, url: templateFile(t.id, f) })));

function walk(el: XmlEl, visit: (el: XmlEl) => void) {
  visit(el);
  el.children.forEach((c) => walk(c, visit));
}

/** Markup that must never appear in a bundled SVG (they are fetched and parsed by the app). */
function unsafe(src: string): string[] {
  const out: string[] = [];
  walk(parseXml(src), (el) => {
    if (/^(script|foreignObject|image|use|a|style|iframe|object|embed)$/i.test(el.tag)) out.push(`<${el.tag}>`);
    for (const [k, v] of Object.entries(el.attrs)) {
      if (/^on/i.test(k)) out.push(`${k}=`);
      if (/href$/i.test(k)) out.push(`${k}=`);
      if (/url\(\s*['"]?(?!#)/i.test(v)) out.push(`url() in ${k}`);
      if (/javascript:/i.test(v)) out.push(`javascript: in ${k}`);
    }
  });
  if (/<!ENTITY|<!DOCTYPE/i.test(src)) out.push("DOCTYPE");
  return out;
}

describe("template catalogue", () => {
  it("has many templates with unique ids, in every category", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(50);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(templateCategories().map((c) => c.id).sort()).toEqual([...TEMPLATE_CATEGORIES].sort());
    expect(TEMPLATES.filter((t) => t.featured).length).toBeGreaterThanOrEqual(6);
  });

  it("describes every template", () => {
    for (const t of TEMPLATES) {
      expect(t.id, t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.title.length, t.id).toBeGreaterThan(3);
      expect(t.description.length, t.id).toBeGreaterThan(40);
      expect(TEMPLATE_CATEGORIES, t.id).toContain(t.category);
      expect(t.tags.length, t.id).toBeGreaterThan(1);
      expect(t.thickness, t.id).toBeGreaterThan(0);
      expect(t.w > 0 && t.h > 0 && t.sheets >= 1, t.id).toBe(true);
    }
  });

  it("matches the build output exactly (run node scripts/build-templates.mjs after changing templates)", () => {
    expect(Object.keys(built).sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
    const thumbs = readdirSync(join(PUB, "templates", "thumbs")).sort();
    expect(thumbs).toEqual(TEMPLATES.map((t) => `${t.id}.svg`).sort());
    const dirs = readdirSync(join(PUB, "templates", "files")).sort();
    expect(dirs).toEqual(TEMPLATES.filter((t) => t.files?.length).map((t) => t.id).sort());
    for (const id of dirs) expect(readdirSync(join(PUB, "templates", "files", id)).sort(), id).toEqual([...TEMPLATE_BY_ID[id].files!].sort());
  });

  it("knows how each template opens", () => {
    for (const t of TEMPLATES) {
      if (t.source === "studio") {
        expect(STUDIO_TEMPLATES[t.id], t.id).toBeTypeOf("function");
        expect(t.files, t.id).toBeUndefined();
      } else if (t.source === "svg") {
        expect(t.files?.length, t.id).toBeGreaterThan(0);
      } else {
        expect(t.product, t.id).toBeTruthy();
        expect(t.files, t.id).toBeUndefined();
      }
      if (t.product) {
        expect(TEMPLATE_PRESETS[t.id]?.product, t.id).toBe(t.product);
        expect(t.product === "hinge" || (GENERATOR_IDS as readonly string[]).includes(t.product), t.id).toBe(true);
      }
      // Hinge Box exports carry the Free plan's watermark, so no Hinge Box cut file is bundled.
      if (t.product === "hinge") expect(t.source, t.id).toBe("editor");
      if (t.pro) expect(t.source, t.id).toBe("editor");
    }
    for (const id of Object.keys(TEMPLATE_PRESETS)) expect(TEMPLATE_BY_ID[id]?.product, id).toBe(TEMPLATE_PRESETS[id].product);
    for (const id of Object.keys(STUDIO_TEMPLATES)) expect(TEMPLATE_BY_ID[id]?.source, id).toBe("studio");
  });

  it("credits third-party designs with title, author, licence and source", () => {
    const credited = TEMPLATES.filter((t) => t.credit);
    expect(credited.map((t) => t.id)).toEqual(["kv1-tank"]);
    for (const t of credited) {
      expect(t.credit!.author).toBeTruthy();
      expect(t.credit!.licence).toMatch(/Creative Commons/);
      expect(t.credit!.licenceUrl).toMatch(/^https:\/\/creativecommons\.org\/licenses\/by\//);
      expect(t.credit!.sourceUrl).toMatch(/^https:\/\//);
      expect(t.credit!.changes.length).toBeGreaterThan(20);
      for (const f of t.files!) expect(read(templateFile(t.id, f)), f).toContain(t.credit!.author);
    }
    const licences = readFileSync(join(PUB, "templates", "LICENSES.md"), "utf8");
    for (const t of credited) expect(licences).toContain(t.credit!.sourceUrl);
  });
});

describe("bundled template SVGs", () => {
  const ALLOWED = new Set(["#000000", "#0000FF", "#FF0000", "#00E000"]);

  it.each(bundled.map((b) => [b.url, b] as const))("%s is a clean, safe cut file in mm", (_, { url }) => {
    const src = read(url);
    expect(statSync(publicPath(url)).size).toBeLessThan(400_000);
    expect(unsafe(src)).toEqual([]);
    const root = parseXml(src).children.find((c) => c.tag === "svg")!;
    expect(root).toBeTruthy();
    const vb = root.attrs.viewBox.split(/\s+/).map(Number);
    expect(vb).toHaveLength(4);
    expect(vb.every(Number.isFinite)).toBe(true);
    expect(vb.slice(0, 2)).toEqual([0, 0]);
    expect(vb[2] > 0 && vb[3] > 0).toBe(true);
    expect(root.attrs.width).toBe(`${vb[2]}mm`);
    expect(root.attrs.height).toBe(`${vb[3]}mm`);
    expect(src).not.toMatch(/NaN|Infinity/);
    walk(root, (el) => {
      for (const k of ["fill", "stroke"]) {
        const v = el.attrs[k];
        if (v && v !== "none") expect(ALLOWED, `${k}=${v}`).toContain(v.toUpperCase());
      }
    });
    const r = importSvg(src);
    expect(r.group).toBeTruthy();
    expect(r.layers.every((l) => [0, 1, 2, 3].includes(l.layer)), JSON.stringify(r.layers)).toBe(true);
    expect(r.box.minX).toBeGreaterThanOrEqual(-0.01);
    expect(r.box.minY).toBeGreaterThanOrEqual(-0.01);
    expect(r.box.maxX).toBeLessThanOrEqual(vb[2] + 0.01);
    expect(r.box.maxY).toBeLessThanOrEqual(vb[3] + 0.01);
    expect(r.layers.some((l) => l.layer === 2)).toBe(true);
  });
});

describe("template thumbnails", () => {
  it("are small, safe SVGs", () => {
    for (const t of TEMPLATES) {
      const url = templateThumb(t.id);
      const src = read(url);
      expect(src.length, t.id).toBeLessThan(64_000);
      expect(src, t.id).toMatch(/^<svg [^>]*viewBox="[-\d. ]+"/);
      expect(src, t.id).not.toMatch(/NaN|Infinity/);
      expect(unsafe(src), t.id).toEqual([]);
    }
  });
});

describe("Studio templates", () => {
  it.each(Object.keys(STUDIO_TEMPLATES))("%s builds a valid document with every part on its sheet", (id) => {
    let n = 0;
    const st = buildStudioTemplate(id, () => `n${++n}`)!;
    const doc = createDocument({ id, name: id, sheet: st.sheet });
    doc.root.children = st.nodes;
    assertDocument(doc);
    const ids = new Set<string>();
    let anchors = 0;
    const visit = (node: SceneNode, w: Mat) => {
      expect(ids.has(node.id), node.id).toBe(false);
      ids.add(node.id);
      const m = mul(w, node.transform);
      if (node.type === "group") return node.children.forEach((c) => visit(c, m));
      expect([0, 1, 2, 3], `${id}: ${node.name}`).toContain(node.layer);
      const subs = transformSubpaths(nodePaths(node), m);
      expect(subs.length, `${id}: ${node.name}`).toBeGreaterThan(0);
      for (const s of subs) for (const a of s.nodes) {
        anchors++;
        for (const v of [a.x, a.y, a.i?.x ?? 0, a.i?.y ?? 0, a.o?.x ?? 0, a.o?.y ?? 0]) expect(Number.isFinite(v)).toBe(true);
        expect(a.x >= -0.01 && a.y >= -0.01 && a.x <= st.sheet.w + 0.01 && a.y <= st.sheet.h + 0.01, `${id}: ${node.name} at ${a.x},${a.y}`).toBe(true);
      }
    };
    st.nodes.forEach((c) => visit(c, [1, 0, 0, 1, 0, 0]));
    expect(anchors).toBeGreaterThan(0);
    // something to cut out
    expect(JSON.stringify(st.nodes)).toMatch(/"layer":2/);
  });

  it("returns null for an unknown id", () => {
    expect(buildStudioTemplate("nope", () => "x")).toBeNull();
  });
});

describe("opening templates", () => {
  const fetchText = async (url: string) => read(url);

  it("opens a Studio template as live shapes on one sheet", async () => {
    const t = TEMPLATE_BY_ID["mandala-coasters"];
    const doc = await templateDocument(t, { id: "p1", fetchText });
    assertDocument(doc);
    expect(doc.origin).toEqual({ kind: "template", id: t.id });
    expect(doc.name).toBe(t.title);
    expect(doc.sheets).toHaveLength(1);
    expect(JSON.stringify(doc.root)).toContain("rotateCopies");
  });

  it("opens a bundled template with one sheet per file", async () => {
    for (const id of ["kv1-tank", "box-three-drawers", "ceramic-tile-frame"]) {
      const t = TEMPLATE_BY_ID[id];
      const doc = await templateDocument(t, { id: "p2", fetchText });
      assertDocument(doc);
      expect(doc.sheets, id).toHaveLength(t.files!.length);
      expect(doc.sheets.map((s) => s.name), id).toEqual(t.files!.map(fileLabel));
      expect(Math.max(...doc.sheets.map((s) => s.w)), id).toBe(t.w);
    }
  });

  it("refuses an editor-only template", async () => {
    await expect(templateDocument(TEMPLATE_BY_ID["hinge-sweet-jar"], { id: "p3", fetchText })).rejects.toThrow(/no files/);
  });

  it("names sheets after their files", () => {
    expect(fileLabel("tracks.svg")).toBe("Tracks");
    expect(fileLabel("sheet-2.svg")).toBe("Sheet 2");
  });
});

describe("template search", () => {
  it("finds by title, tag and description words", () => {
    expect(searchTemplates(TEMPLATES, "coaster").map((t) => t.id)).toEqual(expect.arrayContaining(["mandala-coasters", "op-art-coasters"]));
    const lamps = searchTemplates(TEMPLATES, "lamp").map((t) => t.id);
    expect(lamps[0]).toBe("hinge-lamp-wrap");
    expect(searchTemplates(TEMPLATES, "wedding table").map((t) => t.id)).toContain("tablenum-rustic");
    expect(searchTemplates(TEMPLATES, "zzzz")).toEqual([]);
  });

  it("filters by category and lists featured templates first", () => {
    const games = searchTemplates(TEMPLATES, "", "Games & puzzles");
    expect(games.length).toBeGreaterThan(3);
    expect(games.every((t) => t.category === "Games & puzzles")).toBe(true);
    const all = searchTemplates(TEMPLATES, "");
    expect(all).toHaveLength(TEMPLATES.length);
    const firstPlain = all.findIndex((t) => !t.featured);
    expect(all.slice(firstPlain).some((t) => t.featured)).toBe(false);
  });

  it("ignores case, accents and punctuation", () => {
    expect(searchTemplates(TEMPLATES, "  SNOWFLAKE! ").map((t) => t.id)).toContain("snowflake-ornaments");
  });
});

describe("thumbnail and file paths", () => {
  it("point into public/templates", () => {
    expect(templateThumb("a")).toBe("/templates/thumbs/a.svg");
    expect(templateFile("a", "b.svg")).toBe("/templates/files/a/b.svg");
    for (const t of TEMPLATES) expect(existsSync(publicPath(templateThumb(t.id))), t.id).toBe(true);
  });
});
