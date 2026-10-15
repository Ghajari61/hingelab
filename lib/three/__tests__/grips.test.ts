import { describe, expect, it } from "vitest";
import {
  axisDrag, clampStep, dragFactors, lenText, mmSetting, numberGrip, ratioSetting, scaleDrag, shownAxes, sizeAxes, sizeResult, snapDrag, turnDrag, uniformDrag,
  type Factors, type Grip, type GripSet,
} from "../grips";
import { hingeGrips } from "@/lib/hinge3d/grips";
import { DEFAULTS } from "@/lib/hinge/defaults";
import type { Params } from "@/lib/hinge";
import { generatorGrips } from "@/lib/generators/grips3d";
import { BOXES } from "@/lib/generators/boxes";
import { BOXES_DEFAULTS, type BoxesParams } from "@/lib/generators/boxes/params";
import { CLOCK } from "@/lib/generators/clock";
import { CLOCK_DEFAULTS } from "@/lib/generators/clock/params";
import { letterGrips } from "@/lib/letters/grips";
import { LETTER_DEFAULTS } from "@/lib/letters/defaults";
import type { LetterParams } from "@/lib/letters";
import { assemblyGrips } from "@/lib/studio/assembly/grips";
import { parametricGrips } from "@/components/parametric/grips";
import { PARAMETRIC_DEFAULTS } from "@/lib/parametric";

const byId = (gs: Grip[] | undefined, id: string) => {
  const g = gs?.find((x) => x.id === id);
  if (!g) throw new Error(`no grip ${id} in ${gs?.map((x) => x.id).join(", ")}`);
  return g;
};
const F = (x = 1, y = 1, z = 1): Factors => ({ x, y, z });
/** A scale drag let go: the settings it writes (if any) and the readout. */
const scale = (set: GripSet, ext: Factors, f: Factors) => {
  const r = sizeResult(set.size!, ext, f);
  if (Object.keys(r.values).length) set.size!.write(r.values);
  return r;
};

