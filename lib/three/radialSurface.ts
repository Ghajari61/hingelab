import * as THREE from 'three';
import {meshEdges} from './edges';

/** Target radial form, independent of the flat manufacturing contours. Not a strain simulation. */
export interface RadialSurface { samples: [radius:number,height:number][] }
export function radialHeight(surface:RadialSurface,r:number):number {
 const points=surface.samples;
 if(r<=points[0][0])return points[0][1];
 let lo=0,hi=points.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid][0]<=r)lo=mid;else hi=mid;}
 if(r>=points[hi][0])return points[hi][1];
 const t=(r-points[lo][0])/(points[hi][0]-points[lo][0]);
 return points[lo][1]+t*(points[hi][1]-points[lo][1]);
}
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
