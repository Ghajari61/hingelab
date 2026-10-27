import {it,expect} from 'vitest';
import {POPUP} from '../popup';
import {mergePopup} from '../popup/params';
import {popupGeometry} from '../popup/build';
import {placePoint,unplacePoint} from '../place';
import {pointInContour,bboxOf,transform,circle} from '../geom';
import {spiralSupports} from '../popup/spiralSupports';
import {radialHeight} from '@/lib/radialProfile';
import {unionShapes,intersectShapes,totalArea} from '@/lib/letters/polygon';
import {arrangeGenerator,flatOf,genSVG} from '../output';
import {flatScene} from '@/lib/three/flat';
import {assertFlatMatchesSVG} from '@/lib/three/__tests__/flatExportAssertions';
import {CTX} from './ctx';
import type {Contour,Pt} from '../types';
const inWood=(outer:Contour,holes:Contour[],xy:Pt)=>pointInContour(xy,outer)&&holes.filter(h=>pointInContour(xy,h)).length%2===0;

it('key insertion checks intermediate profile peaks, not only sweep endpoints',()=>{
 const p=mergePopup({pattern:{kind:'spiral'}}),surface={samples:[[22.5,0],[23,10],[24,0],[98,0]] as [number,number][]};
 const a=spiralSupports(p,{id:'blank',name:'Blank',outer:circle(0,0,110),holes:[]},surface,110,0,CTX);
 const margin=Math.max(.6,.4*p.T,p.sheet?.minFeature??0);
 for(const j of a.joints){
  const min=j.u-p.T-margin,max=Math.hypot(j.u+p.T+margin,5*p.T+p.support.fit+margin);
  for(const [r,z] of surface.samples)if(r>min&&r<max)expect(z,'key sweep must remain on one flat land').toBeCloseTo(j.height,3);
 }
});

it('a spiral has a base, three contour supports and retained locating joints',()=>{
 const p=mergePopup({pattern:{kind:'spiral'}}),out=POPUP.build(p,{});
 expect(out.error).toBeUndefined();
 expect(out.parts.some(p=>p.id==='spiral-base')).toBe(true);
 expect(out.parts.filter(p=>p.id.startsWith('spiral-rib-'))).toHaveLength(3);
 expect(out.parts.filter(p=>p.id.startsWith('spiral-key-')).length).toBeGreaterThanOrEqual(3);
 expect(out.parts[0].views3d).toHaveLength(1);
});

for(const T of [2,3,4,6])for(const count of [3,4])it(`${T} mm / ${count} ribs: full-thickness tabs, key eyes and base mortises mate`,()=>{
 const p=mergePopup({T,pattern:{kind:'spiral'},outline:{width:80*T,height:80*T},rings:{center:15*T,rim:5*T,width:4*T},spiral:{count,clearance:4*T},support:{fit:.2}});
 const g=popupGeometry(p,CTX),a=g.cradle!,blank=g.parts[0],base=g.parts.find(v=>v.id==='spiral-base')!;
 expect(g.cradle).not.toBeNull();
 for(const part of g.parts)expect(unionShapes([part.outer,...part.holes],[],true),part.id).toHaveLength(1);
 for(const j of a.joints){
  const rib=g.parts.find(v=>v.id===`spiral-rib-${j.rib+1}`)!,key=g.parts.find(v=>v.id===j.keyId)!;
  const b=bboxOf([transform(j.slot,{rot:-j.angle})]);
  expect(b.x1-b.x0).toBeCloseTo(3*T+p.support.fit,5);expect(b.y1-b.y0).toBeCloseTo(T+p.support.fit,5);
  for(const u of [j.u-1.5*T+.001,j.u,j.u+1.5*T-.001])for(const h of [.001,T/2,T-.001]){
   const q=placePoint(rib.place!,u,-j.height-T/2,h);
   expect(pointInContour([q[0],q[1]],j.slot)).toBe(true);
   expect(inWood(blank.outer,blank.holes,[q[0],q[1]])).toBe(false);
  }
  for(const u of [-T/2+.001,0,T/2-.001])for(const v of [-T/2+.001,0,T/2-.001])for(const h of [.001,T-.001]){
   const q=unplacePoint(rib.place!,placePoint(key.place!,u,v,h));
   expect(q[2]).toBeGreaterThanOrEqual(-.001);expect(q[2]).toBeLessThanOrEqual(T+.001);
   expect(pointInContour([q[0],q[1]],j.eye),'key fits within eye across the whole rib thickness').toBe(true);
  }
  const kb=bboxOf([key.outer]),surface=blank.views3d![0].radialSurface!;
  for(let u=kb.x0+.01;u<kb.x1;u+=T/2)for(let v=kb.y0+.01;v<kb.y1;v+=T/2){
   if(!inWood(key.outer,key.holes,[u,v]))continue;
   for(let shift=-3.5*T;shift<=.001;shift+=T/2)for(const h of [.005,T-.005]){
    const q=placePoint(key.place!,u,v+shift,h);
    if(inWood(blank.outer,blank.holes,[q[0],q[1]])){
     const z=radialHeight(surface,Math.hypot(q[0],q[1]));expect(q[2]>=z+T-.001||q[2]<=z+.001,'key insertion clears the formed strip').toBe(true);
    }
    for(const other of g.parts.filter(v=>v.id.startsWith('spiral-rib-'))){
     const at=unplacePoint(other.place!,q);
     if(at[2]>.001&&at[2]<T-.001)expect(inWood(other.outer,other.holes,[at[0],at[1]]),'key insertion clears all ribs').toBe(false);
    }
   }
  }
 }
 for(const j of a.baseJoints){
  const rib=g.parts.find(v=>v.id===`spiral-rib-${j.rib+1}`)!;
  for(const u of [j.u-1.5*T+.001,j.u+1.5*T-.001])for(const h of [.001,T-.001]){
   const q=placePoint(rib.place!,u,p.spiral.clearance+T/2,h);
   expect(q[2]).toBeCloseTo(base.place!.z+T/2);
   expect(pointInContour([q[0],q[1]],j.slot)).toBe(true);
  }
 }
});

