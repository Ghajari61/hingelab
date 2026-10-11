import { describe, expect, it } from "vitest";
import { createEditorStore } from "@/components/studio/editor/store";
import { fillClick, measureToItem, startCalligraphy, startSpray, startTweak, type ToolPointer } from "@/components/studio/editor/tools/brushTools";
import { seeded } from "../arrays";
import { CALLIGRAPHY_DEFAULTS, calligraphyArea, calligraphyStroke, type InkSample } from "../calligraphy";
import { createDocument } from "../doc";
import { boundaryOutlines, boundedRegion, fillBoundedArea } from "../fillArea";
import { flatten, nodeBox, nodePaths, polygonArea, transformSubpaths, boxCenter } from "../geom";
import { addDimension, measureAcross, measureTargets, MEASURE_LAYER_NAME } from "../measure";
import { areaOfPaths, inter, UNIT } from "../pathfinder";
import { findNode, locate } from "../scene";
import { applySpray, growArea, outlineArea, sprayStep, SPRAY_DEFAULTS, type SprayItem, type SpraySource } from "../spray";
import { eraseTouching, touchedBy } from "../toolOps";
import { falloff, objectTweak, tweakStep, tweakSubpaths, type TweakBrush } from "../tweak";
import type { DimensionNode, Document, GroupNode, PathNode, SceneNode, Subpath } from "../types";

let seq = 0;
const id = () => `p${++seq}`;
const line = (x0: number, y0: number, x1: number, y1: number, layer = 2): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer, subpaths: [{ closed: false, nodes: [{ x: x0, y: y0 }, { x: x1, y: y1 }] }],
});
const rect = (x: number, y: number, w: number, h: number, layer = 2): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, x, y], layer,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }],
});
const circle = (cx: number, cy: number, r: number): SceneNode => ({ id: id(), type: "shape", transform: [1, 0, 0, 1, cx, cy], layer: 2, shape: { kind: "ellipse", rx: r, ry: r } });
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const areaOf = (d: Document, nid: string) => {
  const l = locate(d.root, nid)!;
  return Math.abs(transformSubpaths(nodePaths(l.node), l.world).reduce((a, s) => a + (s.closed ? polygonArea(flatten(s, 0.001)) : 0), 0));
};
/** Four lines crossing at the corners of a 20 × 10 rectangle, each running 5 mm past the corners. */
const frame = () => [line(-5, 0, 25, 0), line(-5, 10, 25, 10), line(0, -5, 0, 15), line(20, -5, 20, 15)];
const roundTrip = (doc: Document, label: string, recipe: (d: Document) => void) => {
  const api = createEditorStore(doc);
  const before = JSON.stringify(api.getState().doc.root);
  api.getState().edit(label, recipe);
  const after = JSON.stringify(api.getState().doc.root);
  expect(after, `${label} changed nothing`).not.toBe(before);
  expect(api.getState().history.past).toHaveLength(1);
  api.getState().undo();
  expect(JSON.stringify(api.getState().doc.root)).toBe(before);
  api.getState().redo();
  expect(JSON.stringify(api.getState().doc.root)).toBe(after);
};

