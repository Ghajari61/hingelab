import { expect, it } from 'vitest';
import type { Manifold, Mat4 } from 'manifold-3d';
import { manifold } from '@/lib/parametric/__tests__/helpers';
import { POPUP } from '../popup';
import { popupGeometry } from '../popup/build';
import { placePoint } from '../place';
import type { GenPart } from '../types';
import { CTX } from './ctx';
import { ringAssemblyOrder } from '../popup/assembly';
import { unionShapes, differenceShapes, shapeContours, offsetShapes } from '@/lib/letters/polygon';
import { cutPart, arrangeGenerator, genSVG } from '../output';
import { bboxOf } from '../geom';

// Independent 3D booleans: extrude the actual cut contours, not centre-line samples or rib bounds.
it('all preset rings can descend from above onto full-thickness ribs without collision', async () => {
  const w = await manifold();
  const placed = (part:GenPart,t:number):Manifold => {
    const c = new w.CrossSection([part.outer,...part.holes], 'EvenOdd');
    const s = c.extrude(t); c.delete();
    const o=placePoint(part.place!,0,0,0),x=placePoint(part.place!,1,0,0),y=placePoint(part.place!,0,1,0),z=placePoint(part.place!,0,0,1);
    const m:Mat4=[x[0]-o[0],x[1]-o[1],x[2]-o[2],0,y[0]-o[0],y[1]-o[1],y[2]-o[2],0,z[0]-o[0],z[1]-o[1],z[2]-o[2],0,...o,1];
    const r=s.transform(m);s.delete();return r;
  };
  const failures: string[]=[];
  const variants=[...POPUP.presets,
    ...[2,3,4,6].flatMap(T=>[0,.15,.4].map(fit=>({id:`stock-${T}-fit-${fit}`,params:{T,support:{fit},rings:{width:18,center:65,rim:18}}}))),
    ...[3,4].map(ribs=>({id:`radial-${ribs}`,params:{support:{ribs}}})),
    {id:'nested-ribs',params:{sets:{count:3,scale:.6}}},
    {id:'asymmetric-zero-fit',params:{support:{fit:0},outline:{shape:'heart'},rings:{width:16,center:50,rim:18}}},
    {id:'non-monotonic',params:{profile:{kind:'custom',curve:'0,0;0.25,0.7;0.5,0.2;1,1'},rings:{width:18,center:65,rim:18}}}];
  for(const preset of variants){
    const p=POPUP.merge(preset.params),g=POPUP.build(p,{});
    expect(g.error,preset.id).toBeUndefined();
    const supportParts=g.parts.filter(x=>/(^|-)rib-\d/.test(x.id));
    const ribs=supportParts.map(x=>({id:x.id,solid:placed(x,p.T)}));
    try{for(const [i,v] of g.parts[0].views3d!.entries()){
      if(!ribs.length)break;
      const c=new w.CrossSection([v.outer,...v.holes],'EvenOdd');
      const local=c.extrude(p.profile.depth+p.T+10);c.delete();
      const sweep=local.translate([v.place.m?.[3]??0,0,v.place.z+.003]);local.delete();
      try{for(const r of ribs){const hit=sweep.intersect(r.solid),volume=hit.volume();hit.delete();if(volume>.015)failures.push(`${preset.id} ring ${i+1}/${r.id}: ${volume.toFixed(3)} mm³`);}}
      finally{sweep.delete();}
      // A 0.01-mm downward probe must meet an actual shoulder, not float around a tab.
      const cs=new w.CrossSection([v.outer,...v.holes],'EvenOdd'),plate=cs.extrude(p.T);cs.delete();
      const probe=plate.translate([v.place.m?.[3]??0,0,v.place.z-.01]);plate.delete();
      const set=v.name?.match(/S(\d+)-/);
      try{for(const r of ribs.filter(r=>!set||r.id.startsWith(`set-${set[1]}-`))){const hit=probe.intersect(r.solid),volume=hit.volume();hit.delete();if(volume<.003)failures.push(`${preset.id} ring ${i+1} has no bearing shoulder on ${r.id}`);}}
      finally{probe.delete();}
    }
    // Complementary half-laps / hub slots: full stock volumes remain disjoint while
    // each new support is lowered. Include the fully seated state and fine early travel.
    for(const [i,part] of supportParts.entries()){
      const fixed=[...ribs.slice(0,i).map(r=>r.solid)];
      const hub=g.parts.find(v=>v.id===part.id.replace(/rib-\d.*$/,'rib-hub'));
      const hubSolid=hub?placed(hub,p.T):null;if(hubSolid)fixed.push(hubSolid);
      try{for(const dz of [0,.01,p.T/2,p.T,2*p.T,p.profile.depth+30]){
        const moving=ribs[i].solid.translate([0,0,dz]);
        for(const s of fixed){const hit=moving.intersect(s),volume=hit.volume();hit.delete();if(volume>.015)failures.push(`${preset.id} ${part.id} support travel ${dz}: ${volume.toFixed(3)} mm³`);}moving.delete();
      }}finally{hubSolid?.delete();}
    }
    }finally{ribs.forEach(r=>r.solid.delete());}
  }
  expect(failures).toEqual([]);
},120000);

