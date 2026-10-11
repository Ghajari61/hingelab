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
