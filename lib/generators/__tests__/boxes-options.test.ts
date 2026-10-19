import { describe, expect, it } from "vitest";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { mergeBoxes } from "../boxes/params";
import { windowShape } from "../boxes/pierce";
import { BOXES_PRESETS } from "../boxes/presets";
import { bboxOf, pointInContour } from "../geom";
import type { GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => buildBoxes(mergeBoxes(raw), CTX) as BoxesOutput;
const part = (o: BoxesOutput, id: string) => o.parts.find((p) => p.id === id) as GenPart;
const lidBox = { design: "box", box: { width: 150, depth: 100, height: 70, lid: "liftoff", clearance: 0.3 } };
const centre = (c: [number, number][]) => { const b = bboxOf([c]); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] as [number, number]; };

describe("Boxes: joint fit", () => {
  it("standard leaves every part as it was; each step grows or shrinks every edge by half the step", () => {
    const base = build({ design: "box" });
    expect(build({ design: "box", joint: { fit: "standard" } })).toEqual(base);
    const w = (o: BoxesOutput) => { const b = bboxOf([part(o, "front").outer]); return b.x1 - b.x0; };
    expect(w(build({ design: "box", joint: { fit: "tight" } })) - w(base)).toBeCloseTo(0.1, 3);
    expect(w(build({ design: "box", joint: { fit: "looser" } })) - w(base)).toBeCloseTo(-0.1, 3);
    expect(build({ design: "box", joint: { fit: "snug" } }).stats.some((s) => s.label === "Fit")).toBe(true);
  });

  it("an unknown fit falls back to standard", () => {
    expect(mergeBoxes({ joint: { fit: "glued" } }).joint.fit).toBe("standard");
  });
});

describe("Boxes: cut-out pattern options", () => {
  it("engraves or scores the pattern instead of cutting it", () => {
    const cut = build({ ...lidBox, pierce: { pattern: "circles", on: "walls" } });
    const eng = build({ ...lidBox, pierce: { pattern: "circles", on: "walls", mark: "engrave" } });
    const sco = build({ ...lidBox, pierce: { pattern: "circles", on: "walls", mark: "score" } });
    const n = part(cut, "front").holes.length;
    expect(n).toBeGreaterThan(5);
    expect(part(eng, "front").holes.length).toBe(0);
    expect(part(eng, "front").engrave?.length).toBe(n);
    expect(part(sco, "front").holes.length).toBe(0);
    expect(part(sco, "front").score?.length).toBe(n);
  });

  it("puts the pattern on the front wall only, or the front and the lid", () => {
    const front = build({ ...lidBox, pierce: { pattern: "circles", on: "front" } });
    expect(part(front, "front").holes.length).toBeGreaterThan(0);
    for (const id of ["back", "left", "right", "lid"]) expect(part(front, id).holes.length, id).toBe(0);
    const both = build({ ...lidBox, pierce: { pattern: "circles", on: "front-lid" } });
    expect(part(both, "lid").holes.length).toBeGreaterThan(0);
    expect(part(both, "back").holes.length).toBe(0);
  });

  it("keeps a shaped pattern inside its window in the middle of the face", () => {
    const full = build({ ...lidBox, pierce: { pattern: "circles", on: "lid", cell: 8, bar: 1.5 } });
    const heart = build({ ...lidBox, pierce: { pattern: "circles", on: "lid", cell: 8, bar: 1.5, shape: "heart", size: 80 } });
    const lid = part(heart, "lid"), b = bboxOf([lid.outer]);
    expect(lid.holes.length).toBeGreaterThan(5);
    expect(lid.holes.length).toBeLessThan(part(full, "lid").holes.length);
    const edge = 3 + 1.5 + 1, s = Math.min(b.x1 - b.x0, b.y1 - b.y0) - 2 * edge;
    const win = windowShape("heart", (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, s * 0.8)!;
    for (const h of lid.holes) expect(pointInContour(centre(h), win)).toBe(true);
  });

  it("draws every window shape at its size, centred", () => {
    for (const s of ["circle", "heart", "star", "hexagon", "diamond"] as const) {
      const c = windowShape(s, 50, 40, 30)!;
      const b = bboxOf([c]);
      expect(Math.max(b.x1 - b.x0, b.y1 - b.y0), s).toBeLessThanOrEqual(30.01);
      expect(Math.max(b.x1 - b.x0, b.y1 - b.y0), s).toBeGreaterThan(20);
      expect(pointInContour([50, 40], c), s).toBe(true);
    }
    expect(windowShape("full", 0, 0, 10)).toBeNull();
  });

  it("an engraved pattern leaves a lift-off lid's lip solid (nothing to see through)", () => {
    const cut = build({ ...lidBox, pierce: { pattern: "circles", on: "lid" } });
    const eng = build({ ...lidBox, pierce: { pattern: "circles", on: "lid", mark: "engrave" } });
    expect(part(cut, "lip").holes.length).toBe(1);
    expect(part(eng, "lip").holes.length).toBe(0);
  });

  it("builds the new presets without errors", () => {
    for (const id of ["coaster-box", "photo-box", "trinket-drawer", "star-lantern", "engraved-chest", "circle-window-box"]) {
      const pr = BOXES_PRESETS.find((x) => x.id === id);
      expect(pr, id).toBeTruthy();
      const out = build(pr!.params);
      expect(out.error, id).toBeUndefined();
      expect(out.parts.length, id).toBeGreaterThan(3);
    }
  });
});
