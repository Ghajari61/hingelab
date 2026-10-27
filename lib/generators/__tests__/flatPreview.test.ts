import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { unionShapes, totalArea, pointInShape } from '@/lib/letters/polygon';
import { flatScene } from '@/lib/three/flat';
import { arrangeGenerator, cutPart, flatOf, mirrorCutPart, turnCutPart, type CutPart } from '../output';
import { rect, circle } from '../geom';
import type { Layout } from '@/lib/hinge';
import { POPUP } from '../popup';
import { modeDefaults } from '../popup/params';
import { CTX } from './ctx';

function layout(pt: CutPart): Layout<CutPart> {
 return {width:400,height:300,items:[{pt,i:0,ox:150,oy:140,w:240,h:240}]};
}
function checkSurface(lay: Layout<CutPart>, thickness: number) {
 const parts=flatOf(lay);
 const expected=lay.items.flatMap(({pt,ox,oy})=>unionShapes([...pt.outline,...pt.inner],[],true).map(s=>({
  ...s,outer:s.outer.map(([x,y])=>[x+ox,y+oy] as [number,number]),holes:s.holes.map(c=>c.map(([x,y])=>[x+ox,y+oy] as [number,number]))
 })));
 expect(parts.length,'every disconnected wooden region has its own outer contour').toBe(expected.length);
 const scene=flatScene(parts,thickness);let area=0;
 try {
  scene.group.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   const pos=o.geometry.attributes.position, normal=o.geometry.attributes.normal;
   for(let i=0;i<pos.count;i+=3){
    if(normal.getZ(i)<.99)continue;
    const ax=pos.getX(i),ay=-pos.getY(i),bx=pos.getX(i+1),by=-pos.getY(i+1),cx=pos.getX(i+2),cy=-pos.getY(i+2);
    const triangle=Math.abs((bx-ax)*(cy-ay)-(cx-ax)*(by-ay))/2;
    area+=triangle;
    if(triangle>.001)expect(expected.some(s=>pointInShape([(ax+bx+cx)/3,(ay+by+cy)/3],s)),'triangle spanning an empty ring gap').toBe(true);
   }
  });
  expect(Math.abs(area-totalArea(expected)),'triangulated wood must match cut-file regions').toBeLessThan(.1);
 } finally {scene.dispose();}
}

describe('Lay flat preserves cut topology',()=>{
 it('the reported tiered blank with ribs and optional holding lands',()=>{
  for(const keep of [false,true]){
   const p=modeDefaults(POPUP.defaults(),'tiered');p.bridges.keep=keep;
   const a=arrangeGenerator(POPUP,p,CTX);
   expect(a.lay).not.toBeNull();expect('error' in a.result).toBe(false);
   checkSurface(a.lay!,p.T);
  }
 });
 for(const K of [0,.15])it(`nested rings and detached islands, kerf ${K}`,()=>{
  const pt=cutPart({id:'rings',name:'Nested rings',outer:circle(0,0,50),holes:[circle(0,0,40),circle(0,0,30).reverse(),circle(0,0,20),circle(0,0,10).reverse()]},K);
  checkSurface(layout(pt),3);
 });
 it('multiple outlines remain solids after rotation, reflection and placement',()=>{
  const pt=cutPart({id:'two',name:'Two islands',outer:rect(0,0,40,30),holes:[]},.15);
  pt.outline.push(rect(50,10,20,20));
  checkSurface(layout(mirrorCutPart(turnCutPart(pt,90))),3);
 });
 for(const preset of POPUP.presets)it(preset.id,()=>{
  const p=POPUP.merge(preset.params),a=arrangeGenerator(POPUP,p,CTX);
  expect(a.lay).not.toBeNull();expect('error' in a.result).toBe(false);
  checkSurface(a.lay!,p.T);
 },30000);
});
