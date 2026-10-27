import {differenceShapes,intersectShapes,unionShapes,offsetShapes,totalArea} from '@/lib/letters/polygon';
import {radialHeight,type RadialSurface} from '@/lib/radialProfile';
import {bboxOf,circle,rect,transform} from '../geom';
import type {BuildContext,Contour,GenPart} from '../types';
import type {PopupParams} from './params';
import {lighten,nearContours} from './supports';

export interface SpiralJoint {
 rib:number;angle:number;u:number;height:number;anchor:'rim'|'centre';slot:Contour;eye:Contour;keyId:string;
}
export interface SpiralBaseJoint {rib:number;u:number;angle:number;slot:Contour}
const contours=(s:ReturnType<typeof unionShapes>)=>s.flatMap(v=>[v.outer,...v.holes]);
const area=(s:ReturnType<typeof unionShapes>)=>totalArea(s);

/** Lower envelope across the entire stock thickness, not just the rib's centreline.
 * Split at every profile knot entering/leaving that span. Chords within each interval lie below
 * the concave minimum of the linear/radial branches, so the support cannot penetrate the sheet. */
export function spiralSaddle(surface:RadialSurface,T:number,lo:number,hi:number):Contour {
 const r1=(u:number)=>Math.hypot(u,T/2);
 const height=(u:number)=>Math.min(radialHeight(surface,u),radialHeight(surface,r1(u)),
  ...surface.samples.filter(([r])=>r>u&&r<r1(u)).map(([,z])=>z));
 const xs=new Set([lo,hi]);
 for(let u=lo+1;u<hi;u++)xs.add(u);
 for(const [r] of surface.samples)for(const u of [r,Math.sqrt(Math.max(0,r*r-T*T/4))])if(u>lo&&u<hi)xs.add(u);
 return [...xs].sort((a,b)=>a-b).map(u=>[u,-height(u)]);
}

/** A permanent, glued forming cradle. Only flat centre/rim lands get keyed tabs; no spiral turn
 * is severed or falsely treated as a rigid ring. The base and all mating slots share one schedule. */
