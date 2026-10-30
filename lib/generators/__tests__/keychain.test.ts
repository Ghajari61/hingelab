import { describe, it, expect } from "vitest";
import { KEYCHAIN } from "../keychain";
import { CTX } from "./ctx";
import { bboxOf, pointInContour } from "../geom";
import { arrangeGenerator, genSVG } from "../output";

describe("keychains", () => {
  it("every preset has one connected body, a contained ring hole and cuttable output", () => {
    for (const preset of KEYCHAIN.presets.filter((q) => !(q.params as { build?: string }).build)) {
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

  describe("layered builds", () => {
    const build = (over: object) => { const p = KEYCHAIN.merge(over); return { p, out: KEYCHAIN.build(p, CTX) }; };
    const holeIn = (pt: { outer: [number, number][]; holes: [number, number][][] }, at: [number, number]) => pt.holes.some((h) => pointInContour(at, h));
    it("every layered preset builds several aligned layers, each with the ring hole, and lays out", () => {
      for (const preset of KEYCHAIN.presets.filter((q) => (q.params as { build?: string }).build)) {
        const p = KEYCHAIN.merge(preset.params), out = KEYCHAIN.build(p, CTX);
        expect(out.error, preset.id).toBeUndefined();
        expect(out.parts.length, preset.id).toBeGreaterThanOrEqual(2);
        // every layer of the stack carries the ring hole (the spinner's loose disc excepted)
        const ring = out.parts[0].holes.at(-1)!, b = bboxOf([ring]), c: [number, number] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
        for (const q of out.parts.filter((x) => x.id !== "disc" && !x.id.startsWith("detail") && x.id !== "mountains" && x.id !== "hills")) expect(holeIn(q as never, c), `${preset.id} ${q.id}`).toBe(true);
        expect(new Set(out.parts.map((q) => q.place?.z)).size, preset.id).toBeGreaterThanOrEqual(2);
        expect(arrangeGenerator(KEYCHAIN, p, CTX).result, preset.id).not.toHaveProperty("error");
        const svg = genSVG(KEYCHAIN, p, arrangeGenerator(KEYCHAIN, p, CTX).lay!);
        expect(svg, preset.id).not.toMatch(/NaN|Infinity/);
      }
    });
    it("a photo frame has a window, a pocket open at the side and a clear cover in the second material", () => {
      const { out } = build({ build: "frame", width: 50, height: 62, text: { name: "MOM" }, ring: { side: "top" } });
      const ids = out.parts.map((q) => q.id);
      expect(ids).toEqual(["back", "pocket", "cover", "front"]);
      const front = out.parts.find((q) => q.id === "front")!, pocket = out.parts.find((q) => q.id === "pocket")!;
      expect(front.holes.length).toBe(2); // window and ring hole
      expect(holeIn(front as never, [25, 25])).toBe(true);
      // the pocket reaches the right edge, so the photo slides in
      expect(bboxOf([pocket.outer]).x1).toBeGreaterThan(40);
      expect(out.parts.find((q) => q.id === "cover")!.material).toBe("second");
      expect(out.materials?.second).toMatch(/Clear acrylic/);
      expect(out.stats.some((s) => s.label === "Photo")).toBe(true);
      expect(front.engrave!.length).toBeGreaterThan(0);
    });
    it("a spinner's disc is free: smaller than its pocket and larger than the rims' windows", () => {
      const { out } = build({ build: "spinner", shape: "circle", width: 48, height: 48, ring: { side: "top" } });
      const disc = out.parts.find((q) => q.id === "disc")!, mid = out.parts.find((q) => q.id === "ring")!, front = out.parts.find((q) => q.id === "front")!;
      const w = (c: [number, number][]) => { const b = bboxOf([c]); return b.x1 - b.x0; };
      const pocket = mid.holes.map(w).reduce((a, b) => Math.max(a, b)), win = front.holes.map(w).reduce((a, b) => Math.max(a, b));
      expect(pocket).toBeGreaterThan(w(disc.outer));
      expect(win).toBeLessThan(w(disc.outer) - 2);
    });
    it("a shaker is sealed: walls round a space and a clear front", () => {
      const { out } = build({ build: "shaker", shape: "heart", width: 56, height: 50, stack: { depth: 3 } });
      expect(out.parts.filter((q) => q.id.startsWith("spacer"))).toHaveLength(3);
      expect(out.parts.find((q) => q.id === "cover")!.material).toBe("second");
      expect(out.parts.find((q) => q.id === "cover")!.clear).toBe(true);
    });
    it("a swivel locket's cover swings on the ring hole", () => {
      const { out } = build({ build: "locket", shape: "heart", width: 50, height: 46 });
      const v = out.parts.find((q) => q.id === "cover")!.views3d![0];
      expect(v.frames!.length).toBeGreaterThan(2);
      const last = v.frames!.at(-1)!, first = v.frames![0];
      expect(last[0]).toBeCloseTo(1, 6); // closed: not turned
      expect(first[0]).toBeLessThan(0.5); // open: swung round
    });
    it("a two-tone outline's backing shows all round the front", () => {
      const { out } = build({ build: "outline", stack: { border: 3 } });
      const b = bboxOf([out.parts[0].outer]), f = bboxOf([out.parts[1].outer]);
      expect(f.x0 - b.x0).toBeCloseTo(3, 0); expect(b.y1 - f.y1).toBeCloseTo(3, 0);
      expect(out.parts[1].material).toBe("second");
    });
    it("explains what is too small instead of making a broken layer", () => {
      const { out } = build({ build: "frame", width: 25, height: 20, stack: { frame: 12 } });
      expect(out.error).toMatch(/frame|window|small|bigger/i);
    });
  });
});
