import { describe, expect, it } from "vitest";
import { pointInContour } from "@/lib/generators/geom";
import { PAPERBOX } from "@/lib/generators/paperbox";
import { buildBox, type DielinePart } from "..";
import { apply, assembled } from "../fold";

const MORE = ["snap-lock", "auto-bottom", "seal-end", "hanging", "hexagon", "pillow", "shipping", "drawer", "sleeve", "tray", "gable", "display"];
const len = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const outlines = (part: DielinePart) => {
  const cuts = part.paths.filter((p) => p.type === "cut" && p.closed);
  return cuts.filter((c) => !cuts.some((o) => o !== c && c.pts.every((q) => pointInContour(q, o.pts))));
};

describe("more box styles", () => {
  it.each(MORE)("%s: every part is one outline with its creases inside", (id) => {
    const d = buildBox(id, {});
    expect(d.parts.length).toBeGreaterThan(0);
    for (const part of d.parts) {
      expect(outlines(part), part.id).toHaveLength(1);
      const outer = outlines(part)[0].pts;
      for (const c of part.paths.filter((p) => p.type === "crease")) for (const q of c.pts) {
        const onEdge = outer.some((a, i) => { const b = outer[(i + 1) % outer.length]; return Math.abs(len(a, q) + len(q, b) - len(a, b)) < 0.05; });
        expect(onEdge || pointInContour(q, outer), `${id} crease ${q}`).toBe(true);
      }
    }
    expect(d.assembly.length).toBeGreaterThan(1);
  });

  it.each(["reverse-tuck", "snap-lock", "seal-end", "shipping", "two-piece"])("%s folds into a box of its outside size", (id) => {
    const d = buildBox(id, { paper: "custom", thickness: 1 });
    const placed = assembled(d.parts.slice(0, 1), [], 1);
    const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const { face, m } of placed) if (face.printable) for (const [x, y] of face.poly) {
      const q = apply(m, [x, y, 0]);
      for (let k = 0; k < 3; k++) { box[2 * k] = Math.min(box[2 * k], q[k]); box[2 * k + 1] = Math.max(box[2 * k + 1], q[k]); }
    }
    const size = [box[1] - box[0], box[3] - box[2], box[5] - box[4]].sort((a, b) => a - b);
    // Folded on the board's mid-plane: the faces span the panels, the inside plus one thickness.
    const want = d.parts[0].faces.filter((f) => f.printable).length ? d.inner.map((v) => v + 1).sort((a, b) => a - b) : [];
    if (id === "two-piece") want[0] = d.inner[2] + 1;
    size.forEach((v, i) => expect(v, `${id} side ${i}`).toBeCloseTo(want[i], 0));
  });

  it("stands the box on its bottom with its front toward the viewer", () => {
    const d = buildBox("reverse-tuck", {});
    const placed = assembled(d.parts, [], 0.45);
    const z = (id: string) => { const f = placed.find((x) => x.face.id === id)!; return f.face.poly.map(([x, y]) => apply(f.m, [x, y, 0])); };
    for (const q of z("lid-bottom")) expect(q[2]).toBeCloseTo(0, 6);
    // The front panel's points share the largest y.
    const ys = z("front").map((q) => q[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
    expect(Math.min(...ys)).toBeGreaterThan(0);
  });
});

describe("Paper Box windows and patterns", () => {
  const holesIn = (raw: Record<string, unknown>) => {
    const out = PAPERBOX.build(PAPERBOX.merge(raw), {});
    return out.parts.reduce((n, p) => n + p.holes.length, 0);
  };

  it("cuts a window in the chosen faces only", () => {
    expect(holesIn({ style: "reverse-tuck" })).toBe(0);
    expect(holesIn({ style: "reverse-tuck", window: { on: "front", shape: "circle", size: 50 } })).toBe(1);
    expect(holesIn({ style: "two-piece", window: { on: "top", shape: "heart", size: 60 } })).toBe(1);
    expect(holesIn({ style: "drawer", window: { on: "all", shape: "rounded", size: 50 } })).toBeGreaterThan(3);
  });

  it("puts the pattern inside its faces, never across a fold", () => {
    const p = PAPERBOX.merge({ style: "mailer", pattern: { pattern: "lattice", on: "top", cell: 10, bar: 2 } });
    const out = PAPERBOX.build(p, {});
    const lid = buildBox("mailer", { ...p.styles.mailer, paper: "custom", thickness: p.T }).parts[0].faces.find((f) => f.id === "lid")!;
    const before = buildBox("mailer", { ...p.styles.mailer, paper: "custom", thickness: p.T }).parts[0].paths.filter((q) => q.type === "cut" && q.closed).length - 1;
    const made = out.parts[0].holes.slice(before);
    expect(made.length).toBeGreaterThan(20);
    for (const c of made) for (const q of c) expect(pointInContour(q, lid.poly), `${q}`).toBe(true);
    expect(out.stats.find((s) => s.label === "Pattern")?.value).toMatch(/^\d+ holes$/);
  });

  it("engraves or scores the pattern when asked, cutting nothing", () => {
    const cut = PAPERBOX.build(PAPERBOX.merge({ style: "reverse-tuck", pattern: { pattern: "circles", on: "front" } }), {});
    const eng = PAPERBOX.build(PAPERBOX.merge({ style: "reverse-tuck", pattern: { pattern: "circles", on: "front", mark: "engrave" } }), {});
    expect(cut.parts[0].holes.length).toBeGreaterThan(5);
    expect(eng.parts[0].holes.length).toBe(0);
    expect(eng.parts[0].engrave?.length ?? 0).toBeGreaterThan(5);
  });
});
