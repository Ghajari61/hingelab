import { describe, expect, it } from "vitest";
import { axisDrag, clampStep, lenText, numberGrip, sizeGrips, snapDrag, turnDrag, type Grip } from "../grips";
import { hingeGrips } from "@/lib/hinge3d/grips";
import { DEFAULTS } from "@/lib/hinge/defaults";
import type { Params } from "@/lib/hinge";
import { generatorGrips } from "@/lib/generators/grips3d";
import { BOXES } from "@/lib/generators/boxes";
import { BOXES_DEFAULTS, type BoxesParams } from "@/lib/generators/boxes/params";
import { CLOCK } from "@/lib/generators/clock";
import { CLOCK_DEFAULTS } from "@/lib/generators/clock/params";
import { TESTCARD } from "@/lib/generators/testcard";
import { TESTCARD_DEFAULTS } from "@/lib/generators/testcard/params";
import { letterGrips } from "@/lib/letters/grips";
import { LETTER_DEFAULTS } from "@/lib/letters/defaults";
import type { LetterParams } from "@/lib/letters";
import { assemblyGrips } from "@/lib/studio/assembly/grips";
import { parametricGrips } from "@/components/parametric/grips";
import { PARAMETRIC_DEFAULTS } from "@/lib/parametric";

const byId = (gs: Grip[], id: string) => {
  const g = gs.find((x) => x.id === id);
  if (!g) throw new Error(`no grip ${id} in ${gs.map((x) => x.id).join(", ")}`);
  return g;
};

describe("grip maths", () => {
  it("projects the pointer onto the axis as drawn on screen", () => {
    // 2 px per mm to the right: 20 px right is 10 mm, 20 px down is nothing.
    expect(axisDrag(20, 0, [2, 0])).toBeCloseTo(10);
    expect(axisDrag(0, 20, [2, 0])).toBeCloseTo(0);
    // An axis drawn up-right at 1 px per mm: moving along it counts fully.
    const u: [number, number] = [Math.SQRT1_2, -Math.SQRT1_2];
    expect(axisDrag(10 * u[0], 10 * u[1], u)).toBeCloseTo(10);
    expect(axisDrag(5, 5, [0, 0])).toBe(0);
  });

  it("measures turns counter-clockwise on screen, flipped when the axis points away", () => {
    const c: [number, number] = [100, 100];
    // From the right of the centre to above it (screen y down): a quarter turn counter-clockwise.
    expect(turnDrag(c, [150, 100], [100, 50], true)).toBeCloseTo(90);
    expect(turnDrag(c, [150, 100], [100, 50], false)).toBeCloseTo(-90);
    expect(turnDrag(c, [150, 100], [100, 150], true)).toBeCloseTo(-90);
    expect(turnDrag(c, [100, 100], [120, 100], true)).toBe(0);
  });

  it("snaps to whole mm and degrees, or 5 mm and 15° with Shift", () => {
    expect(snapDrag("size", 12.4, false)).toBe(12);
    expect(snapDrag("move", -7.6, true)).toBe(-10);
    expect(snapDrag("turn", 22, true)).toBe(15);
    expect(snapDrag("turn", 22.6, false)).toBe(23);
    expect(Object.is(snapDrag("size", -0.2, false), -0)).toBe(false);
  });

  it("clamps and steps values, and shows lengths in the editor's units", () => {
    expect(clampStep(7, 10, 100, 1)).toBe(10);
    expect(clampStep(123.456, 10, 500, 0.5)).toBe(123.5);
    expect(clampStep(999, 10, 500)).toBe(500);
    expect(lenText(120, "mm")).toBe("120 mm");
    expect(lenText(25.4, "in")).toBe("1.00 in");
  });

  it("puts size handles on both faces, and only the top for height", () => {
    const ids = sizeGrips(["x", "z", "y"], () => "").map((g) => g.id);
    expect(ids).toEqual(["size-x+", "size-x-", "size-z+", "size-z-", "size-y+"]);
  });

  it("a number grip applies v0 + k·d from where the drag started", () => {
    const seen: [number, boolean][] = [];
    const g = numberGrip("a", "size", "x", { v0: 50, min: 10, max: 60, k: 2, set: (v, done) => seen.push([v, done]), show: (v) => `${v}` });
    const drag = g.start(100);
    expect(drag(3, false)).toBe("56");
    expect(drag(30, false)).toBe("60");
    expect(drag(-100, true)).toBe("10");
    expect(seen).toEqual([[56, false], [60, false], [10, true]]);
  });
});

