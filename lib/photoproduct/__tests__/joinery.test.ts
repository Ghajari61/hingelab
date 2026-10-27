import {describe,it,expect} from 'vitest';
import {rect,bboxOf} from '@/lib/generators/geom';
import type {GenPart} from '@/lib/generators/types';
import {engineerJoinery,DEFAULT_JOINERY} from '../joinery';
import {pointInShape} from '@/lib/letters/polygon';

const plate=(id:string,w:number,h:number,t:number,m:number[]):GenPart=>({id,name:id,outer:rect(0,0,w,h),holes:[],t,place:{x:m[3],y:m[7],z:m[11],m}});
const base=(t=3)=>plate('base',120,80,t,[1,0,0,0,0,1,0,0,0,0,1,0]);
const wall=(t=3)=>plate('wall',80,50,t,[1,0,0,20,0,0,-1,40,0,1,0,t]);
describe('automatic paired photo-product joinery',()=>{
 it.each([3,6,9])('creates matching tabs and slots from actual %s mm stock and keeps the source immutable',t=>{
  const source=[base(t),wall(t)],out=engineerJoinery(source,DEFAULT_JOINERY);
  const joints=out.report.joints.filter(j=>j.kind==='tab-slot');
  expect(joints.length).toBeGreaterThanOrEqual(1);expect(out.report.unconnected).toEqual([]);
  expect(source[0].holes).toHaveLength(0);expect(bboxOf([source[1].outer]).y0).toBe(0);
  for(const j of joints){expect(j.slotWidth).toBeCloseTo(t+DEFAULT_JOINERY.clearance,3);expect(j.depth).toBe(t);}
  expect(out.parts[0].holes).toHaveLength(joints.length);
  expect(bboxOf([out.parts[1].outer]).y0).toBeCloseTo(-t,3);
  const slot=bboxOf([out.parts[0].holes[0]]);expect(slot.y1-slot.y0).toBeCloseTo(t+DEFAULT_JOINERY.clearance,3);
 });
 it('uses the mating stock thickness independently, and clearance is total nominal gap rather than kerf',()=>{
  const out=engineerJoinery([base(6),wall(6)],{...DEFAULT_JOINERY,clearance:.3});
  expect(out.report.joints[0].slotWidth).toBeCloseTo(6.3);expect(out.report.joints[0].depth).toBe(6);
  const custom=wall(6);custom.t=4;const mixed=engineerJoinery([base(6),custom],DEFAULT_JOINERY);
  expect(mixed.report.joints[0].slotWidth).toBeCloseTo(4.15);expect(mixed.report.joints[0].depth).toBe(6);
 });
 it('cuts complementary open half-laps at the same world-space midpoint',()=>{
  const a=plate('a',100,60,4,[1,0,0,0,0,0,-1,2,0,1,0,0]);
  const b=plate('b',80,60,4,[0,0,1,48,1,0,0,-40,0,1,0,0]);
  const out=engineerJoinery([a,b],DEFAULT_JOINERY);
  expect(out.report.joints.filter(j=>j.kind==='cross-lap')).toHaveLength(1);
  expect(out.parts.every(p=>p.outer.length>4)).toBe(true);expect(out.report.unconnected).toEqual([]);
  expect(out.report.joints[0].at[2]).toBeCloseTo(30);
  for(const z of [10,29,30,31,50]){
   const inside=(p:GenPart,x:number)=>pointInShape([x,z],{outer:p.outer,holes:p.holes,area:0,bbox:bboxOf([p.outer]),group:0});
   expect(inside(out.parts[0],50)&&inside(out.parts[1],40)).toBe(false);
  }
 });
 it('keeps joint pairs aligned after a shared arbitrary assembly rotation',()=>{
  const angle=.43,c=Math.cos(angle),s=Math.sin(angle),parts=[base(),wall()].map(p=>{const m=p.place!.m!,n=[...m];for(let k=0;k<4;k++){n[k]=c*m[k]-s*m[4+k];n[4+k]=s*m[k]+c*m[4+k];}return {...p,place:{...p.place!,m:n}};});
  const out=engineerJoinery(parts,DEFAULT_JOINERY);expect(out.report.joints.length).toBeGreaterThan(0);expect(out.report.groups).toBe(1);
  expect(out.parts[0].holes.length).toBe(out.report.joints.length);
 });
 it('rebuilds every pair when a repeated row of ribs changes thickness',()=>{
  for(const t of [3,6]){const ribs=Array.from({length:8},(_,i)=>{const p=wall(t);p.id='rib-'+i;p.place!.m![7]=20+i*(t+6);return p;});
   const foundation=base(t);foundation.outer=rect(0,0,120,150);
   const out=engineerJoinery([foundation,...ribs],{...DEFAULT_JOINERY,minWeb:.5});
   expect(out.report.groups).toBe(1);expect(out.report.unconnected).toHaveLength(0);expect(out.report.joints.every(j=>Math.abs(j.slotWidth-t-.15)<.001)).toBe(true);
  }
 });
 it('refuses detached parts, existing holes, thin walls and unsupported angles instead of fabricating a successful fit',()=>{
  const detached=wall();detached.place!.m![11]+=10;
  expect(engineerJoinery([base(),detached],DEFAULT_JOINERY).report.unconnected).toHaveLength(2);
  const pierced=base();pierced.holes=[rect(10,30,100,20).reverse()];
  expect(engineerJoinery([pierced,wall()],DEFAULT_JOINERY).report.joints).toHaveLength(0);
  const scored=base();scored.score=[[[0,38],[120,38]]];
  expect(engineerJoinery([scored,wall()],DEFAULT_JOINERY).report.joints).toHaveLength(0);
  const thin=plate('thin',20,20,3,[1,0,0,0,0,1,0,0,0,0,1,0]);
  expect(engineerJoinery([thin,wall()],DEFAULT_JOINERY).report.joints).toHaveLength(0);
 });
 it('identifies glued face contacts without pretending they are interlocking joints and supports disabling auto joinery',()=>{
  const upper=base();upper.id='upper';upper.place!.m![11]=3;
  const out=engineerJoinery([base(),upper],DEFAULT_JOINERY);
  expect(out.report.joints[0].kind).toBe('glue');expect(out.parts[0].holes).toHaveLength(0);
  expect(engineerJoinery([base(),wall()],{...DEFAULT_JOINERY,mode:'off'}).parts).toEqual([base(),wall()]);
 });
});
