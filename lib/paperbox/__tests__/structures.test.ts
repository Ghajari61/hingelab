import { describe, expect, it } from "vitest";
import { pointInContour } from "@/lib/generators/geom";
import { buildBox, type DielinePart } from "..";
import { apply, assembled, tucked } from "../fold";
import { lockSlot, lockTab } from "../locks";

const NEW = ["cube", "pyramid", "prism", "cone", "bakery", "hinged-lid", "pie", "clamshell", "takeout", "carry", "wine", "bag", "cd-sleeve", "cell-insert"];
const len = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const outlines = (part: DielinePart) => {
  const cuts = part.paths.filter((p) => p.type === "cut" && p.closed);
  return cuts.filter((c) => !cuts.some((o) => o !== c && c.pts.every((q) => pointInContour(q, o.pts))));
};
/** The folded box's printed faces, their extent sorted smallest first. */
function foldedSize(id: string, over: Record<string, unknown> = {}) {
  const d = buildBox(id, { paper: "custom", thickness: 1, ...over });
  const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const { face, m } of assembled(d.parts.slice(0, 1), [], 1)) if (face.printable && !tucked(face)) for (const [x, y] of face.poly) {
    const q = apply(m, [x, y, 0]);
    for (let k = 0; k < 3; k++) { box[2 * k] = Math.min(box[2 * k], q[k]); box[2 * k + 1] = Math.max(box[2 * k + 1], q[k]); }
  }
  return { d, size: [box[1] - box[0], box[3] - box[2], box[5] - box[4]].sort((a, b) => a - b) };
}

describe("Paper Box: more structures", () => {
  it.each(NEW)("%s: every part is one outline with its creases inside, and has assembly steps", (id) => {
    const d = buildBox(id, {});
    expect(d.parts.length).toBeGreaterThan(0);
    for (const part of d.parts) {
      expect(outlines(part), `${id} ${part.id}`).toHaveLength(1);
      const outer = outlines(part)[0].pts;
      for (const c of part.paths.filter((p) => p.type === "crease")) for (const q of c.pts) {
        const onEdge = outer.some((a, i) => { const b = outer[(i + 1) % outer.length]; return Math.abs(len(a, q) + len(q, b) - len(a, b)) < 0.05; });
        expect(onEdge || pointInContour(q, outer), `${id} crease ${q}`).toBe(true);
      }
    }
    expect(d.assembly.length).toBeGreaterThan(1);
    expect(d.outer.every((v) => v > 0)).toBe(true);
  });

  it.each(["cube", "pyramid", "prism", "bakery", "hinged-lid", "pie", "clamshell", "bag"])("%s folds into a box of its size", (id) => {
    const { d, size } = foldedSize(id);
    // Folded on the board's mid-plane: the inside plus one thickness (a lid's lip a thickness more).
    const want = d.inner.map((v) => v + 1).sort((a, b) => a - b);
    size.forEach((v, i) => expect(Math.abs(v - want[i]), `${id} side ${i}: ${v} vs ${want[i]}`).toBeLessThan(3));
  });

  it("the takeout pail flares: wider at the top than its base", () => {
    const { d, size } = foldedSize("takeout", { flare: 15 });
    expect(size[2]).toBeGreaterThan(d.inner[0] + 10);
  });

  it("the wine carrier's insert stands in it, and a cell insert's strips cross in a grid", () => {
    const wine = buildBox("wine", { bottles: "4" });
    expect(wine.parts.map((p) => p.id)).toEqual(["carrier", "across-1", "along-1"]);
    const placed = assembled(wine.parts, wine.poses, 0);
    const z = (id: string) => placed.filter((x) => x.part.id === id).flatMap(({ face, m }) => face.poly.map(([x, y]) => apply(m, [x, y, 0])[2]));
    const zs = z("across-1");
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(100);
    expect(Math.min(...zs)).toBeGreaterThan(-1);
    const cells = buildBox("cell-insert", { cols: 3, rows: 2 });
    expect(cells.parts).toHaveLength(1 + 1 + 2);
    expect(buildBox("cell-insert", { cols: 3, rows: 2, base: false }).parts).toHaveLength(3);
  });

  it("locks: the bakery box's corner tabs have slots, the clamshell a front slot, the sleeve a notch or a flap", () => {
    const slots = (id: string, over = {}) => buildBox(id, over).parts[0].paths.filter((p) => p.type === "cut" && p.closed).length - 1;
    expect(slots("bakery", { lidWindow: false })).toBe(4);
    expect(slots("bakery", { lidWindow: true })).toBe(5);
    expect(slots("clamshell")).toBe(1);
    const tab = lockTab(30, 20, "tab"), hook = lockTab(30, 20, "hook"), tuck = lockTab(30, 20, "friction");
    for (const s of [tab, hook, tuck]) expect(s.every(([x, y]) => x >= -1e-9 && x <= 30 + 1e-9 && y >= 0 && y <= 20 + 1e-9)).toBe(true);
    expect(lockSlot((a, b) => [a, b], 0, 0, 20, 1)).toHaveLength(4);
    const flap = buildBox("cd-sleeve", { closure: "flap" }), notch = buildBox("cd-sleeve", { closure: "notch" });
    expect(flap.parts[0].faces.some((f) => f.id === "tuck")).toBe(true);
    expect(notch.parts[0].faces.some((f) => f.id === "tuck")).toBe(false);
  });

  it("the cone rolls into a cone in 3D", () => {
    const d = buildBox("cone", {});
    const s = d.parts[0].surface!;
    expect(s.length).toBeGreaterThan(20);
    const zs = s.flat().map((q) => q[2]);
    expect(Math.max(...zs)).toBeCloseTo(160, 0);
  });
});