describe("fill bounded area", () => {
  it("fills the rectangle four crossing lines make, exactly", () => {
    const d = docWith(...frame());
    for (const gap of [0, 0.1, 0.5]) {
      const r = boundedRegion(boundaryOutlines(d, null), { x: 10, y: 5 }, { gap, grow: 0 })!;
      expect(Math.abs(Math.abs(areaOfPaths(r)) / (UNIT * UNIT) - 200)).toBeLessThanOrEqual(1e-3);
    }
    const grown = boundedRegion(boundaryOutlines(d, null), { x: 10, y: 5 }, { gap: 0.1, grow: 1 })!;
    expect(Math.abs(areaOfPaths(grown)) / (UNIT * UNIT)).toBeCloseTo(22 * 12, 3);
    const shrunk = boundedRegion(boundaryOutlines(d, null), { x: 10, y: 5 }, { gap: 0.1, grow: -1 })!;
    expect(Math.abs(areaOfPaths(shrunk)) / (UNIT * UNIT)).toBeCloseTo(18 * 8, 3);
  });

  it("finds half a disc between a circle and a line across it", () => {
    const d = docWith(circle(0, 0, 10), line(-15, 0, 15, 0));
    const r = boundedRegion(boundaryOutlines(d, null), { x: 2, y: 4 }, { gap: 0.1, grow: 0 })!;
    expect(Math.abs(Math.abs(areaOfPaths(r)) / (UNIT * UNIT) - (Math.PI * 100) / 2)).toBeLessThan(0.3);
  });

  it("creates nothing outside every closed region or on a line", () => {
    const d = docWith(...frame());
    const outlines = boundaryOutlines(d, null);
    for (const p of [{ x: -3, y: 5 }, { x: 10, y: -3 }, { x: 50, y: 50 }, { x: 10, y: 0 }]) expect(boundedRegion(outlines, p, { gap: 0.1, grow: 0 })).toBeNull();
    expect(boundedRegion([], { x: 0, y: 0 }, { gap: 0.1, grow: 0 })).toBeNull();
    const n = d.root.children.length;
    expect(fillBoundedArea(d, { x: 50, y: 50 }, { gap: 0.1, grow: 0 }, { layer: 0 }, id).id).toBeNull();
    expect(d.root.children).toHaveLength(n);
  });

  it("closes gaps up to the tolerance only", () => {
    const d = docWith(line(-5, 0, 25, 0), line(-5, 10, 25, 10), line(0, -5, 0, 15), line(20, -5, 20, 9.7));
    expect(boundedRegion(boundaryOutlines(d, null), { x: 10, y: 5 }, { gap: 0.1, grow: 0 })).toBeNull();
    const r = boundedRegion(boundaryOutlines(d, null), { x: 10, y: 5 }, { gap: 0.8, grow: 0 })!;
    expect(Math.abs(Math.abs(areaOfPaths(r)) / (UNIT * UNIT) - 200)).toBeLessThan(0.5);
  });

  it("adds a new path on the layer, unites with Shift, cuts with Alt, and undoes in one step", () => {
    const d = docWith(...frame(), line(10, -5, 10, 15));
    const a = fillBoundedArea(d, { x: 5, y: 5 }, { gap: 0.1, grow: 0 }, { layer: 0 }, id);
    expect(a.area).toBeCloseTo(100, 3);
    const node = findNode(d.root, a.id!) as PathNode;
    expect([node.layer, node.type, d.root.children[d.root.children.length - 1].id]).toEqual([0, "path", a.id]);
    const b = fillBoundedArea(d, { x: 15, y: 5 }, { gap: 0.1, grow: 0 }, { layer: 0, addTo: a.id }, id);
    expect(b.id).toBe(a.id);
    expect(areaOf(d, a.id!)).toBeCloseTo(200, 2);
    fillBoundedArea(d, { x: 15, y: 5 }, { gap: 0.1, grow: 0 }, { layer: 0, addTo: a.id, subtract: true }, id);
    expect(areaOf(d, a.id!)).toBeCloseTo(100, 2);
    roundTrip(docWith(...frame()), "Fill Bounded Area", (x) => { fillBoundedArea(x, { x: 10, y: 5 }, { gap: 0.1, grow: 0 }, { layer: 0 }); });
  });

  it("uses only the selection's outlines when given", () => {
    const f = frame();
    const d = docWith(...f, rect(5, 2, 4, 4));
    expect(Math.abs(areaOfPaths(boundedRegion(boundaryOutlines(d, null), { x: 3, y: 5 }, { gap: 0.1, grow: 0 })!)) / UNIT ** 2).toBeCloseTo(200 - 16, 2);
    expect(Math.abs(areaOfPaths(boundedRegion(boundaryOutlines(d, f.map((n) => n.id)), { x: 3, y: 5 }, { gap: 0.1, grow: 0 })!)) / UNIT ** 2).toBeCloseTo(200, 3);
  });
});

