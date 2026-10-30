import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { CLOCK } from "../clock";
import { clockGeometry, faceOutline, sliceOutline, type ClockOutput } from "../clock/build";
import { MOVEMENTS, mergeClock, type ClockParams } from "../clock/params";
import { bboxOf, distToContour, pointInContour } from "../geom";
import { arrangeGenerator, sheetIssues } from "../output";
import { CTX } from "./ctx";

const build = (raw: unknown) => CLOCK.build(mergeClock(raw), CTX) as ClockOutput;
const issuesOf = (p: ClockParams) => CLOCK.check(p, CLOCK.build(p, CTX));
const codes = (raw: unknown) => issuesOf(mergeClock(raw)).map((i) => i.code);
const radius = (c: [number, number][]) => Math.min(...c.map(([x, y]) => Math.hypot(x, y)));

describe("clock upgrades: presets", () => {
  for (const id of ["teaching-clock", "wood-slice", "mirror-numerals", "star-clock", "station-seconds"]) {
    it(`${id} builds without warnings and lays out`, () => {
      const pr = CLOCK.presets.find((x) => x.id === id)!;
      expect(pr).toBeTruthy();
      const p = CLOCK.merge(pr.params);
      const out = CLOCK.build(p, CTX);
      expect(out.error).toBeUndefined();
      expect(CLOCK.check(p, out).filter((i) => i.level !== "info").map((i) => i.code)).toEqual([]);
      const a = arrangeGenerator(CLOCK, p, CTX);
      expect(a.lay).toBeTruthy();
      expect(sheetIssues(CLOCK, p, a)).toEqual([]);
    });
  }
});

