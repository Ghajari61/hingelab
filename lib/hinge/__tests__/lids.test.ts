/**
 * Lids, doors and new box kinds: flip-top lids (and cabinets made from them), cap lids, stepped
 * lids, clear windows, base openings, hanging holes and chests of drawers.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layerContent, layoutParts } from "../index";
import type { Model, Params, PlatePart, Point, WallPart } from "../types";
import { coreDistance } from "../lidSlot";
import { hingeRequestError } from "@/lib/billing/validate";
import { hingeIssues } from "@/lib/issues/hinge";
import { hingeForm } from "@/lib/desktop/products";
import { buildHingeScene } from "@/lib/hinge3d/scene";
import { sceneSVG } from "@/components/editor/scene3d";
import { HINGE_PRESETS, hingePresetParams, randomHingeBox } from "../presets";

const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), over);
function model(over: Partial<Params> = {}): Model {
  const m = computeModel(box(over));
  if ("error" in m) throw new Error(m.error);
  return m;
}
const plate = (m: Model, name: string) => m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === name);
const walls = (m: Model, prefix = "WALL") => m.parts.filter((q): q is WallPart => q.kind === "wall" && q.name.startsWith(prefix));
const dot = (q: Point, a: Point) => q[0] * a[0] + q[1] * a[1];
const centre = (poly: Point[]): Point => [poly.reduce((s, q) => s + q[0], 0) / poly.length, poly.reduce((s, q) => s + q[1], 0) / poly.length];
const span = (poly: Point[], i: 0 | 1) => Math.max(...poly.map((q) => q[i])) - Math.min(...poly.map((q) => q[i]));
/** Wall tabs on the top edge: outline points above y = 0. */
const topTabs = (w: WallPart) => w.outline.filter((q) => q[1] < -w.hBody * 0.01).length;