describe("measure tool", () => {
  it("cuts the measuring line and the crossed outlines at every crossing", () => {
    const sq = rect(0, 0, 10, 10), l = line(5, -5, 5, 15);
    const d = docWith(sq, l);
    const r = measureAcross(measureTargets(d), { x: -5, y: 5 }, { x: 15, y: 5 });
    expect(r.length).toBe(20);
    expect(r.angle).toBe(0);
    expect(r.hits.map((h) => h.p.x)).toEqual([0, 5, 10]);
    expect(r.spans.map((s) => s.len)).toEqual([5, 5, 5, 5]);
    const sqPieces = r.pieces.filter((p) => p.id === sq.id).map((p) => p.len);
    expect(sqPieces).toEqual([20, 20]);
    expect(r.pieces.filter((p) => p.id === l.id).map((p) => p.len)).toEqual([10, 10]);
    expect(r.crossed).toBe(2);
    expect(r.crossedLength).toBe(60);
    const mid = r.pieces.find((p) => p.id === l.id)!.mid;
    expect([mid.x, mid.y]).toEqual([5, 0]);
  });

  it("measures angles counter-clockwise on screen and ignores outlines it misses", () => {
    const d = docWith(rect(50, 50, 5, 5));
    const r = measureAcross(measureTargets(d), { x: 0, y: 0 }, { x: 10, y: -10 });
    expect(r.angle).toBeCloseTo(45, 9);
    expect([r.hits.length, r.spans.length, r.pieces.length]).toEqual([0, 1, 0]);
    expect(measureAcross(measureTargets(d), { x: 1, y: 1 }, { x: 1, y: 1 }).spans).toEqual([]);
  });

  it("Convert to Item adds a dimension on a non-output measurements layer", () => {
    const d = docWith(rect(0, 0, 10, 10));
    const a = addDimension(d, { x: 0, y: 0 }, { x: 30, y: 40 }, id);
    const n = findNode(d.root, a) as DimensionNode;
    expect([n.type, n.kind, n.points]).toEqual(["dimension", "linear", [{ x: 0, y: 0 }, { x: 30, y: 40 }]]);
    expect([d.cutLayers[n.layer].name, d.cutLayers[n.layer].output, n.layer]).toEqual([MEASURE_LAYER_NAME, false, 29]);
    const b = addDimension(d, { x: 0, y: 0 }, { x: 1, y: 0 }, id);
    expect((findNode(d.root, b) as DimensionNode).layer).toBe(29);
    roundTrip(docWith(), "Convert Measurement", (x) => { addDimension(x, { x: 0, y: 0 }, { x: 10, y: 0 }); });
  });
});

describe("eraser: delete objects", () => {
  it("deletes every object the stroke touches, scoped to the selection, and empty groups", () => {
    const a = rect(0, 0, 10, 10), b = line(20, 0, 20, 10), c = rect(40, 0, 10, 10), e = rect(0, 30, 5, 5);
    const g: GroupNode = { id: id(), type: "group", transform: [1, 0, 0, 1, 0, 0], layer: 2, children: [e] };
    const d = docWith(a, b, c, g);
    const stroke = [{ x: 5, y: 5 }, { x: 25, y: 5 }];
    expect(touchedBy(d, null, stroke, 1).sort()).toEqual([a.id, b.id].sort());
    expect(touchedBy(d, [b.id], stroke, 1)).toEqual([b.id]);
    expect(touchedBy(d, null, [{ x: 32, y: 5 }], 2)).toEqual([]);
    eraseTouching(d, null, [...stroke, { x: 2, y: 32 }], 1);
    expect(d.root.children.map((n) => n.id)).toEqual([c.id]);
    roundTrip(docWith(rect(0, 0, 10, 10), rect(40, 0, 5, 5)), "Erase", (x) => { eraseTouching(x, null, [{ x: 5, y: 5 }], 1); });
  });
});