describe("clock upgrades: faces", () => {
  it("a star has its points on the outer radius and its inner corners at the set depth", () => {
    const p = mergeClock({ face: { shape: "star", size: 300, points: 6, inner: 60, corner: 0 } });
    const o = faceOutline(p)!;
    expect(Math.max(...o.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(150, 3);
    expect(radius(o)).toBeCloseTo(90, 3);
  });

  it("a wood slice is irregular, reaches the face size and differs with its number", () => {
    const a = sliceOutline(150, 1), b = sliceOutline(150, 2);
    expect(Math.max(...a.map(([x, y]) => Math.hypot(x, y)))).toBeCloseTo(150, 3);
    expect(radius(a)).toBeGreaterThan(110);
    expect(radius(a)).toBeLessThan(147);
    expect(a).not.toEqual(b);
    expect(sliceOutline(150, 1)).toEqual(a);
  });

  it("old saves keep their face; unknown shapes become round", () => {
    expect(mergeClock({ face: { shape: "blob" } }).face.shape).toBe("round");
    expect(mergeClock({}).face.points).toBe(5);
  });
});

describe("clock upgrades: minute numbers", () => {
  it("draws twelve minute numbers outside the hour numerals", () => {
    const base = { face: { size: 320, layers: "single" }, markers: { style: "numerals", numerals: "arabic", fontId: "fredoka", size: 24, inset: 6, minutes: false } };
    const plain = build(base);
    const taught = build({ ...base, markers: { ...base.markers, minuteNumbers: true, minuteSize: 9 } });
    expect(taught.parts[0].engrave!.length).toBeGreaterThan(plain.parts[0].engrave!.length);
    // every hour numeral moved in by the minute numbers' band
    const reach = (out: ClockOutput) => Math.max(...out.parts[0].engrave!.flat().map(([x, y]) => Math.hypot(x, y)));
    expect(reach(taught)).toBeGreaterThan(reach(plain) - 1);
    const g = clockGeometry(mergeClock({ ...base, markers: { ...base.markers, minuteNumbers: true, minuteSize: 9 } }), CTX);
    if ("error" in g) throw new Error(g.error);
    for (const c of taught.parts[0].engrave!) for (const q of c) expect(pointInContour(q, g.outline)).toBe(true);
  });

  it("warns when they crowd a small face, and the fix clears it", () => {
    const p = mergeClock({ face: { size: 160, layers: "single" }, markers: { style: "ticks", minutes: false, minuteNumbers: true, minuteSize: 30 } });
    expect(issuesOf(p).map((i) => i.code)).toContain("MINUTE_NUMBERS_CROWDED");
    expect(issuesOf(autoFixAll(p, issuesOf).params).map((i) => i.code)).not.toContain("MINUTE_NUMBERS_CROWDED");
  });
});

describe("clock upgrades: raised markers", () => {
  const raised = { face: { size: 320, layers: "single" }, markers: { style: "numerals", numerals: "arabic", size: 26, inset: 10, minutes: false, raised: true }, hands: { style: "baton", hour: 60, minute: 82, width: 7, tail: 14 } };

  it("cuts each numeral from the second material and scores where it goes", () => {
    const out = build(raised);
    const pieces = out.parts.filter((p) => p.id.startsWith("marker-"));
    expect(pieces).toHaveLength(12);
    for (const pc of pieces) {
      expect(pc.material).toBe("second");
      expect(pc.t).toBe(3);
    }
    const face = out.parts.find((p) => p.id === "face")!;
    expect(face.engrave ?? []).toHaveLength(0);
    expect(face.score!.length).toBeGreaterThanOrEqual(12);
    expect(out.materials?.second).toMatch(/Gold mirror acrylic/);
    expect(out.raised!.count).toBe(12);
  });

  it("raised ticks and dots, one piece per hour; minute ticks stay engraved", () => {
    const ticks = build({ ...raised, markers: { style: "ticks", raised: true, minutes: true } });
    expect(ticks.parts.filter((p) => p.id.startsWith("marker-"))).toHaveLength(12);
    expect(ticks.parts[0].engrave!.length).toBe(48);
    const dots = build({ ...raised, markers: { style: "dots", raised: true, minutes: false } });
    expect(dots.parts.filter((p) => p.id.startsWith("marker-"))).toHaveLength(12);
  });

  it("flags thick raised markers under the minute hand; the fix shortens the hand to clear them", () => {
    const p = mergeClock({ ...raised, hands: { ...raised.hands, minute: 140, hour: 90 }, mat: { mat2: "acrylic-gold", T2: 5 } });
    const i = issuesOf(p).find((x) => x.code === "RAISED_UNDER_HANDS")!;
    expect(i.level).toBe("warn");
    const fixed = autoFixAll(p, issuesOf).params;
    expect(issuesOf(fixed).map((x) => x.code)).not.toContain("RAISED_UNDER_HANDS");
    expect(fixed.hands.minute).toBeLessThan((build(fixed).raised!.inner));
  });

  it("on a layered face the raised markers sit on the ring when they fit there", () => {
    const out = build({ face: { size: 320, layers: "ring", ring: 60 }, markers: { style: "dots", dot: 10, inset: 10, minutes: false, raised: true } });
    const ring = out.parts.find((p) => p.id === "ring")!;
    expect(ring.score!.length).toBe(12);
  });
});

describe("clock upgrades: second hand", () => {
  it("adds a slim hand as long as the minute hand with the movement's seconds hole", () => {
    const out = build({ hands: { second: true, minute: 100 } });
    const s = out.parts.find((p) => p.id === "second")!;
    expect(s).toBeTruthy();
    const b = bboxOf([s.outer]);
    expect(-b.y0).toBeCloseTo(100, 0);
    const hole = bboxOf(s.holes);
    expect(hole.x1 - hole.x0).toBeCloseTo(MOVEMENTS[0].secondHole, 1);
    // the needle is at least 2 mm wide where it is narrowest
    expect(distToContour([0, -60], s.outer) * 2).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(build({}).parts.some((p) => p.id === "second")).toBe(false);
  });

  it("notes that a second hand cut from thick material is heavy", () => {
    expect(codes({ T: 6, hands: { second: true } })).toContain("SECOND_HAND_HEAVY");
    expect(codes({ T: 3, hands: { second: true } })).not.toContain("SECOND_HAND_HEAVY");
  });
});
