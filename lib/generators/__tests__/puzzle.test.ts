import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { exportGeneratorForPlan } from "@/lib/billing/exportGenerator";
import { distToContour, pointInContour, signedArea } from "../geom";
import { arrangeGenerator, genSVG } from "../output";
import { PUZZLE } from "../puzzle";
import { buildPuzzle, clipPolyline, puzzleOutline, selfIntersects, tabEdge, type PuzzleOutput } from "../puzzle/build";
import { checkPuzzle } from "../puzzle/check";
import { FREE_PIECES, OVERSHOOT, mergePuzzle, type PuzzleParams } from "../puzzle/params";
import { CTX } from "./ctx";
import type { Contour } from "../types";

const build = (raw: unknown) => buildPuzzle(mergePuzzle(raw), CTX) as PuzzleOutput;
const len = (c: Contour) => c.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]) : 0), 0);
const perim = (c: Contour) => len([...c, c[0]]);
const issuesOf = (p: PuzzleParams) => checkPuzzle(p, buildPuzzle(p, CTX) as PuzzleOutput);

const SHAPES: Record<string, unknown> = {
  rectangle: {},
  "rounded rectangle": { shape: { corner: 20 } },
  circle: { shape: { kind: "circle", width: 280 }, pieces: { count: 36 } },
  heart: { shape: { kind: "heart", width: 240, height: 216 }, pieces: { count: 24 } },
  kids: { shape: { width: 200, height: 150 }, pieces: { count: 12 }, tabs: { style: "kids" } },
  wavy: { tabs: { style: "wavy" }, pieces: { count: 20 } },
  "high jitter": { tabs: { jitter: 15, size: 30, seed: 42 } },
};

describe("puzzle pieces", () => {
  for (const [name, raw] of Object.entries(SHAPES)) {
    it(`${name}: pieces tile the outline, none crosses itself, and every edge is cut once`, () => {
      const out = build(raw);
      const pz = out.parts[0];
      const outline = pz.outer;
      const pieces = pz.pieces!;
      expect(pieces.length).toBe(out.info!.pieces);
      for (const c of pieces) expect(selfIntersects(c)).toBe(false);
      const area = pieces.reduce((s, c) => s + Math.abs(signedArea(c)), 0);
      expect(area / Math.abs(signedArea(outline))).toBeCloseTo(1, 2);
      // Each shared edge is on two pieces but cut once: the pieces' perimeters are the outline plus every cut twice.
      const inside = pz.cuts!.flatMap((c) => clipPolyline(c, outline)).reduce((s, c) => s + len(c), 0);
      const total = pieces.reduce((s, c) => s + perim(c), 0);
      expect(Math.abs(total - perim(outline) - 2 * inside) / total).toBeLessThan(0.005);
    });
  }

  it("hits the piece count on rectangles and comes close on shapes", () => {
    for (const n of [12, 24, 48, 100]) expect(build({ pieces: { count: n } }).info!.pieces).toBe(n);
    expect(build({ pieces: { auto: false, cols: 7, rows: 3 } }).info!.pieces).toBe(21);
    for (const [kind, n] of [["circle", 36], ["heart", 24], ["circle", 100]] as const) {
      const got = build({ shape: { kind, width: 280, height: 252 }, pieces: { count: n } }).info!.pieces;
      expect(Math.abs(got - n) / n, `${kind} ${n}: ${got}`).toBeLessThan(0.15);
    }
  });

  it("cuts run past the outline by the overshoot plus half the kerf, so no piece stays attached", () => {
    for (const raw of [SHAPES.rectangle, SHAPES.circle, SHAPES.heart]) {
      const p = mergePuzzle(raw);
      const out = buildPuzzle(p, CTX);
      const outline = out.parts[0].outer;
      const cuts = out.parts[0].cuts!;
      /** A cut may also end where it meets another (a merged edge piece's dropped edge). */
      const onOther = (q: Contour[number], self: Contour) => cuts.some((o) => o !== self && o.some((r, i) => i > 0 && distToContour(q, [o[i - 1], r]) < 1e-6));
      let ends = 0;
      for (const c of cuts) for (const end of [c[0], c[c.length - 1]]) {
        if (onOther(end, c)) continue;
        ends++;
        expect(pointInContour(end, outline)).toBe(false);
        expect(distToContour(end, outline)).toBeGreaterThan(OVERSHOOT + p.K / 2 - 0.05);
      }
      expect(ends).toBeGreaterThan(4);
    }
  });

  it("joins each grid line into one cut where it can", () => {
    const out = build({});
    expect(out.parts[0].cuts).toHaveLength(out.info!.cols - 1 + out.info!.rows - 1);
  });

  it("is the same for the same layout number and different for another", () => {
    const a = genSVG(PUZZLE, mergePuzzle({}), arrangeGenerator(PUZZLE, mergePuzzle({}), CTX).lay!);
    const b = genSVG(PUZZLE, mergePuzzle({}), arrangeGenerator(PUZZLE, mergePuzzle({}), CTX).lay!);
    const c = mergePuzzle({ tabs: { seed: 2 } });
    expect(a).toBe(b);
    expect(genSVG(PUZZLE, c, arrangeGenerator(PUZZLE, c, CTX).lay!)).not.toBe(a);
  });

  it("draws the knob on the side asked for and keeps the ends on the grid", () => {
    const rand = () => 0.5;
    const up = tabEdge([0, 0], [30, 0], 30, { style: "classic", t: 0.1, j: 0 }, false, rand);
    const down = tabEdge([0, 0], [30, 0], 30, { style: "classic", t: 0.1, j: 0 }, true, rand);
    expect(up[0]).toEqual([0, 0]);
    expect(up[up.length - 1]).toEqual([30, 0]);
    // The knob's curve peaks at t + 3/4 of the way to its 3t control points.
    expect(Math.max(...up.map((q) => q[1]))).toBeCloseTo(0.1 * 30 * 2.5, 1);
    expect(Math.min(...down.map((q) => q[1]))).toBeCloseTo(-0.1 * 30 * 2.5, 1);
    expect(tabEdge([0, 0], [30, 0], 30, { style: "straight", t: 0.1, j: 0 }, false, rand)).toEqual([[0, 0], [30, 0]]);
  });

  it("reads custom outlines and rejects bad ones", () => {
    expect(puzzleOutline(mergePuzzle({ shape: { kind: "custom", path: "M0 0 L100 0 L50 80 Z", width: 200, height: 160 } }))).toBeTruthy();
    expect(build({ shape: { kind: "custom", path: "nonsense" } }).error).toMatch(/custom outline/);
  });
});

