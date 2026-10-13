import { describe, expect, it } from "vitest";
import { KEYRACK } from "../keyrack";
import { sanitizeGeneratorParams } from "../sanitize";
import { bboxOf } from "../geom";
import { SIGN } from "../sign";
import { TABLENUM } from "../tablenum";
import { TOPPER } from "../topper";
import type { AnyGenerator } from "../types";
import type { SignOutput } from "../sign/build";
import { mergeSign } from "../sign/params";
import { TEXT_STYLE, caseText, cleanTextStyle, styleContours } from "../textStyle";
import { textBlock } from "../weld";
import { CTX } from "./ctx";

const block = (text: string, style = {}) => textBlock(CTX, text, "archivo-black", 20, { style });
const area = (cs: [number, number][][]) => cs.reduce((s, c) => {
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += c[j][0] * c[i][1] - c[i][0] * c[j][1];
  return s + a / 2;
}, 0);

describe("text style", () => {
  it("the defaults leave the text exactly as it was", () => {
    const a = textBlock(CTX, "Welcome", "pacifico", 30, {});
    const b = textBlock(CTX, "Welcome", "pacifico", 30, { style: { ...TEXT_STYLE } });
    expect(b).toEqual(a);
    expect(styleContours(a.contours, TEXT_STYLE)).toBe(a.contours);
  });

  it("sets letter case; Persian has none and stays as typed", () => {
    expect(caseText("happy birthday, sam", "upper")).toBe("HAPPY BIRTHDAY, SAM");
    expect(caseText("HOME Sweet", "lower")).toBe("home sweet");
    expect(caseText("happy BIRTHDAY mr-smith", "title")).toBe("Happy Birthday Mr-Smith");
    expect(caseText("سلام دنیا", "upper")).toBe("سلام دنیا");
    expect(block("abc", { case: "upper" }).height).toBeCloseTo(block("ABC").height, 6);
  });

  it("width scales the letters sideways and keeps their height", () => {
    const a = block("HOME"), b = block("HOME", { stretch: 150 });
    expect(b.width).toBeCloseTo(a.width * 1.5, 3);
    expect(b.height).toBeCloseTo(a.height, 6);
  });

  it("slant leans the letters without changing their height", () => {
    const a = block("I"), b = block("I", { slant: 20 });
    expect(b.height).toBeCloseTo(a.height, 6);
    expect(b.width).toBeCloseTo(a.width + a.height * Math.tan((20 * Math.PI) / 180), 3);
  });

  it("thicken grows every stroke", () => {
    const a = block("HOME"), b = block("HOME", { bold: 1 });
    expect(b.width).toBeCloseTo(a.width + 2, 1);
    expect(Math.abs(area(b.contours))).toBeGreaterThan(Math.abs(area(a.contours)) * 1.1);
  });

  it("a curve arches the line up (positive) or down (negative) and keeps the letters the right way round", () => {
    const flat = block("HAPPY BIRTHDAY");
    const up = block("HAPPY BIRTHDAY", { arc: 90 }), down = block("HAPPY BIRTHDAY", { arc: -90 });
    expect(up.height).toBeGreaterThan(flat.height * 1.5);
    expect(up.width).toBeLessThan(flat.width);
    expect(Math.sign(area(up.contours))).toBe(Math.sign(area(flat.contours)));
    // Letters above the baseline widen a little on the outside of the curve.
    const ratio = Math.abs(area(up.contours)) / Math.abs(area(flat.contours));
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.15);
    // Arched up: the ends sit lower (y down) than the middle; a smile is the other way round.
    const first = (cs: [number, number][][]) => bboxOf([cs.reduce((a, c) => (bboxOf([c]).x0 < bboxOf([a]).x0 ? c : a))]);
    expect(first(up.contours).y1).toBeGreaterThan(up.height / 2 - 1);
    expect(first(down.contours).y0).toBeLessThan(-down.height / 2 + 1);
  });

  it("a tight curve stops before the letters fold over", () => {
    const t = block("HI", { arc: 180 });
    expect(t.contours.length).toBeGreaterThan(0);
    expect(Number.isFinite(t.width) && Number.isFinite(t.height)).toBe(true);
    expect(t.height).toBeLessThan(block("HI").height * 4);
  });

  it("bad saved values fall back to the defaults or are clamped", () => {
    expect(cleanTextStyle({ case: "shout", slant: 90, stretch: "x", bold: -1, arc: NaN })).toEqual({ case: "as-typed", slant: 30, stretch: 100, bold: 0, arc: 0 });
    expect(mergeSign({ textStyle: { case: "upper", arc: 400 } }).textStyle).toEqual({ ...TEXT_STYLE, case: "upper", arc: 180 });
  });

  it("signs, toppers, key holders and table numbers offer the style and use it", () => {
    for (const g of [SIGN, TOPPER, KEYRACK, TABLENUM] as unknown as AnyGenerator[]) {
      expect(g.sections.some((s) => s.id === "textStyle"), g.id).toBe(true);
      const style = { case: "upper", slant: 10, stretch: 120, bold: 0.5, arc: 30 };
      const p = sanitizeGeneratorParams(g, g.merge({ textStyle: style })) as unknown as { textStyle: unknown };
      expect(p.textStyle, g.id).toEqual(style);
      const wild = sanitizeGeneratorParams(g, g.merge({ textStyle: { slant: 99, bold: 9 } })) as unknown as { textStyle: { slant: number; bold: number } };
      expect([wild.textStyle.slant, wild.textStyle.bold], g.id).toEqual([30, 3]);
      const out = g.build(g.merge({ textStyle: style }), CTX);
      expect(out.error, g.id).toBeUndefined();
    }
    const raw = { text: { text: "Welcome" }, motif: { kind: "none" }, border: { kind: "none" }, mount: { kind: "none" } };
    const a = SIGN.build(mergeSign(raw), CTX) as SignOutput;
    const b = SIGN.build(mergeSign({ ...raw, textStyle: { arc: 60 } }), CTX) as SignOutput;
    expect(b.error).toBeUndefined();
    expect(b.info!.H).toBeGreaterThan(a.info!.H);
  });
});
