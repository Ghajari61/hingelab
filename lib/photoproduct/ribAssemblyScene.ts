import * as THREE from 'three';
import type {GenOutput} from '@/lib/generators/types';
import {generatorScene} from '@/lib/generators/scene3d';
import {applyLook,type LookId} from '@/lib/three/looks';
import {modelBox} from '@/lib/three/dims';
import {partWorld} from './joinery';
import {ribAssemblyFrame,type GluePatch,type RibAssemblyPlan} from './ribAssembly';

export interface AssemblyDisplay {labels:boolean;glue:boolean;ghosts:boolean}
function badge(text:string,width:number){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=192;canvas.height=88;
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 ctx.fillStyle='#132d3e';ctx.beginPath();ctx.roundRect(4,4,184,80,16);ctx.fill();
 ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 42px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,96,47);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));
 sprite.scale.set(width,width*88/192,1);sprite.renderOrder=12;sprite.userData.noMeasure=true;sprite.userData.noPick=true;return sprite;
}
function glueSurface(p:GluePatch){
 const shape=new THREE.Shape(p.outer.map(([x,y])=>new THREE.Vector2(x,y)));
 shape.holes=p.holes.map(h=>new THREE.Path(h.map(([x,y])=>new THREE.Vector2(x,y))));
 const geometry=new THREE.ShapeGeometry(shape),m=p.matrix;
 geometry.applyMatrix4(new THREE.Matrix4().set(m[0],m[1],m[2],m[3],-m[4],-m[5],-m[6],-m[7],m[8],m[9],m[10],m[11],0,0,0,1));
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#05c8ea',side:THREE.DoubleSide,transparent:true,opacity:.68,depthTest:false,depthWrite:false}));
 mesh.name=`Glue ${p.jointId}`;mesh.renderOrder=8;mesh.userData={keepMaterial:true,noMeasure:true,noPick:true,jointId:p.jointId};
 return mesh;
}

/** Move the same extruded cutting parts, not approximate presentation meshes. */
export function ribAssemblyScene(out:GenOutput,T:number,look:LookId,plan:RibAssemblyPlan){
 const scene=generatorScene(out,T),inner=scene.group.children[0];
 applyLook(scene.group,look);
 const frameBounds=modelBox(scene.group);frameBounds.max.y+=plan.rise+30;
 const partNodes=new Map<string,THREE.Object3D>();
 scene.group.traverse(o=>{if(typeof o.userData.partId==='string')partNodes.set(o.userData.partId,o);});
 const originals=new Map([...partNodes].map(([id,node])=>[id,node.matrix.clone()]));
 const materials=new Map<string,{mesh:THREE.Mesh;material:THREE.MeshStandardMaterial;opacity:number;transparent:boolean;shadow:boolean}[]>();
 for(const [id,node] of partNodes){
  const list:NonNullable<ReturnType<typeof materials.get>>=[];
  node.traverse(o=>{
   const mesh=o as THREE.Mesh;if(!mesh.isMesh||mesh.userData.keepMaterial)return;
   for(const material of ([] as THREE.Material[]).concat(mesh.material))list.push({mesh,material:material as THREE.MeshStandardMaterial,opacity:material.opacity,transparent:material.transparent,shadow:mesh.castShadow});
  });materials.set(id,list);
 }
 const labels=new Map<string,{sprite:THREE.Sprite;z:number}>();
 for(const p of out.parts){
  const i=plan.parts.find(q=>q.id===p.id)!,label=badge(p.id.startsWith('support-')?p.name:String(i.number).padStart(2,'0'),Math.max(26,scene.size[0]*.045));
  if(!label)continue;
  const points=p.outer.map(([u,v])=>partWorld(p,u,v));
  const x=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2;
  const y=(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2;
  const z=Math.max(...points.map(p=>p[2]))+18;
  label.position.set(x,-y,z);label.userData.partNumber=i.number;inner.add(label);labels.set(p.id,{sprite:label,z});
 }
 const glueNodes=plan.patches.map(glueSurface);inner.add(...glueNodes);glueNodes.forEach(m=>m.visible=false);
 function setFrame(index:number,progress:number,display:AssemblyDisplay){
  const step=plan.steps[Math.max(0,Math.min(plan.steps.length-1,index))],states=ribAssemblyFrame(plan,index,progress);
  for(const state of states){
   const node=partNodes.get(state.id)!;node.matrix.copy(originals.get(state.id)!);node.matrix.elements[14]+=state.lift;node.matrixWorldNeedsUpdate=true;
   const ghost=!state.active&&!state.seated;
   node.visible=!ghost||state.overview||display.ghosts;
   for(const item of materials.get(state.id)??[]){
    item.material.opacity=ghost?(state.overview?.22:.075):item.opacity;item.material.transparent=ghost||item.transparent;item.material.depthWrite=!ghost;
    item.material.emissive?.setHex(state.active?0x66400c:0x000000);item.mesh.castShadow=!ghost&&item.shadow;
   }
   const label=labels.get(state.id);if(label){label.sprite.visible=node.visible&&(state.active||(display.labels&&state.seated));label.sprite.position.z=label.z+state.lift;}
  }
  for(const node of glueNodes)node.visible=display.glue&&(step.kind==='finish'||step.glue.includes(node.userData.jointId));
  scene.group.updateMatrixWorld(true);
 }
 return {...scene,frameBounds,partNodes,glueNodes,setFrame};
}
export type RibAssemblyScene=ReturnType<typeof ribAssemblyScene>;
