import { describe, expect, it } from "vitest";
import { distToContour, pointInContour } from "../geom";
import { buildBoxes } from "../boxes/build";
import { mergeBoxes } from "../boxes/params";
import { BOXES_PRESETS } from "../boxes/presets";
import { checkBoxes } from "../boxes/check";
import { buildClock, edgeDistance, faceOutline, markerDepth, type ClockOutput } from "../clock/build";
import { checkClock } from "../clock/check";
import { mergeClock, type ClockParams } from "../clock/params";
import { bendAround } from "../textPath";
import type { Contour } from "../types";
import { CTX } from "./ctx";

const pts = (cs: Contour[]) => cs.flat();
const radius = ([x, y]: [number, number]) => Math.hypot(x, y);
const centroid = (c: Contour): [number, number] => [c.reduce((a, q) => a + q[0], 0) / c.length, c.reduce((a, q) => a + q[1], 0) / c.length];

describe("text on a circle", () => {
  it("bends the line along the top clockwise and along the bottom anticlockwise, both left to right", () => {
    const bar: Contour = [[-20, -1], [20, -1], [20, 1], [-20, 1]];
    const top = bendAround([bar], 100, "top")[0];
    const bottom = bendAround([bar], 100, "bottom")[0];
    for (const q of top) { expect(q[1]).toBeLessThan(0); expect(radius(q)).toBeGreaterThan(98.9); expect(radius(q)).toBeLessThan(101.1); }
    for (const q of bottom) { expect(q[1]).toBeGreaterThan(0); expect(radius(q)).toBeGreaterThan(98.9); expect(radius(q)).toBeLessThan(101.1); }
    // The start of the line (x = -20) is on the left in both.
    expect(top[0][0]).toBeLessThan(0);
    expect(bottom[0][0]).toBeLessThan(0);
    // Letters stand outward along the top (y = -1 is the top of the line) and inward along the bottom.
    expect(radius(top[0])).toBeGreaterThan(radius(top[top.length - 1]));
    expect(radius(bottom[0])).toBeLessThan(radius(bottom[bottom.length - 1]));
  });
});

