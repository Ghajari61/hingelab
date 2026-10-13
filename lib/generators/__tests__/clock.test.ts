import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { CLOCK } from "../clock";
import { clockGeometry, handOutline, numeral } from "../clock/build";
import { checkClock } from "../clock/check";
import { MOVEMENTS, mergeClock, type ClockParams } from "../clock/params";
import { bboxOf, pointInContour } from "../geom";
import { arrangeGenerator, cutPart, genSVG, sheetIssues } from "../output";
import { CTX } from "./ctx";

const build = (p: ClockParams) => CLOCK.build(p, CTX);
const issues = (p: ClockParams) => CLOCK.check(p, build(p));
const codes = (p: ClockParams) => issues(p).map((i) => i.code);
const finite = (v: unknown): boolean => (Array.isArray(v) ? v.every(finite) : typeof v === "number" ? Number.isFinite(v) : true);

describe("clock presets", () => {
  for (const pr of CLOCK.presets) {
    it(`${pr.id} builds cleanly`, () => {
      const p = CLOCK.merge(pr.params);
      const out = build(p);
      expect(out.error).toBeUndefined();
      expect(out.notice).toBeUndefined();
      expect(out.missing).toEqual([]);
      for (const part of out.parts) {
        expect(part.outer.length).toBeGreaterThan(2);
        expect(finite(part.outer) && part.holes.every(finite) && (part.engrave ?? []).every(finite)).toBe(true);
      }
      expect(CLOCK.check(p, out).filter((i) => i.level !== "info").map((i) => i.code)).toEqual([]);
      const arranged = arrangeGenerator(CLOCK, p, CTX);
      expect(arranged.lay).toBeTruthy();
      expect(sheetIssues(CLOCK, p, arranged)).toEqual([]);
    });
  }
});

describe("clock geometry", () => {
  it("numerals: Roman uses the clockmaker's IIII; removed numeral sets become Western digits", () => {
    expect(numeral("roman", 4)).toBe("IIII");
    expect(numeral("roman", 0)).toBe("XII");
    expect(numeral("arabic", 0)).toBe("12");
    expect(mergeClock({ markers: { numerals: "persian" } }).markers.numerals).toBe("arabic");
  });

  it("Persian numbers are shaped left to right (۱۲ is one then two)", () => {
    const s = CTX.text!("۱۲", "vazirmatn", 20)!;
    const left = [...s.contours].sort((a, b) => bboxOf([a]).x0 - bboxOf([b]).x0)[0];
    const lb = bboxOf([left]);
    expect(lb.x1 - lb.x0).toBeLessThan(s.width * 0.35);
  });

  it("hides the keyhole under the ring of a layered face", () => {
    const g = clockGeometry(CLOCK.defaults(), CTX);
    if ("error" in g) throw new Error(g.error);
    expect(g.hangerHidden).toBe(true);
    expect(g.keyholeFits).toBe(true);
    const single = clockGeometry(mergeClock({ face: { layers: "single" } }), CTX);
    if ("error" in single) throw new Error(single.error);
    expect(single.hangerHidden).toBe(false);
  });

  it("cuts the movement's holes at the standard sizes", () => {
    const p = CLOCK.defaults();
    const out = build(p);
    const byId = Object.fromEntries(out.parts.map((q) => [q.id, q]));
    const w = (c: number[][]) => { const b = bboxOf([c as [number, number][]]); return [b.x1 - b.x0, b.y1 - b.y0]; };
    expect(w(byId.back.holes[0])[0]).toBeCloseTo(8.4, 1);
    expect(w(byId.hour.holes[0])[0]).toBeCloseTo(5.2, 1);
    const [mw, mh] = w(byId.minute.holes[0]);
    expect(Math.max(mw, mh)).toBeCloseTo(3.6, 1);
    expect(Math.min(mw, mh)).toBeCloseTo(2.4, 1);
  });

  it("kerf grows outlines and shrinks holes by half the kerf", () => {
    const p = { ...CLOCK.defaults(), K: 0.2 };
    const face = build(p).parts[0];
    const cut = cutPart(face, p.K);
    const a = bboxOf([face.outer]), b = cut.bbox;
    expect(b.x1 - b.x0 - (a.x1 - a.x0)).toBeCloseTo(0.2, 2);
    const shaft = cut.inner.find((c) => pointInContour([0, 0], c))!;
    const sb = bboxOf([shaft]);
    expect(sb.x1 - sb.x0).toBeCloseTo(8.4 - 0.2, 1);
  });

  it("puts the markers on the ring, the back plate or reports them straddling the edge", () => {
    const g = (q: Partial<ClockParams["markers"]>, ring = 40) => clockGeometry(mergeClock({ face: { ring }, markers: q }), CTX);
    const on = g({}); if ("error" in on) throw new Error(on.error);
    expect(on.markersOn).toBe("ring");
    const back = g({ inset: 50 }); if ("error" in back) throw new Error(back.error);
    expect(back.markersOn).toBe("back");
    expect(back.straddle).toBe(false);
    const mid = g({ inset: 30 }); if ("error" in mid) throw new Error(mid.error);
    expect(mid.straddle).toBe(true);
  });

  it("hands are single outlines that contain their hub", () => {
    for (const s of ["baton", "classic", "spade", "leaf", "arrow"] as const) {
      const h = handOutline(s, 100, 10, 20, 5.2);
      for (let y = 17; y >= -97; y -= 3) expect(pointInContour([0, y], h), `${s} at y=${y}`).toBe(true);
      const b = bboxOf([h]);
      expect(b.y0, s).toBeCloseTo(-100, 0);
    }
  });

  it("a desk stand has a tab that fits the base's slot", () => {
    const p = CLOCK.merge(CLOCK.presets.find((q) => q.id === "desk-stand")!.params);
    const out = build(p);
    const face = out.parts.find((q) => q.id === "face")!, base = out.parts.find((q) => q.id === "base")!;
    const fb = bboxOf([face.outer]);
    expect(fb.y1).toBeCloseTo(90 + p.T, 1);
    const slot = bboxOf([base.holes[0]]);
    expect(slot.y1 - slot.y0).toBeCloseTo(p.T + 0.1, 3);
    expect(face.place?.upright).toBe(true);
  });

  it("a custom outline is scaled to the face size; an empty one is an error", () => {
    const heart = "M 50 90 C 20 70 0 50 0 28 C 0 10 14 0 27 0 C 38 0 46 7 50 16 C 54 7 62 0 73 0 C 86 0 100 10 100 28 C 100 50 80 70 50 90 Z";
    const out = build(mergeClock({ face: { shape: "custom", path: heart, size: 320, layers: "single" } }));
    expect(out.error).toBeUndefined();
    const b = bboxOf([out.parts[0].outer]);
    expect(Math.max(b.x1 - b.x0, b.y1 - b.y0)).toBeCloseTo(320, 0);
    expect(build(mergeClock({ face: { shape: "custom", path: "" } })).error).toMatch(/path data/);
  });

  it("scales for Fit to sheets but keeps the movement holes", () => {
    const p = CLOCK.scale!(CLOCK.defaults(), 0.5);
    expect(p.face.size).toBe(150);
    expect(p.hands.minute).toBe(50);
    expect(p.movement.shaft).toBe(8.4);
  });
});

