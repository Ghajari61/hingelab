import * as THREE from 'three';

/** A single owned edge overlay; curved models can supply their deformed physical boundaries. */
export function meshEdges(mesh:THREE.Mesh,geometry?:THREE.BufferGeometry):THREE.LineSegments {
 const existing=mesh.getObjectByName('__edges') as THREE.LineSegments|undefined;
 if(existing)return existing;
 const edges=new THREE.LineSegments(geometry??new THREE.EdgesGeometry(mesh.geometry,28),
  new THREE.LineBasicMaterial({color:0x1d1d1d,transparent:true,opacity:.55}));
 edges.name='__edges';edges.userData.keepMaterial=true;edges.raycast=()=>{};
 edges.visible=false;mesh.add(edges);return edges;
}