describe("puzzle frame and engraving", () => {
  it("a frame's hole leaves the clearance; a tray adds a base under it", () => {
    const out = build({ frame: { kind: "tray", border: 15, clearance: 0.5 } });
    expect(out.parts.map((p) => p.id)).toEqual(["puzzle", "frame", "base"]);
    const frame = out.parts[1];
    expect(distToContour([0, 100], frame.holes[0])).toBeCloseTo(0.5, 1);
    expect(frame.outer).toEqual(out.parts[2].outer);
    expect(out.parts[0].place!.z).toBe(3);
  });

  it("a picture covers the puzzle, clipped to its outline, and is exported on the engrave layer", () => {
    const p = mergePuzzle({ engrave: { kind: "image", image: "data:image/jpeg;base64,AAAA", aspect: 2 } });
    const out = buildPuzzle(p, CTX);
    const im = out.parts[0].images![0];
    expect(im.h).toBeCloseTo(200);
    expect(im.w).toBeCloseTo(400);
    expect(im.x).toBeCloseTo(-50);
    const svg = genSVG(PUZZLE, p, arrangeGenerator(PUZZLE, p, CTX).lay!);
    expect(svg).toMatch(/<clipPath id="engrave-clip-0">/);
    expect(svg).toMatch(/<image [^>]*clip-path="url\(#engrave-clip-0\)"[^>]*href="data:image\/jpeg;base64,AAAA"/);
    expect(svg.indexOf("<image")).toBeLessThan(svg.indexOf("Outline cut"));
  });

  it("numbers every piece", () => {
    const out = build({ pieces: { count: 12 }, engrave: { kind: "numbers", numberSize: 6 } });
    expect(out.parts[0].engrave!.length).toBeGreaterThanOrEqual(12);
    expect(out.notice).toBeUndefined();
  });

  it("waits for the font, and reports letters the font lacks", () => {
    expect(buildPuzzle(mergePuzzle({ engrave: { kind: "text", text: "Hi" } }), {}).notice).toMatch(/font/);
    const out = build({ engrave: { kind: "text", text: "سام", fontId: "fredoka" } });
    expect(out.missing!.length).toBeGreaterThan(0);
  });
});

