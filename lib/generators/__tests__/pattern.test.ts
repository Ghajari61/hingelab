import { describe, expect, it } from "vitest";
import { ALL_GENERATORS } from "../all";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { mergeBoxes } from "../boxes/params";
import { fretHoles } from "../fretwork";
import { pointInContour } from "../geom";
import { windowShape } from "../pattern";
import type { GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => buildBoxes(mergeBoxes(raw), CTX) as BoxesOutput;
const holes = (o: BoxesOutput, pred: (p: GenPart) => boolean) => o.parts.filter(pred).reduce((n, p) => n + p.holes.length, 0);

describe("cut-out pattern", () => {
  it("fills a shaped window with whole and trimmed shapes, not just the few that fit wholly inside", () => {
    const win = windowShape("star", 60, 40, 70)!;
    const old = fretHoles({ kind: "quatrefoil", cell: 16, bar: 3 }, 0, 0, 120, 80, [], (q) => pointInContour(q, win));
    const clipped = fretHoles({ kind: "quatrefoil", cell: 16, bar: 3 }, 0, 0, 120, 80, [], () => true, win);
    expect(clipped.length).toBeGreaterThan(old.length * 2);
    for (const h of clipped) for (const q of h) expect(pointInContour(q, win) || win.some((w) => Math.hypot(w[0] - q[0], w[1] - q[1]) < 3.5)).toBe(true);
  });

  it("the tray with an inset knob lid: a star of quatrefoils in the walls and the lid, round the knob and the slots", () => {
    const o = build({ design: "tray", tray: { width: 240, depth: 160, height: 50, lid: "inset" }, pierce: { pattern: "quatrefoil", on: "both", shape: "star", size: 70, cell: 16, bar: 3 } });
    expect(holes(o, (p) => p.id === "lid")).toBeGreaterThan(8);
    for (const id of ["front", "back", "left", "right"]) expect(holes(o, (p) => p.id === id), id).toBeGreaterThan(0);
    // A finer pattern fills the low walls' stars.
    const fine = build({ design: "tray", tray: { width: 240, depth: 160, height: 50, lid: "inset" }, pierce: { pattern: "quatrefoil", on: "both", shape: "star", size: 70, cell: 8, bar: 1.5 } });
    expect(holes(fine, (p) => p.id === "front")).toBeGreaterThan(4);
    expect(o.stats.find((x) => /pattern/i.test(x.label))?.value).not.toMatch(/\b0 in the lid/);
  });

  it("tiles a motif (a library shape, or the user's own)", () => {
    const o = build({ design: "box", box: { width: 150, depth: 100, height: 70, lid: "liftoff" }, pierce: { pattern: "motif", motif: "star", on: "lid", cell: 14, bar: 2 } });
    expect(holes(o, (p) => p.id === "lid")).toBeGreaterThan(10);
  });

  // Every generator that offers the pattern: lattice holes on its default design.
  const WITH = ALL_GENERATORS.filter((g) => g.sections.some((s) => s.id === "pattern") && g.id !== "paperbox");
  it("is offered by every generator it fits", () => {
    expect(WITH.map((g) => g.id).sort()).toEqual(["clock", "keyrack", "puzzle", "qr", "shadowbox", "sign", "tablenum", "topper", "trophy"]);
  });
  // A design with the parts the pattern goes on (the default puzzle has no frame, and so on).
  const WITH_PARTS: Record<string, Record<string, unknown>> = {
    puzzle: { frame: { kind: "frame", border: 25 } },
    qr: { output: { kind: "cutout" }, plate: { padding: 25 } },
    shadowbox: { box: { walls: true } },
  };
  it.each(WITH.map((g) => [g.id, g] as const))("%s: cuts the pattern, and None leaves it as it was", (id, def) => {
    const base = WITH_PARTS[id] ?? {};
    const plain = def.build(def.merge(base), CTX);
    const out = def.build(def.merge({ ...base, pattern: { pattern: "circles", cell: 8, bar: 2 } }), CTX);
    const count = (o: typeof out) => o.parts.reduce((n, p) => n + p.holes.length, 0);
    expect(count(out)).toBeGreaterThan(count(plain));
    expect(out.stats.find((s) => s.label === "Pattern")?.value).toMatch(/\d+ holes/);
    expect(def.build(def.merge({ ...base, pattern: { pattern: "none" } }), CTX)).toEqual(plain);
  });
});
