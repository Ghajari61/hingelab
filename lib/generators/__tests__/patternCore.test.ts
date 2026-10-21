import { describe, expect, it } from "vitest";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { checkBoxes } from "../boxes/check";
import { mergeBoxes } from "../boxes/params";
import { rect } from "../geom";
import { patternIssues, stackedOn } from "../pattern";
import { QR } from "../qr";
import { CODE_AREA } from "../qr/build";
import type { GenOutput, GenPart } from "../types";
import { CTX } from "./ctx";
import { ALL_GENERATORS } from "../all";

const part = (id: string, w: number, h: number, place: GenPart["place"], t = 3): GenPart => ({ id, name: id, outer: rect(0, 0, w, h), holes: [], place, t });
const inside = (c: GenPart["outer"], a: GenPart["outer"]) => {
  const xs = a.map((q) => q[0]), ys = a.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return c.every(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1);
};

describe("cut-out pattern: what stays solid", () => {
  it("a part glued on the face of another keeps that patch solid; a part standing on edge does not", () => {
    const base = part("base", 200, 100, { x: 0, y: 0, z: 0 });
    const glued = part("plaque", 60, 40, { x: 70, y: 30, z: 3 });
    const wall = part("wall", 200, 50, { x: 0, y: 0, z: 3, upright: true });
    const far = part("far", 60, 40, { x: 70, y: 30, z: 20 });
    const under = part("under", 200, 100, { x: 0, y: 0, z: -3 });
    const out = stackedOn(base, [base, glued, wall, far, under], 3);
    expect(out).toHaveLength(1);
    const xs = out[0].map((q) => q[0]);
    expect(Math.min(...xs)).toBeCloseTo(70, 3);
    expect(Math.max(...xs)).toBeCloseTo(130, 3);
  });

  it("a frame glued on keeps its window open", () => {
    const base = part("base", 200, 100, { x: 0, y: 0, z: 0 });
    const frame = { ...part("frame", 200, 100, { x: 0, y: 0, z: 3 }), holes: [rect(20, 20, 160, 60).reverse()] };
    const out = stackedOn(base, [base, frame], 3);
    expect(out).toHaveLength(2);
  });

  it("QR: the pattern goes on the plate, round the code and its quiet zone, so the code still scans", () => {
    const def = QR;
    const plain = def.build(def.merge({ plate: { padding: 25 } }), CTX);
    const out = def.build(def.merge({ plate: { padding: 25 }, pattern: { pattern: "circles", cell: 8, bar: 2 } }), CTX);
    const plate = out.parts.find((p) => p.id === "plate" || p.id === "top")!;
    expect(plate.holes.length).toBeGreaterThan(plain.parts.find((p) => p.id === plate.id)!.holes.length);
    const area = CODE_AREA.get(plate);
    expect(area).toBeDefined();
    const added = plate.holes.slice(plain.parts.find((p) => p.id === plate.id)!.holes.length);
    for (const h of added) expect(h.some(([x, y]) => inside([[x, y]], area!))).toBe(false);
  });
});

describe("cut-out pattern: too coarse for its space", () => {
  const P = { pattern: { pattern: "circles", cell: 40, bar: 3, size: 60, shape: "circle" } };
  const sparse: GenOutput = { parts: [], stats: [], pattern: { shapes: 4, parts: 2, windowed: true } };

  it("says so, with a smaller pattern and a larger shape as fixes", () => {
    const [issue] = patternIssues(P, sparse);
    expect(issue.code).toBe("PATTERN_SPARSE");
    expect(issue.level).toBe("info");
    const ids = issue.fixes!.map((f) => f.id);
    expect(ids).toEqual(["pattern-smaller", "pattern-wider"]);
    const smaller = issue.fixes![0].apply(P) as typeof P;
    expect(smaller.pattern.cell).toBeLessThan(40);
    const wider = issue.fixes![1].apply(P) as typeof P;
    expect(wider.pattern.size).toBe(80);
  });

  it("warns when nothing fits, and stays quiet on a well-filled part or with None", () => {
    expect(patternIssues(P, { ...sparse, pattern: { shapes: 0, parts: 1, windowed: false } })[0].level).toBe("warn");
    expect(patternIssues(P, { ...sparse, pattern: { shapes: 60, parts: 2, windowed: true } })).toEqual([]);
    expect(patternIssues({ pattern: { ...P.pattern, pattern: "none" } }, sparse)).toEqual([]);
  });

  it("Boxes: a coarse pattern on a small box raises it, a fine one does not", () => {
    const run = (cell: number, shape: string) => {
      const p = mergeBoxes({ design: "box", box: { width: 80, depth: 60, height: 40, lid: "liftoff" }, pierce: { pattern: "circles", on: "both", cell, bar: 3, shape, size: 50 } });
      return checkBoxes(p, buildBoxes(p, CTX) as BoxesOutput).filter((i) => i.code === "PATTERN_SPARSE");
    };
    expect(run(30, "circle")).toHaveLength(1);
    expect(run(8, "full")).toHaveLength(0);
  });
});

describe("cut-out pattern: more places", () => {
  it.each([
    ["clock", { stand: true }, "base", "base"],
    ["tablenum", { build: { kind: "stand", double: true } }, "plate", "back-1"],
  ] as const)("%s: on the %s", (id, raw, on, partId) => {
    // A two-sided number stand's back plate takes the front plate's pattern, so the holes go through both.
    const def = ALL_GENERATORS.find((g) => g.id === id)!;
    const plain = def.build(def.merge(raw), CTX);
    const out = def.build(def.merge({ ...raw, pattern: { pattern: "circles", on, cell: 8, bar: 2 } }), CTX);
    const n = (o: typeof out) => o.parts.find((p) => p.id === partId)!.holes.length;
    expect(n(out)).toBeGreaterThan(n(plain));
  });
});