import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import {
  apply, decompose, flatten, hitPaths, I, insertAnchor, invert, mul, nearestOnSubpaths, nodeBox, pathD, polygonArea, rotateAt, scaleAt,
  segmentBox, shapeForBox, shapePaths, simplifyPolyline, smoothStroke, subpathsBox, translate, type Box,
} from "../geom";
import { commit, emptyHistory, HISTORY_LIMIT, redo, seal, undo, jumpTo } from "../history";
import {
  addNode, alignNodes, arrangeNodes, distributeNodes, duplicateNodes, expandNodes, findNode, groupNodes, hitTest, idsInBox,
  moveNode, removeNodes, transformNodes, ungroupNodes, worldBox,
} from "../scene";
import { snapMove, snapPoint, snapTargets, type SnapSettings } from "../snap";
import type { Document, Mat, SceneNode, ShapeKind, ShapeParams, Subpath } from "../types";

const area = (subs: Subpath[]) => subs.filter((s) => s.closed).reduce((a, s) => a + polygonArea(flatten(s, 0.001)), 0);
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const boxClose = (a: Box, b: Box, tol = 1e-6) => (["minX", "minY", "maxX", "maxY"] as const).forEach((k) => close(a[k], b[k], tol));

let seq = 0;
const ids = () => `n${++seq}`;
const shape = (shape: ShapeParams, x = 0, y = 0, layer = 0): SceneNode => ({ id: ids(), type: "shape", transform: [1, 0, 0, 1, x, y], layer, shape });
const rect = (w: number, h: number, x = 0, y = 0) => shape({ kind: "rect", w, h, r: [0, 0, 0, 0], corner: "round" }, x, y);
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};

describe("matrices", () => {
  it("multiplies, inverts and decomposes", () => {
    const m = mul(translate(10, 5), mul(rotateAt(30), scaleAt(2, 3)));
    const p = { x: 4, y: -7 };
    const back = apply(invert(m), apply(m, p));
    close(back.x, p.x); close(back.y, p.y);
    mul(m, invert(m)).forEach((v, k) => close(v, I[k], 1e-9));
    const dm = decompose(m);
    close(dm.x, 10); close(dm.y, 5); close(dm.rotation, 30); close(dm.sx, 2); close(dm.sy, 3); close(dm.skew, 0);
  });

  it("rotates and scales about a centre", () => {
    const c = apply(rotateAt(77, 12, -3), { x: 12, y: -3 });
    close(c.x, 12); close(c.y, -3);
    const s = apply(scaleAt(2, 2, 5, 5), { x: 6, y: 5 });
    close(s.x, 7); close(s.y, 5);
    expect(decompose(scaleAt(1, -1)).sy).toBeLessThan(0);
  });
});

