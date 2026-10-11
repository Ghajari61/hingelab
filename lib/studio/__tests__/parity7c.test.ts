import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { buildHandlers, type CommandContext } from "@/components/studio/editor/commandHandlers";
import { createEditorStore } from "@/components/studio/editor/store";
import { loadFont, type LoadedFont } from "@/lib/letters";
import { bindingsFor, COMMAND_BY_ID, COMMANDS, conflicts, MENUS, menuIds, paletteLabel, paletteSearchText } from "../commands";
import { fuzzyFilter } from "../fuzzy";
import { canonical } from "../keys";
import { createDocument } from "../doc";
import { apply, invert, subpathsBox, transformSubpaths, translate } from "../geom";
import { syncLinks } from "../links";
import { connectObjects } from "../connectors";
import { findNode, removeNodes, transformNodes, worldBox } from "../scene";
import { layoutText, type GlyphPlace, type TextSettings } from "../text";
import { pathWalker } from "../textGeom";
import { flowIntoShape, kernAt, putOnPath, remapManual, rotateChars, shiftChars } from "../textOps";
import type { Document, PathNode, SceneNode, Subpath, TextNode } from "../types";
import { produce } from "immer";

function fixture(file: string, id: string): LoadedFont {
  const b = readFileSync(join(__dirname, "..", "..", "letters", "__tests__", "fonts", file));
  return loadFont(hb, id, id, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}
const fredoka = fixture("Fredoka-Bold.ttf", "fredoka");
const vazir = fixture("Vazirmatn-Black.ttf", "vazir");
const base: TextSettings = { text: "Hello", size: 20, tracking: 0, lineHeight: 1.2, align: "start", direction: "auto" };

const line = (x0: number, y0: number, x1: number, y1: number): Subpath[] => [{ closed: false, nodes: [{ x: x0, y: y0 }, { x: x1, y: y1 }] }];
const rect = (w: number, h: number): Subpath[] => [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }];
/** A circle of four cubics, clockwise on screen from its rightmost point. */
const circle = (r: number, cx = 0, cy = 0): Subpath[] => {
  const k = 0.5522847498 * r;
  const pts = [[r, 0, 0, k], [0, r, -k, 0], [-r, 0, 0, -k], [0, -r, k, 0]];
  return [{ closed: true, nodes: pts.map(([x, y, dx, dy]) => ({ x: cx + x, y: cy + y, i: { x: cx + x - dx, y: cy + y - dy }, o: { x: cx + x + dx, y: cy + y + dy } })) }];
};
/** The point on the baseline under the glyph's middle (where text on a path touches the path). */
const mid = (g: GlyphPlace) => { const a = (g.angle * Math.PI) / 180; return { x: g.x + (Math.cos(a) * g.advance) / 2, y: g.y + (Math.sin(a) * g.advance) / 2 }; };