for(const kind of ['spiral','multi'] as const)for(const profile of ['dome','bell','reverse','pagoda','vase','custom'] as const)it(`${kind}/${profile}: supports never penetrate the continuous strip`,()=>{
 const p=mergePopup({pattern:{kind,arms:3},profile:{kind:profile,depth:75},spiral:{count:4}}),g=popupGeometry(p,CTX),b=g.parts[0],surface=b.views3d![0].radialSurface!;
 const ribs=g.parts.filter(v=>v.id.startsWith('spiral-rib-'));
 for(const rib of ribs){
  const bounds=bboxOf([rib.outer]);
  for(let u=bounds.x0+.01;u<bounds.x1;u+=.45)for(const h of [.001,p.T*.25,p.T*.5,p.T*.75,p.T-.001]){
   const xy=placePoint(rib.place!,u,0,h),z=radialHeight(surface,Math.hypot(xy[0],xy[1]));
   if(!inWood(b.outer,b.holes,[xy[0],xy[1]]))continue;
   for(const lift of [0,p.T,3*p.T])for(const dz of [.005,p.T*.5,p.T-.005])expect(inWood(rib.outer,rib.holes,[u,-z-lift-dz]),`${rib.id} at ${u}/${h}/${z}, insertion lift ${lift}`).toBe(false);
  }
 }
 // Distinct radial supports do not overlap each other in their plan footprints.
 const footprints=ribs.map(r=>{const bounds=bboxOf([r.outer]);return [[bounds.x0,0],[bounds.x1,0],[bounds.x1,p.T],[bounds.x0,p.T]].map(([u,h])=>{const q=placePoint(r.place!,u,0,h);return [q[0],q[1]] as Pt;});});
 for(let i=0;i<footprints.length;i++)for(let j=i+1;j<footprints.length;j++)expect(totalArea(intersectShapes([footprints[i]],[footprints[j]]))).toBeLessThan(.001);
});

it('supported Spiral SVG and Lay Flat have identical solids, openings and positions',()=>{
 const p=mergePopup({pattern:{kind:'spiral'},support:{coupon:true},sheet:{labels:true}}),a=arrangeGenerator(POPUP,p,CTX);
 expect(a.lay).toBeTruthy();if('error' in a.result)throw Error(a.result.error);
 const scene=flatScene(flatOf(a.lay!),p.T);
 try{assertFlatMatchesSVG(scene.group,genSVG(POPUP,a.params,a.lay!));}finally{scene.dispose();}
 expect(a.result.out.parts.some(v=>v.id==='fit-slot')).toBe(true);
 expect(a.result.out.parts.filter(v=>/^spiral-/.test(v.id)).every(v=>v.engrave?.length)).toBe(true);
});
it('unsafe rim, base and joint dimensions fail with actionable errors',()=>{
 for(const [raw,match] of [[{rings:{rim:4}},/rim/i],[{spiral:{clearance:2}},/base clearance/i],[{support:{fit:-.1}},/clearance/i],[{spiral:{count:8}},/3 or 4/i]] as const){
  const out=POPUP.build(mergePopup({pattern:{kind:'spiral'},...raw}),{});expect(out.error).toMatch(match);expect(out.parts).toHaveLength(0);
 }
});