const stroke = (len: number, step = 0.5, y = 0): InkSample[] => Array.from({ length: Math.round(len / step) + 1 }, (_, k) => ({ x: k * step, y, t: k * 16, pressure: 0.5 }));
const pathsArea = (subs: Subpath[]) => subs.reduce((a, s) => a + Math.abs(polygonArea(flatten(s, 0.001))), 0);

describe("calligraphy", () => {
  const base = { ...CALLIGRAPHY_DEFAULTS, thinning: 0, mass: 0, tremor: 0, caps: 0, fixation: 100 };
  const o = { widthMm: 4, pxPerMm: 4, seed: 1 };
  it("a vertical nib along a horizontal stroke gives length × width", () => {
    const subs = calligraphyStroke(stroke(50), { ...base, angle: 90 }, o);
    expect(subs).toHaveLength(1);
    expect(Math.abs(pathsArea(subs) - 200) / 200).toBeLessThan(0.02);
    expect(Math.abs(areaOfPaths(calligraphyArea(stroke(50), { ...base, angle: 90 }, o))) / UNIT ** 2).toBeCloseTo(200, 3);
  });
  it("a nib along the stroke draws almost nothing; fixation 0 keeps the full width", () => {
    expect(pathsArea(calligraphyStroke(stroke(50), { ...base, angle: 0 }, o))).toBeLessThan(2);
    const free = pathsArea(calligraphyStroke(stroke(50), { ...base, angle: 0, fixation: 0 }, o));
    expect(Math.abs(free - 200) / 200).toBeLessThan(0.02);
  });
  it("thinning narrows fast strokes, caps add round ends, tremor is seeded", () => {
    const fast = stroke(50, 5);
    const thin = pathsArea(calligraphyStroke(fast, { ...base, angle: 90, thinning: 100 }, o));
    expect(thin).toBeLessThan(200 * 0.5);
    const capped = pathsArea(calligraphyStroke(stroke(50), { ...base, angle: 90, caps: 2 }, o));
    expect(capped).toBeCloseTo(200 + Math.PI * 4, 0);
    const t1 = calligraphyStroke(stroke(50), { ...base, angle: 90, tremor: 60 }, o), t2 = calligraphyStroke(stroke(50), { ...base, angle: 90, tremor: 60 }, o);
    expect(t1).toEqual(t2);
    expect(Math.abs(pathsArea(t1) - 200)).toBeGreaterThan(1);
  });
});

const brush = (b: Partial<TweakBrush>): TweakBrush => ({ c: { x: 0, y: 0 }, r: 10, force: 50, delta: { x: 0, y: 0 }, invert: false, fidelity: 0, rnd: seeded(3), ...b });

