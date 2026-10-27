import {it,expect} from 'vitest';
import {Vector3,Mesh} from 'three';
import fixture from './rib-wave.fixture.json';
import {GeneratedModelSchema,buildGeneratedProduct} from '../generated';
import {DEFAULT_JOINERY} from '../joinery';
import {CTX} from '@/lib/generators/__tests__/ctx';
import {ribAssemblyPlan} from '../ribAssembly';
import {ribAssemblyScene} from '../ribAssemblyScene';

it('animates actual part matrices vertically without rebuilding geometry or changing the cutting model',()=>{
 const out=buildGeneratedProduct(GeneratedModelSchema.parse(fixture.generated),fixture.size,6,{},CTX,{...DEFAULT_JOINERY,supports:'rib-rails'});
 const before=JSON.stringify(out),plan=ribAssemblyPlan(out)!,scene=ribAssemblyScene(out,6,'wood',plan);
 const id=out.parts[0].id,node=scene.partNodes.get(id)!,base=node.getWorldPosition(new Vector3()),index=plan.steps.findIndex(s=>s.partId===id);
 const meshes:Mesh[]=[];scene.group.traverse(o=>{if((o as Mesh).isMesh)meshes.push(o as Mesh);});const geometries=meshes.map(m=>m.geometry);
 const bounds=scene.frameBounds!.clone();
 scene.setFrame(index,0,{labels:true,glue:true,ghosts:false});const start=node.getWorldPosition(new Vector3());
 expect(start.x).toBeCloseTo(base.x,6);expect(start.z).toBeCloseTo(base.z,6);expect(start.y-base.y).toBeCloseTo(plan.rise,6);
 expect(scene.glueNodes.filter(p=>p.visible)).toHaveLength(plan.steps[index].glue.length*3);
 scene.setFrame(index,.6,{labels:true,glue:false,ghosts:false});expect(node.getWorldPosition(new Vector3()).y).toBeLessThan(start.y);
 expect(scene.glueNodes.every(p=>!p.visible)).toBe(true);
 scene.setFrame(plan.steps.length-1,1,{labels:false,glue:false,ghosts:false});
 expect(node.getWorldPosition(new Vector3()).distanceTo(base)).toBeLessThan(1e-6);
 expect([...scene.partNodes.values()].every(n=>n.visible)).toBe(true);
 expect(scene.frameBounds!.equals(bounds)).toBe(true);expect(meshes.every((m,i)=>m.geometry===geometries[i])).toBe(true);
 expect(JSON.stringify(out)).toBe(before);scene.dispose();
});
