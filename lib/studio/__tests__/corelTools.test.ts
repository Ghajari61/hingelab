import { describe, expect, it } from "vitest";
import { createDocument } from "../doc";
import { addDimensionOf, dimensionDrawing, dimensionText, offsetThrough } from "../dimension";
import { applySymmetry } from "../effects/copies";
import { EFFECTS } from "../effects";
import { nodePaths, subpathsBox } from "../geom";
import { fillFields, mergeFields, parseMergeData, printMerge } from "../printMerge";
import { findNode, worldBox } from "../scene";
import type { Document, SceneNode, Subpath, TextNode } from "../types";

let seq = 0;
const id = () => `c${++seq}`;
const docWith = (...nodes: SceneNode[]): Document => {
  const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
  d.root.children.push(...nodes);
  return d;
};
const text = (t: string, x = 0, y = 0): TextNode => ({
  id: id(), type: "text", transform: [1, 0, 0, 1, x, y], layer: 0, text: t, font: "archivo-black", size: 10, tracking: 0, lineHeight: 1.2, align: "start", direction: "ltr",
  outline: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 0, y: 10 }] }],
});

describe("Symmetry (live effect)", () => {
  const tri: Subpath[] = [{ closed: true, nodes: [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 15, y: 5 }] }];
  it("makes 2 × lines copies: every turn, and each mirrored", () => {
    expect(applySymmetry(tri, { lines: 6, angle: 0, cx: 0, cy: 0, fuse: false })).toHaveLength(12);
    const one = applySymmetry(tri, { lines: 1, angle: 90, cx: 0, cy: 0, fuse: false });
    expect(one).toHaveLength(2);
    // one vertical mirror line through x = 0: the copy is the reflection
    expect(one[1].nodes.map((p) => Math.round(p.x))).toEqual([-10, -20, -15]);
  });
  it("is listed with its defaults and a draggable centre", () => {
    const p = EFFECTS.symmetry.defaults(tri);
    expect(p.lines).toBe(6);
    expect(p.cx).toBeGreaterThan(20);
    expect(EFFECTS.symmetry.handles!(p, tri)).toHaveLength(1);
    expect(EFFECTS.symmetry.outline!(p, tri)).toHaveLength(6);
  });
});

describe("Dimension tool", () => {
  it("parallel: extension lines, a dimension line at the offset, two arrows, the length", () => {
    const g = dimensionDrawing({ kind: "linear", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }], offset: -10 })!;
    expect(g.value).toBeCloseTo(40);
    expect(g.arrows).toHaveLength(2);
    const dimLine = g.lines.find((l) => l.nodes.length === 2 && Math.abs(l.nodes[0].y - l.nodes[1].y) < 1e-9 && Math.abs(l.nodes[0].y + 10) < 1e-9)!;
    expect(dimLine).toBeTruthy();
    expect(dimensionText(g, "mm")).toBe("40 mm");
    expect(dimensionText(g, "in")).toBe("1.575 in");
  });
  it("horizontal and vertical measure along their axis only", () => {
    const a = { x: 0, y: 0 }, b = { x: 30, y: 40 };
    expect(dimensionDrawing({ kind: "horizontal", points: [a, b], offset: 8 })!.value).toBeCloseTo(30);
    expect(dimensionDrawing({ kind: "vertical", points: [a, b], offset: 8 })!.value).toBeCloseTo(40);
    // the click that places the line sets the offset
    expect(offsetThrough("horizontal", a, b, { x: 10, y: 55 })).toBeCloseTo(15);
    expect(offsetThrough("vertical", a, b, { x: -6, y: 10 })).toBeCloseTo(-6);
  });
  it("angular: the angle between the arms; radius and diameter", () => {
    const ang = dimensionDrawing({ kind: "angular", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }], offset: 0 })!;
    expect(ang.value).toBeCloseTo(90);
    expect(dimensionText(ang, "mm")).toBe("90°");
    expect(dimensionText(dimensionDrawing({ kind: "radius", points: [{ x: 0, y: 0 }, { x: 12.5, y: 0 }], offset: 0 })!, "mm")).toBe("R 12.5 mm");
    expect(dimensionText(dimensionDrawing({ kind: "diameter", points: [{ x: 0, y: 0 }, { x: 12.5, y: 0 }], offset: 0 })!, "mm")).toBe("⌀ 25 mm");
  });
  it("goes on the measurements layer, never sent to the laser, and shows its lines and arrows", () => {
    const d = docWith();
    const did = addDimensionOf(d, "linear", [{ x: 10, y: 10 }, { x: 50, y: 10 }], 6, id);
    const n = findNode(d.root, did)!;
    expect(n.type).toBe("dimension");
    expect(d.cutLayers[n.layer].output).toBe(false);
    expect(nodePaths(n).length).toBeGreaterThan(3);
    expect(subpathsBox(nodePaths(n)).maxY).toBeGreaterThan(15);
    expect(dimensionText(dimensionDrawing(n as never)!, "mm", "Width")).toBe("Width");
  });
});

describe("Print Merge", () => {
  it("reads pasted spreadsheet cells, CSV with quotes and semicolons", () => {
    expect(parseMergeData("Name\tYear\nOlivia\t2026\nNoah\t2027\n")).toEqual({ fields: ["Name", "Year"], records: [["Olivia", "2026"], ["Noah", "2027"]] });
    expect(parseMergeData('Name,Note\n"Smith, Jo","He said ""hi"""\n').records[0]).toEqual(["Smith, Jo", 'He said "hi"']);
    expect(parseMergeData("Name;City\nAva;Tehran").records).toEqual([["Ava", "Tehran"]]);
    expect(parseMergeData("[Name]\nMia").fields).toEqual(["Name"]);
  });
  it("fills [fields] in every text of the selection, one copy per record in a grid below", () => {
    const t = text("Hello [Name]!", 10, 10), t2 = text("[YEAR]", 10, 25);
    const d = docWith({ id: "g", type: "group", transform: [1, 0, 0, 1, 0, 0], layer: 0, children: [t, t2] });
    expect(mergeFields(d, ["g"])).toEqual(["Name", "YEAR"]);
    const data = parseMergeData("Name\tYear\nOlivia\t2026\nNoah\t2027\nAva\t2028");
    const out = printMerge(d, ["g"], data, { columns: 2, gapX: 5, gapY: 5 }, id);
    expect(out).toHaveLength(3);
    const texts = out.map((o) => (findNode(d.root, o) as Extract<SceneNode, { type: "group" }>).children.map((c) => (c as TextNode).text));
    expect(texts).toEqual([["Hello Olivia!", "2026"], ["Hello Noah!", "2027"], ["Hello Ava!", "2028"]]);
    // new text is shaped again from the font
    expect((findNode(d.root, out[0]) as Extract<SceneNode, { type: "group" }>).children.every((c) => !(c as TextNode).outline)).toBe(true);
    // the original keeps its field names; copies sit under it, two per row
    expect(t.text).toBe("Hello [Name]!");
    const b0 = worldBox(d.root, "g"), b1 = worldBox(d.root, out[0]), b2 = worldBox(d.root, out[1]), b3 = worldBox(d.root, out[2]);
    expect(b1.minY).toBeGreaterThan(b0.maxY);
    expect(b2.minX).toBeGreaterThan(b1.maxX);
    expect(b3.minY).toBeGreaterThan(b1.maxY);
    expect(fillFields("[Unknown] [name]", data, data.records[0])).toBe("[Unknown] Olivia");
  });
});