describe("tweak", () => {
  it("falloff is 1 at the centre and 0 from the rim out", () => {
    expect([falloff(0, 10), falloff(10, 10), falloff(20, 10)]).toEqual([1, 0, 0]);
    expect(falloff(5, 10)).toBeCloseTo(0.5625, 12);
  });
  it("push moves nodes inside the brush by the weighted drag and leaves the others", () => {
    const sub: Subpath = { closed: false, nodes: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 30, y: 0 }] };
    const r = tweakSubpaths([sub], "push", brush({ delta: { x: 0, y: 2 }, fidelity: 0, r: 10 }));
    expect(r.changed).toBe(true);
    const out = r.subs[0].nodes;
    expect(out[0]).toEqual({ x: 0, y: 1 });
    expect(out[out.length - 1]).toEqual({ x: 30, y: 0 });
    const at5 = out.find((n) => n.x === 5)!;
    expect(at5.y).toBeCloseTo(2 * 0.5 * 0.5625, 12);
    const miss = tweakSubpaths([sub], "push", brush({ c: { x: 100, y: 100 }, delta: { x: 0, y: 2 } }));
    expect(miss).toEqual({ subs: [sub], changed: false });
  });
  it("push bends a long straight edge whose end nodes are both outside the brush", () => {
    const sq: Subpath = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }] };
    const r = tweakSubpaths([sq], "push", brush({ c: { x: 61, y: 30 }, delta: { x: 2, y: 0 }, r: 10, force: 30, fidelity: 50 }));
    expect(r.changed).toBe(true);
    expect(Math.max(...r.subs[0].nodes.map((n) => n.x))).toBeGreaterThan(60.3);
    expect(r.subs[0].nodes.filter((n) => n.x === 0)).toHaveLength(2);
  });
  it("shrink pulls a closed outline inwards, grow (Alt) pushes it out, attract gathers nodes", () => {
    const sq: Subpath = { closed: true, nodes: [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }] };
    const shrink = tweakSubpaths([sq], "shrinkGrow", brush({ r: 20 })).subs[0], grow = tweakSubpaths([sq], "shrinkGrow", brush({ r: 20, invert: true })).subs[0];
    const span = (s: Subpath) => Math.max(...s.nodes.map((n) => n.x)) - Math.min(...s.nodes.map((n) => n.x));
    expect(span(shrink)).toBeLessThan(10);
    expect(span(grow)).toBeGreaterThan(10);
    const pulled = tweakSubpaths([sq], "attract", brush({ r: 20 })).subs[0];
    expect(span(pulled)).toBeLessThan(10);
    const rough = tweakSubpaths([sq], "roughen", brush({ r: 20, fidelity: 100 })).subs[0];
    expect(rough.nodes.length).toBeGreaterThan(4);
  });
  it("scale mode scales objects whose centre is in the brush, about their centre", () => {
    const a = rect(-5, -5, 10, 10), b = rect(40, 0, 10, 10);
    const d = docWith(a, b);
    const changed = tweakStep(d, null, "scale", brush({ r: 10, force: 100 }));
    expect(changed).toEqual([a.id]);
    const box = nodeBox(findNode(d.root, a.id)!);
    expect(box.maxX - box.minX).toBeCloseTo(10 * 0.96, 9);
    expect(boxCenter(box).x).toBeCloseTo(0, 9);
    expect(findNode(d.root, b.id)!.transform).toEqual(b.transform);
    expect(objectTweak("rotate", { x: 50, y: 0 }, brush({}))).toBeNull();
    const moved = objectTweak("move", { x: 0, y: 0 }, brush({ delta: { x: 4, y: 0 }, force: 100 }))!;
    expect(moved).toEqual([1, 0, 0, 1, 4, 0]);
  });
  it("path modes turn shapes into paths, keep Live Effects, and undo in one step", () => {
    const c = circle(0, 0, 8);
    const d = docWith(c);
    expect(tweakStep(d, [c.id], "push", brush({ delta: { x: 1, y: 0 }, fidelity: 50 }))).toEqual([c.id]);
    expect(findNode(d.root, c.id)!.type).toBe("path");
    roundTrip(docWith(circle(0, 0, 8)), "Tweak", (x) => { tweakStep(x, null, "roughen", brush({ r: 12 })); });
  });
});