describe("clock checks and fixes", () => {
  it("a stacked face too thick for the short shaft is fixed with a longer movement", () => {
    const p = mergeClock({ face: { layers: "stack" }, T: 3 });
    expect(codes(p)).toContain("DIAL_TOO_THICK");
    const res = autoFixAll(p, issues);
    expect(res.params.movement.maxDial).toBe(8);
    expect(res.remaining.map((i) => i.code)).not.toContain("DIAL_TOO_THICK");
  });

  it("markers straddling the ring are fixed by widening the ring", () => {
    const p = mergeClock({ markers: { inset: 30 } });
    expect(codes(p)).toContain("MARKERS_STRADDLE_RING");
    const res = autoFixAll(p, issues);
    expect(res.remaining.map((i) => i.code)).not.toContain("MARKERS_STRADDLE_RING");
  });

  it("a minute hand over the ring, a long hour hand and thin hands are fixed", () => {
    const p = mergeClock({ hands: { minute: 140, hour: 150, style: "classic", width: 6 } });
    const c = codes(p);
    expect(c).toEqual(expect.arrayContaining(["HAND_TOO_LONG", "HOUR_HAND_LONGER", "HAND_TOO_THIN"]));
    const res = autoFixAll(p, issues);
    expect(res.remaining.filter((i) => i.level !== "info")).toEqual([]);
  });

  it("a small face shows the movement and gets bigger", () => {
    const p = mergeClock({ face: { size: 70, layers: "single" }, markers: { style: "none", minutes: false }, hands: { style: "none" }, hanger: "none" });
    expect(codes(p)).toContain("MOVEMENT_SHOWS");
    expect(autoFixAll(p, issues).params.face.size).toBeGreaterThanOrEqual(84);
  });

  it("crowded numerals shrink, a keyhole that does not fit is dropped", () => {
    const p = mergeClock({ face: { size: 120, layers: "single" }, markers: { size: 30, inset: 2 }, hands: { minute: 40, hour: 28 } });
    expect(codes(p)).toContain("NUMERALS_CROWDED");
    const q = mergeClock({ face: { shape: "sunburst", size: 300, depth: 60, layers: "single" }, hanger: "hole" });
    expect(codes(q)).toContain("KEYHOLE_FIT");
    expect(autoFixAll(q, issues).params.hanger).toBe("none");
  });

  it("dial text in a font without those letters reports missing glyphs", () => {
    const p = mergeClock({ inscription: { text: "\u00c5\u0141\u0152 \u05d0", fontId: "archivo-black" } });
    expect(build(p).missing?.length).toBeGreaterThan(0);
    expect(codes(p)).toContain("MISSING_GLYPHS");
    expect(autoFixAll(p, issues).params).toBeTruthy();
  });

  it("long minute hands need a high-torque movement", () => {
    const p = mergeClock({ face: { size: 500, ring: 30 }, hands: { minute: 180, hour: 120 } });
    expect(codes(p)).toContain("HIGH_TORQUE");
  });

  it("checks run without fonts (geometry only) and a broken custom outline reports no issues", () => {
    const p = CLOCK.defaults();
    expect(() => checkClock(p, CLOCK.build(p, {}))).not.toThrow();
    const bad = mergeClock({ face: { shape: "custom", path: "" } });
    expect(checkClock(bad, CLOCK.build(bad, {}))).toEqual([]);
  });

  it("every standard movement is selectable", () => {
    expect(MOVEMENTS.map((m) => m.maxDial)).toEqual([5, 8, 13]);
  });
});

describe("clock export", () => {
  it("the wall clock's SVG matches the golden file", async () => {
    const p = CLOCK.defaults();
    const arranged = arrangeGenerator(CLOCK, p, CTX);
    const svg = genSVG(CLOCK, p, arranged.lay!);
    expect(svg).toContain('inkscape:label="00 Engrave"');
    expect(svg.indexOf("Engrave")).toBeLessThan(svg.indexOf("Outline cut"));
    await expect(svg).toMatchFileSnapshot("./golden/clock-wall.svg");
  });
});