describe("Hinge Box handles", () => {
  const run = (p: Params, id: string, d: number) => {
    let out: Params | null = null, rec = false;
    byId(hingeGrips(p, (k, v, r) => { out = { ...p, [k]: v }; rec = r; }, "mm"), id).start(100)(d, true);
    return { p: out as unknown as Params, rec };
  };

  it("dragging a side face out widens the box; front or back sets the depth; the top the height", () => {
    const p = { ...DEFAULTS, shape: "rect" as const };
    expect(run(p, "size-x+", 12).p.W).toBe(p.W + 12);
    expect(run(p, "size-x-", -5).p.W).toBe(p.W - 5);
    expect(run(p, "size-z-", 8).p.D).toBe(p.D + 8);
    const top = run(p, "size-y+", 20);
    expect(top.p.H).toBe(p.H + 20);
    expect(top.rec).toBe(true);
    // Only the dragged size changes.
    expect({ ...top.p, H: p.H }).toEqual(p);
  });

  it("round boxes take the diameter, polygons the size across; never below the fields' minimum", () => {
    expect(run({ ...DEFAULTS, shape: "cyl" }, "size-z+", 10).p.dia).toBe(DEFAULTS.dia + 10);
    expect(run({ ...DEFAULTS, shape: "poly" }, "size-z+", 10).p.W).toBe(DEFAULTS.W + 10);
    expect(run(DEFAULTS, "size-x+", -10000).p.W).toBe(10);
  });

  it("reads out the setting in inches when the editor shows inches", () => {
    const g = byId(hingeGrips(DEFAULTS, () => {}, "in"), "size-y+");
    expect(g.start(100)(0, false)).toBe(`Height ${(DEFAULTS.H / 25.4).toFixed(2)} in`);
  });
});

describe("generator handles", () => {
  const box: BoxesParams = structuredClone(BOXES_DEFAULTS);

  it("Boxes: faces set the design's own width, depth and height within the fields' limits", () => {
    let out: BoxesParams | null = null;
    const gs = generatorGrips(BOXES, box, (q) => { out = q as BoxesParams; }, "mm", [140, 60, 80]);
    expect(gs.map((g) => g.id)).toContain("size-x--box.width");
    byId(gs, "size-x+-box.width").start(140)(15, true);
    expect(out!.box.width).toBe(box.box.width + 15);
    expect(out!.box.depth).toBe(box.box.depth);
    byId(gs, "size-z--box.depth").start(80)(10, false);
    expect(out!.box.depth).toBe(box.box.depth + 10);
    byId(gs, "size-y+-box.height").start(60)(-1000, true);
    const f = BOXES.sections.flatMap((s) => s.fields).find((x) => x.kind === "number" && x.key === "box.height") as { min: number };
    expect(out!.box.height).toBe(f.min);
  });

  it("Boxes: each design gets its own handles; the phone stand's ring sets its lean", () => {
    const ids = (design: BoxesParams["design"]) => generatorGrips(BOXES, { ...box, design }, () => {}, "mm", [1, 1, 1]).map((g) => g.id);
    expect(ids("tray")).toContain("size-z+-tray.depth");
    expect(ids("hex").filter((x) => x.endsWith("hex.width"))).toHaveLength(4);
    expect(ids("frame")).toEqual(["size-x+-frame.photoW", "size-x--frame.photoW", "size-y+-frame.photoH"]);
    expect(ids("keys")).toContain("size-z+-keys.reach");
    expect(ids("keys")).not.toContain("size-z--keys.reach");
    let out: BoxesParams | null = null;
    const turn = byId(generatorGrips(BOXES, { ...box, design: "stand" }, (q) => { out = q as BoxesParams; }, "mm", null), "turn-x+-stand.angle");
    expect(turn.start(0)(7, true)).toBe(`Lean ${box.stand.angle + 7}°`);
    expect(out!.stand.angle).toBe(box.stand.angle + 7);
  });

  it("designs without their own handles are sized as a whole, but not through their thickness", () => {
    let out: typeof CLOCK_DEFAULTS | null = null;
    const p = structuredClone(CLOCK_DEFAULTS);
    const gs = generatorGrips(CLOCK, p, (q) => { out = q as typeof CLOCK_DEFAULTS; }, "mm", [300, 3, 300]);
    expect(gs.map((g) => g.id)).toEqual(["size-x+", "size-x-", "size-z+", "size-z-"]);
    expect(byId(gs, "size-x+").start(300)(30, true)).toBe("Width 330 mm");
    expect(out).toEqual(CLOCK.scale!(p, 1.1));
    // Test cards keep their size: no handles.
    expect(generatorGrips(TESTCARD, structuredClone(TESTCARD_DEFAULTS), () => {}, "mm", [100, 3, 60])).toEqual([]);
  });
});

