import { describe, expect, it } from "vitest";
import { unionShapes } from "@/lib/letters/polygon";
import { bboxOf } from "../geom";
import { arrangeGenerator } from "../output";
import { TOPPER } from "../topper";
import type { TopperOutput } from "../topper/build";
import { mergeTopper } from "../topper/params";
import { CTX } from "./ctx";

const build = (raw: unknown) => TOPPER.build(mergeTopper(raw), CTX) as TopperOutput;
const onePiece = (pt: { outer: number[][]; holes: number[][][] }) => unionShapes([pt.outer as never, ...(pt.holes as never[])]).length === 1;

describe("cake topper", () => {
  it("welds script text and a motif into one piece with two level sticks", () => {
    const out = build({ text: { text: "Happy\nBirthday" }, motif: { kind: "balloons", place: "above" } });
    expect(out.parts).toHaveLength(1);
    const [t] = out.parts;
    expect(onePiece(t)).toBe(true);
    const b = bboxOf([t.outer]);
    expect(out.info!.height).toBeCloseTo(b.y1 - b.y0, 3);
    expect(out.info!.height).toBeGreaterThan(out.info!.contentH + 80);
  });

  it("layered toppers add a front layer in the second material", () => {
    const p = mergeTopper({ style: { kind: "layered" }, mat: { mat2: "acrylic-silver" } });
    const out = TOPPER.build(p, CTX);
    const front = out.parts.find((pt) => pt.id === "front")!;
    expect(front.material).toBe("second");
    expect(front.color).toBe("#C9CED6");
    expect(out.materials?.second).toMatch(/Silver mirror acrylic/);
    const a = arrangeGenerator(TOPPER, p, CTX);
    expect(a.sheets!.length).toBe(2);
    expect(a.sheets![1].label).toMatch(/Silver mirror acrylic/);
  });

  it("outline style is solid with the text engraved", () => {
    const out = build({ style: { kind: "outline", mark: "engrave" } });
    expect(out.parts[0].holes).toHaveLength(0);
    expect(out.parts[0].engrave!.length).toBeGreaterThan(0);
    const scored = build({ style: { kind: "outline", mark: "score" } });
    expect(scored.parts[0].score!.length).toBeGreaterThan(0);
  });

  it("plates fit the text and score a frame", () => {
    const out = build({ style: { kind: "plate" }, plate: { shape: "rounded", auto: true, pad: 10, frame: true }, sticks: { count: 0 } });
    expect(out.info!.width).toBeCloseTo(out.info!.contentW + 20, 0);
    expect(out.parts[0].score!.length).toBeGreaterThan(0);
  });

  it("cupcake picks cycle through the names", () => {
    const out = build({ kit: { kind: "cupcake" }, cupcake: { count: 5, shape: "circle", text: "Mia\nLeo", motif: "star" } });
    expect(out.parts.map((p) => p.name)).toEqual(["Pick Mia", "Pick Leo", "Pick Mia", "Pick Leo", "Pick Mia"]);
    for (const pt of out.parts) expect(pt.engrave!.length).toBeGreaterThan(0);
  });

  it("asks for text or a motif", () => {
    expect(build({ text: { text: "  " }, motif: { kind: "none" } }).error).toMatch(/text or pick a motif/);
  });

  it("flags thin sticks and fixes them", () => {
    const p = mergeTopper({ sticks: { width: 3 } });
    const issue = TOPPER.check(p, TOPPER.build(p, CTX)).find((i) => i.code === "THIN_STICK")!;
    expect(issue).toBeTruthy();
    expect(issue.fixes[0].apply(p).sticks.width).toBeGreaterThanOrEqual(5);
  });

  it("party sets and plates are Pro", () => {
    expect(TOPPER.pro!(mergeTopper({ kit: { kind: "set" } }), { parts: [], stats: [] })).toMatch(/Pro/);
    expect(TOPPER.pro!(mergeTopper({}), { parts: [], stats: [] })).toBeNull();
  });
});

describe("hoop and shaker toppers", () => {
  const T = 3;
  it("a hoop welds the letters across a ring into one piece", () => {
    const out = build({ style: { kind: "hoop" }, plate: { shape: "circle" }, frame: { band: 5 } });
    expect(out.parts).toHaveLength(1);
    expect(onePiece(out.parts[0])).toBe(true);
    expect(out.parts[0].holes.length).toBeGreaterThan(1);
    // the words run past the ring, so the topper is as wide as the words
    expect(out.info!.width).toBeGreaterThanOrEqual(out.info!.contentW - 0.5);
  });

  it("a shaker stacks the back, spacer rings and a clear window with the words", () => {
    const p = mergeTopper({ T, style: { kind: "shaker", mark: "engrave" }, plate: { shape: "rounded", auto: true, pad: 10 }, frame: { band: 5, spacers: 2 }, mat: { mat2: "acrylic-clear" } });
    const out = TOPPER.build(p, CTX) as TopperOutput;
    const back = out.parts.find((x) => x.id === "topper")!, win = out.parts.find((x) => x.id === "window")!;
    const spacers = out.parts.filter((x) => x.id.startsWith("spacer"));
    expect(spacers).toHaveLength(2);
    expect(win.material).toBe("second");
    expect(win.engrave!.length).toBeGreaterThan(0);
    expect(win.place!.z).toBeCloseTo(3 * T, 6);
    const wb = bboxOf([win.outer]);
    for (const s of spacers) {
      expect(s.holes).toHaveLength(1);
      const sb = bboxOf([s.outer]), hb = bboxOf([s.holes[0]]);
      expect(sb.x1 - sb.x0).toBeCloseTo(wb.x1 - wb.x0, 4);
      expect(hb.x0 - sb.x0).toBeCloseTo(5, 1);
    }
    // only the back carries the sticks
    expect(bboxOf([back.outer]).y1).toBeGreaterThan(wb.y1 + 80);
    expect(TOPPER.check(p, out).some((i) => i.code === "SHAKER_WINDOW")).toBe(false);
  });

  it("flags a thin frame and a window that is not clear, and the fixes clear them", () => {
    for (const [raw, code] of [[{ style: { kind: "hoop" }, frame: { band: 2 } }, "FRAME_THIN"], [{ style: { kind: "shaker" }, frame: { band: 3 } }, "FRAME_THIN"], [{ style: { kind: "shaker" }, mat: { mat2: "acrylic-gold" } }, "SHAKER_WINDOW"], [{ style: { kind: "shaker" }, plate: { auto: false, width: 60, height: 40 } }, "PLATE_SMALL"]] as const) {
      const p = mergeTopper(raw);
      const i = TOPPER.check(p, TOPPER.build(p, CTX)).find((x) => x.code === code)!;
      expect(i, code).toBeDefined();
      const q = i.fixes[0].apply(p);
      expect(TOPPER.check(q, TOPPER.build(q, CTX)).some((x) => x.code === code), code).toBe(false);
    }
  });
});