describe("spray", () => {
  const unit: SpraySource = { id: "s", centre: { x: 2, y: 2 }, area: outlineArea([{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] }]) };
  it("places exactly `amount` items per step without no-overlap, inside the brush", () => {
    const rnd = seeded(7);
    let all: SprayItem[] = [];
    for (let k = 0; k < 10; k++) all = all.concat(sprayStep([unit], { x: 100, y: 100 }, { ...SPRAY_DEFAULTS, amount: 3, radius: 10 }, rnd, all));
    expect(all).toHaveLength(30);
    for (const it of all) { const c = { x: (it.box.minX + it.box.maxX) / 2, y: (it.box.minY + it.box.maxY) / 2 }; expect(Math.hypot(c.x - 100, c.y - 100)).toBeLessThanOrEqual(10 + 1e-6); }
  });
  it("with no overlap, no two items (or an item and an obstacle) come closer than the gap", () => {
    const rnd = seeded(42);
    const p = { ...SPRAY_DEFAULTS, amount: 4, radius: 12, noOverlap: true, gap: 1, scaleVar: 30, rotateVar: 90 };
    const obstacle = { area: outlineArea([{ closed: true, nodes: [{ x: 98, y: 98 }, { x: 102, y: 98 }, { x: 102, y: 102 }, { x: 98, y: 102 }] }]), box: { minX: 98, minY: 98, maxX: 102, maxY: 102 } };
    let all: SprayItem[] = [];
    for (let k = 0; k < 40; k++) all = all.concat(sprayStep([unit], { x: 100, y: 100 }, p, rnd, all, [obstacle]));
    expect(all.length).toBeGreaterThan(3);
    expect(all.length).toBeLessThan(160);
    for (let i = 0; i < all.length; i++) {
      const near = growArea(all[i].area, 0.99);
      expect(Math.abs(areaOfPaths(inter(near, obstacle.area)))).toBe(0);
      for (let j = i + 1; j < all.length; j++) expect(Math.abs(areaOfPaths(inter(near, all[j].area))), `${i}/${j}`).toBe(0);
    }
    // Same seed, same result.
    const again = seeded(42);
    let b: SprayItem[] = [];
    for (let k = 0; k < 40; k++) b = b.concat(sprayStep([unit], { x: 100, y: 100 }, p, again, b, [obstacle]));
    expect(b.map((x) => x.m)).toEqual(all.map((x) => x.m));
  });
  it("adds copies, clones or one united path, as one undo step", () => {
    const src = rect(0, 0, 4, 4);
    const d = docWith(src);
    const items = sprayStep([{ id: src.id, centre: { x: 2, y: 2 }, area: unit.area }], { x: 50, y: 50 }, { ...SPRAY_DEFAULTS, amount: 3, radius: 5 }, seeded(1), []);
    const copies = applySpray(d, [src.id], items, "copies", id);
    expect(copies).toHaveLength(3);
    for (const [k, cid] of copies.entries()) expect(boxCenter(nodeBox(findNode(d.root, cid)!, locate(d.root, cid)!.world)).x).toBeCloseTo(items[k].m[4] + 2 * items[k].m[0] + 2 * items[k].m[2], 6);
    const d2 = docWith(rect(0, 0, 4, 4));
    const src2 = d2.root.children[0].id;
    const clones = applySpray(d2, [src2], items, "clones", id);
    expect(clones.map((c) => findNode(d2.root, c)!.type)).toEqual(["clone", "clone", "clone"]);
    const d3 = docWith(rect(0, 0, 4, 4));
    const one = applySpray(d3, [d3.root.children[0].id], items, "single", id);
    expect(one).toHaveLength(1);
    expect(areaOf(d3, one[0])).toBeLessThanOrEqual(3 * 16 + 1e-6);
    roundTrip(docWith(rect(0, 0, 4, 4, 2)), "Spray", (x) => { applySpray(x, [x.root.children[0].id], items, "clones"); });
  });
});

