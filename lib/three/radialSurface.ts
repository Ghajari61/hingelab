import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {meshEdges} from './edges';
import {formHeight,type FormedSurface as RadialSurface} from '@/lib/radialProfile';
export {radialHeight,type RadialSurface} from '@/lib/radialProfile';
// Meshes are built with y flipped (y up); the form is defined as drawn (y down).
const H=(s:RadialSurface,x:number,y:number)=>formHeight(s,x,-y);

/** How far (mm) the bent surface may stray from the target form between two vertices. */
export const FORM_TOLERANCE = 0.2;
/** No edge longer than this (mm) on a formed part, so light and shadow follow the curve. */
export const FORM_EDGE = 12;

/**
 * Whether the edge a-b must be split: it is long, or the target form between its ends is not the
 * straight line the renderer would draw (height at its midpoint's radius against the average of
 * its ends). Depends only on the two ends, so both triangles sharing an edge agree.
 */
function bends(surface:RadialSurface,ax:number,ay:number,bx:number,by:number):number {
 const len=Math.hypot(bx-ax,by-ay);
 // long edges first, the longest of a triangle's (bisecting the longest edge keeps triangles well shaped)
 if(len>FORM_EDGE)return 1000+len;
 // a kink in the profile (where the slope meets a flat land) cannot be met exactly; 1 mm is invisible
 if(len<1)return 0;
 const ha=H(surface,ax,ay),hb=H(surface,bx,by),hm=H(surface,(ax+bx)/2,(ay+by)/2);
 const err=Math.abs(hm-(ha+hb)/2);
 return err>FORM_TOLERANCE?err/FORM_TOLERANCE:0;
}

/**
 * The flat part as a surface fine enough to bend. The extruded blank's caps are triangulated with
 * long thin triangles that join far-apart points of the strip, and a triangle is lifted only at
 * its three corners: a formed spiral sagged up to 19 mm between them and looked crumpled. Edges are
 * split where the form bends (or the edge is long) until the surface is within FORM_TOLERANCE,
 * then vertices sharing a position, normal and uv are joined so the caps shade smoothly while the
 * cut faces keep their sharp edges.
 */
export function formable(g:THREE.BufferGeometry,surface:RadialSurface):THREE.BufferGeometry {
 // Shared corners first, so neighbouring triangles that split a common edge share its midpoint.
 const plain=new THREE.BufferGeometry(),flat=g.index?g.toNonIndexed():g;
 const names=(['position','normal','uv'] as const).filter(n=>flat.getAttribute(n));
 for(const n of names)plain.setAttribute(n,flat.getAttribute(n));
 const src=mergeVertices(plain,1e-4);
 if(flat!==g)flat.dispose();
 const size=names.map(n=>src.getAttribute(n).itemSize);
 const data=names.map(n=>Array.from(src.getAttribute(n).array as ArrayLike<number>));
 const P=data[0];
 let tris=Array.from(src.index!.array as ArrayLike<number>);
 const mids=new Map<number,number>(),done:number[]=[];
 const mid=(a:number,b:number)=>{
  const key=a<b?a*4194304+b:b*4194304+a;let m=mids.get(key);
  if(m===undefined){m=P.length/3;names.forEach((_,q)=>{const s=size[q],d=data[q];for(let c=0;c<s;c++)d.push((d[a*s+c]+d[b*s+c])/2);});mids.set(key,m);}
  return m;
 };
 for(let pass=0;pass<48;pass++){
  const next:number[]=[];let split=false;
  for(let t=0;t<tris.length;t+=3){
   const v=[tris[t],tris[t+1],tris[t+2]];let best=-1,score=0;
   for(let e=0;e<3;e++){const a=v[e],b=v[(e+1)%3],sc=bends(surface,P[a*3],P[a*3+1],P[b*3],P[b*3+1]);if(sc>score){score=sc;best=e;}}
   if(best<0){done.push(v[0],v[1],v[2]);continue;}
   split=true;
   const a=v[best],b=v[(best+1)%3],c=v[(best+2)%3],m=mid(a,b);
   next.push(a,m,c,m,b,c);
  }
  // a triangle with nothing to split is final: its edges only get shorter if a neighbour splits
  // a shared edge, which leaves a hairline T-junction at worst
  tris=next;if(!split)break;
 }
 for(let i=0;i<tris.length;i++)done.push(tris[i]);
 const out=new THREE.BufferGeometry();
 names.forEach((n,q)=>out.setAttribute(n,new THREE.Float32BufferAttribute(data[q],size[q])));
 out.setIndex(done);
 src.dispose();
 return out;
}

/** Line segments split where the form bends, so an edge drawn over a bent surface bends with it. */
export function splitSegments(g:THREE.BufferGeometry,surface:RadialSurface):THREE.BufferGeometry {
 const p=g.getAttribute('position'),out:number[]=[];
 const walk=(a:number[],b:number[],depth:number)=>{
  if(depth<14&&bends(surface,a[0],a[1],b[0],b[1])>0){const m=a.map((v,c)=>(v+b[c])/2);walk(a,m,depth+1);walk(m,b,depth+1);}
  else out.push(...a,...b);
 };
 for(let i=0;i+1<p.count;i+=2)walk([p.getX(i),p.getY(i),p.getZ(i)],[p.getX(i+1),p.getY(i+1),p.getZ(i+1)],0);
 g.dispose();
 const res=new THREE.BufferGeometry();res.setAttribute('position',new THREE.Float32BufferAttribute(out,3));return res;
}

/** Target radial form, independent of the flat manufacturing contours. Not a strain simulation. */
/** Apply once at construction, including engraved skins, before materials and edge extraction. */
export function applyRadialSurface(group:THREE.Object3D,surface:RadialSurface):void {
 const deform=(g:THREE.BufferGeometry)=>{
  const pos=g.getAttribute('position');
  for(let i=0;i<pos.count;i++)pos.setZ(i,pos.getZ(i)+H(surface,pos.getX(i),pos.getY(i)));
  pos.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();
 };
 const meshes:THREE.Mesh[]=[],lines:THREE.LineSegments[]=[];
 // score lines on the part bend with it (split where the form bends, like the cut edges)
 group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);else if(o instanceof THREE.LineSegments&&o.name!=='__edges')lines.push(o);});
 for(const l of lines){const g=splitSegments(l.geometry,surface);deform(g);l.geometry=g;}
 for(const mesh of meshes){
  // Extract physical edges before warping: the curved caps' triangulation is not a cut line.
  if(!mesh.userData.noMeasure){const edges=splitSegments(new THREE.EdgesGeometry(mesh.geometry,28),surface);deform(edges);meshEdges(mesh,edges);}
  const old=mesh.geometry;
  // the flat outlines it was made from, for anything that needs the cut shapes rather than the mesh
  mesh.userData.flatShapes=(old as THREE.ExtrudeGeometry).parameters?.shapes;
  mesh.geometry=formable(old,surface);old.dispose();
  deform(mesh.geometry);mesh.geometry.computeVertexNormals();
 }
}