describe("text on a path", () => {
  it("places glyphs along a straight path at their advances, turned with it", () => {
    const flat = layoutText(hb, fredoka, base);
    const along = layoutText(hb, fredoka, { ...base, onPath: "p", frame: line(0, 0, 200, 0) });
    expect(along.glyphs.map((g) => [g.x, g.y, g.angle])).toEqual(flat.glyphs.map((g) => [expect.closeTo(g.x, 9), expect.closeTo(0, 9), expect.closeTo(0, 9)]));
    expect(subpathsBox(along.outline).minX).toBeCloseTo(subpathsBox(flat.outline).minX, 9);
    const diag = layoutText(hb, fredoka, { ...base, onPath: "p", frame: line(0, 0, 100, 100), pathStart: 10 });
    const L = Math.SQRT2 * 100;
    diag.glyphs.forEach((g, k) => {
      expect(g.angle).toBeCloseTo(45, 9);
      expect(g.x).toBeCloseTo(g.y, 9);
      expect(Math.hypot(g.x, g.y)).toBeCloseTo(0.1 * L + flat.glyphs[k].x, 6);
    });
  });

  it("follows a circle: glyph middles on it at their cumulative advances, turned to the tangent", () => {
    const r = 50, frame = circle(r);
    const walk = pathWalker(frame[0]);
    const flat = layoutText(hb, fredoka, base);
    const out = layoutText(hb, fredoka, { ...base, onPath: "c", frame, pathStart: 25 });
    expect(out.glyphs).toHaveLength(flat.glyphs.length);
    out.glyphs.forEach((g, k) => {
      const m = mid(g), want = walk.at(0.25 * walk.length + flat.glyphs[k].x + g.advance / 2);
      expect(Math.hypot(m.x, m.y)).toBeCloseTo(r, 1);
      expect(m.x).toBeCloseTo(want.p.x, 6);
      expect(m.y).toBeCloseTo(want.p.y, 6);
      expect(g.angle).toBeCloseTo((want.angle * 180) / Math.PI, 6);
      // The tangent of a circle is square to the radius (to the four-cubic circle's accuracy).
      const a = (g.angle * Math.PI) / 180;
      expect((Math.cos(a) * m.x + Math.sin(a) * m.y) / r).toBeCloseTo(0, 2);
    });
    // Clockwise from the bottom (25 %) the text runs leftwards, upright outside the circle's bottom.
    expect(Math.abs(out.glyphs[0].angle)).toBeGreaterThan(170);
    // The other side reads the path backwards.
    const back = layoutText(hb, fredoka, { ...base, onPath: "c", frame, pathStart: 25, pathSide: "right" });
    expect(back.glyphs[0].angle).toBeCloseTo(-out.glyphs[0].angle + 0, 0);
  });

  it("lays right-to-left text in visual order and hides what runs off an open path", () => {
    const fa = { ...base, text: "سلام دنیا", direction: "auto" as const };
    const flat = layoutText(hb, vazir, fa);
    const out = layoutText(hb, vazir, { ...fa, onPath: "p", frame: line(0, 0, 300, 0), pathStart: 100 });
    expect(out.overflow).toBeUndefined();
    const xs = out.glyphs.map((g) => g.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(out.glyphs[0].index).toBeGreaterThan(out.glyphs[out.glyphs.length - 1].index);
    const b = subpathsBox(out.outline);
    expect(b.maxX).toBeLessThanOrEqual(300 + 1);
    expect(b.minX).toBeCloseTo(300 - flat.lines[0].width + subpathsBox(flat.outline).minX + flat.lines[0].width, 0);
    const short = layoutText(hb, vazir, { ...fa, onPath: "p", frame: line(0, 0, 30, 0), pathStart: 100 });
    expect(short.overflow).toBe(true);
    expect(short.glyphs.length).toBeLessThan(flat.glyphs.length);
  });
});

describe("flowed text", () => {
  const text = "The quick brown fox jumps over the lazy dog while five wizards box quickly";
  it("wraps in a rectangle exactly like area text of the same width", () => {
    const s = { ...base, text, size: 4 };
    const area = layoutText(hb, fredoka, { ...s, width: 40 });
    const flow = layoutText(hb, fredoka, { ...s, flowInto: "r", frame: rect(40, 200) });
    expect(flow.lines.length).toBe(area.lines.length);
    expect(flow.lines.length).toBeGreaterThan(2);
    flow.lines.forEach((l, k) => {
      expect(l.text).toBe(area.lines[k].text);
      expect(l.width).toBeCloseTo(area.lines[k].width, 9);
      expect(l.x).toBeCloseTo(area.lines[k].x, 9);
      expect(l.baseline - flow.lines[0].baseline).toBeCloseTo(area.lines[k].baseline, 9);
    });
    const short = layoutText(hb, fredoka, { ...s, flowInto: "r", frame: rect(40, 12) });
    expect(short.overflow).toBe(true);
    expect(short.lines.map((l) => l.text)).toEqual(area.lines.slice(0, 2).map((l) => l.text));
    for (const l of short.lines) expect(l.baseline).toBeLessThan(12);
  });

  it("follows a circle: the first line is shorter than the middle one and every line stays inside", () => {
    const s = { ...base, text: `${text} ${text}`, size: 4, align: "center" as const };
    const r = 25, out = layoutText(hb, fredoka, { ...s, flowInto: "c", frame: circle(r, r, r) });
    expect(out.lines.length).toBeGreaterThan(4);
    const middle = out.lines.reduce((a, l) => (Math.abs(l.baseline - r) < Math.abs(a.baseline - r) ? l : a));
    expect(out.lines[0].width).toBeLessThan(middle.width);
    for (const l of out.lines) {
      const half = Math.sqrt(Math.max(0, r * r - Math.min((l.baseline - 4 - r) ** 2, (l.baseline + 1 - r) ** 2)));
      expect(l.x).toBeGreaterThanOrEqual(r - half - 1e-6);
      expect(l.x + l.width).toBeLessThanOrEqual(r + half + 1e-6);
    }
  });
});

describe("manual kerning, shifts and turns", () => {
  it("a kern moves every following glyph by the amount and changes the outline", () => {
    const flat = layoutText(hb, fredoka, base);
    const kerned = layoutText(hb, fredoka, { ...base, kerns: { 2: 100 } });
    kerned.glyphs.forEach((g, k) => expect(g.x - flat.glyphs[k].x).toBeCloseTo(g.index >= 2 ? 2 : 0, 9));
    expect(kerned.lines[0].width - flat.lines[0].width).toBeCloseTo(2, 9);
    expect(subpathsBox(kerned.outline).maxX - subpathsBox(flat.outline).maxX).toBeCloseTo(2, 9);
    // Right-to-left: the kerned character and everything after it (to its left) move left.
    const fa = { ...base, text: "سلام" };
    const a = layoutText(hb, vazir, fa), b = layoutText(hb, vazir, { ...fa, kerns: { 2: 100 } });
    expect(b.lines[0].width - a.lines[0].width).toBeCloseTo(2, 9);
  });

  it("shifts move a glyph off the baseline and turns spin it in place", () => {
    const flat = layoutText(hb, fredoka, { ...base, text: "H" });
    const up = layoutText(hb, fredoka, { ...base, text: "H", shifts: { 0: 250 } });
    expect(subpathsBox(up.outline).minY - subpathsBox(flat.outline).minY).toBeCloseTo(-5, 9);
    const turned = layoutText(hb, fredoka, { ...base, text: "H", rotations: { 0: 90 } });
    const a = subpathsBox(flat.outline), b = subpathsBox(turned.outline);
    expect(b.maxX - b.minX).toBeCloseTo(a.maxY - a.minY, 6);
  });

  it("edits keep manual values on the same characters", () => {
    const t = { kerns: { 1: 10, 4: 20 }, shifts: { 3: 5 } } as unknown as TextNode;
    remapManual(t, "Hello", "HeXXllo");
    expect(t.kerns).toEqual({ 1: 10, 6: 20 });
    expect(t.shifts).toEqual({ 5: 5 });
    remapManual(t, "HeXXllo", "Hello");
    expect(t.kerns).toEqual({ 1: 10, 4: 20 });
    const u = { text: "ab" } as TextNode;
    kernAt(u, 1, 0.04);
    expect(u.kerns).toBeUndefined();
    kernAt(u, 1, 12.34);
    kernAt(u, 1, -12.34);
    expect(u.kerns).toBeUndefined();
    shiftChars(u, 0, 2, 50);
    expect(u.shifts).toEqual({ 0: 50, 1: 50 });
    rotateChars(u, 1, 1, 200);
    expect(u.rotations).toEqual({ 1: -160 });
  });
});

describe("vertical text", () => {
  it("stacks glyphs downwards by the advance, upright, columns right to left", () => {
    const out = layoutText(hb, fredoka, { ...base, vertical: true, text: "Hey\nyou" });
    const ext = fredoka.hb.hExtents();
    const adv = ((ext.ascender - ext.descender) / fredoka.unitsPerEm) * base.size;
    const first = out.glyphs.filter((g) => g.index < 3), second = out.glyphs.filter((g) => g.index > 3);
    first.forEach((g, k) => {
      expect(g.advance).toBeCloseTo(adv, 9);
      expect(g.angle).toBe(90);
      expect(g.x).toBe(0);
      expect(g.y).toBeCloseTo(k * adv, 9);
    });
    second.forEach((g) => expect(g.x).toBeCloseTo(-base.lineHeight * base.size, 9));
    // Upright: a glyph is as wide as in horizontal text.
    const h = layoutText(hb, fredoka, { ...base, text: "H" }), v = layoutText(hb, fredoka, { ...base, text: "H", vertical: true });
    const hb1 = subpathsBox(h.outline), vb = subpathsBox(v.outline);
    expect(vb.maxX - vb.minX).toBeCloseTo(hb1.maxX - hb1.minX, 9);
    expect((vb.minX + vb.maxX) / 2).toBeCloseTo(0, 0);
    expect(vb.minY).toBeGreaterThanOrEqual(0);
    // Kerning in a column moves the following glyphs down.
    const k = layoutText(hb, fredoka, { ...base, text: "Hey", vertical: true, kerns: { 1: 100 } });
    expect(k.glyphs[2].y - first[2].y).toBeCloseTo(2, 9);
  });
});

let seq = 0;
const nid = () => `q${++seq}`;
const pathNode = (subpaths: Subpath[], x = 0, y = 0): PathNode => ({ id: nid(), type: "path", transform: [1, 0, 0, 1, x, y], layer: 1, subpaths });
const textNode = (over: Partial<TextNode> = {}): TextNode => ({ id: nid(), type: "text", transform: [1, 0, 0, 1, 0, 0], layer: 2, text: "Hi", font: "fredoka", size: 10, tracking: 0, lineHeight: 1.2, align: "start", direction: "auto", ...over });
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const edit = (d: Document, fn: (d: Document) => void) => syncLinks(produce(d, (x) => { fn(x); }));

describe("linked frames", () => {
  it("keeps the path in the text's coordinates, follows it, and keeps the shape when it is deleted", () => {
    const p = pathNode(line(0, 0, 100, 0), 10, 20), t = textNode({ transform: [2, 0, 0, 2, 5, 5] });
    let d = edit(docWith(p, t), (x) => { expect(putOnPath(x, t.id, p.id)).toBe(true); });
    const tt = () => findNode(d.root, t.id) as TextNode;
    const world = (sub: Subpath[]) => transformSubpaths(sub, tt().transform);
    expect(world(tt().frame!)[0].nodes).toEqual([{ x: 10, y: 20 }, { x: 110, y: 20 }]);
    expect(tt().pathStart).toBe(0);
    d = edit(d, (x) => transformNodes(x, [p.id], translate(0, 30)));
    expect(world(tt().frame!)[0].nodes.map((n) => n.y)).toEqual([50, 50]);
    // Moving the text alone keeps it on the path (the frame is re-read in its new coordinates).
    d = edit(d, (x) => transformNodes(x, [t.id], translate(7, 0)));
    expect(world(tt().frame!)[0].nodes[0]).toEqual({ x: 10, y: 50 });
    const frame = tt().frame;
    expect(syncLinks(d)).toBe(d);
    d = edit(d, (x) => removeNodes(x, [p.id]));
    expect(tt().frame).toBe(frame);
    expect(tt().onPath).toBe(p.id);
  });

  it("refuses links that would loop and only flows into closed shapes", () => {
    const t = textNode(), open = pathNode(line(0, 0, 10, 0)), closed = pathNode(rect(30, 30));
    const d = docWith(t, open, closed);
    produce(d, (x) => {
      expect(putOnPath(x, t.id, t.id)).toBe(false);
      expect(flowIntoShape(x, t.id, open.id)).toBe(false);
      expect(flowIntoShape(x, t.id, closed.id)).toBe(true);
      expect((findNode(x.root, t.id) as TextNode).flowInto).toBe(closed.id);
    });
  });
});

describe("connectors", () => {
  const square = (x: number, y: number) => pathNode(rect(10, 10), x, y);
  const route = (d: Document, id: string) => {
    const c = findNode(d.root, id) as PathNode;
    return c.subpaths[0].nodes.map((n) => apply(c.transform, n));
  };

  it("runs between the objects' outlines and follows them", () => {
    const a = square(0, 0), b = square(40, 0);
    let d = edit(docWith(a, b), (x) => { connectObjects(x, a.id, b.id, "straight", 3, "con"); });
    expect(route(d, "con")).toEqual([{ x: 10, y: 5 }, { x: 40, y: 5 }]);
    d = edit(d, (x) => transformNodes(x, [b.id], translate(0, 40)));
    const [p, q] = route(d, "con");
    // On the outlines: the exit is on A's bottom edge, the entry on B's top edge, on the centre line.
    expect(p.y).toBeCloseTo(10, 9);
    expect(q.y).toBeCloseTo(40, 9);
    expect((p.x - 5) / (p.y - 5)).toBeCloseTo((45 - 5) / (45 - 5), 9);
    expect(syncLinks(d)).toBe(d);
  });

  it("orthogonal routes use horizontal and vertical runs", () => {
    const a = square(0, 0), b = square(40, 30);
    const d = edit(docWith(a, b), (x) => { connectObjects(x, a.id, b.id, "orthogonal", 3, "con"); });
    const pts = route(d, "con");
    expect(pts).toEqual([{ x: 10, y: 5 }, { x: 45, y: 5 }, { x: 45, y: 30 }]);
    const c = square(0, 40);
    const z = edit(docWith(a, c), (x) => { connectObjects(x, a.id, c.id, "orthogonal", 3, "z"); });
    expect(route(z, "z")).toEqual([{ x: 5, y: 10 }, { x: 5, y: 40 }]);
    const e = square(30, 8);
    const zz = edit(docWith(a, e), (x) => { connectObjects(x, a.id, e.id, "orthogonal", 3, "zz"); });
    expect(route(zz, "zz")).toEqual([{ x: 10, y: 5 }, { x: 20, y: 5 }, { x: 20, y: 13 }, { x: 30, y: 13 }]);
    // Centres lined up to within rounding: one straight run, no zero-length jog.
    const f = square(4e-4, 40);
    const s = edit(docWith(a, f), (x) => { connectObjects(x, a.id, f.id, "orthogonal", 3, "s"); });
    expect(route(s, "s")).toHaveLength(2);
  });

  it("clips to a round outline, becomes a plain path when an end is deleted, and survives loops", () => {
    const disc = pathNode(circle(10, 10, 10)), b = square(50, 5);
    let d = edit(docWith(disc, b), (x) => { connectObjects(x, disc.id, b.id, "straight", 3, "con"); });
    expect(route(d, "con")[0].x).toBeCloseTo(20, 3);
    d = edit(d, (x) => removeNodes(x, [b.id]));
    const c = findNode(d.root, "con") as PathNode;
    expect(c.connector).toBeUndefined();
    expect(c.subpaths[0].nodes).toHaveLength(2);
    // Two connectors attached to each other: a loop, both become plain paths.
    const a = square(0, 0);
    const loop = edit(docWith(a), (x) => {
      x.root.children.push({ ...pathNode(line(0, 0, 1, 1)), id: "c1", connector: { from: a.id, to: "c2", mode: "straight" } });
      x.root.children.push({ ...pathNode(line(0, 0, 1, 1)), id: "c2", connector: { from: a.id, to: "c1", mode: "straight" } });
    });
    expect((findNode(loop.root, "c1") as PathNode).connector).toBeUndefined();
    expect((findNode(loop.root, "c2") as PathNode).connector).toBeUndefined();
  });

  it("a connector in a moved group stays on the page between its objects", () => {
    const a = square(0, 0), b = square(40, 0);
    let d = edit(docWith(a, b), (x) => { connectObjects(x, a.id, b.id, "straight", 3, "con"); });
    d = edit(d, (x) => { (findNode(x.root, "con") as PathNode).transform = [1, 0, 0, 1, 7, 9]; });
    expect(route(d, "con")).toEqual([{ x: 10, y: 5 }, { x: 40, y: 5 }]);
    expect(worldBox(d.root, "con").minX).toBeCloseTo(10, 9);
    expect(invert([1, 0, 0, 1, 7, 9])[4]).toBe(-7);
  });
});

// ---------- commands ----------

describe("Type and connector commands are registered", () => {
  const NEW = ["type.putOnPath", "type.removeFromPath", "type.pathSide", "type.flowIntoShape", "type.unflow", "type.dir.horizontal", "type.dir.vertical", "type.removeKerns"];
  it("are in the Type menu", () => {
    const type = menuIds(MENUS.find((m) => m.id === "type")!.items);
    for (const id of NEW) { expect(type, id).toContain(id); expect(COMMAND_BY_ID.has(id), id).toBe(true); }
    expect(COMMAND_BY_ID.get("tool.connector")?.category).toBe("Tool");
  });

  it("have the Inkscape-style keys without conflicts", () => {
    const ink = bindingsFor("inkscape");
    const owner = (key: string) => [...ink].filter(([, keys]) => keys.some((k) => canonical(k) === canonical(key))).map(([cid]) => cid);
    expect(owner("O")).toEqual(["tool.connector"]);
    expect(owner("Ctrl+F2")).toEqual(["tool.connector"]);
    expect(owner("Alt+W")).toEqual(["type.flowIntoShape"]);
    expect(owner("Shift+Alt+W")).toEqual(["type.unflow"]);
    for (const set of ["hingelab", "corel", "lightburn", "inkscape"] as const) expect(conflicts(bindingsFor(set)), set).toEqual([]);
  });

  const items = COMMANDS.map((c) => ({ id: c.id, label: paletteLabel(c), category: c.category, keywords: c.keywords }));
  it.each([
    ["text on path", "type.putOnPath"], ["path text", "type.putOnPath"], ["flow text", "type.flowIntoShape"], ["area type", "type.flowIntoShape"],
    ["kern", "type.removeKerns"], ["tracking", "type.removeKerns"], ["vertical type", "type.dir.vertical"], ["connector", "tool.connector"],
    ["flowchart", "tool.connector"], ["unflow", "type.unflow"],
  ])("palette: %s → %s", (q, id) => {
    expect(fuzzyFilter(items, q, paletteSearchText).slice(0, 8).map((r) => r.item.id)).toContain(id);
  });
});

describe("Type commands: run, undo and redo", () => {
  const make = (...nodes: SceneNode[]) => {
    const api = createEditorStore(docWith(...nodes));
    const h = () => buildHandlers({
      api, canvas: () => null, toast: () => {}, navigate: () => {}, openFile: () => {}, save: () => {}, saveCopy: () => {}, download: () => {},
      rename: () => {}, revert: () => {}, dialog: () => {}, showPanel: () => {}, workspace: "essentials", setWorkspace: () => {}, resetWorkspace: () => {},
      theme: "dark", setTheme: () => {}, lastField: () => null, viewCenter: () => ({ x: 0, y: 0 }), offsetStep: 1,
    } as CommandContext);
    const text = (id: string) => findNode(api.getState().doc.root, id) as TextNode;
    /** Runs a command, then checks undo restores the document and redo brings the result back. */
    const roundTrip = (cmd: string) => {
      const before = api.getState().doc;
      const hd = h()[cmd];
      expect(hd.enabled, cmd).toBe(true);
      hd.run();
      const after = api.getState().doc;
      expect(after, cmd).not.toBe(before);
      api.getState().undo();
      expect(JSON.parse(JSON.stringify(api.getState().doc.root))).toEqual(JSON.parse(JSON.stringify(before.root)));
      api.getState().redo();
      expect(JSON.parse(JSON.stringify(api.getState().doc.root))).toEqual(JSON.parse(JSON.stringify(after.root)));
    };
    return { api, h, text, roundTrip };
  };

  it("put on path, other side, remove from path", () => {
    const t = textNode(), c = pathNode(circle(20, 50, 50)), o = pathNode(line(0, 0, 10, 0));
    const { api, h, text, roundTrip } = make(t, c, o);
    expect(h()["type.putOnPath"].enabled).toBe(false);
    api.getState().select([t.id, c.id]);
    roundTrip("type.putOnPath");
    expect(text(t.id).onPath).toBe(c.id);
    expect(text(t.id).frame?.[0].nodes[0]).toEqual(expect.objectContaining({ x: 70, y: 50 }));
    expect(api.getState().selection).toEqual([t.id]);
    expect(h()["type.pathSide"].checked).toBe(false);
    roundTrip("type.pathSide");
    expect(text(t.id).pathSide).toBe("right");
    expect(h()["type.pathSide"].checked).toBe(true);
    expect(h()["type.dir.vertical"].enabled).toBe(false);
    roundTrip("type.removeFromPath");
    expect(text(t.id).onPath).toBeUndefined();
    expect(text(t.id).frame).toBeUndefined();
    // The path's start (a closed path read backwards starts at the same node).
    expect(text(t.id).transform).toEqual([1, 0, 0, 1, 70, 50]);
  });

  it("flow into a closed shape and unflow; open paths are refused", () => {
    const t = textNode(), r = pathNode(rect(40, 30), 10, 10), o = pathNode(line(0, 0, 10, 0));
    const { api, h, text, roundTrip } = make(t, r, o);
    api.getState().select([t.id, o.id]);
    expect(h()["type.flowIntoShape"].enabled).toBe(false);
    expect(h()["type.flowIntoShape"].reason).toBe("Select one text and one closed shape");
    api.getState().select([t.id, r.id]);
    roundTrip("type.flowIntoShape");
    expect(text(t.id).flowInto).toBe(r.id);
    expect(text(t.id).frame).toHaveLength(1);
    roundTrip("type.unflow");
    expect(text(t.id).flowInto).toBeUndefined();
    expect(text(t.id).width).toBe(40);
    expect(text(t.id).transform).toEqual([1, 0, 0, 1, 10, 10 + t.size]);
  });

  it("vertical type and removing manual kerns", () => {
    const t = textNode({ kerns: { 1: 40 }, shifts: { 0: 10 } });
    const { api, h, text, roundTrip } = make(t);
    api.getState().select([t.id]);
    roundTrip("type.dir.vertical");
    expect(text(t.id).vertical).toBe(true);
    expect(h()["type.dir.vertical"].checked).toBe(true);
    roundTrip("type.dir.horizontal");
    expect(text(t.id).vertical).toBeUndefined();
    roundTrip("type.removeKerns");
    expect(text(t.id).kerns).toBeUndefined();
    expect(h()["type.removeKerns"].enabled).toBe(false);
  });

  it("connectors: create, follow a move, undo, delete an end, expand", () => {
    const a = pathNode(rect(10, 10)), b = pathNode(rect(10, 10), 40, 0);
    const { api, h } = make(a, b);
    const route = () => { const c = findNode(api.getState().doc.root, "con") as PathNode; return c.subpaths[0]?.nodes.map((n) => apply(c.transform, n)); };
    api.getState().edit("Connector", (d) => { connectObjects(d, a.id, b.id, "orthogonal", 3, "con"); }, { select: ["con"] });
    expect(route()).toEqual([{ x: 10, y: 5 }, { x: 40, y: 5 }]);
    api.getState().edit("Move", (d) => transformNodes(d, [b.id], translate(0, 30)));
    expect(route()).toEqual([{ x: 10, y: 5 }, { x: 45, y: 5 }, { x: 45, y: 30 }]);
    api.getState().undo();
    expect(route()).toEqual([{ x: 10, y: 5 }, { x: 40, y: 5 }]);
    api.getState().redo();
    api.getState().edit("Delete", (d) => removeNodes(d, [a.id]));
    expect((findNode(api.getState().doc.root, "con") as PathNode).connector).toBeUndefined();
    api.getState().undo();
    expect((findNode(api.getState().doc.root, "con") as PathNode).connector?.from).toBe(a.id);
    api.getState().select(["con"]);
    h()["object.expand"].run();
    const c = findNode(api.getState().doc.root, "con") as PathNode;
    expect(c.connector).toBeUndefined();
    expect(c.subpaths[0].nodes).toHaveLength(3);
  });
});
