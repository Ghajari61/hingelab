import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layoutParts } from "../index";
import { buildHingeScene } from "@/lib/hinge3d/scene";
import { hingeRequestError } from "@/lib/billing/validate";
import type { Model, Params, PlatePart, WallPart } from "../types";

const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), over);
function model(over: Partial<Params> = {}): Model {
  const m = computeModel(box(over));
  if ("error" in m) throw new Error(m.error);
  return m;
}
const dividers = (m: Model) => m.parts.filter((p): p is WallPart => p.kind === "wall" && !!p.divider);
const plate = (m: Model, name: string) => m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === name)!;
const ys = (w: WallPart) => w.outline.map((q) => q[1]);

describe("inside dividers", () => {
  it("are off by default, so a plain box keeps its parts", () => {
    const m = model();
    expect(dividers(m)).toHaveLength(0);
    expect(m.dividers).toBeUndefined();
  });

  it("split a box into a grid that locks together and stands in the base", () => {
    const base0 = plate(model(), "BASE").slots.length;
    const m = model({ W: 220, D: 150, H: 85, R: 22, divX: 2, divY: 1 });
    const d = dividers(m);
    expect(d.map((x) => x.name)).toEqual(["DIVIDER A", "DIVIDER B", "DIVIDER 1"]);
    expect(m.dividers).toHaveLength(3);
    const t = DEFAULTS.T, h = m.hBody - t - 1;
    for (const x of d) expect(x.hBody).toBeCloseTo(h, 9);
    // Front-to-back strips run the inside depth less a little play; the left-to-right one the inside width.
    const inside = (n: number) => n - 2 * t - 2 * Math.max(0.2, DEFAULTS.slotClr);
    expect(d[0].w).toBeCloseTo(inside(150), 1);
    expect(d[2].w).toBeCloseTo(inside(220), 1);
    // Half-lap slots: A and B are cut from the top down to half height, 1 from the bottom up.
    const A = d[0], one = d[2], k = DEFAULTS.K;
    // The cut line sits half a kerf inside each slot, so the slot comes out at its size.
    expect(A.outline.some((q) => Math.abs(q[1] - (h / 2 - k / 2)) < 1e-6)).toBe(true);
    expect(one.outline.some((q) => Math.abs(q[1] - (h / 2 + k / 2)) < 1e-6)).toBe(true);
    // Tabs reach t below the bottom edge, and each has a slot in the base.
    expect(Math.max(...ys(A))).toBeCloseTo(h + t + k / 2, 6);
    expect(plate(m, "BASE").slots.length).toBeGreaterThan(base0 + 3);
  });

  it("stand as tall as the walls under a fixed lid, or as asked", () => {
    expect(dividers(model({ lid: "fixed", divX: 1 }))[0].hBody).toBeCloseTo(model({ lid: "fixed" }).hBody - 0.5, 9);
    expect(dividers(model({ divX: 1, divH: 30 }))[0].hBody).toBe(30);
    const tall = model({ divX: 1, divH: 500 });
    expect(dividers(tall)[0].hBody).toBeCloseTo(tall.hBody - DEFAULTS.T - 1, 9);
  });

  it("step up onto a support ring at their ends", () => {
    const m = model({ divX: 1, baseRing: true });
    const A = dividers(m)[0], h = A.hBody, t = DEFAULTS.T, k = DEFAULTS.K;
    const ends = A.outline.filter((q) => q[0] < 2 || q[0] > A.w - 2).map((q) => q[1]);
    expect(Math.max(...ends)).toBeCloseTo(h - t + k / 2, 6);
  });

  it("follow a round wall: shorter strips near the side", () => {
    const m = model({ shape: "cyl", dia: 150, H: 80, divX: 2 });
    const [a, b] = dividers(m);
    expect(a.w).toBeLessThan(150 - 2 * DEFAULTS.T);
    expect(a.w).toBeCloseTo(b.w, 6);
    const mid = dividers(model({ shape: "cyl", dia: 150, H: 80, divX: 1 }))[0];
    expect(mid.w).toBeGreaterThan(a.w);
  });

  it("leave out what does not fit, with a note", () => {
    const m = model({ W: 80, D: 60, divX: 8 });
    expect(dividers(m).length).toBeLessThan(8);
    expect(m.issues.some((i) => /fit with compartments/.test(i.msg))).toBe(true);
  });

  it("are checked on requests, exported and shown in 3D", () => {
    expect(hingeRequestError(box({ divX: 2, divY: 1, divH: 40 }))).toBeNull();
    expect(hingeRequestError(box({ divX: 9 }))).not.toBeNull();
    const p = box({ divX: 2, divY: 1 });
    const m = model(p);
    const svg = exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p);
    expect(svg).toContain(">DIVIDER A<");
    expect(() => buildHingeScene(m, p)).not.toThrow();
  });
});
