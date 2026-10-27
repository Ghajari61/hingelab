import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generatorScene } from '../scene3d';
import { rect } from '../geom';
import { cutPart, flatOf } from '../output';
import { flatScene } from '@/lib/three/flat';
import type { GenOutput } from '../types';
import { sceneModel } from '@/lib/desktop/model3d';

describe('preview motion and stock thickness', () => {
 it('the serialized desktop view fades puzzle-wide marks while pieces separate', () => {
  const out: GenOutput={stats:[],parts:[{id:'puzzle',name:'Puzzle',outer:rect(0,0,40,20),holes:[],pieces:[rect(0,0,20,20),rect(20,0,20,20)],engrave:[rect(2,2,36,16)]}]};
  const model=sceneModel(e=>generatorScene(out,3,e));
  expect(model?.objects.find(o=>o.name==='Puzzle engraving')).toMatchObject({fade:true});
 });
 it('moves rigid parts and puzzle pieces without rebuilding their geometry', () => {
  const out: GenOutput = {stats:[],parts:[
   {id:'base',name:'Base',outer:rect(0,0,60,40),holes:[],place:{x:0,y:0,z:0}},
   {id:'lid',name:'Lid',outer:rect(0,0,60,40),holes:[],place:{x:0,y:0,z:30}},
   {id:'puzzle',name:'Puzzle',outer:rect(0,0,40,20),holes:[],pieces:[rect(0,0,20,20),rect(20,0,20,20)],place:{x:80,y:0,z:0}},
  ]};
  const scene=generatorScene(out,3), meshes:THREE.Mesh[]=[];
  scene.group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o)});
  const geometry=meshes.map(m=>m.geometry), before=meshes.map(m=>m.getWorldPosition(new THREE.Vector3()));
  try {
   expect(scene.explode).toBeTypeOf('function');
   for(let i=0;i<=20;i++)scene.explode!(i/20);
   expect(meshes.map(m=>m.geometry)).toEqual(geometry);
   expect(meshes[1].getWorldPosition(new THREE.Vector3()).distanceTo(before[1])).toBeCloseTo(30);
   expect(meshes[2].getWorldPosition(new THREE.Vector3()).distanceTo(before[2])).toBeGreaterThan(0);
   scene.explode!(0);
   meshes.forEach((m,i)=>expect(m.getWorldPosition(new THREE.Vector3()).distanceTo(before[i])).toBeLessThan(1e-6));
  } finally {scene.dispose()}
 });
 it('shows each flat part at its own stock thickness', () => {
  const pt=cutPart({id:'thin',name:'Thin insert',outer:rect(0,0,30,20),holes:[],t:1.5},0);
  const lay={width:40,height:30,items:[{pt,i:0,ox:5,oy:5,w:30,h:20}]};
  const scene=flatScene(flatOf(lay),6);
  try {expect(scene.size[1]).toBeCloseTo(1.5)} finally {scene.dispose()}
 });
});