describe("shapes", () => {
  it("rectangle corners: round, chamfer, inverted", () => {
    const r = 10, w = 100, h = 60;
    close(area(shapePaths({ kind: "rect", w, h, r: [0, 0, 0, 0], corner: "round" })), w * h);
    close(area(shapePaths({ kind: "rect", w, h, r: [r, r, r, r], corner: "round" })), w * h - (4 - Math.PI) * r * r, 0.1);
    close(area(shapePaths({ kind: "rect", w, h, r: [r, r, r, r], corner: "chamfer" })), w * h - 2 * r * r, 1e-6);
    close(area(shapePaths({ kind: "rect", w, h, r: [r, r, r, r], corner: "inverted" })), w * h - Math.PI * r * r, 0.1);
    close(area(shapePaths({ kind: "rect", w, h, r: [r, 0, 0, 0], corner: "chamfer" })), w * h - r * r / 2, 1e-6);
    boxClose(subpathsBox(shapePaths({ kind: "rect", w, h, r: [r, r, r, r], corner: "round" })), { minX: -50, minY: -30, maxX: 50, maxY: 30 });
  });

  it("clamps radii larger than the sides", () => {
    const subs = shapePaths({ kind: "rect", w: 40, h: 20, r: [50, 50, 50, 50], corner: "round" });
    boxClose(subpathsBox(subs), { minX: -20, minY: -10, maxX: 20, maxY: 10 });
    close(area(subs), (40 - 20) * 20 + Math.PI * 100, 0.1);
  });

  it("ellipse, polygon, star, arc and slot have the expected areas", () => {
    close(area(shapePaths({ kind: "ellipse", rx: 30, ry: 30 })), Math.PI * 900, 900 * Math.PI * 0.001);
    boxClose(subpathsBox(shapePaths({ kind: "ellipse", rx: 30, ry: 12 })), { minX: -30, minY: -12, maxX: 30, maxY: 12 }, 1e-9);
    close(area(shapePaths({ kind: "polygon", sides: 6, r: 10, round: 0 })), (3 * Math.sqrt(3) / 2) * 100, 1e-9);
    expect(shapePaths({ kind: "star", points: 5, r: 10, inner: 0.5, round: 0 })[0].nodes).toHaveLength(10);
    close(area(shapePaths({ kind: "arc", r: 10, start: 0, sweep: 90, pie: true })), Math.PI * 100 / 4, 0.05);
    expect(shapePaths({ kind: "arc", r: 10, start: 0, sweep: 90, pie: false })[0].closed).toBe(false);
    close(area(shapePaths({ kind: "slot", w: 50, h: 10 })), 40 * 10 + Math.PI * 25, 0.05);
  });

  it("rounded polygons shrink inside the sharp outline", () => {
    const sharp = area(shapePaths({ kind: "polygon", sides: 5, r: 20, round: 0 }));
    const round = area(shapePaths({ kind: "polygon", sides: 5, r: 20, round: 4 }));
    expect(round).toBeLessThan(sharp);
    expect(round).toBeGreaterThan(sharp * 0.9);
  });

  it("gear has the right outside radius, tooth count and bore", () => {
    const z = 18, m = 2;
    const subs = shapePaths({ kind: "gear", teeth: z, module: m, pressure: 20, bore: 8 });
    expect(subs).toHaveLength(2);
    const pts = flatten(subs[0]);
    const radii = pts.map((p) => Math.hypot(p.x, p.y));
    close(Math.max(...radii), (m * (z + 2)) / 2, 1e-6);
    const tips = radii.filter((r) => Math.abs(r - (m * (z + 2)) / 2) < 1e-6).length;
    expect(tips).toBe(z * 2);
    expect(area([subs[1]])).toBeLessThan(0);
  });

  it("grid, spiral, arrow, bubble and heart", () => {
    expect(shapePaths({ kind: "grid", w: 40, h: 30, cols: 4, rows: 3 })).toHaveLength(1 + 3 + 2);
    const sp = shapePaths({ kind: "spiral", turns: 3, r: 20, inner: 0 })[0];
    expect(sp.closed).toBe(false);
    const end = sp.nodes[sp.nodes.length - 1];
    close(Math.hypot(end.x, end.y), 20, 1e-9);
    expect(shapePaths({ kind: "arrow", w: 50, h: 20, head: 15, shaft: 8 })[0].nodes).toHaveLength(7);
    for (const k of ["bubble", "heart"] as const) expect(area(shapePaths(shapeForBox(k, 40, 30)))).toBeGreaterThan(0);
  });

  it("every shape kind drawn in a box gives finite closed or open paths", () => {
    const kinds: ShapeKind[] = ["rect", "ellipse", "polygon", "star", "arc", "slot", "gear", "arrow", "bubble", "heart", "grid", "spiral"];
    for (const k of kinds) {
      const b = subpathsBox(shapePaths(shapeForBox(k, 80, 50)));
      for (const v of [b.minX, b.minY, b.maxX, b.maxY]) expect(Number.isFinite(v)).toBe(true);
      expect(b.maxX - b.minX).toBeLessThanOrEqual(80 + 1e-6);
    }
    for (const k of ["rect", "ellipse", "slot"] as const) boxClose(subpathsBox(shapePaths(shapeForBox(k, 80, 50))), { minX: -40, minY: -25, maxX: 40, maxY: 25 }, 1e-9);
  });

  it("exact cubic bounds and SVG path data", () => {
    const b = segmentBox({ p0: { x: 0, y: 0 }, c1: { x: 0, y: 10 }, c2: { x: 10, y: 10 }, p3: { x: 10, y: 0 }, line: false });
    close(b.maxY, 7.5);
    expect(pathD([{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5, i: { x: 12, y: 2 } }] }])).toBe("M0 0L10 0C10 0 12 2 10 5L0 0Z");
  });

  it("hit test on outlines and inside closed areas", () => {
    const subs = shapePaths({ kind: "ellipse", rx: 10, ry: 10 });
    expect(hitPaths({ x: 10.2, y: 0 }, subs, 0.5).stroke).toBeLessThan(0.5);
    expect(hitPaths({ x: 0, y: 0 }, subs, 0.5).inside).toBe(true);
    expect(hitPaths({ x: 20, y: 0 }, subs, 0.5).inside).toBe(false);
  });
});

