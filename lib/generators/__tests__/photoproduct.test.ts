import { describe, it, expect } from "vitest";
import {PHOTO_PRESETS} from "../photoproduct/presets";
import { PHOTO_PRODUCT } from "../photoproduct";
import { CTX } from "./ctx";
import { arrangeGenerator, genSVG } from "../output";
import { pointInContour, bboxOf } from "../geom";

describe("Photo to Product manufacturing geometry", () => {
  it("builds every example as finite, connected physical parts with millimetre SVGs", () => {
    for (const preset of PHOTO_PRESETS) {
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

import { distToContour } from "../geom";
import { measurementProblem, validatePhoto } from "@/lib/photoproduct/contracts";
const gap=(a:number[][],b:number[][])=>Math.min(...a.map(p=>distToContour(p as [number,number],b as [number,number][])),...b.map(p=>distToContour(p as [number,number],a as [number,number][])));
describe("Photo to Product: engineering review", () => {
  it("keeps at least the frame width between neighbouring paw windows at every size", () => {
    for(const [w,d] of [[100,105],[150,150],[300,300],[144,103],[100,200]])for(const frame of [2,4])for(const wings of [false,true]){
      const p=PHOTO_PRODUCT.merge({recipe:"paw",size:{width:w,depth:d},paw:{frame,wings,detail:"none",connected:false,backing:true},text:{name:""}});
      const out=PHOTO_PRODUCT.build(p,CTX);if(out.error)continue;
      const front=out.parts.find(x=>x.id==="paw-front")!;
      const windows=front.holes.filter(h=>{const b=bboxOf([h]);return b.x1-b.x0>p.paw.hole+1;});
      expect(windows.length,`${w}x${d} frame ${frame}`).toBe(5);
      for(let i=0;i<windows.length;i++)for(let j=i+1;j<windows.length;j++)expect(gap(windows[i],windows[j]),`${w}x${d} frame ${frame} wings ${wings}`).toBeGreaterThan(frame-.05);
    }
  });
  it("centres the honeycomb symmetrically and fits it on the smallest supported heart box", () => {
    const p=PHOTO_PRODUCT.merge({recipe:"heartbox"}),lid=PHOTO_PRODUCT.build(p,CTX).parts.find(x=>x.id==="lid")!;
    const xs=lid.holes.map(h=>{const b=bboxOf([h]);return (b.x0+b.x1)/2;}).sort((a,b)=>a-b),axis=p.size.width/2;
    // every cell has a mirror image across the heart's axis
    for(const x of xs)expect(xs.some(y=>Math.abs(axis-x-(y-axis))<.05)).toBe(true);
    const small=PHOTO_PRODUCT.build(PHOTO_PRODUCT.merge({recipe:"heartbox",size:{width:95,depth:85,height:14}}),CTX);
    expect(small.error).toBeUndefined();
    expect(small.parts.find(x=>x.id==="lid")!.holes.length).toBeGreaterThan(2);
  });
  it("names the known measurement that is out of range instead of a generic error", () => {
    expect(measurementProblem({width:5,depth:0,height:0,thickness:0})).toMatch(/width must be between 10 and 3000/);
    expect(measurementProblem({width:0,depth:0,height:0,thickness:40})).toMatch(/thickness/);
    expect(measurementProblem({width:120,depth:100,height:30,thickness:3})).toBeNull();
    expect(PHOTO_PRODUCT.merge({measurements:{width:9000,height:9000,thickness:90}}).measurements).toMatchObject({width:3000,height:3000,thickness:30});
  });
  it("checks a reference photo once, not on every edit", () => {
    // a 64 x 64 white JPEG
    const data="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCABAAEABAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AJ//2Q==";
    const photo={id:"p",name:"p",data,width:64,height:64,digest:"0".repeat(64)};
    expect(validatePhoto(photo)).toBeNull();
    const t=performance.now();for(let i=0;i<2000;i++)validatePhoto(photo);
    expect(performance.now()-t).toBeLessThan(50);
    expect(validatePhoto({...photo,width:65})).not.toBeNull();
  });
});
