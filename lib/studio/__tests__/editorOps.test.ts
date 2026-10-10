import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { flatten, nodePaths, pathLength, polygonArea, rotateAt, subpathsBox, transformSubpaths } from "../geom";
import { clipToSvg, copyNodes, parseClip } from "../clipboard";
import { bindingsFor, COMMANDS } from "../commands";
import { cleanKeymap, exportKeymap, parseKeymap, reassign, usersOf } from "../keymap";
import { matches, shortcutFromEvent } from "../keys";
import {
  addMidpoints, breakApartNodes, closeSubpath, joinNodes, joinSubpaths, makeClip, makeCompound, releaseClip, resetBoxNodes, reverseSubpath,
} from "../pathOps";
import { findNode, locate, pasteNodes, worldBox } from "../scene";
import type { Document, PathNode, SceneNode, Subpath } from "../types";
import { builtIn, cleanWorkspace, showPanel, WORKSPACES } from "../workspace";

let seq = 0;
const ids = () => `p${++seq}`;
const close = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const area = (subs: Subpath[]) => subs.filter((s) => s.closed).reduce((a, s) => a + polygonArea(flatten(s, 0.001)), 0);
const line = (x0: number, y0: number, x1: number, y1: number): Subpath => ({ closed: false, nodes: [{ x: x0, y: y0 }, { x: x1, y: y1 }] });
const path = (subpaths: Subpath[], x = 0, y = 0): PathNode => ({ id: ids(), type: "path", transform: [1, 0, 0, 1, x, y], layer: 0, subpaths });
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const square: Subpath = { closed: true, nodes: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] };

