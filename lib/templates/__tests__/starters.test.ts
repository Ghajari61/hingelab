import { describe, expect, it } from "vitest";
import { assertDocument, createDocument } from "@/lib/studio/doc";
import { mul, nodePaths, transformSubpaths } from "@/lib/studio/geom";
import type { Mat, SceneNode, TextNode } from "@/lib/studio/types";
import { GENERATORS, generatorHref } from "@/lib/generators/catalog";
import { GENERATOR_PRESETS } from "@/lib/generators/presets";
import { isGeneratorId } from "@/lib/generators/ids";
import { templateCategories } from "../catalog";
import { buildGeneratorStarter } from "../studio";

const flat = (nodes: SceneNode[]): SceneNode[] => nodes.flatMap((n) => (n.type === "group" ? flat(n.children) : [n]));

describe("start screen cards", () => {
  it.each(GENERATORS.map((g) => [g.id, g] as const))("%s leads somewhere with something to make", (_, g) => {
    const href = generatorHref(g);
    if (g.opens === "studio") {
      expect(href).toBe(`/home?generator=${g.id}`);
      expect(buildGeneratorStarter(g.id, () => "x")).not.toBeNull();
      return;
    }
    expect(buildGeneratorStarter(g.id, () => "x")).toBeNull();
    const u = new URL(href, "https://hingelab.test");
    if ("editor" in g.opens) {
      expect(u.pathname).toBe("/app/editor/local");
      const p = u.searchParams.get("p")!;
      expect(p === "hinge" || p === "letters" || p === "parametric" || isGeneratorId(p), p).toBe(true);
      const preset = u.searchParams.get("preset");
      if (preset) expect(isGeneratorId(p) && GENERATOR_PRESETS[p].some((x) => x.id === preset), preset).toBe(true);
    } else {
      expect(u.pathname).toBe("/templates");
      const c = u.searchParams.get("c");
      expect(templateCategories().find((x) => x.id === c)?.count ?? 0, c ?? "").toBeGreaterThan(0);
    }
  });
});

describe("Studio starters", () => {
  it.each(["hinge-fill"])("%s builds a valid document with every part on its sheet", (id) => {
    let n = 0;
    const st = buildGeneratorStarter(id, () => `n${++n}`)!;
    const doc = createDocument({ id, name: id, sheet: st.sheet });
    doc.root.children = st.nodes;
    assertDocument(doc);
    const visit = (node: SceneNode, w: Mat) => {
      const m = mul(w, node.transform);
      if (node.type === "group") return node.children.forEach((c) => visit(c, m));
      if (node.type === "text") return;
      const subs = transformSubpaths(nodePaths(node), m);
      expect(subs.length, node.name).toBeGreaterThan(0);
      for (const s of subs) for (const a of s.nodes) expect(a.x >= -0.01 && a.y >= -0.01 && a.x <= st.sheet.w + 0.01 && a.y <= st.sheet.h + 0.01, `${node.name} at ${a.x},${a.y}`).toBe(true);
    };
    st.nodes.forEach((c) => visit(c, [1, 0, 0, 1, 0, 0]));
    expect(flat(st.nodes).some((x) => (x.type === "shape" || x.type === "path") && x.effects?.some((e) => e.kind === "livingHinge"))).toBe(true);
  });
});
