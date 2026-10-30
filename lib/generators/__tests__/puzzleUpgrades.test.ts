import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { bboxOf, distToContour, pointInContour, signedArea } from "../geom";
import { arrangeGenerator } from "../output";
import { PUZZLE } from "../puzzle";
import { buildPuzzle, neckOf, selfIntersects, tabEdge, whimsyOutline, type PuzzleOutput } from "../puzzle/build";
import { checkPuzzle } from "../puzzle/check";
import { WHIMSY_SHAPES, mergePuzzle, type PuzzleParams } from "../puzzle/params";
import { CTX } from "./ctx";

const build = (raw: unknown) => buildPuzzle(mergePuzzle(raw), CTX) as PuzzleOutput;
const issuesOf = (p: PuzzleParams) => checkPuzzle(p, buildPuzzle(p, CTX) as PuzzleOutput);
const codes = (raw: unknown) => issuesOf(mergePuzzle(raw)).map((i) => i.code);
const closedCuts = (out: PuzzleOutput) => out.parts[0].cuts!.filter((c) => c.length > 3 && Math.hypot(c[0][0] - c.at(-1)![0], c[0][1] - c.at(-1)![1]) < 1e-9);

const NEW_PRESETS = ["toddler-knobs", "whimsy-hearts", "dovetail-30", "wall-display", "star-whimsy-kids"];

describe("puzzle upgrades: presets", () => {
  for (const id of NEW_PRESETS) {
    it(`${id} builds without warnings and lays out`, () => {
      const pr = PUZZLE.presets.find((x) => x.id === id)!;
      expect(pr).toBeTruthy();
      const p = PUZZLE.merge(pr.params);
      const out = PUZZLE.build(p, CTX) as PuzzleOutput;
      expect(out.error).toBeUndefined();
      expect(PUZZLE.check(p, out).filter((i) => i.level !== "info").map((i) => i.code)).toEqual([]);
      expect(arrangeGenerator(PUZZLE, p, CTX).lay).toBeTruthy();
    });
  }
});

describe("puzzle upgrades: dovetail tabs", () => {
  it("draws a flared knob: wider at its head than at its neck, on the knob side", () => {
    const e = tabEdge([0, 0], [100, 0], 100, { style: "dovetail", t: 0.1, j: 0 }, false, () => 0.5);
    const at = (y: number) => { const xs = e.filter((q) => Math.abs(q[1] - y) < 1.5).map((q) => q[0]); return Math.max(...xs) - Math.min(...xs); };
    const high = Math.max(...e.map((q) => q[1]));
    expect(high).toBeGreaterThan(20);
    expect(at(high * 0.85)).toBeGreaterThan(at(high * 0.15));
    expect(e[0]).toEqual([0, 0]);
    expect(e.at(-1)).toEqual([100, 0]);
    expect(neckOf({ style: "dovetail", t: 0.1, j: 0 })).toBeCloseTo(0.18, 6);
  });

  it("pieces tile the outline and none crosses itself", () => {
    const out = build({ tabs: { style: "dovetail", jitter: 8, seed: 5 }, pieces: { count: 30 } });
    const pz = out.parts[0];
    for (const c of pz.pieces!) expect(selfIntersects(c)).toBe(false);
    const area = pz.pieces!.reduce((s, c) => s + Math.abs(signedArea(c)), 0);
    expect(area / Math.abs(signedArea(pz.outer))).toBeCloseTo(1, 2);
    expect(out.info!.pieces).toBe(30);
  });
});

