import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layerContent, layoutParts } from "../index";
import { hingeRequestError } from "@/lib/billing/validate";
import { hingeForm } from "@/lib/desktop/products";
import type { Model, Params, PlatePart } from "../types";

const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), over);
function model(over: Partial<Params> = {}): Model {
  const m = computeModel(box(over));
  if ("error" in m) throw new Error(m.error);
  return m;
}
const plate = (m: Model, name: string) => m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === name)!;
const span = (pts: [number, number][], i: 0 | 1) => Math.max(...pts.map((q) => q[i])) - Math.min(...pts.map((q) => q[i]));

describe("open top with a rim", () => {
  const pen = { W: 90, D: 70, H: 110, R: 20, lid: "fixed" as const, lidHole: "rim" as const };

  it("cuts the lid's middle away, leaving a 13 mm rim round a 3 mm pen holder by default", () => {
    const m = model(pen), lid = plate(m, "LID"), base = plate(m, "BASE");
    expect(lid.slots).toHaveLength(base.slots.length + 1);
    const opening = lid.slots[lid.slots.length - 1];
    // The rim is 13 mm on every side; the cut sits half a kerf inside the opening.
    expect(span(opening, 0)).toBeCloseTo(90 - 2 * 13 - DEFAULTS.K, 6);
    expect(span(opening, 1)).toBeCloseTo(70 - 2 * 13 - DEFAULTS.K, 6);
    expect(lid.rim).toBe(13);
    expect(m.issues.some((i) => /rim/.test(i.msg))).toBe(false);
  });

  it("takes the user's width and puts the label on the rim", () => {
    const p = box({ ...pen, lidHoleW: 10 });
    const m = model(p);
    expect(span(plate(m, "LID").slots.at(-1)!, 0)).toBeCloseTo(70 - DEFAULTS.K, 6);
    const lay = layoutParts(m.parts, p.bedW, p.gap);
    const it = lay.items.find((x) => x.pt.name === "LID")!;
    const label = layerContent(m, lay, p).labels.find((l) => l.text === "LID")!;
    expect(label.y - it.oy).toBeGreaterThan(70 / 2 - 10);
    expect(label.size).toBeLessThanOrEqual(5);
    expect(exportSVG(m, lay, p)).toContain(">LID<");
  });

  it("keeps the top closed, with a note, when the rim would cut into the tab slots or close up", () => {
    const narrow = model({ ...pen, lidHoleW: 3 });
    expect(plate(narrow, "LID").slots).toHaveLength(plate(narrow, "BASE").slots.length);
    expect(narrow.issues.some((i) => /rim is too narrow/.test(i.msg))).toBe(true);
    const wide = model({ ...pen, lidHoleW: 60 });
    expect(wide.issues.some((i) => /rim is too wide/.test(i.msg))).toBe(true);
  });

  it("makes a frame of a removable lid and its lip, and works on a cylinder", () => {
    const m = model({ lidHole: "rim", lidHoleW: 12 });
    expect(plate(m, "LID").slots).toHaveLength(1);
    expect(plate(m, "LID LIP").slots).toHaveLength(1);
    expect(plate(m, "LID LIP").rim).toBeCloseTo(12 - DEFAULTS.T - DEFAULTS.lidGap, 9);
    const cyl = model({ shape: "cyl", dia: 80, H: 110, lid: "fixed", lidHole: "rim" });
    expect(plate(cyl, "LID").slots.length).toBe(plate(cyl, "BASE").slots.length + 1);
  });

  it("is checked on requests and named on the desktop", () => {
    expect(hingeRequestError(box({ ...pen, lidHoleW: 13 }))).toBeNull();
    const f = hingeForm(box(pen));
    expect(f.labels.lidHoleW).toBe("Top rim width");
    expect(f.values?.lidHoleW).toBe(13);
    expect(f.hidden).toContain("lidHoleD");
    expect(f.hidden).not.toContain("lidHoleW");
  });
});
