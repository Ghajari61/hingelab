import { describe, expect, it } from "vitest";
import { createEditorStore } from "@/components/studio/editor/store";
import { createDocument } from "../doc";
import { openHingelab, packHingelab } from "../file";
import { boxCenter, nodePaths, translate } from "../geom";
import { cloneNodes, clonesOf, originalsOf, relinkClones, removeClonesOf, syncLinks, unlinkClones, wouldCycle } from "../links";
import { copyNodes } from "../clipboard";
import { addEffect } from "../effects/ops";
import { alignNodes, duplicateNodes, expandNodes, findNode, groupNodes, pasteNodes, removeNodes, transformNodes, worldBox } from "../scene";
import { exchangePositions } from "../alignOps";
import { arrangeGrid } from "../arrange";
import type { CloneNode, Document, PathNode, SceneNode } from "../types";

let seq = 0;
const id = () => `n${++seq}`;
const sq = (x: number, y: number, s: number): PathNode => ({
  id: id(), type: "path", transform: [1, 0, 0, 1, x, y], layer: 1,
  subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }] }],
});
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const box = (d: Document, nid: string) => worldBox(d.root, nid);
const centre = (d: Document, nid: string) => boxCenter(box(d, nid));

describe("clones", () => {
  it("a new clone sits on its original and follows it", () => {
    const a = sq(0, 0, 10);
    const api = createEditorStore(docWith(a));
    let c: string[] = [];
    api.getState().edit("Clone", (d) => { c = cloneNodes(d, [a.id], id); });
    let d = api.getState().doc;
    expect(findNode(d.root, c[0])?.type).toBe("clone");
    expect(box(d, c[0])).toEqual(box(d, a.id));
    api.getState().edit("Move", (dd) => transformNodes(dd, [a.id], translate(20, 5)));
    d = api.getState().doc;
    expect(centre(d, c[0])).toEqual({ x: 25, y: 10 });
    // Moving the clone is relative to the original.
    api.getState().edit("Move", (dd) => transformNodes(dd, c, translate(0, 30)));
    d = api.getState().doc;
    expect(centre(d, c[0])).toEqual({ x: 25, y: 40 });
    // Editing the original's shape updates the clone.
    api.getState().edit("Edit", (dd) => { const n = findNode(dd.root, a.id) as PathNode; n.subpaths[0].nodes[2].x = 20; n.subpaths[0].nodes[1].x = 20; });
    d = api.getState().doc;
    expect(box(api.getState().doc, c[0]).maxX - box(d, c[0]).minX).toBeCloseTo(20, 9);
    // Undo restores the clone's cache with the shape.
    api.getState().undo();
    d = api.getState().doc;
    expect(box(d, c[0]).maxX - box(d, c[0]).minX).toBeCloseTo(10, 9);
    api.getState().redo();
    expect(box(api.getState().doc, c[0]).maxX - box(api.getState().doc, c[0]).minX).toBeCloseTo(20, 9);
  });

  it("moving original and clone together moves the clone once", () => {
    const a = sq(0, 0, 10);
    const api = createEditorStore(docWith(a));
    let c: string[] = [];
    api.getState().edit("Clone", (d) => { c = cloneNodes(d, [a.id], id); });
    api.getState().edit("Move clone", (d) => transformNodes(d, c, translate(30, 0)));
    api.getState().edit("Rotate both", (d) => transformNodes(d, [a.id, c[0]], [0, 1, -1, 0, 0, 0]));
    const d = api.getState().doc;
    expect(centre(d, a.id).x).toBeCloseTo(-5, 9); expect(centre(d, a.id).y).toBeCloseTo(5, 9);
    expect(centre(d, c[0]).x).toBeCloseTo(-5, 9); expect(centre(d, c[0]).y).toBeCloseTo(35, 9);
  });

  it("clones of groups show visible children after Live Effects, and clones of clones follow", () => {
    const a = sq(0, 0, 10), b = sq(20, 0, 10);
    const api = createEditorStore(docWith(a, b));
    let g: string | null = null;
    api.getState().edit("Group", (d) => { g = groupNodes(d, [a.id, b.id], id); });
    let c1: string[] = [], c2: string[] = [];
    api.getState().edit("Clone", (d) => { c1 = cloneNodes(d, [g!], id); });
    api.getState().edit("Clone of clone", (d) => { c2 = cloneNodes(d, c1, id); });
    expect(box(api.getState().doc, c2[0])).toEqual({ minX: 0, minY: 0, maxX: 30, maxY: 10 });
    api.getState().edit("Offset", (d) => { addEffect(d, [b.id], "offset"); });
    expect(box(api.getState().doc, c2[0]).maxX).toBeCloseTo(31, 2);
    api.getState().edit("Hide", (d) => { findNode(d.root, b.id)!.hidden = true; });
    expect(box(api.getState().doc, c1[0]).maxX).toBeCloseTo(10, 9);
    expect(box(api.getState().doc, c2[0]).maxX).toBeCloseTo(10, 9);
  });

  it("the clone keeps its own layer and Live Effects (linked offset)", () => {
    const a = sq(0, 0, 10);
    const api = createEditorStore(docWith(a));
    let c: string[] = [];
    api.getState().edit("Linked Offset", (d) => { c = cloneNodes(d, [a.id], id); addEffect(d, c, "offset"); findNode(d.root, c[0])!.layer = 5; });
    const d = api.getState().doc;
    const n = findNode(d.root, c[0]) as CloneNode;
    expect(n.layer).toBe(5);
    expect(box(d, c[0]).minX).toBeCloseTo(-1, 2);
    // Expand bakes the effect into a plain path.
    api.getState().edit("Expand", (dd) => { expandNodes(dd, c); });
    const p = findNode(api.getState().doc.root, c[0])!;
    expect(p.type).toBe("path");
    expect(box(api.getState().doc, c[0]).minX).toBeCloseTo(-1, 2);
  });

  it("deleting the original turns clones into paths; unlink, select original, relink, remove clones", () => {
    const a = sq(0, 0, 10), b = sq(50, 0, 4);
    const api = createEditorStore(docWith(a, b));
    let c: string[] = [];
    api.getState().edit("Clone", (d) => { c = [...cloneNodes(d, [a.id], id), ...cloneNodes(d, [a.id], id)]; });
    expect(originalsOf(api.getState().doc, c)).toEqual([a.id]);
    expect(clonesOf(api.getState().doc, [a.id]).sort()).toEqual([...c].sort());
    api.getState().edit("Relink", (d) => { relinkClones(d, [c[1]], b.id); });
    expect(box(api.getState().doc, c[1])).toEqual({ minX: 50, minY: 0, maxX: 54, maxY: 4 });
    api.getState().edit("Unlink", (d) => { unlinkClones(d, [c[1]]); });
    expect(findNode(api.getState().doc.root, c[1])?.type).toBe("path");
    api.getState().edit("Delete", (d) => removeNodes(d, [a.id]));
    const d = api.getState().doc;
    expect(findNode(d.root, c[0])?.type).toBe("path");
    expect(box(d, c[0])).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
    api.getState().undo();
    expect(findNode(api.getState().doc.root, c[0])?.type).toBe("clone");
    let n = 0;
    api.getState().edit("Remove Tiled Clones", (dd) => { n = removeClonesOf(dd, [a.id]); });
    expect(n).toBe(1);
    expect(findNode(api.getState().doc.root, c[0])).toBeNull();
  });

  it("refuses and breaks loops", () => {
    const a = sq(0, 0, 10);
    const d0 = docWith(a);
    const c = cloneNodes(d0, [a.id], id);
    let g: string | null = null;
    g = groupNodes(d0, [a.id, c[0]], id);
    expect(wouldCycle(d0, c[0], g!)).toBe(true);
    expect(wouldCycle(d0, c[0], a.id)).toBe(false);
    expect(relinkClones(d0, c, g!)).toEqual([]);
    // A loop written straight into a document (a damaged file) is unlinked by the sync.
    const bad = docWith(sq(0, 0, 1));
    bad.root.children.push({ id: "x", type: "clone", source: "y", transform: [1, 0, 0, 1, 0, 0], layer: 0 }, { id: "y", type: "clone", source: "x", transform: [1, 0, 0, 1, 0, 0], layer: 0 });
    const fixed = syncLinks(bad);
    expect(fixed.root.children.map((x) => x.type)).toEqual(["path", "path", "path"]);
  });

  it("duplicates, copies and pastes as clones, and survives save and load", () => {
    const a = sq(0, 0, 10);
    const api = createEditorStore(docWith(a));
    let c: string[] = [];
    api.getState().edit("Clone", (d) => { c = cloneNodes(d, [a.id], id); });
    let dup: string[] = [];
    api.getState().edit("Duplicate", (d) => { dup = duplicateNodes(d, c, { x: 5, y: 0 }, id); });
    expect((findNode(api.getState().doc.root, dup[0]) as CloneNode).source).toBe(a.id);
    const clip = copyNodes(api.getState().doc, c);
    let pasted: string[] = [];
    api.getState().edit("Paste", (d) => { pasted = pasteNodes(d, clip.nodes, { x: 0, y: 20 }, id); });
    expect(centre(api.getState().doc, pasted[0])).toEqual({ x: 5, y: 25 });
    api.getState().edit("Move", (d) => transformNodes(d, [a.id], translate(1, 0)));
    expect(centre(api.getState().doc, pasted[0])).toEqual({ x: 6, y: 25 });
    // Pasted into a document without the original, the clone becomes a path where it was.
    const other = createEditorStore(docWith());
    other.getState().edit("Paste", (d) => { pasteNodes(d, clip.nodes, { x: 0, y: 0 }, id); });
    expect(other.getState().doc.root.children[0].type).toBe("path");
    // Save and load.
    const bytes = packHingelab({ doc: api.getState().doc });
    const opened = openHingelab(bytes);
    if (opened.kind !== "studio") throw new Error("not studio");
    expect(nodePaths(findNode(opened.doc.root, c[0])!)).toEqual(nodePaths(findNode(api.getState().doc.root, c[0])!));
    expect(syncLinks(opened.doc)).toBe(opened.doc);
  });

  it("a moved group of clones keeps its clones", () => {
    const a = sq(0, 0, 10);
    const api = createEditorStore(docWith(a));
    let g: string | null = null;
    api.getState().edit("Clones", (d) => { const c = cloneNodes(d, [a.id], id); transformNodes(d, c, translate(20, 0)); g = groupNodes(d, c, id); });
    api.getState().edit("Move group", (d) => transformNodes(d, [g!], translate(0, 50)));
    expect(box(api.getState().doc, g!)).toEqual({ minX: 20, minY: 50, maxX: 30, maxY: 60 });
    // Select all and move: everything moves once.
    api.getState().edit("Move all", (d) => transformNodes(d, [a.id, g!], translate(7, 0)));
    expect(box(api.getState().doc, a.id).minX).toBe(7);
    expect(box(api.getState().doc, g!).minX).toBeCloseTo(27, 9);
  });

  it("per-object moves (align, arrange, exchange) move a clone and its original once each", () => {
    const setup = () => {
      const a = sq(10, 0, 10), b = sq(2, 40, 10);
      const api = createEditorStore(docWith(a, b));
      let c = "";
      api.getState().edit("Clone", (d) => { c = cloneNodes(d, [a.id], id)[0]; transformNodes(d, [c], translate(30, 20)); });
      return { a, b, c, api };
    };
    let t = setup();
    t.api.getState().edit("Align", (d) => alignNodes(d, [t.a.id, t.c, t.b.id], "left"));
    expect([t.a.id, t.c, t.b.id].map((n) => box(t.api.getState().doc, n).minX)).toEqual([2, 2, 2]);
    t = setup();
    t.api.getState().edit("Arrange", (d) => arrangeGrid(d, [t.a.id, t.c, t.b.id], { rows: 1, cols: 0, spacingX: 5, spacingY: 0, alignX: 0, alignY: 0, equal: false }));
    expect([t.a.id, t.c, t.b.id].map((n) => box(t.api.getState().doc, n).minX)).toEqual([2, 17, 32]);
    t = setup();
    const before = [t.a.id, t.c, t.b.id].map((n) => centre(t.api.getState().doc, n));
    t.api.getState().edit("Exchange", (d) => exchangePositions(d, [t.a.id, t.c, t.b.id], "selection"));
    expect([t.a.id, t.c, t.b.id].map((n) => centre(t.api.getState().doc, n))).toEqual([before[1], before[2], before[0]]);
  });
});
