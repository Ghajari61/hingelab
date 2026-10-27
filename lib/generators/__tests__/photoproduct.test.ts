import { describe, it, expect } from "vitest";
import { PHOTO_PRODUCT } from "../photoproduct";
import { CTX } from "./ctx";
import { arrangeGenerator, genSVG } from "../output";
import { pointInContour, bboxOf } from "../geom";

describe("Photo to Product manufacturing geometry", () => {
  it("builds every example as finite, connected physical parts with millimetre SVGs", () => {
    for (const preset of PHOTO_PRODUCT.presets) {
      const p=PHOTO_PRODUCT.merge(preset.params),out=PHOTO_PRODUCT.build(p,CTX);
      expect(out.error,preset.id).toBeUndefined();expect(out.parts.length).toBeGreaterThan(0);
      for(const part of out.parts){
        expect(part.outer.flat().every(Number.isFinite),part.id).toBe(true);
        expect(part.holes.every(h=>h.every(pt=>pointInContour(pt,part.outer))),part.id).toBe(true);
      }
      const a=arrangeGenerator(PHOTO_PRODUCT,p,CTX);
      expect(a.result,preset.id).not.toHaveProperty("error");
      const svg=genSVG(PHOTO_PRODUCT,a.params,a.lay!);
      expect(svg).toMatch(/width="[\d.]+mm"/);expect(svg).not.toMatch(/NaN|Infinity|<text[ >]/);
    }
  });
  it("keeps connected lettering and snowflakes in one paw front with a contained hanging hole", () => {
    const p=PHOTO_PRODUCT.merge({recipe:"paw",paw:{connected:true},text:{name:"Lucy"}});
    const out=PHOTO_PRODUCT.build(p,CTX);
    expect(out.parts.map(p=>p.id)).toEqual(["paw-backing","paw-front"]);
    expect(out.parts[1].holes.length).toBeGreaterThan(5);
    expect(out.parts[0].t).toBe(p.paw.backThickness);
  });
  it("uses the actual neutral wall path, real lid clearance and separate cuttable wall strips", () => {
    const p=PHOTO_PRODUCT.merge({recipe:"heartbox"}),out=PHOTO_PRODUCT.build(p,CTX);
    const stats=Object.fromEntries(out.stats.map(s=>[s.label,s.value]));
    const walls=out.parts.filter(p=>p.id.startsWith("wall-"));
    expect(walls).toHaveLength(2);
    const total=walls.reduce((n,p)=>{const b=bboxOf([p.outer]);return n+b.x1-b.x0},0);
    expect(total).toBeCloseTo(Number(stats["Neutral perimeter"].replace(" mm","")),1);
    expect(walls.every(p=>p.cuts!.length>20&&p.views3d!.length>10)).toBe(true);
    const rim=out.parts.find(p=>p.id==="top-rim")!,lip=out.parts.find(p=>p.id==="lid-locator")!;
    expect(lip.outer.every(pt=>pointInContour(pt,rim.holes[0]))).toBe(true);
  });
  it("regenerates matching fabrication geometry when dimensions change", () => {
    for(const recipe of ["paw","heartbox"]){
      const a=PHOTO_PRODUCT.build(PHOTO_PRODUCT.merge({recipe,size:{width:120,depth:110}}),CTX);
      const b=PHOTO_PRODUCT.build(PHOTO_PRODUCT.merge({recipe,size:{width:180,depth:160}}),CTX);
      expect(a.error).toBeUndefined();expect(b.error).toBeUndefined();
      expect(bboxOf([b.parts[0].outer]).x1-bboxOf([b.parts[0].outer]).x0).toBeCloseTo(180,1);
      expect(JSON.stringify(a.parts)).not.toBe(JSON.stringify(b.parts));
    }
  });
});
