import { describe, expect, it } from "vitest";
import { pointInContour } from "@/lib/generators/geom";
import { buildBox, cleanParams, dielineSVG, fromMM, getBoxStyle, listBoxStyles, panelSizes, toMM, type Dieline, type DielinePart } from "..";

const STEP1 = ["reverse-tuck", "straight-tuck", "mailer", "two-piece"];
const len = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Closed cut paths not inside another one: the part's outlines. */
function outlines(part: DielinePart) {
  const cuts = part.paths.filter((p) => p.type === "cut" && p.closed);
  return cuts.filter((c) => !cuts.some((o) => o !== c && c.pts.every((q) => pointInContour(q, o.pts))));
}

describe("paper box engine", () => {
  it("registers the styles with schemas and defaults that build", () => {
    const ids = listBoxStyles().map((s) => s.id);
    for (const id of STEP1) expect(ids).toContain(id);
    for (const s of listBoxStyles()) {
      expect(s.paramSchema.length).toBeGreaterThan(1);
      for (const g of s.paramSchema) for (const f of g.fields) expect(f.key in s.defaultParams, `${s.id}.${f.key}`).toBe(true);
    }
  });

  it("converts units both ways", () => {
    expect(toMM(1, "in")).toBe(25.4);
    expect(toMM(2.5, "cm")).toBe(25);
    expect(fromMM(toMM(3.7, "in"), "in")).toBeCloseTo(3.7, 12);
  });

  it("puts scores on the board's mid-plane: panels are inside + t, outside is inside + 2t", () => {
    const s = panelSizes(60, 40, 100, "inner", 0.5);
    expect([s.l, s.w, s.h]).toEqual([60.5, 40.5, 100.5]);
    expect(s.outer).toEqual([61, 41, 101]);
    const o = panelSizes(61, 41, 101, "outer", 0.5);
    expect(o.inner).toEqual([60, 40, 100]);
  });

  it("checks settings against the schema", () => {
    const s = getBoxStyle("reverse-tuck")!;
    const p = cleanParams(s, { L: -5, W: 9999, gluePos: "middle", slitLock: "yes", junk: 1 });
    expect(p.L).toBe(10);
    expect(p.W).toBe(1000);
    expect(p.gluePos).toBe("left");
    expect(p.slitLock).toBe(true);
    expect("junk" in p).toBe(false);
  });

  it.each(STEP1)("%s: every part is one closed outline with its folds inside", (id) => {
    const d = buildBox(id, {});
    for (const part of d.parts) {
      expect(outlines(part), part.id).toHaveLength(1);
      const outer = outlines(part)[0].pts;
      for (const c of part.paths.filter((p) => p.type === "crease")) for (const q of c.pts) {
        // Crease ends sit on the outline or inside it.
        const onEdge = outer.some((a, i) => { const b = outer[(i + 1) % outer.length]; return Math.abs(len(a, q) + len(q, b) - len(a, b)) < 0.05; });
        expect(onEdge || pointInContour(q, outer), `${id} crease end ${q}`).toBe(true);
      }
      expect(part.paths.filter((p) => p.type === "crease").length).toBeGreaterThan(4);
    }
    expect(d.assembly.length).toBeGreaterThan(2);
  });

  it("tuck boxes: glue flap runs the panel's height; tucks and dust flaps fit the opening", () => {
    for (const id of ["reverse-tuck", "straight-tuck"]) {
      for (const gluePos of ["left", "right"]) {
        const p = { L: 60, W: 40, H: 100, paper: "350", gluePos };
        const d = buildBox(id, p), f = d.parts[0].faces, t = 0.45;
        const glue = f.find((x) => x.id === "glue")!, back = f.find((x) => x.id === "back")!;
        expect(glue.w).toBeCloseTo(back.h, 9);
        expect(back.h).toBeCloseTo(100 + t, 9);
        const lid = f.find((x) => x.id === "lid-top")!, tuck = f.find((x) => x.id === "tuck-top")!;
        expect(lid.w).toBeCloseTo(60 + t, 9);
        expect(lid.h).toBeCloseTo(40 + t, 9);
        expect(tuck.parent).toBe("lid-top");
        for (const dust of f.filter((x) => x.id.startsWith("dust-"))) expect(dust.h).toBeLessThan((60 + t) / 2);
        expect(d.outer).toEqual([61, 41, 101].map((v, i) => [60, 40, 100][i] + 2 * t));
      }
    }
    // Reverse tuck: the bottom lid hangs on the back panel; straight tuck: on the front.
    expect(buildBox("reverse-tuck", {}).parts[0].faces.find((x) => x.id === "lid-bottom")!.parent).toBe("back");
    expect(buildBox("straight-tuck", {}).parts[0].faces.find((x) => x.id === "lid-bottom")!.parent).toBe("front");
  });

  it("slit locks cut the ends of the tuck folds", () => {
    const on = buildBox("reverse-tuck", { slitLock: true }), off = buildBox("reverse-tuck", { slitLock: false });
    const openCuts = (d: Dieline) => d.parts[0].paths.filter((p) => p.type === "cut" && !p.closed).length;
    expect(openCuts(on)).toBe(4);
    expect(openCuts(off)).toBe(0);
  });

  it("mailer: slots in the base for every lock tab", () => {
    const d = buildBox("mailer", {}), part = d.parts[0];
    const tabs = part.faces.filter((f) => f.name === "Lock tab").length;
    const slots = part.paths.filter((p) => p.type === "cut" && p.closed).length - 1;
    expect(tabs).toBeGreaterThanOrEqual(4);
    expect(slots).toBe(tabs);
  });

  it("two-piece: the lid's inside is the base's outside plus the clearance each side", () => {
    for (const clearance of [0, 0.5, 1.5]) {
      const d = buildBox("two-piece", { L: 100, W: 80, H: 50, paper: "chip1", clearance });
      const [base, lid] = d.parts.map((p) => p.faces.find((f) => f.id === "base")!);
      const t = 1;
      // Base panel = inside + t; base outside = inside + 2t; lid inside = that + 2c; lid panel = lid inside + t.
      expect(lid.w - t).toBeCloseTo(base.w + t + 2 * clearance, 9);
      expect(lid.h - t).toBeCloseTo(base.h + t + 2 * clearance, 9);
    }
  });

  it("bleed adds a bleed line outside the cut", () => {
    expect(buildBox("reverse-tuck", { bleed: 3 }).parts[0].paths.some((p) => p.type === "bleed")).toBe(true);
    expect(buildBox("reverse-tuck", {}).parts[0].paths.some((p) => p.type === "bleed")).toBe(false);
  });

  it.each(STEP1)("%s: SVG layers by line type, in real units", (id) => {
    const svg = dielineSVG(buildBox(id, {}));
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).toContain('inkscape:label="02 Cut" fill="none" stroke="#FF0000"');
    expect(svg).toContain('inkscape:label="01 Crease (score)"');
    expect(dielineSVG(buildBox(id, {}), { unit: "in" })).toMatch(/width="[\d.]+in"/);
    expect(svg).toMatchSnapshot();
  });
});