export function spiralSupports(p:PopupParams,blank:GenPart,surface:RadialSurface,radius:number,opening:number,ctx:BuildContext,prefix='') {
 const {T}=p,fit=p.support.fit,n=p.spiral.count,foot=p.spiral.clearance;
 if(!Number.isInteger(n)||n<3||n>4)throw Error('Use 3 or 4 spiral support ribs.');
 if(!Number.isFinite(foot)||foot<2*T||foot>150)throw Error(`Spiral base clearance must be at least ${(2*T).toFixed(1)} mm (twice the stock thickness), and at most 150 mm.`);
 if(!Number.isFinite(fit)||fit<0||fit>1)throw Error('Spiral joint clearance must be between 0 and 1 mm.');
 const tab=3*T,margin=Math.max(.6,.4*T,p.sheet?.minFeature??0),start=surface.samples[0][0],end=surface.samples.at(-1)![0];
 const lo=Math.max(2*T,opening/2+T),hi=Math.sqrt(radius*radius-T*T/4)-margin;
 if(hi-lo<tab+2*margin)throw Error('The spiral support is too short. Enlarge the outline or reduce the centre opening.');
 const wood=[blank.outer,...blank.holes];
 const baseOuter=circle(0,0,radius),baseHoles:Contour[]=opening?[circle(0,0,opening/2)]:[];
 const rimLo=end+p.rings.gap/2+tab/2+fit/2+margin,rimHi=hi-tab/2-fit/2;
 if(rimLo>rimHi)throw Error(`Outer rim is too narrow for ${T} mm stock. Increase it to at least ${(tab+fit+2*margin+p.rings.gap/2+T*T/(8*radius)).toFixed(1)} mm.`);
 let chosen:{joints:SpiralJoint[];angles:number[]}|undefined;
 for(let turn=0;turn<360/n;turn+=5){
  const angles=Array.from({length:n},(_,i)=>turn+i*360/n),joints:SpiralJoint[]=[];
  let valid=true;
  for(let i=0;i<n&&valid;i++){
   const angle=angles[i];
   for(const anchor of ['rim','centre'] as const){
    const low=anchor==='rim'?rimLo:lo+tab/2+fit/2+margin;
    const high=anchor==='rim'?rimHi:start-p.rings.gap/2-tab/2-fit/2-margin;
    let joint:SpiralJoint|undefined;
    if(high>=low)for(const f of [.5,.25,.75,0,1]){
     const u=low+(high-low)*f,h=radialHeight(surface,u);
     const slot=transform(rect(u-(tab+fit)/2,-(T+fit)/2,tab+fit,T+fit),{rot:angle});
     const padded=transform(rect(u-(tab+fit)/2-margin,-(T+fit)/2-margin,tab+fit+2*margin,T+fit+2*margin),{rot:angle});
     if(area(differenceShapes([padded],[blank.outer]))>.001||area(intersectShapes([padded],nearContours(blank.holes,padded)))>.001)continue;
     if(slot.some(([x,y])=>Math.abs(radialHeight(surface,Math.hypot(x,y))-h)>.001))continue;
     if(joints.some(j=>area(intersectShapes([padded],[j.slot]))>.001))continue;
     // Keep the entire sideways key-insertion sweep on a flat land, clear of accessory tabs.
     const sweep=transform(rect(u-T-margin,-5*T-fit-margin,2*T+2*margin,8*T+fit+2*margin),{rot:angle});
     const sweepMin=u-T-margin,sweepMax=Math.hypot(u+T+margin,5*T+fit+margin);
     if([sweepMin,sweepMax].some(r=>Math.abs(radialHeight(surface,r)-h)>.001)
      ||surface.samples.some(([r,z])=>r>sweepMin&&r<sweepMax&&Math.abs(z-h)>.001))continue;
     if(area(intersectShapes([sweep],nearContours(blank.holes,sweep)))>.001)continue;
     joint={rib:i,angle,u,height:h,anchor,slot,eye:rect(u-(T+fit)/2,-h-2*T-fit,T+fit,T+fit),keyId:`spiral-key-${i+1}-${anchor}`};break;
    }
    if(joint)joints.push(joint);else if(anchor==='rim')valid=false;
   }
  }
  if(valid){chosen={joints,angles};break;}
 }
 if(!chosen)throw Error('No clear spiral anchor positions fit. Widen the rim or remove conflicting handle/finial openings.');
 const {joints,angles}=chosen,parts:GenPart[]=[],baseJoints:SpiralBaseJoint[]=[];
 let loading=false;
 const ink=(code:string,solid:Contour[],x:number,y:number,size=3)=>{
  if(!p.support.labels)return [];
  const text=ctx.text?.(prefix+code,'archivo-black',size);if(!text){loading=true;return [];}
  const b=bboxOf(text.contours);return contours(intersectShapes(text.contours.map(c=>transform(c,{x:x-b.x0,y:y-b.y0})),solid));
 };
 const saddle=spiralSaddle(surface,T,lo,hi);
 for(let i=0;i<n;i++){
  const angle=angles[i],a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const body:Contour=[...saddle,[hi,foot],[lo,foot]],tabs:Contour[]=[],eyes:Contour[]=[];
  for(const j of joints.filter(v=>v.rib===i)){
   tabs.push(rect(j.u-tab/2,-j.height-3*T-fit,tab,3*T+fit+.02));eyes.push(j.eye);
   // A headed retaining key passes horizontally through the tab eye above the flat land.
   const key=contours(unionShapes([rect(-T/2,-T/2-fit,T,3.5*T+fit),rect(-T,-1.5*T-fit,2*T,T+.01)]));
   const keyShape=unionShapes(key)[0];
   parts.push({id:j.keyId,name:`Retaining key ${prefix}K${i+1}${j.anchor==='rim'?'A':'B'}`,outer:keyShape.outer,holes:[],
    engrave:ink(`K${i+1}${j.anchor==='rim'?'A':'B'}`,key,-T,-1.5*T-fit,T*.4),
    place:{x:j.u*c,y:j.u*s,z:j.height+T+fit/2,rot:angle},apart:[-s*30,c*30,15]});
  }
  const span=hi-lo,locations=span>8*T?[lo+span*.3,lo+span*.7]:[lo+span*.5];
  for(const u of locations){
   const slot=transform(rect(u-(tab+fit)/2,-(T+fit)/2,tab+fit,T+fit),{rot:angle});
   const padded=transform(rect(u-(tab+fit)/2-margin,-(T+fit)/2-margin,tab+fit+2*margin,T+fit+2*margin),{rot:angle});
   if(area(differenceShapes([padded],[baseOuter,...baseHoles]))>.001)throw Error('Base mortises need more surrounding material. Enlarge the outline or reduce the centre opening.');
   baseJoints.push({rib:i,u,angle,slot});baseHoles.push(slot);
   tabs.push(rect(u-tab/2,foot-.02,tab,T+.02));
  }
  // A 0.01 mm normal relief absorbs the polygon kernel's 0.001 mm rounding even at steep
  // profile transitions. Locating tabs are added afterwards and keep their exact joint sizes.
  const relieved=contours(offsetShapes(unionShapes([body]),-.01,'miter'));
  const solids=lighten(differenceShapes(contours(unionShapes([...relieved,...tabs])),eyes),T);
  if(solids.length!==1)throw Error('A spiral support split at a joint. Increase base clearance or reduce the openings.');
  const solid=solids[0],m=[c,0,-s,s*T/2,s,0,c,-c*T/2,0,-1,0,0];
  parts.push({id:`spiral-rib-${i+1}`,name:`Spiral support ${prefix}R${i+1}`,outer:solid.outer,holes:solid.holes,
   engrave:ink(`R${i+1}`,contours(solids),lo+T,foot*.35,Math.min(3,foot*.25)),place:{x:0,y:0,z:0,m},apart:[c*25,s*25,-15]});
 }
 const baseSolid=unionShapes([baseOuter,...baseHoles],[],true);
 if(baseSolid.length!==1)throw Error('Base slots disconnect the support plate. Enlarge the base or reduce stock thickness.');
 const baseInk=ink('B1',[baseOuter,...baseHoles],-T,radius-3*T);
 if(p.support.labels)for(let i=0;i<n;i++){
  const j=baseJoints.find(j=>j.rib===i)!;
  const text=ctx.text?.(prefix+`R${i+1}`,'archivo-black',Math.min(3,T));
  if(text){const b=bboxOf(text.contours);const marks=text.contours.map(c=>transform(transform(c,{x:j.u-b.x0,y:2*T-b.y0}),{rot:j.angle}));baseInk.push(...contours(intersectShapes(marks,[baseOuter,...baseHoles])));}
 }
 parts.unshift({id:'spiral-base',name:`Spiral base ${prefix}B1`,outer:baseOuter,holes:baseHoles,
  engrave:baseInk,place:{x:0,y:0,z:-foot-T},apart:[0,0,-40]});
 const marks:Contour[]=[];
 if(p.support.labels)for(const j of joints.filter(j=>j.anchor==='rim')){
  const text=ctx.text?.(prefix+`R${j.rib+1}`,'archivo-black',Math.min(2.5,T));
  if(text){const b=bboxOf(text.contours);marks.push(...text.contours.map(c=>transform(c,{x:j.u-b.x0,y:2*T-b.y0,rot:0})).map(c=>transform(c,{rot:j.angle})));}
 }
 return {parts,slots:joints.map(j=>j.slot),joints,baseJoints,saddle,loading,
  marks:contours(intersectShapes(marks,contours(differenceShapes(wood,joints.map(j=>j.slot))))) };
}
