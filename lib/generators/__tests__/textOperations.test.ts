import { describe, expect, it } from "vitest";
import { buildCharm } from "../charm/build";
import { mergeCharm } from "../charm/params";
import { buildSign } from "../sign/build";
import { mergeSign } from "../sign/params";
import { buildTopper } from "../topper/build";
import { mergeTopper } from "../topper/params";
import { buildFamily } from "../family/build";
import { mergeFamily } from "../family/params";
import { CTX } from "./ctx";
import { textBlock, letterShapes } from "../weld";
import { pointInContour } from "../geom";
import { CHARM } from "../charm";
import { arrangeGenerator, genSVG } from "../output";
import { generatorScene } from "../scene3d";

describe("explicit no-weld lettering", () => {
  it("keeps a charm's separate letters and dots without changing the remembered weld", () => {
    const p = mergeCharm({ names: { list: "iji", fontId: "fredoka" }, style: { kind: "letters", noWeld: true, weld: 2, backing: 3 }, hang: { kind: "none" } });
    const out = buildCharm(p, CTX);
    expect(out.parts.filter(pt => pt.material === "second").length).toBeGreaterThanOrEqual(6);
    expect(p.style.weld).toBe(2);
  });
  it("scores charm letters on their backing without cutting a second layer", () => {
    const out = buildCharm(mergeCharm({ names: { list: "BO" }, style: { kind: "letters", operation: "score", backing: 3 }, hang: { kind: "none" } }), CTX);
    expect(out.parts).toHaveLength(1);
    expect(out.parts[0].score!.length).toBeGreaterThan(2);
    expect(out.parts[0].holes).toHaveLength(0);
    const scene = generatorScene(out, 3);
    expect(scene.group.getObjectByName(`${out.parts[0].name} · Letters engraving lines`)).toBeDefined();
    scene.dispose();
  });
  it("keeps sign letters separate on the board", () => {
    const out = buildSign(mergeSign({ text: { text: "iji", fontId: "fredoka" }, style: { kind: "layered", noWeld: true }, mount: { kind: "none" } }), CTX);
    expect(out.parts.filter(pt => pt.material === "second").length).toBeGreaterThanOrEqual(6);
  });
  it("scores topper letters on the structural backer and retains the sticks", () => {
    const out = buildTopper(mergeTopper({ text: { text: "BO" }, style: { kind: "layered", operation: "score" }, motif: { kind: "none" } }), CTX);
    expect(out.parts).toHaveLength(1);
    expect(out.parts[0].score!.length).toBeGreaterThan(2);
  });
  for (const kind of ["tree", "snowflake"]) it(`${kind} retains separate name pieces with No Weld`, () => {
    const out = buildFamily(mergeFamily({ layout: { kind }, names: { list: "iji\nOBO", fontId: "fredoka" }, [kind]: { noWeld: true }, backer: { on: true } }), CTX);
    expect(out.parts.filter(pt => pt.material === "second").length).toBeGreaterThan(6);
  });
  it("preserves overlapping glyphs, counters, and transformed script letters", () => {
    for (const style of [{ slant: 12, stretch: 85 }, { arc: 50 }, { circle: 80 }, { bold: 0.6 }, { stencil: 1 }]) {
      const t = textBlock(CTX, "hello BO", "pacifico", 25, { noWeld: true, style });
      expect(t.glyphs).toHaveLength(7);
      const parts = letterShapes(t.contours, { noWeld: true, border: 4 }, t.glyphs);
      expect(parts.length).toBeGreaterThanOrEqual(7);
      expect(parts).toEqual(letterShapes(t.contours, { noWeld: true, border: 0 }, t.glyphs));
    }
  });
  it("preserves second-line script glyphs and accent motifs", () => {
    const p = mergeCharm({ names: { list: "BO", fontId: "fredoka", sub: "hello", subFontId: "pacifico", subSize: 90 }, style: { kind: "layered", noWeld: true }, accent: { kind: "heart" }, hang: { kind: "none" } });
    const out = buildCharm(p, CTX);
    expect(out.parts.filter(pt => pt.material === "second").length).toBeGreaterThanOrEqual(8);
  });
  it("scores a card holder name only on retained wood below its window", () => {
    const p = mergeCharm({ kind: { kind: "cardholder" }, names: { list: "Henry" }, style: { kind: "layered", operation: "score" }, shape: { kind: "rounded", width: 106, height: 78 }, card: { width: 85.6, height: 54, clearance: 1, lip: 5 } });
    const out = buildCharm(p, CTX), face = out.parts.find(pt => pt.id.endsWith("-front"))!;
    expect(face.score!.length).toBeGreaterThan(2);
    for (const path of face.score!) for (const q of path) {
      expect(pointInContour(q, face.outer)).toBe(true);
      expect(face.holes.some(h => pointInContour(q, h))).toBe(false);
    }
    expect(out.parts.some(pt => pt.id.includes("-name"))).toBe(false);
  });
  it("exports scored charm letters as score paths and only the backing as an outline", () => {
    const p = mergeCharm({ names: { list: "BO" }, style: { kind: "letters", operation: "score" }, hang: { kind: "none" } });
    const a = arrangeGenerator(CHARM, p, CTX);
    expect(a.lay!.items).toHaveLength(1);
    expect(a.lay!.items[0].pt.score.length).toBeGreaterThan(2);
    expect(a.lay!.items[0].pt.inner).toHaveLength(0);
    const svg = genSVG(CHARM, a.params, a.lay!, "", a.sheets);
    expect(svg).toMatch(/Score/);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
});