describe("grip maths", () => {
  it("projects the pointer onto the axis as drawn on screen", () => {
    // 2 px per mm to the right: 20 px right is 10 mm, 20 px down is nothing.
    expect(axisDrag(20, 0, [2, 0])).toBeCloseTo(10);
    expect(axisDrag(0, 20, [2, 0])).toBeCloseTo(0);
    const u: [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];
    expect(axisDrag(10 * u[0], 10 * u[1], u)).toBeCloseTo(10);
    expect(axisDrag(5, 5, [0, 0])).toBe(0);
  });

  it("measures turns counter-clockwise on screen, flipped when the axis points away", () => {
    const c: [number, number] = [100, 100];
    expect(turnDrag(c, [150, 100], [100, 50], true)).toBeCloseTo(90);
    expect(turnDrag(c, [150, 100], [100, 50], false)).toBeCloseTo(-90);
    expect(turnDrag(c, [150, 100], [100, 150], true)).toBeCloseTo(-90);
    expect(turnDrag(c, [100, 100], [120, 100], true)).toBe(0);
  });

  it("snaps moves and turns to whole mm and degrees, or 5 mm and 15° with Shift", () => {
    expect(snapDrag("move", 12.4, false)).toBe(12);
    expect(snapDrag("move", -7.6, true)).toBe(-10);
    expect(snapDrag("turn", 22, true)).toBe(15);
    expect(snapDrag("turn", 22.6, false)).toBe(23);
  });

  it("scales by the pointer's distance from the gizmo's centre over where it was grabbed", () => {
    const c: [number, number] = [100, 100];
    // Grabbed 60 px right of the centre: 120 px is twice the size, 30 px half; across the axis counts nothing.
    expect(scaleDrag(c, [1, 0], [160, 100], [220, 100])).toBeCloseTo(2);
    expect(scaleDrag(c, [1, 0], [160, 100], [130, 140])).toBeCloseTo(0.5);
    expect(scaleDrag(c, [1, 0], [160, 100], [0, 100])).toBe(0.02);
    expect(scaleDrag(c, [1, 0], [101, 100], [300, 100])).toBe(1);
    // The middle: 100 px up doubles, 100 px down halves.
    expect(uniformDrag(-100)).toBeCloseTo(2);
    expect(uniformDrag(100)).toBeCloseTo(0.5);
  });

  it("an axis sizes alone, a plane two axes, the middle all; Shift keeps the proportions", () => {
    expect(dragFactors(["x"], 1.5, false)).toEqual(F(1.5));
    expect(dragFactors(["x", "z"], 2, false)).toEqual(F(2, 1, 2));
    expect(dragFactors(["x"], 1.5, true)).toEqual(F(1.5, 1.5, 1.5));
  });

  it("length settings grow by whole mm within their limits; ratio settings scale", () => {
    const w = mmSetting("w", ["x"], { v0: 100, min: 50, max: 150, step: 0.1 }, (v) => `${v}`);
    expect(w.at(1.204, 100)).toEqual({ v: 120, f: 1.2 });
    expect(w.at(1.002, 100)).toEqual({ v: 100, f: 1 });
    expect(w.at(3, 100)).toEqual({ v: 150, f: 1.5 });
    expect(w.at(0.1, 100)).toEqual({ v: 50, f: 0.5 });
    const s = ratioSetting("s", ["x", "y"], { v0: 40, min: 5, max: 100, step: 0.1 }, (v) => `${v}`);
    expect(s.at(1.5, 999)).toEqual({ v: 60, f: 1.5 });
    expect(s.at(10, 999)).toEqual({ v: 100, f: 2.5 });
  });

  it("clamps and steps values, and shows lengths in the editor's units", () => {
    expect(clampStep(7, 10, 100, 1)).toBe(10);
    expect(clampStep(123.456, 10, 500, 0.5)).toBe(123.5);
    expect(clampStep(999, 10, 500)).toBe(500);
    expect(lenText(120, "mm")).toBe("120 mm");
    expect(lenText(25.4, "in")).toBe("1.00 in");
  });

  it("a number grip applies v0 + k·d from where the drag started", () => {
    const seen: [number, boolean][] = [];
    const g = numberGrip("a", "turn", "x", { v0: 50, min: 10, max: 60, k: 2, set: (v, done) => seen.push([v, done]), show: (v) => `${v}` });
    const drag = g.start(100);
    expect(drag(3, false)).toBe("56");
    expect(drag(30, false)).toBe("60");
    expect(drag(-100, true)).toBe("10");
    expect(seen).toEqual([[56, false], [60, false], [10, true]]);
  });

  it("shows no handle along an axis the box is too thin along, unless every axis is", () => {
    const s = ratioSetting("size", ["x", "y", "z"], { v0: 10, min: 1, max: 100 }, String);
    const g = { settings: [s], write: () => {}, thin: 1.5 };
    expect(shownAxes(g, F(40, 0.2, 12))).toEqual(["x", "z"]);
    expect(shownAxes(g, F(0.2, 0.2, 0.2))).toEqual(["x", "y", "z"]);
    expect(shownAxes({ settings: [s], write: () => {} }, F(40, 0.2, 12))).toEqual(["x", "y", "z"]);
    // An even gizmo grows the shown axes alike from any handle; the setting follows that growth.
    const r = sizeResult(g, F(40, 0.2, 12), dragFactors(["x", "z"], 1.5, false));
    expect(r.values).toEqual({ size: 15 });
    expect(r.f).toEqual(F(1.5, 1.5, 1.5));
  });
});

