import { describe, expect, it } from "vitest";
import { clipToSvg, copyNodes } from "../clipboard";
import { bindingsFor, COMMAND_BY_ID, MENUS, type MenuEntry } from "../commands";
import { createDocument } from "../doc";
import { apply, cubicAt, flatten, nodeBasePaths, nodePaths, polygonArea, segments } from "../geom";
import { commit, emptyHistory, redo, undo } from "../history";
import { applyEffects, createEffect, EFFECT_KINDS, EFFECTS } from "../effects";
import { applyCorners } from "../effects/corners";
import { applyMirror, applyRotateCopies, mirrorMatrix } from "../effects/copies";
import { applyHatches } from "../effects/hatches";
import { applyLivingHinge, livingHingeAnalysis } from "../effects/livingHinge";
import { applyOffset } from "../effects/offset";
import { addEffect, duplicateEffect, moveEffect, removeEffect, resetEffect, setEffectEnabled, setEffectParams } from "../effects/ops";
import { duplicateNodes, expandNodes, findNode } from "../scene";
import type { CornersParams, Document, HatchParams, LiveEffect, LivingHingeParams, MirrorParams, PathNode, RotateCopiesParams, SceneNode, ShapeNode, Subpath } from "../types";

let seq = 0;
const id = () => `n${++seq}`;
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const rect = (x: number, y: number, w: number, h: number): Subpath => ({
  closed: true, nodes: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }],
});
/** 20 × 10 mm rectangle centred on the origin. */
const R20 = () => rect(-10, -5, 20, 10);
const area = (subs: Subpath[], tol = 1e-5) => Math.abs(subs.filter((s) => s.closed).reduce((a, s) => a + polygonArea(flatten(s, tol)), 0));
const path = (subs: Subpath[], effects?: LiveEffect[]): PathNode => ({ id: id(), type: "path", transform: [1, 0, 0, 1, 50, 40], layer: 0, subpaths: subs, ...(effects ? { effects } : {}) });
const fx = <K extends LiveEffect["kind"]>(kind: K, params: Partial<Extract<LiveEffect, { kind: K }>["params"]>, base: Subpath[] = [R20()]): LiveEffect =>
  ({ id: id(), kind, enabled: true, params: { ...EFFECTS[kind].defaults(base), ...params } }) as unknown as LiveEffect;
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const roundTrip = (d: Document, label: string, recipe: (d: Document) => unknown) => {
  const before = JSON.stringify(d);
  const c = commit(d, emptyHistory(), label, (x) => { recipe(x); });
  expect(c.changed).toBe(true);
  const after = JSON.stringify(c.doc);
  const u = undo(c.doc, c.history);
  expect(JSON.stringify(u.doc)).toBe(before);
  const r = redo(u.doc, u.history);
  expect(JSON.stringify(r.doc)).toBe(after);
  return c.doc;
};
const corners = (p: Partial<CornersParams>): CornersParams => ({ mode: "fillet", radius: 2, ...p });
const hatch = (p: Partial<HatchParams>): HatchParams => ({ angle: 0, spacing: 1, phase: 0, cross: false, inset: 0, keepOutline: false, ...p });

describe("Corners", () => {
  it("a 2 mm fillet on a 20 × 10 rectangle: circular arcs of radius 2 and area 200 − (4 − π)·4", () => {
    const [s] = applyCorners([R20()], corners({ mode: "fillet", radius: 2 }));
    const centres = [{ x: -8, y: -3 }, { x: 8, y: -3 }, { x: 8, y: 3 }, { x: -8, y: 3 }];
    const curved = segments(s).filter((g) => !g.line);
    expect(curved).toHaveLength(8);
    for (const g of curved) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p = cubicAt(g, t);
        const r = Math.min(...centres.map((c) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - 2)));
        expect(r).toBeLessThanOrEqual(0.01);
      }
    }
    close(area([s]), 200 - (4 - Math.PI) * 4, 1e-3);
  });

  it("a 2 mm chamfer cuts four 2 × 2 triangles: area 200 − 4·2", () => {
    const [s] = applyCorners([R20()], corners({ mode: "chamfer", radius: 2 }));
    expect(s.nodes).toHaveLength(8);
    close(area([s]), 200 - 4 * 2, 1e-6);
  });

  it("inverse fillet and inverse chamfer notch the corners (quarter discs, squares)", () => {
    close(area(applyCorners([R20()], corners({ mode: "inverseFillet", radius: 2 }))), 200 - Math.PI * 4, 1e-3);
    close(area(applyCorners([R20()], corners({ mode: "inverseChamfer", radius: 2 }))), 200 - 4 * 4, 1e-6);
  });

  it("only the picked corners change; curved corners and open ends are left alone", () => {
    const [s] = applyCorners([R20()], corners({ mode: "chamfer", radius: 2, nodes: [[1]] }));
    expect(s.nodes).toHaveLength(5);
    close(area([s]), 198, 1e-6);
    const open: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    const [o] = applyCorners([open], corners({ mode: "chamfer", radius: 1 }));
    const want = [[0, 0], [9, 0], [10, 1], [10, 10]];
    expect(o.nodes).toHaveLength(4);
    o.nodes.forEach((a, k) => { close(a.x, want[k][0], 1e-12); close(a.y, want[k][1], 1e-12); });
    const curvy: Subpath = { closed: false, nodes: [{ x: 0, y: 0, o: { x: 3, y: 3 } }, { x: 10, y: 0, i: { x: 7, y: 3 } }, { x: 10, y: 10 }] };
    expect(applyCorners([curvy], corners({ radius: 1 }))[0].nodes).toHaveLength(3);
  });

  it("the radius is limited to half of each neighbouring segment", () => {
    const [s] = applyCorners([rect(0, 0, 4, 4)], corners({ mode: "chamfer", radius: 5 }));
    expect(s.nodes).toHaveLength(4);
    close(area([s]), 8, 1e-6);
  });
});

