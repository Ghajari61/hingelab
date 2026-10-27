import {describe,it,expect} from 'vitest';
import fixture from './rib-wave.fixture.json';
import {GeneratedModelSchema,buildGeneratedProduct} from '../generated';
import {DEFAULT_JOINERY} from '../joinery';
import {engineerRibSupports,verifyRibInsertion} from '../ribSupports';
import {CTX} from '@/lib/generators/__tests__/ctx';
import {bboxOf} from '@/lib/generators/geom';
import {differenceShapes,signedArea} from '@/lib/letters/polygon';
import {PHOTO_PRODUCT} from '@/lib/generators/photoproduct';
import {arrangeGenerator,genSVG} from '@/lib/generators/output';
import {photoBuildPackage} from '../package';
import {unzipSync,strFromU8} from 'fflate';

const model=GeneratedModelSchema.parse(fixture.generated);
const raw=()=>buildGeneratedProduct(model,fixture.size,fixture.T,{},CTX);
describe('saved 36-rib sculpture assembly',()=>{
 it('keeps the real 36-rib model and connects every rib to two curved, sheet-sized support tracks',()=>{
  const original=raw();expect(original.parts).toHaveLength(36);
  const out=engineerRibSupports(original.parts,{...DEFAULT_JOINERY,supports:'rib-rails',railLength:500});
  expect(out.report.groups).toBe(1);expect(out.report.unconnected).toEqual([]);
  expect(out.parts.length).toBeGreaterThan(36);
  expect(out.parts).toHaveLength(40);expect(out.report.joints.filter(j=>j.kind==='cross-lap')).toHaveLength(76);
  expect(out.report.joints.filter(j=>j.kind==='glue')).toHaveLength(2);
  expect(out.report.supportPlan!.maxRailLength).toBeLessThanOrEqual(500);
  expect(out.report.supportPlan!.insertionClearance).toBeCloseTo(.15,2);
  for(const rib of original.parts){expect(out.report.joints.filter(j=>j.a===rib.id||j.b===rib.id).length).toBeGreaterThanOrEqual(2);expect(out.parts.find(p=>p.id===rib.id)?.place).toEqual(rib.place);}
  // No photo silhouette is expanded/repositioned: only bottom-open local notches are subtracted.
  for(const rib of original.parts){const next=out.parts.find(p=>p.id===rib.id)!;expect(next.holes).toHaveLength(rib.holes.length);expect(differenceShapes([next.outer],[rib.outer]).reduce((s,p)=>s+p.area,0)).toBeLessThan(.01);expect(Math.abs(signedArea(next.outer))/Math.abs(signedArea(rib.outer))).toBeGreaterThan(.98);}
 });
 it.each([24,48,64])('rebuilds an editable %s-rib assembly without trapped insertion or solid overlap',count=>{
  const out=buildGeneratedProduct(model,fixture.size,6,{rib_count:count},CTX,{...DEFAULT_JOINERY,supports:'rib-rails'});
  expect(out.error).toBeUndefined();expect(out.joinery?.groups).toBe(1);expect(out.joinery?.supportPlan?.ribCount).toBe(count);
 });
 it.each([3,6,9])('uses %s mm stock on both mating slots and rebuilds supports',t=>{
  const out=buildGeneratedProduct(model,fixture.size,t,t>6?{ring_thick:44}:{},CTX,{...DEFAULT_JOINERY,supports:'rib-rails',clearance:.3});
  expect(out.error).toBeUndefined();expect(out.joinery?.groups).toBe(1);expect(out.joinery?.supportPlan?.insertionClearance).toBeCloseTo(.3,2);
  expect(out.joinery?.joints.filter(j=>j.kind==='cross-lap').every(j=>j.slotWidth===t+.3&&j.mateSlotWidth===t+.3)).toBe(true);
 });
 it('detects an uncut rail interfering with vertical insertion rather than merely counting graph edges',()=>{
  const out=engineerRibSupports(raw().parts,{...DEFAULT_JOINERY,supports:'rib-rails'});
  const rails=out.parts.slice(36).map(p=>({...p,outer:[...p.outer]})),rail=rails[0],b=bboxOf([rail.outer]);
  rail.outer=[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]];
  expect(()=>verifyRibInsertion(out.parts.slice(0,36),rails,.15)).toThrow(/interference/);
 });
 it('rejects invalid spacing, unsupported orientation and excessive slots without exporting stale parts',()=>{
  const p={...DEFAULT_JOINERY,supports:'rib-rails' as const};
  expect(buildGeneratedProduct(model,{...fixture.size,width:300},6,{},CTX,p).error).toMatch(/too close/);
  const tilted=structuredClone(model);tilted.parts[0].pose.rz='80';expect(buildGeneratedProduct(tilted,fixture.size,6,{},CTX,p).error).toMatch(/normal to/);
  expect(buildGeneratedProduct(model,fixture.size,6,{},CTX,{...p,minWeb:3}).error).toMatch(/too close|solid material/);
 });
 it('exports all numbered pieces on 600×400 sheets with one kerf pass and the matching assembly plan',()=>{
  const p=PHOTO_PRODUCT.merge({generated:model,size:fixture.size,T:6,K:.15,joinery:{...DEFAULT_JOINERY,supports:'rib-rails',railLength:500},sheet:{labels:true}});
  const a=arrangeGenerator(PHOTO_PRODUCT,p,CTX);expect(a.result).not.toHaveProperty('error');expect(a.lay).toBeTruthy();
  if('error' in a.result)throw Error(a.result.error);
  expect(a.result.parts).toHaveLength(40);
  for(const pt of a.result.parts){const b=pt.bbox;expect(Math.min(b.x1-b.x0,b.y1-b.y0)).toBeLessThan(396);expect(Math.max(b.x1-b.x0,b.y1-b.y0)).toBeLessThan(596);}
  const svg=genSVG(PHOTO_PRODUCT,p,a.lay!),files=unzipSync(photoBuildPackage(p,a,svg,JSON.stringify({app:'HingeLab',version:2,product:'photoproduct',params:p})));
  expect(Object.keys(files).filter(n=>n.startsWith('parts/'))).toHaveLength(40);
  expect(strFromU8(files['SUPPORT-ASSEMBLY.txt'])).toContain('vertically onto BOTH tracks');
  expect(JSON.parse(strFromU8(files['connections.json'])).supportPlan.ribCount).toBe(36);
  expect(svg).not.toMatch(/NaN|Infinity|<text[ >]/);expect(svg).toContain('mm');
  expect(a.lay!.items.every(it=>it.pt.score.length>0)).toBe(true);
 });
});
