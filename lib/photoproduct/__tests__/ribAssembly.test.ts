import {describe,it,expect} from 'vitest';
import fixture from './rib-wave.fixture.json';
import {GeneratedModelSchema,buildGeneratedProduct} from '../generated';
import {DEFAULT_JOINERY} from '../joinery';
import {CTX} from '@/lib/generators/__tests__/ctx';
import {ribAssemblyPlan,ribAssemblyFrame} from '../ribAssembly';

const out=()=>buildGeneratedProduct(GeneratedModelSchema.parse(fixture.generated),fixture.size,6,{},CTX,{...DEFAULT_JOINERY,supports:'rib-rails'});
describe('rib assembly walkthrough',()=>{
 it('seats each of the actual 40 pieces once, with splice ribs before a manual curing checkpoint',()=>{
  const model=out(),before=JSON.stringify(model),plan=ribAssemblyPlan(model)!;
  const placed=plan.steps.filter(s=>s.partId).map(s=>s.partId!);
  expect(placed).toHaveLength(40);expect(new Set(placed).size).toBe(40);
  expect(new Set(placed)).toEqual(new Set(model.parts.map(p=>p.id)));
  expect(placed.slice(0,4).every(id=>id.startsWith('support-'))).toBe(true);
  const cure=plan.steps.findIndex(s=>s.kind==='cure');expect(cure).toBeGreaterThan(4);
  const spliceRibs=model.parts.slice(0,36).filter(p=>model.joinery!.joints.filter(j=>j.a===p.id).length>2);
  expect(spliceRibs).toHaveLength(2);
  for(const rib of spliceRibs)expect(plan.steps.findIndex(s=>s.partId===rib.id)).toBeLessThan(cure);
  expect(plan.steps[cure].pause).toBe(true);
  expect(plan.steps.flatMap(s=>s.glue)).toHaveLength(78);
  expect(JSON.stringify(model)).toBe(before);
 });
 it('moves ribs only downward, keeps prior parts seated, and restores exact assembly positions',()=>{
  const model=out(),plan=ribAssemblyPlan(model)!,index=plan.steps.findIndex(s=>s.partId===model.parts[0].id);
  const a=ribAssemblyFrame(plan,index,0),b=ribAssemblyFrame(plan,index,.6),c=ribAssemblyFrame(plan,index,1);
  expect(a.find(p=>p.id===model.parts[0].id)!.lift).toBeGreaterThan(b.find(p=>p.id===model.parts[0].id)!.lift);
  expect(c.find(p=>p.id===model.parts[0].id)!.lift).toBe(0);
  expect(b.filter(p=>p.seated).every(p=>p.lift===0)).toBe(true);
  const final=ribAssemblyFrame(plan,plan.steps.length-1,1);
  expect(final.filter(p=>p.seated)).toHaveLength(40);expect(final.every(p=>p.lift===0)).toBe(true);
  expect(final.map(p=>p.number)).toEqual(Array.from({length:40},(_,i)=>i+1));
 });
 it('derives the adhesive faces from the matching rail and half-lap geometry',()=>{
  const model=out(),plan=ribAssemblyPlan(model)!;
  expect(plan.patches.filter(p=>p.kind==='splice').length).toBeGreaterThanOrEqual(2);
  expect(plan.patches.filter(p=>p.kind==='slot')).toHaveLength(76*3);
  expect(new Set(plan.patches.map(p=>p.jointId)).size).toBe(78);
  for(const patch of plan.patches){expect(patch.outer.length).toBeGreaterThanOrEqual(4);expect(model.parts.some(p=>p.id===patch.hostId)).toBe(true);expect(patch.outer.flat().every(Number.isFinite)).toBe(true);}
 });
 it('offers no unsupported guide when the supports or complete connection report are absent',()=>{
  expect(ribAssemblyPlan({...out(),joinery:undefined})).toBeNull();
  const model=out();model.joinery!.groups=2;expect(ribAssemblyPlan(model)).toBeNull();
 });
});