describe("Offset", () => {
  it("a 2 mm mitred offset of a 20 × 10 rectangle is 24 × 14", () => {
    const out = applyOffset([R20()], { distance: 2, join: "miter", miterLimit: 4 });
    close(area(out), 24 * 14, 1e-6);
    const xs = out[0].nodes.map((a) => a.x), ys = out[0].nodes.map((a) => a.y);
    close(Math.min(...xs), -12, 1e-6); close(Math.max(...ys), 7, 1e-6);
  });

  it("round joins keep every point 2 mm from the rectangle; a negative distance shrinks it", () => {
    const out = applyOffset([R20()], { distance: 2, join: "round", miterLimit: 4 });
    const toRect = (x: number, y: number) => Math.hypot(Math.max(0, Math.abs(x) - 10), Math.max(0, Math.abs(y) - 5));
    for (const a of out[0].nodes) close(toRect(a.x, a.y), 2, 0.01);
    close(area(out), 200 + 2 * 30 * 2 + Math.PI * 4, 0.05);
    close(area(applyOffset([R20()], { distance: -1, join: "miter", miterLimit: 4 })), 18 * 8, 1e-6);
  });
});

describe("Hatches", () => {
  it("angle 0, spacing 1 on a 20 × 10 rectangle: 10 lines 1 mm apart, half a spacing in from the edges", () => {
    const out = applyHatches([R20()], hatch({}));
    expect(out).toHaveLength(10);
    const ys = out.map((s) => s.nodes[0].y);
    expect(ys).toEqual([-4.5, -3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5, 4.5]);
    for (const s of out) {
      expect(s.closed).toBe(false);
      expect(s.nodes[0].y).toBe(s.nodes[1].y);
      expect([s.nodes[0].x, s.nodes[1].x].sort((a, b) => a - b)).toEqual([-10, 10]);
    }
    expect(out[0].nodes[0].x).toBe(-10);
    expect(out[1].nodes[0].x).toBe(10);
  });

  it("crosshatch adds the 90° set (20 more lines); keep outline adds the rectangle; phase shifts the lines", () => {
    expect(applyHatches([R20()], hatch({ cross: true }))).toHaveLength(30);
    const kept = applyHatches([R20()], hatch({ keepOutline: true }));
    expect(kept).toHaveLength(11);
    expect(kept[0].closed).toBe(true);
    expect(applyHatches([R20()], hatch({ phase: 0.25 })).map((s) => s.nodes[0].y)[0]).toBe(-4.25);
  });

  it("holes stay empty (even-odd) and the inset keeps lines away from the edge", () => {
    const out = applyHatches([R20(), rect(-2, -4, 4, 8)], hatch({}));
    // 10 lines; the 8 that cross the hole (|y| < 4) are split in two.
    expect(out).toHaveLength(18);
    for (const s of out) {
      const mx = (s.nodes[0].x + s.nodes[1].x) / 2, my = s.nodes[0].y;
      expect(Math.abs(mx) < 2 && Math.abs(my) < 4).toBe(false);
    }
    const inset = applyHatches([R20()], hatch({ inset: 1 }));
    expect(inset).toHaveLength(8);
    for (const s of inset) for (const a of s.nodes) expect(Math.abs(a.x)).toBeLessThanOrEqual(9 + 1e-9);
  });
});