describe("clock: text on the dial", () => {
  const withText = (o: Partial<ClockParams["inscription"]>, face: Partial<ClockParams["face"]> = {}) =>
    mergeClock({ face: { layers: "single", ...face }, inscription: { text: "GRAND CENTRAL", at: "top", fontId: "archivo-black", size: 10, gap: 6, ...o } });

  for (const at of ["top", "bottom"] as const) {
    it(`${at}: centred, inside the markers by the gap, and the same size as asked`, () => {
      const p = withText({ at });
      const plain = buildClock({ ...p, inscription: { ...p.inscription, text: "" } }, CTX);
      const out = buildClock(p, CTX) as ClockOutput;
      const face = out.parts.find((q) => q.id === "face")!;
      const before = plain.parts.find((q) => q.id === "face")!.engrave!.length;
      const ins = face.engrave!.slice(before);
      expect(ins.length).toBeGreaterThan(5);
      const q = pts(ins);
      const cx = q.reduce((a, v) => a + v[0], 0) / q.length;
      expect(Math.abs(cx)).toBeLessThan(5);
      for (const v of q) expect(at === "top" ? v[1] < 0 : v[1] > 0).toBe(true);
      const outline = faceOutline(p)!;
      const bandInner = edgeDistance(outline, at === "top" ? 0 : 180) - p.markers.inset - markerDepth(p);
      const rMax = Math.max(...q.map(radius)), rMin = Math.min(...q.map(radius));
      expect(rMax).toBeLessThanOrEqual(bandInner - p.inscription.gap + 0.5);
      expect(rMax - rMin).toBeGreaterThan(p.inscription.size * 0.8);
      expect(rMax - rMin).toBeLessThan(p.inscription.size * 1.6);
      expect(out.inscription!.span).toBeGreaterThan(0.3);
      expect(checkClock(p, out).map((i) => i.code)).not.toContain("INSCRIPTION_LONG");
    });
  }

  it("on a ring face the text goes on the back plate, inside the ring where it shows", () => {
    const p = withText({}, { layers: "ring", ring: 40 });
    const out = buildClock(p, CTX);
    const back = out.parts.find((q) => q.id === "back")!;
    const ring = out.parts.find((q) => q.id === "ring")!;
    const ringInner = ring.holes[0];
    const plain = buildClock({ ...p, inscription: { ...p.inscription, text: "" } }, CTX);
    const ins = back.engrave!.slice(plain.parts.find((q) => q.id === "back")!.engrave!.length);
    expect(ins.length).toBeGreaterThan(5);
    for (const v of pts(ins)) {
      expect(pointInContour(v, ringInner)).toBe(true);
      expect(distToContour(v, ringInner)).toBeGreaterThan(1);
    }
  });

  it("text that wraps more than half way round is flagged, and the fix clears it", () => {
    const p = withText({ text: "A VERY LONG MOTTO ON A SMALL CLOCK FACE", size: 14 }, { size: 220 });
    const out = buildClock(p, CTX);
    const issue = checkClock(p, out).find((i) => i.code === "INSCRIPTION_LONG")!;
    expect(issue).toBeTruthy();
    const q = issue.fixes[0].apply(p);
    expect(checkClock(q, buildClock(q, CTX)).map((i) => i.code)).not.toContain("INSCRIPTION_LONG");
  });

  it("text pushed into the middle is flagged", () => {
    const p = withText({ gap: 90, size: 12 });
    const issue = checkClock(p, buildClock(p, CTX)).find((i) => i.code === "INSCRIPTION_CENTRE");
    expect(issue).toBeTruthy();
    const q = issue!.fixes[0].apply(p);
    expect(checkClock(q, buildClock(q, CTX)).map((i) => i.code)).not.toContain("INSCRIPTION_CENTRE");
  });

  it("numerals can follow the dial: at three o'clock III stands on its side", () => {
    const base = mergeClock({ face: { layers: "single" }, markers: { style: "numerals", numerals: "roman", quarters: false, minutes: false } });
    const at3 = (p: ClockParams) => {
      const face = buildClock(p, CTX).parts.find((q) => q.id === "face")!;
      const cs = face.engrave!.filter((c) => { const [x, y] = centroid(c); return x > 0 && Math.abs(y) < 0.2 * x; });
      const all = pts(cs);
      return { w: Math.max(...all.map((v) => v[0])) - Math.min(...all.map((v) => v[0])), h: Math.max(...all.map((v) => v[1])) - Math.min(...all.map((v) => v[1])) };
    };
    const up = at3(base), side = at3({ ...base, markers: { ...base.markers, follow: true } });
    expect(up.w).toBeGreaterThan(up.h);
    expect(side.h).toBeGreaterThan(side.w);
  });

  it("the defaults are unchanged (no text, upright numerals)", () => {
    const p = mergeClock({});
    expect(p.inscription.text).toBe("");
    expect(p.markers.follow).toBe(false);
  });
});

describe("boxes: sign border", () => {
  it("an engraved band follows the outline at the inset, and the text room shrinks", () => {
    const pr = BOXES_PRESETS.find((q) => q.id === "office-sign")!;
    const p = mergeBoxes(pr.params);
    const out = buildBoxes(p, CTX);
    const plain = buildBoxes({ ...p, sign: { ...p.sign, border: 0 } }, CTX);
    const plate = out.parts.find((q) => q.id === "plate")!;
    const band = plate.engrave!.slice(0, plate.engrave!.length - plain.parts.find((q) => q.id === "plate")!.engrave!.length);
    expect(band.length).toBe(2);
    const outer = band[0], s = p.sign;
    const rect: Contour = [[0, 0], [s.width, 0], [s.width, s.height], [0, s.height]];
    for (const v of outer) expect(Math.abs(distToContour(v, rect) - s.border)).toBeLessThan(s.corner + 0.1);
    for (const v of band.flat()) expect(distToContour(v, rect)).toBeGreaterThanOrEqual(s.border - 0.05);
    const minIn = Math.min(...band[1].map((v) => distToContour(v, rect)));
    expect(minIn).toBeCloseTo(s.border + s.borderWidth, 1);
    const square = { ...p, sign: { ...p.sign, corner: 2 } };
    const room = (q: typeof p) => buildBoxes(q, CTX).info!.textRoom!;
    expect(room(square)).toBeLessThan(room({ ...square, sign: { ...square.sign, border: 0 } }));
    expect(checkBoxes(p, out).filter((i) => i.level === "error")).toEqual([]);
  });
});