describe("puzzle checks and fixes", () => {
  it("every preset builds without warnings", () => {
    for (const pr of PUZZLE.presets) {
      const p = PUZZLE.merge(pr.params);
      const bad = issuesOf(p).filter((i) => i.level !== "info");
      expect(bad.map((i) => i.code), pr.id).toEqual([]);
    }
  });

  it("small pieces: Auto-fix all makes them larger", () => {
    const p = mergePuzzle({ pieces: { count: 600 } });
    expect(issuesOf(p).map((i) => i.code)).toContain("SMALL_PIECES");
    const res = autoFixAll(p, issuesOf);
    expect(issuesOf(res.params).map((i) => i.code)).not.toContain("SMALL_PIECES");
  });

  it("thin tab necks: bigger tabs", () => {
    const p = mergePuzzle({ pieces: { count: 300 }, tabs: { size: 10 } });
    expect(issuesOf(p).map((i) => i.code)).toContain("THIN_NECK");
    const res = autoFixAll(p, issuesOf);
    expect(issuesOf(res.params).filter((i) => i.level !== "info").map((i) => i.code)).toEqual([]);
  });

  it("a thin frame, wide text and missing letters each have a fix", () => {
    expect(autoFixAll(mergePuzzle({ frame: { kind: "frame", border: 5 } }), issuesOf).params.frame.border).toBe(12);
    const wide = mergePuzzle({ engrave: { kind: "text", text: "WIDE TEXT HERE", size: 80 } });
    expect(issuesOf(wide).map((i) => i.code)).toContain("TEXT_WIDE");
    expect(issuesOf(autoFixAll(wide, issuesOf).params).map((i) => i.code)).not.toContain("TEXT_WIDE");
    const fa = mergePuzzle({ engrave: { kind: "text", text: "سام", fontId: "fredoka", size: 30 } });
    expect(autoFixAll(fa, issuesOf).params.engrave.fontId).toBe("vazirmatn");
  });

  it("asks for a picture when Picture is picked without one", () => {
    expect(issuesOf(mergePuzzle({ engrave: { kind: "image" } })).map((i) => i.code)).toEqual(["NO_PICTURE"]);
  });
});

describe("puzzle plan", () => {
  it(`free up to ${FREE_PIECES} pieces`, () => {
    const p48 = mergePuzzle({}), p100 = mergePuzzle({ pieces: { count: 100 } });
    expect(PUZZLE.pro!(p48, buildPuzzle(p48, CTX))).toBeNull();
    expect(PUZZLE.pro!(p100, buildPuzzle(p100, CTX))).toMatch(/Pro/);
    expect(PUZZLE.presets.filter((p) => p.pro).map((p) => p.id)).toEqual(["photo-100"]);
  });

  it("the server builds generator designs and refuses Pro ones on the free plan", async () => {
    const free = await exportGeneratorForPlan("puzzle", { pieces: { count: 100 } }, "free");
    expect(free).toMatchObject({ ok: false, status: 403 });
    const pro = await exportGeneratorForPlan("puzzle", { pieces: { count: 100 } }, "pro");
    expect(pro.ok && pro.svg).toMatch(/^<\?xml/);
    const small = await exportGeneratorForPlan("puzzle", {}, "free");
    expect(small.ok).toBe(true);
    expect(await exportGeneratorForPlan("nope", {}, "pro")).toMatchObject({ ok: false, status: 400 });
    const text = await exportGeneratorForPlan("puzzle", { pieces: { count: 60 }, engrave: { kind: "text", text: "Hi" } }, "pro");
    expect(text.ok && text.svg).toMatch(/Engrave/);
  });
});

describe("puzzle export", () => {
  it("the default puzzle's SVG matches the golden file", async () => {
    const p = PUZZLE.defaults();
    const svg = genSVG(PUZZLE, p, arrangeGenerator(PUZZLE, p, CTX).lay!);
    expect(svg).toContain('inkscape:label="03 Inner cuts"');
    expect(svg.indexOf("Inner cuts")).toBeLessThan(svg.indexOf("Outline cut"));
    await expect(svg).toMatchFileSnapshot("./golden/puzzle-default.svg");
  });
});