describe("scene edits", () => {
  it("group and ungroup keep every object where it was", () => {
    const a = rect(10, 10, 20, 20), b = shape({ kind: "ellipse", rx: 5, ry: 8 }, 60, 40);
    const d = docWith(a, b);
    const before = [worldBox(d.root, a.id), worldBox(d.root, b.id)];
    const g = groupNodes(d, [a.id, b.id], ids)!;
    expect(d.root.children).toHaveLength(1);
    transformNodes(d, [g], rotateAt(90, 40, 30));
    transformNodes(d, [g], rotateAt(-90, 40, 30));
    const released = ungroupNodes(d, [g]);
    expect(released).toEqual([a.id, b.id]);
    boxClose(worldBox(d.root, a.id), before[0], 1e-9);
    boxClose(worldBox(d.root, b.id), before[1], 1e-9);
  });

  it("moves a nested object by a world offset inside a rotated, scaled group", () => {
    const a = rect(10, 10, 0, 0);
    const d = docWith(a);
    const g = groupNodes(d, [a.id], ids)!;
    (findNode(d.root, g)!).transform = mul(rotateAt(30), scaleAt(2, 2)) as Mat;
    const b0 = worldBox(d.root, a.id);
    transformNodes(d, [a.id], translate(15, -4));
    const b1 = worldBox(d.root, a.id);
    close(b1.minX - b0.minX, 15, 1e-9); close(b1.minY - b0.minY, -4, 1e-9);
  });

  it("arranges, aligns and distributes", () => {
    const a = rect(10, 10, 10, 10), b = rect(20, 10, 50, 30), c = rect(10, 30, 120, 60);
    const d = docWith(a, b, c);
    arrangeNodes(d, [a.id], "front");
    expect(d.root.children.map((n) => n.id)).toEqual([b.id, c.id, a.id]);
    arrangeNodes(d, [a.id], "backward");
    expect(d.root.children.map((n) => n.id)).toEqual([b.id, a.id, c.id]);
    arrangeNodes(d, [c.id], "back");
    expect(d.root.children[0].id).toBe(c.id);
    alignNodes(d, [a.id, b.id, c.id], "left");
    for (const n of [a, b, c]) close(worldBox(d.root, n.id).minX, 5);
    alignNodes(d, [a.id, b.id, c.id], "top", { minX: 0, minY: 0, maxX: 300, maxY: 200 });
    for (const n of [a, b, c]) close(worldBox(d.root, n.id).minY, 0);
    const p = rect(10, 10, 0, 100), q = rect(30, 10, 40, 100), r = rect(10, 10, 200, 100);
    const d2 = docWith(p, q, r);
    distributeNodes(d2, [p.id, q.id, r.id], "x");
    const [bp, bq, br] = [p, q, r].map((n) => worldBox(d2.root, n.id));
    close(bq.minX - bp.maxX, br.minX - bq.maxX, 1e-9);
  });

  it("duplicates with new ids, expands shapes and moves between groups", () => {
    const a = rect(10, 10, 0, 0), b = rect(10, 10, 50, 0);
    const d = docWith(a, b);
    const [copy] = duplicateNodes(d, [a.id], { x: 5, y: 5 }, ids);
    expect(copy).not.toBe(a.id);
    expect(d.root.children.map((n) => n.id)).toEqual([a.id, copy, b.id]);
    close(worldBox(d.root, copy).minX, worldBox(d.root, a.id).minX + 5);
    const box = worldBox(d.root, b.id);
    expandNodes(d, [b.id]);
    expect(findNode(d.root, b.id)!.type).toBe("path");
    boxClose(worldBox(d.root, b.id), box, 1e-9);
    const g = groupNodes(d, [copy], ids)!;
    (findNode(d.root, g)!).transform = rotateAt(45);
    const before = worldBox(d.root, a.id);
    moveNode(d, a.id, g, 0);
    boxClose(worldBox(d.root, a.id), before, 1e-9);
    removeNodes(d, [g]);
    expect(findNode(d.root, a.id)).toBeNull();
  });

  it("hit testing picks outlines first, then the smallest area, and skips hidden or locked objects", () => {
    const big = rect(100, 100, 50, 50), small = shape({ kind: "ellipse", rx: 10, ry: 10 }, 50, 50);
    const d = docWith(small, big);
    expect(hitTest(d, { x: 50, y: 50 }, 0.5)).toBe(small.id);
    expect(hitTest(d, { x: 60.1, y: 50 }, 0.5)).toBe(small.id);
    expect(hitTest(d, { x: 0.2, y: 50 }, 0.5)).toBe(big.id);
    expect(hitTest(d, { x: 500, y: 50 }, 0.5)).toBeNull();
    const g = groupNodes(d, [small.id], ids)!;
    expect(hitTest(d, { x: 50, y: 50 }, 0.5)).toBe(g);
    expect(hitTest(d, { x: 50, y: 50 }, 0.5, { deep: true })).toBe(small.id);
    (findNode(d.root, g)!).locked = true;
    expect(hitTest(d, { x: 50, y: 50 }, 0.5)).toBe(big.id);
    big.hidden = true;
    expect(idsInBox(d, { minX: -10, minY: -10, maxX: 200, maxY: 200 })).toEqual([]);
  });

  it("marquee selects contained or touched objects", () => {
    const a = rect(10, 10, 10, 10), b = rect(10, 10, 40, 10);
    const d = docWith(a, b);
    expect(idsInBox(d, { minX: 0, minY: 0, maxX: 20, maxY: 20 }, "contain")).toEqual([a.id]);
    expect(idsInBox(d, { minX: 0, minY: 0, maxX: 36, maxY: 20 }, "touch")).toEqual([a.id, b.id]);
  });
});