describe("tool sessions: one undo step per click or stroke", () => {
  const ptr = (x: number, y: number, t: number, extra: Partial<ToolPointer> = {}): ToolPointer => ({ p: { x, y }, shift: false, alt: false, pressure: 0.5, t, ...extra });
  const steps = (api: ReturnType<typeof createEditorStore>) => api.getState().history.past.length;
  const undoRedo = (api: ReturnType<typeof createEditorStore>, before: string) => {
    const after = JSON.stringify(api.getState().doc.root);
    expect(after).not.toBe(before);
    api.getState().undo();
    expect(JSON.stringify(api.getState().doc.root)).toBe(before);
    api.getState().redo();
    expect(JSON.stringify(api.getState().doc.root)).toBe(after);
  };

  it("fill: click, Shift+click adds to it, Alt+click removes, outside does nothing", () => {
    const api = createEditorStore(docWith(...frame(), line(10, -5, 10, 15)));
    const before = JSON.stringify(api.getState().doc.root);
    const toasts: string[] = [];
    fillClick(api, ptr(5, 5, 0), (m) => toasts.push(m));
    expect(steps(api)).toBe(1);
    const filled = api.getState().doc.root.children.at(-1)!;
    expect(areaOf(api.getState().doc, filled.id)).toBeCloseTo(100, 3);
    fillClick(api, ptr(15, 5, 0, { shift: true }), (m) => toasts.push(m));
    expect(api.getState().doc.root.children).toHaveLength(6);
    expect(areaOf(api.getState().doc, filled.id)).toBeCloseTo(200, 3);
    fillClick(api, ptr(15, 5, 0, { alt: true }), (m) => toasts.push(m));
    expect(areaOf(api.getState().doc, filled.id)).toBeCloseTo(100, 3);
    expect(steps(api)).toBe(3);
    fillClick(api, ptr(100, 100, 0), (m) => toasts.push(m));
    expect(steps(api)).toBe(3);
    expect(toasts).toHaveLength(1);
    api.getState().undo(); api.getState().undo(); api.getState().undo();
    expect(JSON.stringify(api.getState().doc.root)).toBe(before);
  });

  it("measure: Convert to Item adds a dimension in one step", () => {
    const api = createEditorStore(docWith());
    const before = JSON.stringify(api.getState().doc.root);
    api.getState().set({ measure: { a: { x: 0, y: 0 }, b: { x: 30, y: 40 } } });
    expect(measureToItem(api, () => {})).toBe(true);
    const dim = api.getState().doc.root.children.at(-1) as DimensionNode;
    expect([dim.type, api.getState().selection]).toEqual(["dimension", [dim.id]]);
    undoRedo(api, before);
  });

  it("calligraphy: a stroke becomes one filled path on an engrave layer", () => {
    const api = createEditorStore(docWith());
    const before = JSON.stringify(api.getState().doc.root);
    api.getState().set({ calligraphy: { ...CALLIGRAPHY_DEFAULTS, fixation: 100, angle: 90, thinning: 0, mass: 0, width: 2 } });
    const s = startCalligraphy(api, ptr(0, 0, 0), { zoom: 3, widthMm: 300 });
    for (let k = 1; k <= 20; k++) s.move(ptr(k, 0, k * 16));
    expect(s.draft?.()).toMatch(/^M/);
    expect(steps(api)).toBe(0);
    s.up(ptr(20, 0, 400));
    expect(steps(api)).toBe(1);
    const n = api.getState().doc.root.children.at(-1)!;
    expect(api.getState().doc.cutLayers[n.layer].mode).toBe("fill");
    expect(areaOf(api.getState().doc, n.id)).toBeCloseTo(40, 0);
    undoRedo(api, before);
  });

  it("tweak: a whole drag is one undo step", () => {
    const api = createEditorStore(docWith(rect(0, 0, 60, 60)));
    const before = JSON.stringify(api.getState().doc.root);
    const s = startTweak(api, ptr(61, 30, 0));
    for (let k = 1; k <= 10; k++) s.move(ptr(61 + k, 30, k * 16));
    s.up(ptr(71, 30, 200));
    expect(steps(api)).toBe(1);
    expect(api.getState().history.past[0].label).toBe("Tweak");
    undoRedo(api, before);
  });

  it("spray: needs a selection; a whole drag is one undo step and the sources stay selected", () => {
    const api = createEditorStore(docWith(rect(0, 0, 4, 4)));
    const toasts: string[] = [];
    expect(startSpray(api, ptr(50, 50, 0), (m) => toasts.push(m))).toBeNull();
    expect(toasts).toHaveLength(1);
    const src = api.getState().doc.root.children[0].id;
    api.getState().select([src]);
    api.getState().set({ spray: { ...SPRAY_DEFAULTS, amount: 2, radius: 10, noOverlap: true, gap: 0.5 } });
    const before = JSON.stringify(api.getState().doc.root);
    const s = startSpray(api, ptr(50, 50, 0), () => {})!;
    for (let k = 1; k <= 20; k++) s.move(ptr(50 + k * 3, 50, k * 16));
    s.up(ptr(110, 50, 400));
    expect(steps(api)).toBe(1);
    expect(api.getState().doc.root.children.length).toBeGreaterThan(5);
    expect(api.getState().selection).toEqual([src]);
    undoRedo(api, before);
  });
});