describe("Rotate Copies", () => {
  const base = [rect(10, -1, 5, 2)];
  it("copy k is the path rotated by exactly 360·k/N about the centre", () => {
    const p: RotateCopiesParams = { count: 6, start: 15, cx: 2, cy: 3, fuse: false };
    const out = applyRotateCopies(base, p);
    expect(out).toHaveLength(6);
    for (let k = 0; k < 6; k++) {
      const a = (((15 + 60 * k) * Math.PI) / 180), v = base[0].nodes[2];
      const want = { x: 2 + (v.x - 2) * Math.cos(a) - (v.y - 3) * Math.sin(a), y: 3 + (v.x - 2) * Math.sin(a) + (v.y - 3) * Math.cos(a) };
      close(out[k].nodes[2].x, want.x, 1e-9); close(out[k].nodes[2].y, want.y, 1e-9);
    }
  });

  it("fused copies of a 20 × 2 bar (4-fold) make a plus of area 76", () => {
    const out = applyRotateCopies([rect(-10, -1, 20, 2)], { count: 4, start: 0, cx: 0, cy: 0, fuse: true });
    expect(out).toHaveLength(1);
    close(area(out), 2 * 40 - 4, 1e-6);
  });
});

describe("Mirror", () => {
  const sq = [rect(0, 0, 10, 10)];
  const mirror = (p: Partial<MirrorParams>): MirrorParams => ({ axis: "vertical", x: 10, y: 10, x1: 0, y1: 0, x2: 1, y2: 1, keepOriginal: true, fuse: false, ...p });
  it("reflects each anchor exactly across the axis", () => {
    const out = applyMirror(sq, mirror({ axis: "vertical", x: 12 }));
    expect(out).toHaveLength(2);
    expect(out[1].nodes.map((a) => [a.x, a.y])).toEqual([[24, 0], [14, 0], [14, 10], [24, 10]]);
    const h = applyMirror(sq, mirror({ axis: "horizontal", y: -1, keepOriginal: false }));
    expect(h).toHaveLength(1);
    expect(h[0].nodes[2]).toEqual({ x: 10, y: -12 });
    const m = mirrorMatrix(0, 0, 1, 1)!;
    const q = apply(m, { x: 3, y: 1 });
    close(q.x, 1, 1e-12); close(q.y, 3, 1e-12);
    const diag = applyMirror(sq, mirror({ axis: "line", x1: 0, y1: 0, x2: 2, y2: 2, keepOriginal: false }));
    close(diag[0].nodes[1].x, 0, 1e-12); close(diag[0].nodes[1].y, 10, 1e-12);
  });

  it("fuse unites the original and its overlapping mirror image (10 × 10 at x = 8: area 160)", () => {
    const out = applyMirror(sq, mirror({ axis: "vertical", x: 8, fuse: true }));
    expect(out).toHaveLength(1);
    close(area(out), 160, 1e-6);
  });
});

describe("Living Hinge", () => {
  const hinge = (p: Partial<LivingHingeParams>): LivingHingeParams => ({ ...(EFFECTS.livingHinge.defaults([]) as LivingHingeParams), ...p });
  it("fills a 60 × 40 rectangle less a 2 mm margin with the Hinge Box pattern: 31 single-line cuts, all inside", () => {
    const out = applyLivingHinge([rect(-30, -20, 60, 40)], hinge({ cutStyle: "line", margin: 2, keepOutline: true }));
    expect(out[0].closed).toBe(true);
    const cuts = out.slice(1);
    // 56 mm zone, 2.5 mm pitch: 21 columns; 36 mm high, 28 mm slits, 3 mm bridges: 11 closed columns × 1 cut + 10 open columns × 2.
    expect(cuts).toHaveLength(31);
    for (const s of cuts) {
      expect(s.closed).toBe(false);
      for (const a of s.nodes) {
        expect(Math.abs(a.x)).toBeLessThanOrEqual(28 + 1e-9);
        expect(Math.abs(a.y)).toBeLessThanOrEqual(18 + 1e-9);
      }
    }
    const a = livingHingeAnalysis([rect(-30, -20, 60, 40)], hinge({ cutStyle: "line", margin: 2 }))!;
    expect(a.columns).toBe(21);
    close(a.height, 36, 1e-9);
    expect(a.rMin).toBeGreaterThan(0);
  });

  it("slot style gives closed slots; angle 90 turns the cuts to run along x", () => {
    const slots = applyLivingHinge([rect(-30, -20, 60, 40)], hinge({ cutStyle: "slot", margin: 2, keepOutline: false }));
    expect(slots.length).toBe(31);
    expect(slots.every((s) => s.closed)).toBe(true);
    const turned = applyLivingHinge([rect(-20, -30, 40, 60)], hinge({ cutStyle: "line", margin: 2, angle: 90, keepOutline: false }));
    expect(turned).toHaveLength(31);
    for (const s of turned) close(s.nodes[0].y, s.nodes[s.nodes.length - 1].y, 1e-6);
  });
});