describe("flip-top lid", () => {
  it("cuts a hinge band across the lid near the back and keeps only the back tabs", () => {
    const m = model({ lid: "flip" });
    const lid = plate(m, "LID")!, base = plate(m, "BASE")!;
    expect(m.flip).toBeDefined();
    const f = m.flip!;
    expect(f.a).toEqual([0, -1]);
    // The band runs between the flap and the fixed strip, on the back half of the lid.
    expect(f.to).toBeGreaterThan(f.from);
    expect(f.from).toBeGreaterThan(-DEFAULTS.D / 2);
    expect(lid.hinge!.length).toBeGreaterThan(20);
    // Every slot of the band lies inside it (the hinge layer), every tab slot behind it.
    for (const s of lid.hinge!) for (const q of s) expect(dot(q, f.a)).toBeGreaterThan(f.from - 2);
    expect(lid.slots.length).toBeGreaterThan(0);
    expect(lid.slots.length).toBeLessThan(base.slots.length);
    for (const s of lid.slots) expect(dot(centre(s), f.a)).toBeGreaterThan(f.to);
    // The wall carries just those tabs up into the lid.
    expect(topTabs(walls(m)[0])).toBe(2 * lid.slots.length);
    // Opens past a right angle with the automatic band.
    expect(f.angle).toBeGreaterThan(100);
    expect(f.angle).toBeLessThanOrEqual(180);
  });

  it("draws the band on the hinge layer: slots, or single lines for the line cut style", () => {
    const p = box({ lid: "flip" }), m = model(p), lay = layoutParts(m.parts, p.bedW, p.gap);
    const plain = model({ lid: "fixed" }), playP = box({ lid: "fixed" });
    const n = layerContent(m, lay, p).hinge.length, n0 = layerContent(plain, layoutParts(plain.parts, playP.bedW, playP.gap), playP).hinge.length;
    expect(n - n0).toBe(plate(m, "LID")!.hinge!.length);
    const line = model({ lid: "flip", cutStyle: "line" });
    expect(plate(line, "LID")!.hingeLines!.length).toBeGreaterThan(20);
    expect(plate(line, "LID")!.hinge).toEqual([]);
    const svg = exportSVG(line, layoutParts(line.parts, 600, 5), box({ lid: "flip", cutStyle: "line" }));
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it("puts a finger hole near the free edge and the label on the flap", () => {
    const m = model({ lid: "flip", lidHole: "finger" });
    const lid = plate(m, "LID")!, hole = lid.slots[lid.slots.length - 1];
    expect(span(hole, 0)).toBeCloseTo(22 - DEFAULTS.K, 1);
    expect(centre(hole)[1]).toBeGreaterThan(15);
    expect(lid.labelAt![1]).toBeGreaterThan(0);
  });

  it("hinges on any side; on the left it is a cabinet door", () => {
    const m = model({ lid: "flip", flipSide: "left", W: 160, D: 220, H: 120, R: 20, upright: true });
    expect(m.flip!.a).toEqual([-1, 0]);
    for (const s of plate(m, "LID")!.slots) expect(centre(s)[0]).toBeLessThan(-60);
  });

  it("keeps a rim opening and its window on the flap", () => {
    const m = model({ lid: "flip", lidHole: "rim", lidWindow: true });
    const f = m.flip!, lid = plate(m, "LID")!, win = plate(m, "WINDOW")!;
    const opening = lid.slots[lid.slots.length - 1];
    for (const q of opening) expect(dot(q, f.a)).toBeLessThanOrEqual(f.from - 3 + 1e-6);
    expect(win.clear).toBe(true);
    for (const q of win.pts!) expect(dot(q, f.a)).toBeLessThanOrEqual(f.from - 1 + 1e-6);
  });

  it("cuts a honeycomb box's band with plain slots that never touch", () => {
    const m = model({ lid: "flip", pattern: "honeycomb", slotW: 9.3, pitch: 5.4, W: 300, D: 300, H: 120, R: 30 });
    const slots = plate(m, "LID")!.hinge!;
    expect(slots.length).toBeGreaterThan(10);
    // Each slot is a standard 0.8 mm slot, well under the band's 2.5 mm spacing.
    for (const sl of slots) expect(span(sl, 1)).toBeLessThan(1);
    expect("error" in computeModel(box({ lid: "flip", pattern: "honeycomb", slotW: 3, pitch: 2 }))).toBe(false);
  });

  it("takes the kerf across each slot's own sides, whichever way the band runs", () => {
    const back = plate(model({ lid: "flip", K: 0.1, Ky: 0.3 }), "LID")!.hinge![0];
    const left = plate(model({ lid: "flip", flipSide: "left", K: 0.1, Ky: 0.3 }), "LID")!.hinge![0];
    // Back hinge: slots run along x, so their width (along y) loses the y kerf; left hinge: the x kerf.
    expect(span(back, 1)).toBeCloseTo(DEFAULTS.slotW - 0.3, 6);
    expect(span(left, 0)).toBeCloseTo(DEFAULTS.slotW - 0.1, 6);
  });

  it("refuses a lid too narrow for the hinge, and offers a fix", () => {
    const r = computeModel(box({ lid: "flip", D: 40, H: 40, R: 12 }));
    expect("error" in r && r.error).toMatch(/too narrow for a flip hinge/);
    const fixes = hingeIssues(box({ lid: "flip", D: 40, H: 40, R: 12 }))[0].fixes;
    expect(fixes.some((x) => x.id === "flip-side")).toBe(true);
  });

  it("warns when a hand-set band is too narrow to open, with the automatic width as the fix", () => {
    const p = box({ lid: "flip", flipBand: 8 });
    const issue = hingeIssues(p).find((i) => i.code === "FLIP_ANGLE")!;
    expect(issue).toBeDefined();
    const fixed = issue.fixes.find((x) => x.id === "flip-auto")!.apply(p);
    expect(fixed.flipBand).toBeUndefined();
    expect(hingeIssues(fixed).some((i) => i.code === "FLIP_ANGLE")).toBe(false);
  });
});

describe("every lid on every shape", () => {
  const shapes: Partial<Params>[] = [
    { shape: "rect", W: 160, D: 120, H: 80, R: 24 }, { shape: "pill", W: 180, D: 90, H: 70 },
    { shape: "poly", sides: 6, W: 150, R: 16, H: 70 }, { shape: "poly", sides: 8, W: 150, R: 14, H: 70 }, { shape: "cyl", dia: 140, H: 80 },
  ];
  it("hinges a flip lid on each side, opening past a right angle", () => {
    for (const s of shapes) for (const flipSide of ["back", "left", "right", "front"] as const) {
      const m = model({ ...s, lid: "flip", flipSide, lidHole: "finger" });
      expect(m.flip!.angle, `${s.shape}${s.sides ?? ""}/${flipSide}`).toBeGreaterThan(100);
      expect(plate(m, "LID")!.slots.length).toBeGreaterThan(0);
    }
  });
  it("builds a cap and two steps on fixed, lift-off and cap lids", () => {
    for (const s of shapes) for (const lid of ["cap", "fixed", "removable"] as const) {
      const m = model({ ...s, lid, lidSteps: 2, lidHole: "knob" });
      const prefix = lid === "cap" ? "CAP" : "LID";
      expect(plate(m, `${prefix} STEP 2`), `${s.shape}${s.sides ?? ""}/${lid}`).toBeDefined();
      expect(m.issues.filter((i) => i.lvl === "warn").map((i) => i.msg)).toEqual([]);
    }
  });
});

describe("cap lid", () => {
  it("is a shallow box of its own, just outside the walls", () => {
    const p = box({ lid: "cap", capH: 35, lidHole: "finger" }), m = model(p);
    const top = plate(m, "CAP TOP")!, base = plate(m, "BASE")!;
    const grow = 2 * (p.T + p.lidGap);
    expect(top.bbox.x1 - top.bbox.x0).toBeCloseTo(base.bbox.x1 - base.bbox.x0 + grow, 6);
    const cw = walls(m, "CAP WALL");
    expect(cw.length).toBe(1);
    expect(cw[0].hBody).toBeCloseTo(35 - p.T, 9);
    expect(cw[0].hs).toBeDefined();
    // The box's own walls are as tall as under a lift-off lid; the cap top has the finger hole.
    expect(walls(m)[0].hBody).toBeCloseTo(p.H - 2 * p.T, 9);
    expect(top.hole).toBe(11);
    expect(m.cap!.H).toBe(35);
    expect(plate(m, "LID")).toBeUndefined();
  });

  it("fits its own lattice to short walls, and refuses a cap taller than the box", () => {
    const m = model({ lid: "cap", capH: 22 });
    const cw = walls(m, "CAP WALL")[0];
    if (cw.lattice) expect(m.issues.some((i) => /cap's walls are shorter/.test(i.msg))).toBe(true);
    const r = computeModel(box({ lid: "cap", capH: 200 }));
    expect("error" in r && r.error).toMatch(/taller than the box/);
  });

  it("works on a cylinder, with round steps", () => {
    const m = model({ shape: "cyl", dia: 140, H: 110, lid: "cap", capH: 35, lidSteps: 2, lidHole: "knob" });
    const s1 = plate(m, "CAP STEP 1")!, s2 = plate(m, "CAP STEP 2")!;
    const w1 = s1.bbox.x1 - s1.bbox.x0, h1 = s1.bbox.y1 - s1.bbox.y0;
    expect(w1).toBeCloseTo(h1, 3);
    expect(w1 - (s2.bbox.x1 - s2.bbox.x0)).toBeCloseTo(12, 3);
    expect(s1.slots).toHaveLength(1);
  });
});

describe("stepped lid and window", () => {
  it("stacks smaller plates on a lift-off lid, with the knob hole through them", () => {
    const m = model({ lidSteps: 2, lidStepIn: 7, lidHole: "knob", lidOver: 3 });
    const lid = plate(m, "LID")!, s1 = plate(m, "LID STEP 1")!, s2 = plate(m, "LID STEP 2")!;
    const w = (q: PlatePart) => q.bbox.x1 - q.bbox.x0;
    expect(w(lid) - w(s1)).toBeCloseTo(14, 6);
    expect(w(s1) - w(s2)).toBeCloseTo(14, 6);
    expect(s1.slots).toHaveLength(1);
  });

  it("leaves steps out when they would cover a lid pattern, or do not fit", () => {
    const fret = model({ lidSteps: 1, fret: "lattice" });
    expect(plate(fret, "LID STEP 1")).toBeUndefined();
    expect(fret.issues.some((i) => /cover the lid's cut-out pattern/.test(i.msg))).toBe(true);
    const small = model({ W: 60, D: 50, H: 40, R: 10, lidSteps: 3, lidStepIn: 12 });
    expect(small.issues.some((i) => /lid steps fit/.test(i.msg))).toBe(true);
  });

  it("puts a clear window between a rim lid and its lip", () => {
    const p = box({ lidHole: "rim", lidWindow: true }), m = model(p);
    const win = plate(m, "WINDOW")!, lip = plate(m, "LID LIP")!;
    expect(win.clear).toBe(true);
    expect(win.bbox.x1 - win.bbox.x0).toBeLessThanOrEqual(lip.bbox.x1 - lip.bbox.x0 + 1e-6);
    const opening = plate(m, "LID")!.slots.at(-1)!;
    expect(win.bbox.x1 - win.bbox.x0).toBeGreaterThan(span(opening, 0) + 4);
    expect(plate(model({ lidWindow: true }), "WINDOW")).toBeUndefined();
  });
});

describe("base openings and hanging holes", () => {
  it("cuts a round hole or an open bottom in the base", () => {
    const plain = plate(model({ lid: "open" }), "BASE")!;
    const hole = plate(model({ lid: "open", baseHole: "hole", baseHoleD: 12 }), "BASE")!;
    expect(hole.slots).toHaveLength(plain.slots.length + 1);
    expect(span(hole.slots.at(-1)!, 0)).toBeCloseTo(12 - DEFAULTS.K, 1);
    const open = plate(model({ lid: "open", baseHole: "rim", baseHoleW: 14 }), "BASE")!;
    expect(span(open.slots.at(-1)!, 0)).toBeCloseTo(DEFAULTS.W - 28 - DEFAULTS.K, 6);
  });

  it("keeps the base for dividers and leaves the text off a base with a hole", () => {
    const m = model({ lid: "open", baseHole: "rim", divX: 1 });
    expect(m.issues.some((i) => /open bottom was left out/.test(i.msg))).toBe(true);
    const t = model({ lid: "open", baseHole: "hole", baseText: "Hi" });
    expect(plate(t, "BASE")!.noText).toBe(true);
  });

  it("adds two keyholes near the top of the base, inside the walls", () => {
    const m = model({ hangHoles: true }), base = plate(m, "BASE")!;
    const plain = plate(model(), "BASE")!;
    const keys = base.slots.slice(plain.slots.length);
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      expect(centre(k)[1]).toBeLessThan(0);
      for (const q of k) expect(coreDistance(m.core.edges, q)).toBeLessThanOrEqual(m.R - DEFAULTS.T);
    }
    expect(Math.sign(centre(keys[0])[0])).toBe(-Math.sign(centre(keys[1])[0]));
  });
});

describe("chest of drawers", () => {
  const chest: Partial<Params> = { drawers: 3, W: 180, D: 200, H: 140, R: 16, slit: 40, bridge: 2, split: 2, fit: { mode: "auto", sheets: 1 } };

  it("is an open-fronted case with shelves and a drawer in each bay", () => {
    const m = model(chest);
    expect(m.dividers!.filter((d) => d.axis === "y")).toHaveLength(2);
    expect(plate(m, "LID")).toBeUndefined();
    expect(m.drawerPlaces).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      expect(plate(m, `DRAWER ${n} BASE`)).toBeDefined();
      expect(plate(m, `DRAWER ${n} FRONT`)!.hole).toBe(2.5);
      expect(walls(m, `DRAWER ${n} WALL`).length).toBeGreaterThan(0);
    }
    const inner = m.R - DEFAULTS.T;
    for (const d of m.drawerPlaces!) {
      // A drawer reaches from the back to the front of the case, and its square corners clear the wall.
      expect(d.d).toBeCloseTo(m.hBody - 1.5, 0);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) expect(coreDistance(m.core.edges, [sx * d.w / 2, d.cy + sy * d.h / 2])).toBeLessThanOrEqual(inner);
    }
    expect(hingeIssues(box(chest)).filter((i) => i.level !== "info")).toEqual([]);
  });

  it("needs a rounded or pill case", () => {
    const m = model({ ...chest, shape: "poly", sides: 6, W: 180 });
    expect(m.drawerPlaces).toBeUndefined();
    expect(m.issues.some((i) => /Drawers need/.test(i.msg))).toBe(true);
  });

  it("leaves out drawers that a pill's round end has no room for, with a note", () => {
    const m = model({ shape: "pill", W: 120, D: 300, H: 150, drawers: 3, slit: 40, bridge: 2 });
    expect(m.issues.some((i) => /round end/.test(i.msg))).toBe(true);
    expect(m.drawerPlaces?.length ?? 0).toBeLessThan(3);
    const wide = model({ shape: "pill", W: 300, D: 160, H: 150, drawers: 2, slit: 40, bridge: 2 });
    expect(wide.drawerPlaces).toHaveLength(2);
  });

  it("makes one drawer with a finger hole", () => {
    const m = model({ drawers: 1, W: 160, D: 90, H: 120, R: 16, drawerPull: "finger", slit: 40, bridge: 2 });
    expect(m.drawerPlaces).toHaveLength(1);
    expect(plate(m, "DRAWER 1 FRONT")!.hole).toBe(11);
  });
});

describe("the rest of the app knows the new settings", () => {
  it("the server accepts them and refuses bad values", () => {
    const ok = box({ lid: "flip", flipSide: "left", flipBand: 30, lidSteps: 2, lidStepIn: 6, lidWindow: true, lidHole: "lamp", baseHole: "rim", baseHoleW: 12, hangHoles: true, upright: true });
    expect(hingeRequestError(ok)).toBeNull();
    expect(hingeRequestError(box({ lid: "cap", capH: 40, drawers: 2, drawerPull: "finger" }))).toBeNull();
    expect(hingeRequestError(box({ flipSide: "up" as never }))).toMatch(/flipSide/);
    expect(hingeRequestError(box({ baseHole: "huge" as never }))).toMatch(/baseHole/);
    expect(hingeRequestError(box({ drawers: 9 }))).toMatch(/drawers/);
    expect(hingeRequestError(box({ upright: "yes" as never }))).toMatch(/upright/);
  });

  it("the desktop form shows each setting only where it applies", () => {
    expect(hingeForm(box()).hidden).toEqual(expect.arrayContaining(["flipSide", "flipBand", "capH", "lidWindow", "baseHoleD", "baseHoleW", "drawerPull"]));
    const flip = hingeForm(box({ lid: "flip" }));
    expect(flip.hidden).not.toContain("flipSide");
    expect(flip.values?.flipBand).toBeGreaterThan(10);
    expect(hingeForm(box({ lid: "cap" })).values?.capH).toBe(28);
    expect(hingeForm(box({ drawers: 2 })).hiddenSections).toContain("secLid");
  });

  it("draws every new kind in 3D and as a picture", () => {
    const cases: Partial<Params>[] = [
      { lid: "flip", lidHole: "finger" }, { lid: "flip", flipSide: "left", upright: true, divY: 2 }, { lid: "cap", capH: 30 },
      { lidSteps: 2 }, { lidHole: "rim", lidWindow: true }, { lid: "open", baseHole: "hole" }, { drawers: 2, W: 180, D: 160, H: 150, R: 16, slit: 40, bridge: 2 },
    ];
    for (const c of cases) {
      const p = box(c), m = model(c);
      const sc = buildHingeScene(m, p, 0.5);
      expect(sc.size.every((v) => Number.isFinite(v) && v > 0), JSON.stringify(c)).toBe(true);
      sc.dispose();
      const svg = sceneSVG(m, p, -0.6, 0.35);
      expect(svg).not.toMatch(/NaN|Infinity/);
      expect(svg.length).toBeLessThan(60_000);
    }
    // Only the lid's opening is glass, not the base's hole.
    const gp = box({ lidHole: "rim", lidWindow: true, baseHole: "hole" });
    expect(sceneSVG(model(gp), gp, -0.6, 0.35).split("rgba(178,214,236,.78)").length - 1).toBe(1);
    // Stood up, a cabinet is as tall as its depth; a flip lid swings up as the view explodes.
    const cab = box({ lid: "flip", flipSide: "left", W: 160, D: 220, H: 120, R: 20, upright: true });
    expect(buildHingeScene(model(cab), cab).size[1]).toBeCloseTo(220 + DEFAULTS.K, 0);
    const fl = box({ lid: "flip" });
    const closed = buildHingeScene(model(fl), fl).size[1], open = buildHingeScene(model(fl), fl, 1).size[1];
    expect(open).toBeGreaterThan(closed + 20);
    const flap = buildHingeScene(model(fl), fl, 1).group.getObjectByName("lid flap") as THREE.Mesh;
    expect(flap).toBeDefined();
  });

  it("every new preset opens clean and every box idea builds", () => {
    for (const id of ["flip-top-box", "mini-cabinet", "wall-cabinet", "display-cabinet", "desk-drawers", "jewel-chest", "shoebox", "hat-box", "stepped-jewel", "display-box", "pendant-shade", "table-lamp", "drain-planter"]) {
      const pr = HINGE_PRESETS.find((x) => x.id === id);
      expect(pr, id).toBeDefined();
      expect(hingeIssues(hingePresetParams(pr!.params)).filter((i) => i.level !== "info").map((i) => i.message), id).toEqual([]);
    }
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const q = randomHingeBox(box(), "pro", rnd);
      expect("error" in computeModel(q)).toBe(false);
      kinds.add(q.lid + (q.drawers ? "+drawers" : ""));
    }
    expect(kinds.has("flip")).toBe(true);
    expect(kinds.has("cap")).toBe(true);
  });
});