describe("Hinge Box scale gizmo", () => {
  const ext = F(100, 80, 60);
  const run = (p: Params, f: Factors) => {
    let out: Params | null = null, writes = 0;
    const r = scale(hingeGrips(p, (patch) => { out = { ...p, ...patch }; writes++; }, "mm"), ext, f);
    return { p: out as unknown as Params, writes, r };
  };

  it("X sets the width alone, Z the depth, Y the height; the box shows what was reached", () => {
    const p = { ...DEFAULTS, shape: "rect" as const };
    const x = run(p, F(1.2));
    expect(x.p).toEqual({ ...p, W: p.W + 20 });
    expect(x.r.f).toEqual(F(1.2));
    expect(x.r.text).toBe(`Width ${p.W + 20} mm`);
    expect(run(p, F(1, 1, 1.25)).p).toEqual({ ...p, D: p.D + 15 });
    expect(run(p, F(1, 0.5)).p).toEqual({ ...p, H: p.H - 40 });
  });

  it("a plane or Shift changes several settings in one write (one undo step)", () => {
    const p = { ...DEFAULTS, shape: "rect" as const };
    const both = run(p, F(1.1, 1, 1.1));
    expect(both.writes).toBe(1);
    expect(both.p).toEqual({ ...p, W: p.W + 10, D: p.D + 6 });
    const all = run(p, F(2, 2, 2));
    expect(all.p).toEqual({ ...p, W: p.W + 100, D: p.D + 60, H: p.H + 80 });
    expect(all.r.text).toBe(`Width ${p.W + 100} mm · Depth ${p.D + 60} mm · Height ${p.H + 80} mm`);
  });

  it("round boxes size the diameter on X and Z together; polygons the size across; minimums hold", () => {
    const cyl = run({ ...DEFAULTS, shape: "cyl" }, F(1, 1, 1.1));
    expect(cyl.p.dia).toBe(DEFAULTS.dia + 6);
    expect(cyl.r.f.x).toBeCloseTo(1.1);
    expect(run({ ...DEFAULTS, shape: "poly" }, F(1.1)).p.W).toBe(DEFAULTS.W + 10);
    expect(run({ ...DEFAULTS, W: 60 }, F(0.001)).p.W).toBe(10);
    expect(sizeAxes(hingeGrips(DEFAULTS, () => {}, "mm").size!)).toEqual(["x", "y", "z"]);
  });

  it("an unchanged drag writes nothing; readouts follow the editor's units", () => {
    expect(run(DEFAULTS, F()).writes).toBe(0);
    const r = sizeResult(hingeGrips(DEFAULTS, () => {}, "in").size!, ext, F());
    expect(r.text).toContain(`Height ${(DEFAULTS.H / 25.4).toFixed(2)} in`);
  });
});

describe("generator handles", () => {
  const box: BoxesParams = structuredClone(BOXES_DEFAULTS);
  const ext = F(140, 60, 80);

  it("Boxes: the gizmo sets the design's own width, depth and height within the fields' limits", () => {
    let out: BoxesParams | null = null;
    const g = generatorGrips(BOXES, box, (q) => { out = q as BoxesParams; }, "mm", [140, 60, 80]);
    expect(g.size!.settings.map((s) => s.key)).toEqual(["box.width", "box.depth", "box.height"]);
    scale(g, ext, F(1.25));
    expect(out!.box.width).toBe(box.box.width + 35);
    expect(out!.box.depth).toBe(box.box.depth);
    scale(g, ext, F(1.5, 1, 1.5));
    expect([out!.box.width, out!.box.depth]).toEqual([box.box.width + 70, box.box.depth + 40]);
    scale(g, ext, F(1, 0.001));
    const f = BOXES.sections.flatMap((s) => s.fields).find((x) => x.kind === "number" && x.key === "box.height") as { min: number };
    expect(out!.box.height).toBe(f.min);
  });

  it("Boxes: each design gets its own axes; the phone stand's ring sets its lean", () => {
    const axes = (design: BoxesParams["design"]) => {
      const g = generatorGrips(BOXES, { ...box, design }, () => {}, "mm", [1, 1, 1]);
      return Object.fromEntries(g.size!.settings.map((s) => [s.key, s.axes.join("")]));
    };
    expect(axes("tray")["tray.depth"]).toBe("z");
    expect(axes("hex")).toEqual({ "hex.width": "xz", "hex.height": "y" });
    expect(axes("frame")).toEqual({ "frame.photoW": "x", "frame.photoH": "y" });
    expect(axes("keys")["keys.reach"]).toBe("z");
    let out: BoxesParams | null = null;
    const stand = generatorGrips(BOXES, { ...box, design: "stand" }, (q) => { out = q as BoxesParams; }, "mm", null);
    expect(byId(stand.grips, "turn-x-stand.angle").start(0)(7, true)).toBe(`Lean ${box.stand.angle + 7}°`);
    expect(out!.stand.angle).toBe(box.stand.angle + 7);
  });

  it("designs without their own settings are scaled as a whole, but not through their thickness", () => {
    let out: typeof CLOCK_DEFAULTS | null = null;
    const p = structuredClone(CLOCK_DEFAULTS);
    const g = generatorGrips(CLOCK, p, (q) => { out = q as typeof CLOCK_DEFAULTS; }, "mm", [300, 3, 300]);
    expect(sizeAxes(g.size!)).toEqual(["x", "z"]);
    const r = scale(g, F(300, 3, 300), F(1.1));
    expect(r.f).toEqual(F(1.1, 1, 1.1));
    expect(r.text).toBe("Width 330 mm (110%)");
    expect(out).toEqual(CLOCK.scale!(p, 1.1));
  });
});

