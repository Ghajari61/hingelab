import {describe,it,expect} from 'vitest';
import {assemblyFeedback,revisionPreservesAssembly} from '../assemblyFeedback';
import {buildGeneratedProduct} from '../generated';
import {DEFAULT_JOINERY} from '../joinery';
import {generatedTable} from './generated-fixture';
import {CTX} from '@/lib/generators/__tests__/ctx';

const build=(detached=false)=>{
 const m=generatedTable();m.parts[1].pose.x='15+(i%2)*(W-apron-30)';m.parts[1].pose.y='15+floor(i/2)*(D-30)';
 if(detached)m.parts[1].pose.z='-20';
 return buildGeneratedProduct(m,{width:200,depth:150,height:100},3,{},CTX,DEFAULT_JOINERY);
};
describe('measured assembly feedback for visual correction',()=>{
 it('reports actual world extents and normals, not origin-as-center guesses',()=>{
  const out=build(),feedback=assemblyFeedback(out);
  expect(feedback.actualSize).toEqual([200,150,100]);expect(feedback.groups).toBe(1);expect(feedback.pairedJoints).toBeGreaterThan(0);
  const leg=feedback.samples.find(p=>p.id==='legs-1')!;
  expect(leg.normal).toEqual([0,-1,0]);expect(leg.origin).toEqual([15,15,0]);
  expect(leg.bounds).toEqual([[15,55],[12,15],[0,100]]);
 });
 it('samples the first/middle/last repeated parts and bounds the payload',()=>{
  const m=generatedTable();m.parts=m.parts.slice(0,1);m.parts[0].count='128';m.parts[0].pose.dz='T*2';
  const out=buildGeneratedProduct(m,{width:100,depth:80,height:50},3,{},CTX);
  const feedback=assemblyFeedback(out);expect(feedback.samples.map(p=>p.id)).toEqual(['top-1','top-65','top-128']);expect(JSON.stringify(feedback).length).toBeLessThan(2500);
 });
 it('rejects a visual correction that disconnects a working assembly',()=>{
  const good=build(),bad=build(true);expect(good.joinery?.groups).toBe(1);expect(bad.joinery?.groups).toBeGreaterThan(1);
  expect(revisionPreservesAssembly(good,bad)).toBe(false);expect(revisionPreservesAssembly(bad,good)).toBe(true);
 });
});
