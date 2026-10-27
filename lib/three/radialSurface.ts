import * as THREE from 'three';
import {meshEdges} from './edges';
import {radialHeight,type RadialSurface} from '@/lib/radialProfile';
export {radialHeight,type RadialSurface} from '@/lib/radialProfile';

/** Target radial form, independent of the flat manufacturing contours. Not a strain simulation. */
/** Apply once at construction, including engraved skins, before materials and edge extraction. */
export function applyRadialSurface(group:THREE.Object3D,surface:RadialSurface):void {
 const deform=(g:THREE.BufferGeometry)=>{
  const pos=g.getAttribute('position');
  for(let i=0;i<pos.count;i++)pos.setZ(i,pos.getZ(i)+radialHeight(surface,Math.hypot(pos.getX(i),pos.getY(i))));
  pos.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();
 };
 const meshes:THREE.Mesh[]=[];
 group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
 for(const mesh of meshes){
  // Extract physical edges before warping: the curved caps' triangulation is not a cut line.
  if(!mesh.userData.noMeasure){const edges=new THREE.EdgesGeometry(mesh.geometry,28);deform(edges);meshEdges(mesh,edges);}
  deform(mesh.geometry);mesh.geometry.computeVertexNormals();
 }
}