describe("puzzle upgrades: whimsy pieces", () => {
  it("cuts each figure as a closed line wholly inside one piece, with wood left round it", () => {
    const out = build({ pieces: { count: 24 }, whimsy: { count: 4, shape: "heart", size: 50 } });
    expect(out.info!.whimsy).toBe(4);
    expect(out.info!.pieces).toBe(24 + 4);
    const figs = closedCuts(out);
    expect(figs).toHaveLength(4);
    const pieces = out.parts[0].pieces!;
    for (const f of figs) {
      const host = pieces.find((c) => f.every((q) => pointInContour(q, c)));
      expect(host).toBeTruthy();
      expect(Math.min(...f.map((q) => distToContour(q, host!)))).toBeGreaterThan(2.5);
    }
  });

  it("every figure is a simple closed outline", () => {
    for (const kind of WHIMSY_SHAPES) {
      const c = whimsyOutline(kind, 30, 50, 50);
      expect(selfIntersects(c), kind).toBe(false);
      const b = bboxOf([c]);
      expect(Math.max(b.x1 - b.x0, b.y1 - b.y0), kind).toBeCloseTo(30, 0);
    }
  });

  it("the default puzzle is unchanged by the new options' defaults", () => {
    const a = build({}), b = build({ whimsy: { count: 0 }, knobs: { on: false }, frame: { guide: false, hang: false } });
    expect(a.parts[0].cuts).toEqual(b.parts[0].cuts);
  });

  it("reports figures that do not fit, and the fix clears it", () => {
    const p = mergePuzzle({ pieces: { count: 100 }, whimsy: { count: 20, size: 70 } });
    expect(issuesOf(p).map((i) => i.code)).toContain("WHIMSY_NO_ROOM");
    const fixed = autoFixAll(p, issuesOf).params;
    expect(issuesOf(fixed).map((i) => i.code)).not.toContain("WHIMSY_NO_ROOM");
  });

  it("piece numbers go in the whimsy and beside it, never under its cut", () => {
    const out = build({ pieces: { count: 12 }, whimsy: { count: 2, size: 45 }, engrave: { kind: "numbers", numberSize: 5 } });
    const figs = closedCuts(out);
    for (const c of out.parts[0].engrave!) {
      const b = bboxOf([c]);
      for (const f of figs) {
        const crosses = f.some((q) => q[0] > b.x0 && q[0] < b.x1 && q[1] > b.y0 && q[1] < b.y1);
        expect(crosses).toBe(false);
      }
    }
  });
});

describe("puzzle upgrades: knobs, guide and hanging", () => {
  it("cuts one disc (or two) per piece, each over its own piece", () => {
    const one = build({ pieces: { auto: false, cols: 3, rows: 2 }, knobs: { on: true, diameter: 14, stack: 1 } });
    const two = build({ pieces: { auto: false, cols: 3, rows: 2 }, knobs: { on: true, diameter: 14, stack: 2 } });
    const knobs = one.parts.filter((p) => p.id.startsWith("knob-"));
    expect(knobs).toHaveLength(6);
    expect(two.parts.filter((p) => p.id.startsWith("knob-"))).toHaveLength(12);
    const pieces = one.parts[0].pieces!;
    for (const k of knobs) {
      const c: [number, number] = [k.place!.x, k.place!.y];
      const host = pieces.find((pc) => pointInContour(c, pc))!;
      expect(distToContour(c, host)).toBeGreaterThan(7);
      expect(bboxOf([k.outer]).x1 - bboxOf([k.outer]).x0).toBeCloseTo(14, 1);
    }
  });

  it("warns about knobs too big for the pieces, and about knobs over numbers", () => {
    const p = mergePuzzle({ pieces: { count: 100 }, knobs: { on: true, diameter: 30 } });
    expect(issuesOf(p).map((i) => i.code)).toContain("KNOB_TOO_BIG");
    expect(issuesOf(autoFixAll(p, issuesOf).params).map((i) => i.code)).not.toContain("KNOB_TOO_BIG");
    expect(codes({ knobs: { on: true }, engrave: { kind: "numbers" } })).toContain("KNOBS_HIDE_NUMBERS");
  });

  it("scores the piece outlines on the tray base only when asked", () => {
    const plain = build({ frame: { kind: "tray" } }).parts.find((p) => p.id === "base")!;
    const guided = build({ frame: { kind: "tray", guide: true } }).parts.find((p) => p.id === "base")!;
    expect(plain.score ?? []).toHaveLength(0);
    expect(guided.score!.length).toBeGreaterThan(5);
    for (const c of guided.score!) for (const q of c) expect(q[0]).toBeGreaterThan(-1e-6);
  });

  it("puts two hanging holes in the frame's top border (and the base under them)", () => {
    const out = build({ frame: { kind: "tray", border: 18, hang: true } });
    const frame = out.parts.find((p) => p.id === "frame")!, base = out.parts.find((p) => p.id === "base")!;
    expect(frame.holes).toHaveLength(3);
    expect(base.holes).toHaveLength(2);
    for (const h of frame.holes.slice(1)) {
      const b = bboxOf([h]);
      expect(b.y1).toBeLessThan(0);
      expect(b.y0).toBeGreaterThan(-18);
    }
    const narrow = mergePuzzle({ frame: { kind: "frame", border: 6, hang: true } });
    expect(issuesOf(narrow).map((i) => i.code)).toContain("HANG_NO_ROOM");
    expect(issuesOf(autoFixAll(narrow, issuesOf).params).map((i) => i.code)).not.toContain("HANG_NO_ROOM");
  });
});