describe("Live Effects on nodes", () => {
  it("nodePaths shows the stack output in order, skips disabled effects and caches per node object", () => {
    const n = path([R20()], [fx("offset", { distance: 2, join: "miter" }), fx("hatches", { angle: 0, spacing: 1, keepOutline: true })]);
    const out = nodePaths(n);
    expect(out[0].closed).toBe(true);
    close(area([out[0]]), 24 * 14, 1e-6);
    expect(out.slice(1)).toHaveLength(14);
    expect(nodePaths(n)).toBe(out);
    expect(nodeBasePaths(n)).toBe(n.subpaths);
    const off = { ...n, effects: n.effects!.map((e, k) => (k === 0 ? { ...e, enabled: false } : e)) };
    expect(nodePaths(off).slice(1)).toHaveLength(10);
  });

  it("a shape keeps its live geometry; the effect applies to its outline", () => {
    const s: ShapeNode = { id: id(), type: "shape", transform: [1, 0, 0, 1, 0, 0], layer: 0, shape: { kind: "rect", w: 20, h: 10, r: [0, 0, 0, 0], corner: "round" }, effects: [fx("corners", { mode: "chamfer", radius: 2 })] };
    close(area(nodePaths(s)), 192, 1e-6);
    close(area(nodeBasePaths(s)), 200, 1e-6);
  });

  it("an unknown or failing effect passes its input on", () => {
    const bad = { id: "x", kind: "nope", enabled: true, params: {} } as unknown as LiveEffect;
    const subs = [R20()];
    expect(applyEffects(subs, [bad], path(subs))).toBe(subs);
  });

  it("every kind has defaults, a label and keywords, and produces geometry on a rectangle", () => {
    for (const k of EFFECT_KINDS) {
      const e = createEffect(k, [R20()], () => "e");
      expect(e.kind).toBe(k);
      expect(EFFECTS[k].label.length).toBeGreaterThan(0);
      expect(EFFECTS[k].keywords.length).toBeGreaterThan(0);
      expect(applyEffects([R20()], [e], path([R20()])).length).toBeGreaterThan(0);
    }
  });

  it("exported SVG carries the effect output (hatch lines)", () => {
    const n = path([R20()], [fx("hatches", { angle: 0, spacing: 1, keepOutline: true })]);
    const d = docWith(n);
    const svg = clipToSvg(d, copyNodes(d, [n.id]));
    const data = /<path d="([^"]+)"/.exec(svg)![1];
    expect(data.match(/M/g)).toHaveLength(11);
    expect(data).toContain("M40 35.5L60 35.5");
  });

  it("Expand bakes the effects into a plain path; editing helpers keep them live", () => {
    const n = path([R20()], [fx("corners", { mode: "chamfer", radius: 2 })]);
    const d = docWith(n);
    const after = roundTrip(d, "Expand", (x) => { expect(expandNodes(x, [n.id])).toEqual([n.id]); });
    const p = findNode(after.root, n.id) as PathNode;
    expect(p.effects).toBeUndefined();
    expect(p.subpaths[0].nodes).toHaveLength(8);
    const s: ShapeNode = { id: id(), type: "shape", transform: [1, 0, 0, 1, 0, 0], layer: 0, shape: { kind: "rect", w: 20, h: 10, r: [0, 0, 0, 0], corner: "round" }, effects: [fx("corners", { mode: "chamfer" })] };
    const d2 = docWith(s);
    const c = commit(d2, emptyHistory(), "Edit", (x) => { expandNodes(x, [s.id], true); });
    const q = findNode(c.doc.root, s.id) as PathNode;
    expect(q.type).toBe("path");
    expect(q.subpaths[0].nodes).toHaveLength(4);
    expect(q.effects).toHaveLength(1);
  });

  it("effects survive save (JSON), copy and duplicate", () => {
    const n = path([R20()], [fx("mirror", { axis: "vertical", x: 10 })]);
    const d = docWith(n);
    const back = JSON.parse(JSON.stringify(d)) as Document;
    expect((findNode(back.root, n.id) as PathNode).effects).toEqual(n.effects);
    expect((copyNodes(d, [n.id]).nodes[0] as PathNode).effects).toEqual(n.effects);
    const c = commit(d, emptyHistory(), "Duplicate", (x) => { duplicateNodes(x, [n.id], { x: 5, y: 5 }, id); });
    const dup = c.doc.root.children.find((k) => k.id !== n.id) as PathNode;
    expect(dup.effects).toEqual(n.effects);
  });
});

