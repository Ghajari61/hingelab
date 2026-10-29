import * as THREE from 'three';

/**
 * Feature edges of a mesh: every edge with one face, and every edge between two faces that meet at
 * more than `angle` degrees. Each face's direction comes from its vertex normals where the geometry
 * has them, not from its corners: the triangulator leaves long, nearly flat slivers on the faces of
 * cut parts, whose corner-computed normals wobble and would draw stray lines across a flat face.
 */
export function featureEdges(geometry:THREE.BufferGeometry,angle=28):THREE.BufferGeometry {
 const pos=geometry.getAttribute('position');const nor=geometry.getAttribute('normal');const idx=geometry.getIndex();
 const count=idx?idx.count:pos.count;const at=(k:number)=>idx?idx.getX(k):k;
 const key=(i:number)=>`${Math.round(pos.getX(i)*1e4)},${Math.round(pos.getY(i)*1e4)},${Math.round(pos.getZ(i)*1e4)}`;
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
 const edges=new Map<string,{i:number;j:number;n:THREE.Vector3[]}>();
 for(let k=0;k+2<count;k+=3){
  const v=[at(k),at(k+1),at(k+2)];
  if(nor){n.set(0,0,0);for(const i of v)n.add(b.set(nor.getX(i),nor.getY(i),nor.getZ(i)));}
  else{a.fromBufferAttribute(pos,v[0]);b.fromBufferAttribute(pos,v[1]);c.fromBufferAttribute(pos,v[2]);n.copy(b.sub(a)).cross(c.sub(a));}
  if(n.lengthSq()<1e-24)continue;
  const fn=n.clone().normalize();const ks=v.map(key);
  for(const [s,t] of [[0,1],[1,2],[2,0]]){
   if(ks[s]===ks[t])continue;
   const h=ks[s]<ks[t]?`${ks[s]}|${ks[t]}`:`${ks[t]}|${ks[s]}`;
   const e=edges.get(h);if(e)e.n.push(fn);else edges.set(h,{i:v[s],j:v[t],n:[fn]});
  }
 }
 const cos=Math.cos((angle*Math.PI)/180),out:number[]=[];
 for(const e of edges.values()){
  if(e.n.length===2&&e.n[0].dot(e.n[1])>cos)continue;
  out.push(pos.getX(e.i),pos.getY(e.i),pos.getZ(e.i),pos.getX(e.j),pos.getY(e.j),pos.getZ(e.j));
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));return g;
}

/** A single owned edge overlay; curved models can supply their deformed physical boundaries. */
export function meshEdges(mesh:THREE.Mesh,geometry?:THREE.BufferGeometry):THREE.LineSegments {
 const existing=mesh.getObjectByName('__edges') as THREE.LineSegments|undefined;
 if(existing)return existing;
 const edges=new THREE.LineSegments(geometry??featureEdges(mesh.geometry,28),
  new THREE.LineBasicMaterial({color:0x1d1d1d,transparent:true,opacity:.55}));
 edges.name='__edges';edges.userData.keepMaterial=true;edges.raycast=()=>{};
 edges.visible=false;mesh.add(edges);return edges;
}
