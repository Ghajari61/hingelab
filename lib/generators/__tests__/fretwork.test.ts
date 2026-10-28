import { describe, expect, it } from "vitest";
import { distToContour, pointInContour } from "../geom";
import { FRET_BUILT_IN, fretHoles } from "../fretwork";
import { arrangeGenerator, genSVG } from "../output";
import { generatorScene } from "../scene3d";
import { BOXES } from "../boxes";
import { CTX } from "./ctx";
import { clone, computeModel, DEFAULTS, exportSVG, layoutParts, type Params, type PlatePart, type WallPart } from "@/lib/hinge";
import { hingeRequestError } from "@/lib/billing/validate";
import type { Contour } from "../types";

/** Smallest gap between two holes (sampled), mm. */
function minGap(a: Contour, b: Contour) {
  let d = Infinity;
  for (const q of a) d = Math.min(d, distToContour(q, b));
  for (const q of b) d = Math.min(d, distToContour(q, a));
  return d;
}

describe("cut-out patterns", () => {
  it.each(FRET_BUILT_IN.filter((k) => k !== "none"))("%s keeps every hole inside, a bar from the edge and from its neighbours", (kind) => {
    const bar = 2.5, holes = fretHoles({ kind, cell: 14, bar }, 0, 0, 120, 90);
    expect(holes.length).toBeGreaterThan(8);
    for (const c of holes) for (const [x, y] of c) {
      expect(x).toBeGreaterThanOrEqual(bar - 1e-9);
      expect(x).toBeLessThanOrEqual(120 - bar + 1e-9);
      expect(y).toBeGreaterThanOrEqual(bar - 1e-9);
      expect(y).toBeLessThanOrEqual(90 - bar + 1e-9);
    }
    // Neighbouring holes stay at least most of a bar apart (sampled outlines).
    for (let i = 0; i < Math.min(holes.length, 30); i++) for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i][0], b = holes[j][0];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 40) continue;
      expect(minGap(holes[i], holes[j])).toBeGreaterThan(bar * 0.6);
    }
  });

  it("keeps a label area solid", () => {
    const keep = { x0: 40, y0: 30, x1: 80, y1: 60 };
    const holes = fretHoles({ kind: "circles", cell: 10, bar: 2 }, 0, 0, 120, 90, [keep]);
    for (const c of holes) for (const [x, y] of c) expect(x > keep.x0 - 2 && x < keep.x1 + 2 && y > keep.y0 - 2 && y < keep.y1 + 2).toBe(false);
  });
});

describe("Boxes: patterns and the book box", () => {
  const build = (id: string) => {
    const p = BOXES.merge(BOXES.presets.find((x) => x.id === id)!.params);
    const out = BOXES.build(p, CTX);
    expect(out.error).toBeUndefined();
    return { p, out };
  };

  it("pierces the walls and lid, frames the lid's title and opens the lip", () => {
    const { p, out } = build("pierced-jewellery");
    for (const id of ["front", "back", "left", "right", "lid"]) expect(out.parts.find((q) => q.id === id)!.holes.length, id).toBeGreaterThan(0);
    const front = out.parts.find((q) => q.id === "front")!;
    for (const h of front.holes) for (const q of h) {
      expect(pointInContour(q, front.outer)).toBe(true);
      expect(distToContour(q, front.outer)).toBeGreaterThanOrEqual(p.T + p.pierce.bar + 1 - 1e-6);
    }
    expect(out.parts.find((q) => q.id === "lip")!.holes).toHaveLength(1);
    const tea = build("moroccan-tea").out.parts.find((q) => q.id === "lid")!;
    expect(tea.holes.length).toBeGreaterThan(0);
    expect(tea.engrave!.length).toBeGreaterThan(2);
  });

  it("leaves boxes without a pattern as they were", () => {
    const p = BOXES.merge({ design: "box", box: { lid: "liftoff" } });
    expect(BOXES.build(p, CTX).parts.every((q) => q.holes.length === 0)).toBe(true);
  });

  it("builds the book box: one cover with a hinge spine, three walls, and 3D pieces", () => {
    const { p, out } = build("book-box");
    const cover = out.parts.find((q) => q.id === "cover")!;
    expect(out.parts.map((q) => q.id)).toEqual(["cover", "head", "tail", "fore"]);
    expect(cover.cuts!.length).toBeGreaterThan(20);
    // back cover, the spine bent in 16 strips, front cover
    expect(cover.views3d).toHaveLength(18);
    const tabs = out.parts.filter((q) => q.id !== "cover").reduce((n, q) => n + q.outer.filter(([, y]) => y > p.book.thickness - 2 * p.T + 1e-6).length / 2, 0);
    const slots = cover.holes.filter((h) => h.length === 4).length;
    expect(slots).toBe(tabs);
    const a = arrangeGenerator(BOXES, p, CTX);
    expect(genSVG(BOXES, p, a.lay!)).toContain("Cover (bends round the spine)");
    expect(() => generatorScene(out, p.T)).not.toThrow();
    expect(BOXES.build(BOXES.merge({ design: "book", book: { thickness: 8 } }), CTX).error).toMatch(/too thin/);
  });
});

describe("Hinge Box: patterns", () => {
  const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), over);
  const build = (p: Params) => { const m = computeModel(p); if ("error" in m) throw new Error(m.error); return m; };

  it("cuts the pattern through the lid and its lip, and the wall's flat stretches", () => {
    const plain = build(box());
    const m = build(box({ fret: "lattice", fretCell: 14, fretBar: 3 }));
    const plate = (name: string) => m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === name)!;
    const n = plate("LID").slots.length;
    expect(n).toBeGreaterThan(10);
    expect(plate("LID LIP").slots).toHaveLength(n);
    const wall = m.parts.find((q): q is WallPart => q.kind === "wall" && !q.test)!;
    expect(wall.holes!.length).toBeGreaterThan(4);
    // No hole comes near a hinge column.
    for (const h of wall.holes!) for (const [x] of h) for (const c of wall.cols) expect(Math.abs(x - c.x)).toBeGreaterThan(DEFAULTS.slotW / 2);
    const p = box({ fret: "lattice" });
    expect(exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p).length).toBeGreaterThan(exportSVG(plain, layoutParts(plain.parts, p.bedW, p.gap), box()).length);
  });

  it("keeps clear of a fixed lid's tab slots and opening, and can go on one place only", () => {
    const m = build(box({ lid: "fixed", lidHole: "finger", fret: "circles", fretOn: "lid" }));
    const lid = m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === "LID")!;
    const base = m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === "BASE")!;
    expect(lid.slots.length).toBeGreaterThan(base.slots.length + 1);
    expect(m.parts.some((q) => q.kind === "wall" && !!q.holes)).toBe(false);
    expect(hingeRequestError(box({ fret: "floral", fretOn: "walls", fretCell: 12, fretBar: 2 }))).toBeNull();
    expect(hingeRequestError(box({ fret: "zigzag" as never }))).not.toBeNull();
  });
});