describe("Letters, Studio and Parametric handles", () => {
  it("Letters: X and Z scale the text size together; Y sets a box's depth", () => {
    let out: LetterParams | null = null;
    const p: LetterParams = { ...structuredClone(LETTER_DEFAULTS), mode: "box", size: 100, depth: 50 };
    const g = letterGrips(p, (q) => { out = q; }, "mm");
    const r = scale(g, F(400, 50, 120), F(1.25));
    expect(out!.size).toBe(125);
    expect(r.f).toEqual(F(1.25, 1, 1.25));
    scale(g, F(400, 50, 120), F(1, 1.4));
    expect(out!.depth).toBe(70);
    expect(sizeAxes(letterGrips({ ...p, mode: "solid" }, () => {}, "mm").size!)).toEqual(["x", "z"]);
  });

  it("Studio: arrows move a part along the views' axes in the assembly's frame; rings turn it by quarter turns", () => {
    const calls: { patch: { move?: number[]; turn?: number[] }; tag: string }[] = [];
    const gs = assemblyGrips([0, 0, 5], [0, 0, 270], (patch, tag) => calls.push({ patch, tag }), "mm");
    const up = byId(gs, "move-y").start(0);
    up(10, false);
    up(12, true);
    expect(calls.map((c) => c.patch.move)).toEqual([[0, 0, 15], [0, 0, 17]]);
    expect(calls[0].tag).toBe(calls[1].tag);
    byId(gs, "move-z").start(0)(4, true);
    expect(calls[2].patch.move).toEqual([0, -4, 5]);
    expect(calls[2].tag).not.toBe(calls[0].tag);
    expect(byId(gs, "turn-y").start(0)(100, true)).toBe("Turn Y 90°");
    expect(calls[3].patch.turn).toEqual([0, 0, 0]);
    byId(gs, "turn-z").start(0)(-80, true);
    expect(calls[4].patch.turn).toEqual([0, 90, 270]);
  });

  it("Parametric: the gizmo scales the model as a whole (or its set size); a ring turns it", () => {
    const p = structuredClone(PARAMETRIC_DEFAULTS);
    let next = p;
    const edit = (f: (q: typeof p) => void) => { next = structuredClone(p); f(next); };
    const g = parametricGrips(p, edit, "mm");
    const r = scale(g, F(200, 200, 200), F(1, 1.5));
    expect(r.f).toEqual(F(1.5, 1.5, 1.5));
    expect(next.sourceSettings.transform.uniformScale).toBeCloseTo(p.sourceSettings.transform.uniformScale * 1.5);
    byId(g.grips, "turn-z").start(0)(30, true);
    expect(next.sourceSettings.transform.rotation).toEqual([0, 0, 30]);
    const sized = { ...p, sourceSettings: { ...p.sourceSettings, targetSize: { axis: "height" as const, value: 200 } } };
    let n2 = sized;
    scale(parametricGrips(sized, (f) => { n2 = structuredClone(sized); f(n2); }, "mm"), F(100, 100, 100), F(0.5));
    expect(n2.sourceSettings.targetSize!.value).toBe(100);
  });
});