describe("history", () => {
  const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  it("200 random edits undo back to the identical document and redo forward", () => {
    const r = rnd(42);
    let doc = docWith(rect(20, 20, 30, 30));
    let h = emptyHistory();
    const start = JSON.stringify(doc);
    const kinds: ShapeKind[] = ["rect", "ellipse", "star", "polygon", "gear"];
    for (let k = 0; k < 200; k++) {
      const all = doc.root.children.map((n) => n.id);
      const pick = () => all[Math.floor(r() * all.length)];
      const op = Math.floor(r() * 8);
      const res = commit(doc, h, `op${op}`, (d) => {
        if (op === 0 || all.length < 2) addNode(d, { id: ids(), type: "shape", transform: [1, 0, 0, 1, r() * 200, r() * 150], layer: Math.floor(r() * 30), shape: shapeForBox(kinds[Math.floor(r() * kinds.length)], 5 + r() * 40, 5 + r() * 40) });
        else if (op === 1) transformNodes(d, [pick()], translate(r() * 10 - 5, r() * 10 - 5));
        else if (op === 2) transformNodes(d, [pick()], rotateAt(r() * 90, 50, 50));
        else if (op === 3) removeNodes(d, [pick()]);
        else if (op === 4) groupNodes(d, [pick(), pick()], ids);
        else if (op === 5) ungroupNodes(d, all);
        else if (op === 6) arrangeNodes(d, [pick()], (["front", "back", "forward", "backward"] as const)[Math.floor(r() * 4)]);
        else { const n = findNode(d.root, pick()); if (n) { n.name = `Name ${k}`; n.layer = Math.floor(r() * 30); } }
      }, { now: k * 5000 });
      doc = res.doc; h = res.history;
    }
    const end = JSON.stringify(doc);
    expect(h.past.length).toBeGreaterThan(150);
    while (h.past.length) ({ doc, history: h } = undo(doc, h));
    expect(JSON.stringify(doc)).toBe(start);
    while (h.future.length) ({ doc, history: h } = redo(doc, h));
    expect(JSON.stringify(doc)).toBe(end);
  });

  it("keeps 200 steps, merges drags, ignores no-ops and jumps to a state", () => {
    let doc = docWith(rect(10, 10));
    let h = emptyHistory();
    const id = doc.root.children[0].id;
    for (let k = 0; k < 250; k++) ({ doc, history: h } = commit(doc, h, "Move", (d) => transformNodes(d, [id], translate(1, 0)), { now: k * 5000 }));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    h = emptyHistory();
    for (let k = 0; k < 10; k++) ({ doc, history: h } = commit(doc, h, "Drag", (d) => transformNodes(d, [id], translate(1, 0)), { mergeKey: "drag", now: 1000 + k * 50 }));
    expect(h.past).toHaveLength(1);
    h = seal(h);
    ({ doc, history: h } = commit(doc, h, "Drag", (d) => transformNodes(d, [id], translate(1, 0)), { mergeKey: "drag", now: 1600 }));
    expect(h.past).toHaveLength(2);
    const res = commit(doc, h, "Nothing", () => {});
    expect(res.changed).toBe(false);
    expect(res.history).toBe(h);
    const j = jumpTo(doc, h, 0);
    expect(j.history.past).toHaveLength(0);
    expect(j.history.future).toHaveLength(2);
  });
});