describe("Live Effects commands", () => {
  it("one Add Live Effect command per kind, Expand Live Effects and the panel, all in menus", () => {
    const inMenus = new Set<string>();
    const walkMenu = (items: MenuEntry[]) => items.forEach((i) => (typeof i === "string" ? inMenus.add(i) : walkMenu(i.items)));
    MENUS.forEach((m) => walkMenu(m.items));
    for (const k of EFFECT_KINDS) {
      const cmd = COMMAND_BY_ID.get(`path.effect.add.${k}`)!;
      expect(cmd.label).toBe(`Add Live Effect: ${EFFECTS[k].label}`);
      expect(cmd.keywords).toContain(EFFECTS[k].keywords);
      expect(inMenus.has(cmd.id)).toBe(true);
    }
    expect(inMenus.has("path.effect.expand")).toBe(true);
    expect(inMenus.has("window.panel.liveEffects")).toBe(true);
    expect(COMMAND_BY_ID.get("object.expand")!.description).toContain("apply Live Effects");
  });

  it("the Inkscape-style set opens Live Effects with Ctrl+& (Make Clipping Mask gives up Ctrl+7 there)", () => {
    expect(bindingsFor("inkscape").get("window.panel.liveEffects")).toEqual(["Ctrl+&"]);
    expect(bindingsFor("inkscape").get("object.clip.make")).toBeUndefined();
    expect(bindingsFor("hingelab").get("object.clip.make")).toEqual(["Ctrl+7"]);
  });
});

describe("Live Effects stack edits (one undo step each)", () => {
  const setup = () => {
    const n = path([R20()]);
    return { d: docWith(n), n };
  };

  it("add, then every stack edit round-trips through undo and redo", () => {
    const { d, n } = setup();
    let fid = "";
    const a = roundTrip(d, "Add Live Effect", (x) => { fid = addEffect(x, [n.id], "hatches", () => "fx1").get(n.id)!; });
    expect(fid).toBe("fx1");
    expect((findNode(a.root, n.id) as PathNode).effects).toHaveLength(1);
    const b = roundTrip(a, "Add Live Effect", (x) => { addEffect(x, [n.id], "corners", () => "fx2"); });
    const order = (doc: Document) => ((findNode(doc.root, n.id) as PathNode).effects ?? []).map((e) => e.id);
    expect(order(b)).toEqual(["fx1", "fx2"]);
    expect(order(roundTrip(b, "Move Effect", (x) => { moveEffect(x, n.id, "fx2", -1); }))).toEqual(["fx2", "fx1"]);
    expect(order(roundTrip(b, "Duplicate Effect", (x) => { duplicateEffect(x, n.id, "fx1", () => "fx3"); }))).toEqual(["fx1", "fx3", "fx2"]);
    expect(order(roundTrip(b, "Delete Effect", (x) => { removeEffect(x, n.id, "fx1"); }))).toEqual(["fx2"]);
    const off = roundTrip(b, "Hide Effect", (x) => { setEffectEnabled(x, n.id, "fx1", false); });
    expect((findNode(off.root, n.id) as PathNode).effects![0].enabled).toBe(false);
    const sp = roundTrip(b, "Effect Spacing", (x) => { setEffectParams(x, n.id, "fx1", { spacing: 2 }); });
    expect(((findNode(sp.root, n.id) as PathNode).effects![0].params as HatchParams).spacing).toBe(2);
    const reset = roundTrip(sp, "Reset Effect", (x) => { resetEffect(x, n.id, "fx1"); });
    expect(((findNode(reset.root, n.id) as PathNode).effects![0].params as HatchParams).spacing).toBe(1);
  });

  it("Rotate Copies and Mirror defaults come from the geometry they receive", () => {
    const { d, n } = setup();
    const a = roundTrip(d, "Add Live Effect", (x) => { addEffect(x, [n.id], "rotateCopies", () => "r"); addEffect(x, [n.id], "mirror", () => "m"); });
    const [r, m] = (findNode(a.root, n.id) as PathNode).effects!;
    expect(r.params).toMatchObject({ cx: 0, cy: 0, count: 6 });
    // The mirror receives six rotated copies: its axis sits on their right edge.
    const reach = Math.max(...nodePaths({ ...n, effects: [r] }).flatMap((s) => s.nodes.map((q) => q.x)));
    close((m.params as MirrorParams).x, reach, 1e-9);
  });
});
