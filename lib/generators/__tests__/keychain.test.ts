import { describe, it, expect } from "vitest";
import { KEYCHAIN } from "../keychain";
import { CTX } from "./ctx";
import { bboxOf, pointInContour } from "../geom";
import { arrangeGenerator, genSVG } from "../output";

describe("keychains", () => {
  it("every preset has one connected body, a contained ring hole and cuttable output", () => {
    for (const preset of KEYCHAIN.presets) {
      const p = KEYCHAIN.merge(preset.params), out = KEYCHAIN.build(p, CTX);
      expect(out.error, preset.id).toBeUndefined();
      expect(out.parts.length, preset.id).toBeGreaterThan(0);
      const body = out.parts[0];
      expect(body.holes).toHaveLength(1);
      expect(body.holes[0].every(pt => pointInContour(pt, body.outer)), preset.id).toBe(true);
      expect(KEYCHAIN.check(p, out).filter(i => i.level === "error")).toEqual([]);
      expect(arrangeGenerator(KEYCHAIN, p, CTX).result).not.toHaveProperty("error");
    }
  });
  it("exports vectors at real dimensions and personalizes a names batch", () => {
    const p=KEYCHAIN.merge({job:{names:"Ana\nBen\nCy"}});
    const a=arrangeGenerator(KEYCHAIN,p,CTX);
    expect(a.result).not.toHaveProperty("error");
    if ("error" in a.result) throw Error(a.result.error);
    expect(a.result.parts).toHaveLength(3);
    expect(new Set(a.result.parts.map(p=>p.id)).size).toBe(3);
    const svg=genSVG(KEYCHAIN,a.params,a.lay!);
    expect(svg).toContain("<svg");expect(svg).toContain("mm");expect(svg).not.toMatch(/NaN|Infinity|<text[ >]/);
  });
  it("supports all attachment positions without changing hole diameter", () => {
    for (const side of ["left", "right", "top"]) {
      const p = KEYCHAIN.merge({ ring: { side, diameter: 5 } });
      const out = KEYCHAIN.build(p, CTX), b = bboxOf([out.parts[0].holes[0]]);
      expect(b.x1-b.x0).toBeCloseTo(5, 2);expect(b.y1-b.y0).toBeCloseTo(5, 2);
    }
  });
  it("makes raised text as real cut parts and keeps score separate from engraving", () => {
    const raised=KEYCHAIN.build(KEYCHAIN.merge({ style: "layered" }), CTX);
    expect(raised.parts.length).toBeGreaterThan(1);
    const score=KEYCHAIN.build(KEYCHAIN.merge({ style: "score" }), CTX);
    expect(score.parts[0].score!.length).toBeGreaterThan(0);
    expect(score.parts[0].engrave).toHaveLength(0);
  });
  it("sanitizes invalid settings and reports missing glyphs instead of silently dropping text", () => {
    const p=KEYCHAIN.merge({width:NaN,height:-20,ring:{diameter:Infinity,wall:-1}});
    const out=KEYCHAIN.build(p, CTX);
    expect(out.error).toBeUndefined();
    expect(out.parts.flatMap(p=>p.outer).flat().every(Number.isFinite)).toBe(true);
    expect(KEYCHAIN.build(KEYCHAIN.merge({text:{name:"test"}}),{text:()=>({contours:[],width:0,height:0,missing:["t"]})}).error).toMatch(/font/i);
  });
});