describe("snapping", () => {
  const s: SnapSettings = { grid: false, points: true, guides: true, smart: true, gridSize: 10 };

  it("snaps edges and centres to sheets and objects, with guide lines", () => {
    const a = rect(20, 20, 100, 100), m = rect(10, 10, 0, 0);
    const d = docWith(a, m);
    const t = snapTargets(d, new Set([m.id]), s);
    const box = worldBox(d.root, m.id);
    const r = snapMove(box, 4.7, 30, t, 1, s);
    close(r.dx, 5);
    expect(r.lines.some((l) => l.axis === "x" && l.at === 0)).toBe(true);
    const c = snapMove(box, 99.6, 99.8, t, 1, s);
    close(c.dx, 100); close(c.dy, 100);
  });

  it("snaps to equal spacing between neighbours", () => {
    const a = rect(10, 10, 105, 105), b = rect(10, 10, 165, 105), m = rect(10, 10, 0, 0);
    const d = docWith(a, b, m);
    const t = snapTargets(d, new Set([m.id]), { ...s, points: false });
    t.xs = t.xs.filter((x) => x.kind !== "edge" && x.kind !== "center");
    const r = snapMove(worldBox(d.root, m.id), 134.4, 105, t, 1, s);
    close(r.dx, 135);
    expect(r.lines.filter((l) => l.kind === "spacing")).toHaveLength(2);
  });

  it("snaps to the grid and to object points", () => {
    const d = docWith(rect(10, 10, 50, 50));
    const t = snapTargets(d, new Set(), { ...s, smart: false, guides: false });
    const g = snapMove({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 21.4, 41.2, { ...t, xs: [], ys: [] }, 2, { ...s, grid: true, smart: false });
    close(g.dx, 20); close(g.dy, 40);
    const far = snapMove({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 25, 41.2, { ...t, xs: [], ys: [] }, 2, { ...s, grid: true, smart: false });
    close(far.dx, 25);
    const p = snapPoint({ x: 45.3, y: 44.8 }, t, 1, s);
    close(p.p.x, 45); close(p.p.y, 45);
  });
});

describe("path editing helpers", () => {
  it("inserting an anchor keeps the curve, nearest point finds it", () => {
    const circle = shapePaths({ kind: "ellipse", rx: 20, ry: 20 })[0];
    const hit = nearestOnSubpaths({ x: 15, y: 15 }, [circle])!;
    close(hit.dist, Math.hypot(15, 15) - 20, 1e-3);
    const more = insertAnchor(circle, hit.seg, hit.t);
    expect(more.nodes).toHaveLength(5);
    close(area([more]), area([circle]), 1e-6);
    close(Math.hypot(more.nodes[hit.seg + 1].x, more.nodes[hit.seg + 1].y), 20, 0.01);
    const line = insertAnchor({ closed: false, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, 0, 0.25);
    expect(line.nodes[1]).toEqual({ x: 2.5, y: 0 });
  });

  it("pencil strokes are simplified and smoothed", () => {
    const pts = Array.from({ length: 200 }, (_, k) => ({ x: k, y: Math.sin(k / 10) * 0.01 }));
    expect(simplifyPolyline(pts, 0.1)).toHaveLength(2);
    const wave = Array.from({ length: 200 }, (_, k) => ({ x: k, y: Math.sin(k / 20) * 30 }));
    const s = smoothStroke(wave, 0.5, false);
    expect(s.nodes.length).toBeLessThan(40);
    expect(s.nodes.length).toBeGreaterThan(5);
    expect(s.closed).toBe(false);
    const ring = Array.from({ length: 100 }, (_, k) => ({ x: 30 * Math.cos(k / 99 * 2 * Math.PI), y: 30 * Math.sin(k / 99 * 2 * Math.PI) }));
    expect(smoothStroke(ring, 0.3, true).closed).toBe(true);
  });
});

describe("node bounds", () => {
  it("rotated shapes have exact world bounds", () => {
    const n = rect(20, 10);
    n.transform = rotateAt(90);
    boxClose(nodeBox(n), { minX: -5, minY: -10, maxX: 5, maxY: 10 }, 1e-9);
  });
});
