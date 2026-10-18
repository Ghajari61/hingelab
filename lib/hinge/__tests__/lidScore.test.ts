import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layerContent, layoutParts } from "../index";
import { plateExtent } from "../core";
import { hingeRequestError } from "@/lib/billing/validate";
import { hingeForm } from "@/lib/desktop/products";
import type { Model, Params, PlatePart } from "../types";

const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), { lid: "removable" }, over);
function build(over: Partial<Params> = {}) {
  const p = box(over);
  const m = computeModel(p);
  if ("error" in m) throw new Error(m.error);
  const lay = layoutParts(m.parts, p.bedW, p.gap);
  return { p, m: m as Model, lay, svg: exportSVG(m, lay, p) };
}
const plate = (m: Model, name: string) => m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === name);

describe("score the lid lip on the lid", () => {
  it("is off by default, so files keep no score layer", () => {
    const { m, lay, p, svg } = build();
    expect(plate(m, "LID")!.scoreR).toBeUndefined();
    expect(layerContent(m, lay, p).score).toBeUndefined();
    expect(svg).not.toContain('id="score"');
  });

  it("scores the lip's outline on the lid, in its own layer before the cuts", () => {
    const { m, lay, p, svg } = build({ lidLipScore: true });
    const lid = plate(m, "LID")!, lip = plate(m, "LID LIP")!;
    expect(lid.scoreR).toBeCloseTo(m.R - p.T - p.lidGap, 9);
    const score = layerContent(m, lay, p).score!;
    expect(score).toHaveLength(1);
    // The scored line is the lip's size before kerf: the cut lip is a kerf larger.
    const e = plateExtent(lid.edges, lid.scoreR!);
    expect(e.x1 - e.x0).toBeCloseTo(lip.bbox.x1 - lip.bbox.x0 - p.K, 6);
    expect(e.y1 - e.y0).toBeCloseTo(lip.bbox.y1 - lip.bbox.y0 - p.K, 6);
    expect(score[0]).toMatch(/^M/);
    expect(svg).toContain('inkscape:label="05 Score lines"');
    expect(svg.indexOf('id="score"')).toBeLessThan(svg.indexOf('id="outline"'));
    expect(svg).toContain("Cut order: score, slots");
  });

  it("needs a removable lid with a lip", () => {
    expect(plate(build({ lidLipScore: true, lidLip: false }).m, "LID")!.scoreR).toBeUndefined();
    expect(build({ lidLipScore: true, lid: "fixed" }).svg).not.toContain('id="score"');
  });

  it("is checked on requests and shown on the desktop only when it applies", () => {
    expect(hingeRequestError(box({ lidLipScore: true }))).toBeNull();
    expect(hingeRequestError(box({ lidLipScore: "yes" as never }))).not.toBeNull();
    expect(hingeForm(box()).hiddenSections).not.toContain("secLid");
    expect(hingeForm(box()).hidden).not.toContain("lidLipScore");
    expect(hingeForm(box({ lidLip: false })).hidden).toContain("lidLipScore");
    expect(hingeForm(box({ lid: "fixed" })).hidden).toContain("lidLipScore");
    expect(hingeForm(box({ lid: "open" })).hiddenSections).toContain("secLid");
  });
});