it('releases the exact ring solids, with matching identifiers and height-ordered instructions',()=>{
  for(const raw of [{},{mode:'tower'},{profile:{kind:'custom',curve:'0,0;0.25,0.7;0.5,0.2;1,1'}},{sets:{count:3,scale:.6}}]){
    const p=POPUP.merge(raw),out=POPUP.build(p,CTX);expect(out.error).toBeUndefined();
    const b=out.parts[0],wood=unionShapes([b.outer,...b.holes],[],true);
    expect(wood.length).toBe(b.views3d!.length);
    const names=b.views3d!.map(v=>v.name!);expect(new Set(names).size).toBe(names.length);
    const instructions=out.assembly!.filter(s=>s.includes(': lower vertically'));
    expect(instructions.length).toBe(names.length);
    for(const v of b.views3d!)expect(instructions.some(s=>s.startsWith(v.name!.replace('Ring ','')+':')&&s.includes(v.place.z.toFixed(2)+' mm'))).toBe(true);
    const order=ringAssemblyOrder(popupGeometry(p).rings);expect(order.map(r=>r.height)).toEqual(order.map(r=>r.height).sort((a,b)=>a-b));
    expect(differenceShapes(b.engrave!,shapeContours(wood)).reduce((n,s)=>n+s.area,0)).toBeLessThan(.02);
  }
});

it('rejects negative physical clearance and retains optional holding lands',()=>{
  expect(POPUP.build(POPUP.merge({support:{fit:-.1}}),{}).error).toMatch(/clearance/);
  const b=POPUP.build(POPUP.merge({bridges:{keep:true}}),CTX).parts[0];
  expect(unionShapes([b.outer,...b.holes],[],true)).toHaveLength(1);
});

it('SVG compensation preserves all separate rings and the calibrated slot size',()=>{
  const p=POPUP.merge({support:{coupon:true},sets:{assemblyCard:true}}),out=POPUP.build(p,CTX);
  expect(out.error).toBeUndefined();
  for(const part of out.parts){
    const cut=cutPart(part,p.K),nominal=unionShapes([part.outer,...part.holes],[],true);
    // Erode tool-centre outlines by half a kerf to recover finished stock geometry.
    const finished=offsetShapes(unionShapes([...cut.outline,...cut.inner],[],true),-p.K/2);
    expect(finished.length,part.id).toBe(nominal.length);
    const delta=differenceShapes(shapeContours(finished),shapeContours(nominal)).concat(differenceShapes(shapeContours(nominal),shapeContours(finished))).reduce((n,s)=>n+s.area,0);
    expect(delta,part.id).toBeLessThan(1); // 0.001-mm clipping and flattened corner arcs.
  }
  const coupon=out.parts.find(v=>v.id==='fit-slot')!,cut=cutPart(coupon,p.K),b=bboxOf(cut.inner);
  expect(b.y1-b.y0+p.K).toBeCloseTo(p.T+p.support.fit,3);
  const a=arrangeGenerator(POPUP,p,CTX);expect(a.lay).toBeTruthy();
  const svg=genSVG(POPUP,p,a.lay!);expect(svg).toContain('mm');expect(svg).not.toMatch(/NaN|Infinity|<text\b|<image\b/);
});