describe("path operations", () => {
  it("reverses direction without changing the outline", () => {
    const curve: Subpath = { closed: false, nodes: [{ x: 0, y: 0, o: { x: 5, y: -5 } }, { x: 10, y: 0, i: { x: 8, y: 5 } }] };
    const r = reverseSubpath(curve);
    expect(r.nodes[0]).toEqual({ x: 10, y: 0, o: { x: 8, y: 5 } });
    expect(r.nodes[1]).toEqual({ x: 0, y: 0, i: { x: 5, y: -5 } });
    close(pathLength([r]), pathLength([curve]), 1e-6);
    close(area([reverseSubpath(square)]), -area([square]), 1e-9);
  });

  it("closes a path and merges an end lying on the start", () => {
    const open: Subpath = { closed: false, nodes: [...square.nodes, { x: 0, y: 0 }] };
    const c = closeSubpath(open);
    expect(c.closed).toBe(true);
    expect(c.nodes).toHaveLength(4);
    close(area([c]), 100, 1e-9);
  });

  it("adds a midpoint anchor to every segment and keeps the shape", () => {
    const m = addMidpoints(square);
    expect(m.nodes).toHaveLength(8);
    expect(m.nodes[1]).toEqual({ x: 5, y: 0 });
    close(area([m]), 100, 1e-9);
  });

  it("joins open paths at their nearest ends and closes a single path", () => {
    const joined = joinSubpaths([line(0, 0, 10, 0), line(10, 10, 10, 0.005), line(0, 10, 10, 10)], 0.01);
    expect(joined).toHaveLength(1);
    expect(joined[0].nodes.map((n) => [Math.round(n.x), Math.round(n.y)])).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(joined[0].closed).toBe(false);
    const ring = joinSubpaths(joined, 0.01);
    expect(ring[0].closed).toBe(true);
    close(Math.abs(area(ring)), 100, 1e-6);
  });

  it("joins paths of different objects in world space", () => {
    const a = path([line(0, 0, 10, 0)], 5, 5), b = path([line(0, 0, 10, 0)], 15, 5);
    const d = docWith(a, b);
    const id = joinNodes(d, [a.id, b.id]);
    expect(id).toBe(a.id);
    expect(d.root.children).toHaveLength(1);
    const p = findNode(d.root, id!) as PathNode;
    expect(p.subpaths).toHaveLength(1);
    const world = transformSubpaths(p.subpaths, locate(d.root, id!)!.world)[0];
    expect(world.nodes.map((n) => n.x)).toEqual([5, 15, 25]);
  });

  it("makes a compound path with a hole and breaks it apart again", () => {
    const outer = path([square]), inner: PathNode = { ...path([{ closed: true, nodes: [{ x: 2, y: 2 }, { x: 2, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 2 }] }]) };
    const d = docWith(outer, inner);
    const id = makeCompound(d, [outer.id, inner.id])!;
    expect(d.root.children).toHaveLength(1);
    const comp = findNode(d.root, id) as PathNode;
    expect(comp.subpaths).toHaveLength(2);
    close(area(comp.subpaths), 100 - 36, 1e-9);
    const parts = breakApartNodes(d, [id], ids);
    expect(parts).toHaveLength(2);
    expect(d.root.children).toHaveLength(2);
    close(area(nodePaths(d.root.children[0])), 100, 1e-9);
  });

  it("makes a clipping mask with the topmost object first and releases it", () => {
    const a = path([square]), b = path([square], 5, 5);
    const d = docWith(a, b);
    const g = makeClip(d, [a.id, b.id], ids)!;
    const group = findNode(d.root, g)!;
    expect(group.type === "group" && group.role).toBe("clip");
    expect(group.type === "group" && group.children.map((c) => c.id)).toEqual([b.id, a.id]);
    releaseClip(d, [g]);
    expect(d.root.children.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("resets the bounding box of a rotated path without moving its outline", () => {
    const p = path([square]);
    p.transform = rotateAt(30, 0, 0);
    p.transform[4] = 20; p.transform[5] = 10;
    const d = docWith(p);
    const before = worldBox(d.root, p.id);
    resetBoxNodes(d, [p.id]);
    const after = worldBox(d.root, p.id);
    (["minX", "minY", "maxX", "maxY"] as const).forEach((k) => close(after[k], before[k], 1e-9));
    expect((findNode(d.root, p.id) as PathNode).transform).toEqual([1, 0, 0, 1, 20, 10]);
  });
});

describe("clipboard", () => {
  it("copies with world transforms, round-trips as text and pastes in place", () => {
    const p = path([square], 30, 40);
    const d = docWith(p);
    const clip = copyNodes(d, [p.id]);
    expect(clip.nodes[0].transform).toEqual([1, 0, 0, 1, 30, 40]);
    const back = parseClip(JSON.stringify(clip))!;
    expect(back.nodes).toHaveLength(1);
    expect(parseClip("not json")).toBeNull();
    const d2 = docWith();
    const [nid] = pasteNodes(d2, back.nodes, { x: 0, y: 0 }, ids);
    expect(nid).not.toBe(p.id);
    expect(worldBox(d2.root, nid)).toEqual(worldBox(d.root, p.id));
  });

  it("writes SVG in millimetres with the cut-layer colour", () => {
    const p = path([square], 30, 40);
    const d = docWith(p);
    const svg = clipToSvg(d, copyNodes(d, [p.id]));
    expect(svg).toContain('width="10mm"');
    expect(svg).toContain('viewBox="30 40 10 10"');
    expect(svg).toContain(`stroke="${d.cutLayers[0].color}"`);
    const b = subpathsBox(transformSubpaths([square], [1, 0, 0, 1, 30, 40]));
    expect(b.minX).toBe(30);
  });
});

describe("custom shortcuts", () => {
  it("reassigns a key and removes it from the command that had it", () => {
    expect(usersOf("hingelab", {}, "Ctrl+G")).toEqual(["object.group"]);
    const k = reassign("hingelab", {}, "object.lock", "Ctrl+G");
    expect(k["object.lock"]).toEqual(["Ctrl+G"]);
    expect(k["object.group"]).toEqual([]);
    const b = bindingsFor("hingelab", k);
    expect(b.get("object.lock")).toEqual(["Ctrl+G"]);
    expect(b.has("object.group")).toBe(false);
  });

  it("exports and imports a set, dropping unknown commands and bad keys", () => {
    const text = exportKeymap("corel", { "object.lock": ["Ctrl+L"] });
    expect(parseKeymap(text)).toEqual({ set: "corel", bindings: { "object.lock": ["Ctrl+L"] } });
    expect(cleanKeymap({ "nope.cmd": ["X"], "object.hide": ["", 5, "Ctrl+H"] })).toEqual({ "object.hide": ["Ctrl+H"] });
    expect(() => parseKeymap("{}")).toThrow(/not a HingeLab shortcuts file/);
    expect(() => parseKeymap("{")).toThrow(/not valid JSON/);
  });

  it("records a key press as a shortcut that matches it again", () => {
    const ev = (key: string, code: string, m: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
      ({ key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m });
    expect(shortcutFromEvent(ev("Control", "ControlLeft", { ctrlKey: true }))).toBeNull();
    expect(shortcutFromEvent(ev("K", "KeyK", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+K");
    expect(shortcutFromEvent(ev("}", "BracketRight", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+]");
    expect(shortcutFromEvent(ev("F2", "F2"))).toBe("F2");
    expect(shortcutFromEvent(ev("Delete", "Delete"))).toBe("Delete");
    expect(shortcutFromEvent(ev("¡", "Digit1", { altKey: true }))).toBe("Alt+1");
    for (const [key, code, m] of [["K", "KeyK", { ctrlKey: true, shiftKey: true }], ["}", "BracketRight", { ctrlKey: true, shiftKey: true }], ["¡", "Digit1", { altKey: true }]] as const) {
      const e = ev(key, code, m);
      expect(matches(e, shortcutFromEvent(e)!)).toBe(true);
    }
  });

  it("every command can be found by id", () => {
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
  });
});

describe("workspaces", () => {
  it("has the built-ins and cleans stored layouts", () => {
    expect(WORKSPACES.map((w) => w.id)).toEqual(["essentials", "laser", "typography", "minimal"]);
    expect(cleanWorkspace({ panels: ["layers", "bogus", "layers"], active: "nope", dockWidth: 9999 }, "essentials"))
      .toEqual({ ...builtIn("essentials"), panels: ["layers"], active: "layers" });
    expect(cleanWorkspace(null, "laser")).toEqual(builtIn("laser"));
    const m = showPanel(builtIn("minimal"), "history");
    expect(m.panels).toEqual(["properties", "layers", "history"]);
    expect(m.active).toBe("history");
  });
});