describe("Letters, Studio and Parametric handles", () => {
  it("Letters: a face scales the text size with the drag; the top sets a box's depth", () => {
    let out: LetterParams | null = null;
    const p: LetterParams = { ...structuredClone(LETTER_DEFAULTS), mode: "box", size: 100, depth: 50 };
    const gs = letterGrips(p, (q) => { out = q; }, "mm");
    byId(gs, "size-x+").start(400)(100, true);
    expect(out!.size).toBe(125);
    byId(gs, "size-y+").start(50)(20, true);
    expect(out!.depth).toBe(70);
    expect(letterGrips({ ...p, mode: "solid" }, () => {}, "mm").some((g) => g.axis === "y")).toBe(false);
  });

  it("Studio: arrows move a part along the views' axes in the assembly's frame; rings turn it by quarter turns", () => {
    const calls: { patch: { move?: number[]; turn?: number[] }; tag: string }[] = [];
    const gs = assemblyGrips([0, 0, 5], [0, 0, 270], (patch, tag) => calls.push({ patch, tag }), "mm");
    const up = byId(gs, "move-y").start(0);
    up(10, false);
    up(12, true);
    expect(calls.map((c) => c.patch.move)).toEqual([[0, 0, 15], [0, 0, 17]]);
    // One drag, one tag: the edits merge into one undo step.
    expect(calls[0].tag).toBe(calls[1].tag);
    byId(gs, "move-z").start(0)(4, true);
    expect(calls[2].patch.move).toEqual([0, -4, 5]);
    expect(calls[2].tag).not.toBe(calls[0].tag);
    expect(byId(gs, "turn-y").start(0)(100, true)).toBe("Turn Y 90°");
    expect(calls[3].patch.turn).toEqual([0, 0, 0]);
    byId(gs, "turn-z").start(0)(-80, true);
    expect(calls[4].patch.turn).toEqual([0, 90, 270]);
  });

  it("Parametric: a face scales the model (or its set size); a ring turns it", () => {
    const p = structuredClone(PARAMETRIC_DEFAULTS);
    let next = p;
    const edit = (f: (q: typeof p) => void) => { next = structuredClone(p); f(next); };
    const gs = parametricGrips(p, edit, "mm");
    byId(gs, "size-y+").start(200)(100, true);
    expect(next.sourceSettings.transform.uniformScale).toBeCloseTo(p.sourceSettings.transform.uniformScale * 1.5);
    byId(gs, "turn-z").start(0)(30, true);
    expect(next.sourceSettings.transform.rotation).toEqual([0, 0, 30]);
    const sized = { ...p, sourceSettings: { ...p.sourceSettings, targetSize: { axis: "height" as const, value: 200 } } };
    let n2 = sized;
    byId(parametricGrips(sized, (f) => { n2 = structuredClone(sized); f(n2); }, "mm"), "size-x-").start(100)(-50, true);
    expect(n2.sourceSettings.targetSize!.value).toBe(100);
  });
});
