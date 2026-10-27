import {expect,it} from 'vitest';
import {POPUP} from '../popup';
import {mergePopup} from '../popup/params';
import {unionShapes} from '@/lib/letters/polygon';
import {patternDefaults,modeDefaults,type PopupParams} from '../popup/params';
import {generatorScene} from '../scene3d';
import {flatScene} from '@/lib/three/flat';
import {arrangeGenerator,flatOf,genSVG} from '../output';
import {assertFlatMatchesSVG} from '@/lib/three/__tests__/flatExportAssertions';
import * as THREE from 'three';
import {CTX} from './ctx';

it('opens the saved Ripple spiral without inheriting separate-ring joints',()=>{
 const p=mergePopup({outline:{width:220,height:220},pattern:{kind:'spiral',edge:'wave',amplitude:1,frequency:12},profile:{depth:26}});
 const out=POPUP.build(p,{});
 expect(out.error).toBeUndefined();
 expect(out.parts.map(v=>v.id)).toEqual(['blank']);
 const b=out.parts[0];
 expect(unionShapes([b.outer,...b.holes],[],true)).toHaveLength(1);
 expect(b.views3d).toHaveLength(1);
 expect(b.views3d![0].holes).toEqual(b.holes);
 expect(POPUP.check(p,out).some(i=>i.code==='popup-strain'||i.code==='popup-released-rings')).toBe(false);
 expect(out.assembly!.join(' ')).not.toMatch(/ring-to-rib|lower vertically onto/);
});

for(const [kind,arms] of [['spiral',2],['multi',2],['multi',3],['multi',4]] as const){
 for(const shape of ['circle','ellipse','heart','star'] as const)it(`${kind}/${arms}/${shape}: connected sheet, 3D and exact flat SVG`,()=>{
  const p=mergePopup({pattern:{kind,arms},outline:{shape},rings:{center:25,width:12}}),a=arrangeGenerator(POPUP,p,{});
  expect(a.lay).toBeTruthy();
  if('error' in a.result)throw Error(a.result.error);
  const b=a.result.out.parts[0];
  expect(unionShapes([b.outer,...b.holes],[],true)).toHaveLength(1);
  expect(b.holes).toHaveLength(kind==='spiral'?1:arms);
  expect(b.views3d).toHaveLength(1);
  const scene=generatorScene(a.result.out,p.T),flat=flatScene(flatOf(a.lay!),p.T);
  try {
   assertFlatMatchesSVG(flat.group,genSVG(POPUP,a.params,a.lay!));
   const zs:number[]=[];let meshes=0;
   scene.group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;meshes++;const pos=o.geometry.getAttribute('position');for(let i=0;i<pos.count;i++)zs.push(pos.getZ(i));});
   expect(meshes).toBe(1);expect(Math.max(...zs)-Math.min(...zs)).toBeCloseTo(p.profile.depth+p.T,3);
   const before=new THREE.Box3().setFromObject(scene.group);scene.explode?.(1);
   expect(new THREE.Box3().setFromObject(scene.group).equals(before)).toBe(true);
  }finally{scene.dispose();flat.dispose();}
 });
}
it('pattern field changes and mode changes choose compatible construction without mutating undo state',()=>{
 const original=mergePopup({extras:{feet:true,post:true,loop:true},support:{coupon:true},sets:{assemblyCard:true}});
 const snapshot=JSON.stringify(original),field=POPUP.sections.flatMap(s=>s.fields).find(f=>f.key==='pattern.kind')!;
 if(field.kind!=='choice'||!field.apply)throw Error('Cut pattern needs an atomic switch');
 const spiral=field.apply(original,'spiral');
 expect(JSON.stringify(original)).toBe(snapshot);expect(spiral.support.kind).toBe('form');
 expect(spiral.extras.feet||spiral.extras.post||spiral.extras.loop||spiral.support.coupon||spiral.sets.assemblyCard).toBe(false);
 for(const mode of ['bowl','tower','tiered','hanging','sleeve'] as PopupParams['mode'][]){
  const p=modeDefaults(spiral,mode);expect(POPUP.build(p,{}).error,mode).toBeUndefined();expect(p.support.kind).toBe('form');
 }
 const rings=patternDefaults(spiral,'rings');expect(rings.support.kind).toBe('ribs');expect(POPUP.build(rings,{}).error).toBeUndefined();
});
it('ring-only settings are hidden and do not alter spiral cuts',()=>{
 const a=mergePopup({pattern:{kind:'spiral',edge:'wave',segmented:true},rings:{variable:true}}),b=mergePopup({pattern:{kind:'spiral'}});
 expect(POPUP.build(a,{}).parts[0].holes).toEqual(POPUP.build(b,{}).parts[0].holes);
 for(const key of ['pattern.edge','pattern.follow','pattern.segmented','rings.variable','support.kind','extras.feet','extras.loop','extras.post']){
  const field=POPUP.sections.flatMap(s=>s.fields).find(f=>f.key===key)!;expect(field.show?.(a),key).toBe(false);
 }
});
it('rejects overlapping spiral slots and collapsed kerf gaps',()=>{
 for(const rings of [{gap:.1},{by:'count',count:80,gap:5}])expect(POPUP.build(mergePopup({pattern:{kind:'spiral'},rings}),{}).error).toBeTruthy();
});
it('curved caps show physical edges, never triangulation diagonals',()=>{
 const p=mergePopup({pattern:{kind:'spiral'}}),out=POPUP.build(p,{}),scene=generatorScene(out,p.T);
 try {scene.group.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o.userData.noMeasure)return;
  const edges=o.getObjectByName('__edges') as THREE.LineSegments;
  expect(edges).toBeTruthy();
  // Flat source boundaries are unchanged by curvature; only their heights move.
  const source=new THREE.ExtrudeGeometry((o.geometry as THREE.ExtrudeGeometry).parameters.shapes,{depth:p.T,bevelEnabled:false,curveSegments:1});
  const expected=new THREE.EdgesGeometry(source,28);
  try{expect(edges.geometry.getAttribute('position').count).toBe(expected.getAttribute('position').count);}finally{source.dispose();expected.dispose();}
 });}finally{scene.dispose();}
});
it('multi keeps the requested total turns even with more arms than turns',()=>{
 const p=mergePopup({pattern:{kind:'multi',arms:4},rings:{by:'count',count:2}}),out=POPUP.build(p,{});
 expect(out.error).toBeUndefined();expect(out.parts[0].holes).toHaveLength(4);
 expect(out.stats.find(v=>v.label==='Spiral turns / arm')?.value).toBe('0.50');
});
it('every existing preset can switch to Spiral and Multi',()=>{
 for(const preset of POPUP.presets)for(const kind of ['spiral','multi'] as const){
  const p=patternDefaults(POPUP.merge(preset.params),kind),out=POPUP.build(p,CTX);
  expect(out.error,`${preset.id}/${kind}`).toBeUndefined();
  expect(out.parts[0].views3d!.every(v=>!!v.radialSurface)).toBe(true);
 }
},30000);
