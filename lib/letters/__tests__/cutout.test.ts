import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { LETTER_DEFAULTS, cleanCutout, computeLetterModel, exportLetterSVG, layoutLetters, loadFont, mergeLetterParams } from "@/lib/letters";
import type { Contour, LetterModel, LetterParams, LoadedFont, PlatePart, Point } from "@/lib/letters";

function fixture(file: string, id: string, name: string): LoadedFont {
  const b = readFileSync(join(__dirname, "fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}
const fredoka = fixture("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold");
const params = (text: string, extra: Partial<LetterParams> = {}): LetterParams => ({ ...LETTER_DEFAULTS, text, mode: "box", fontId: "fredoka", size: 200, ...extra });
function model(p: LetterParams): LetterModel {
  const r = computeLetterModel(p, fredoka, hb);
  if ("error" in r) throw new Error(r.error);
  return r;
}
const plates = (m: LetterModel, kind: "base" | "lid" | "lid lip") =>
  m.parts.filter((pt): pt is PlatePart => pt.kind === "plate" && new RegExp(`· ${kind}( \\d+)?$`, "u").test(pt.name));
const added = (on: PlatePart[], off: PlatePart[]) => on.map((pl, i) => pl.holes.slice(off[i].holes.length));
function dist(q: Point, c: Contour) {
  let best = Infinity;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
  }
  return best;
}

describe("Letters: a cut-out pattern on the lids and bases", () => {
  const CUT = { kind: "circles" as const, on: "both" as const, cell: 10, bar: 2 };

  it("cuts the lid, its lip (the same holes) and the base, inside the walls", () => {
    const p = params("O", { lid: "removable", cutout: CUT });
    const on = model(p), off = model(params("O", { lid: "removable" }));
    const lid = added(plates(on, "lid"), plates(off, "lid")).flat();
    const lip = added(plates(on, "lid lip"), plates(off, "lid lip")).flat();
    const base = added(plates(on, "base"), plates(off, "base")).flat();
    expect(lid.length).toBeGreaterThan(10);
    expect(lip.length).toBe(lid.length);
    expect(base.length).toBeGreaterThan(10);
    const clear = p.T + p.T + p.lidGap + CUT.bar - 0.1;
    const plate = plates(on, "lid")[0];
    for (const h of lid) for (const q of h) {
      expect(dist(q, plate.outer)).toBeGreaterThan(clear);
      for (const o of plates(off, "lid")[0].holes) expect(dist(q, o)).toBeGreaterThan(clear);
    }
  });

  it("goes on one plate only, and keeps clear of the marquee light holes", () => {
    const off = model(params("O"));
    const lidOnly = model(params("O", { cutout: { ...CUT, on: "lid" } }));
    expect(added(plates(lidOnly, "base"), plates(off, "base")).flat()).toHaveLength(0);
    expect(added(plates(lidOnly, "lid"), plates(off, "lid")).flat().length).toBeGreaterThan(0);
    const MARQUEE = { enabled: true, holeDia: 12, spacing: 30, margin: 5 };
    const lit = model(params("O", { marquee: MARQUEE, cutout: { ...CUT, on: "lid" } }));
    const litOff = model(params("O", { marquee: MARQUEE }));
    const lights = plates(litOff, "lid")[0].holes.slice(plates(off, "lid")[0].holes.length);
    expect(lights.length).toBeGreaterThan(0);
    const extra = added(plates(lit, "lid"), plates(litOff, "lid")).flat();
    expect(extra.length).toBeGreaterThan(0);
    for (const h of extra) for (const l of lights) {
      const xs = l.map((q) => q[0]), ys = l.map((q) => q[1]);
      expect(h.some(([x, y]) => x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys))).toBe(false);
    }
  });

  it("none, or a bad value, changes nothing; saved settings are cleaned", () => {
    const p = params("Sam");
    const a = model(p), b = model({ ...p, cutout: { kind: "zigzag" } as never });
    expect(exportLetterSVG(layoutLetters(b, p), p)).toBe(exportLetterSVG(layoutLetters(a, p), p));
    expect(cleanCutout({ kind: "motif" })).toBeUndefined();
    expect(cleanCutout({ kind: "lattice", cell: 1, bar: 99, on: "x" })).toEqual({ kind: "lattice", on: "both", cell: 6, bar: 15 });
    expect("cutout" in mergeLetterParams({ text: "A" })).toBe(false);
    expect(mergeLetterParams({ text: "A", cutout: { kind: "stars", on: "lid", cell: 12, bar: 2 } }).cutout).toEqual({ kind: "stars", on: "lid", cell: 12, bar: 2 });
  });
});
