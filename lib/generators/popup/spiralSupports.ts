import {differenceShapes,intersectShapes,unionShapes,offsetShapes,totalArea} from '@/lib/letters/polygon';
import {formHeight,radialHeight,type FormedSurface as RadialSurface} from '@/lib/radialProfile';
import {bboxOf,circle,rect,transform} from '../geom';
import type {BuildContext,Contour,GenPart} from '../types';
import type {PopupParams} from './params';
import {lighten,nearContours} from './supports';
import {ACCESSORY_CLEARANCE,type AccessorySolid} from './hardware';

export interface SpiralJoint {
 rib:number;angle:number;u:number;height:number;anchor:'rim'|'centre';slot:Contour;eye:Contour;keyId:string;
}
export interface SpiralBaseJoint {rib:number;u:number;angle:number;slot:Contour}
const contours=(s:ReturnType<typeof unionShapes>)=>s.flatMap(v=>[v.outer,...v.holes]);
const area=(s:ReturnType<typeof unionShapes>)=>totalArea(s);

/** Lower envelope across the entire stock thickness, not just the rib's centreline.
 * Split at every profile knot entering/leaving that span. Chords within each interval lie below
 * the concave minimum of the linear/radial branches, so the support cannot penetrate the sheet. */
export function spiralSaddle(surface:RadialSurface,T:number,lo:number,hi:number,angle=0):Contour {
 if(surface.spiral)return stepSaddle(surface,T,lo,hi,angle);
 const r1=(u:number)=>Math.hypot(u,T/2);
 const height=(u:number)=>Math.min(radialHeight(surface,u),radialHeight(surface,r1(u)),
  ...surface.samples.filter(([r])=>r>u&&r<r1(u)).map(([,z])=>z));
 const xs=new Set([lo,hi]);
 for(let u=lo+1;u<hi;u++)xs.add(u);
 for(const [r] of surface.samples)for(const u of [r,Math.sqrt(Math.max(0,r*r-T*T/4))])if(u>lo&&u<hi)xs.add(u);
 return [...xs].sort((a,b)=>a-b).map(u=>[u,-height(u)]);
}

/**
 * The top of a support under a continuous spiral: each strip turn it passes under sits level, at its
 * own height, so the top steps from turn to turn at the slots (a smooth saddle cut through the
 * higher side of every turn). The lowest height across the support's thickness is used, and each
 * riser stands on the lower side of its step, so it never rises into the strip; risers fall within
 * 0.25 mm of the slot.
 */
function stepSaddle(surface:RadialSurface,T:number,lo:number,hi:number,angle:number):Contour {
 const a=angle*Math.PI/180;
 const height=(u:number)=>{const d=Math.atan2(T/2,Math.max(u,1e-6));return Math.min(...[-d,0,d].map(o=>formHeight(surface,u*Math.cos(a+o),u*Math.sin(a+o))));};
 const n=Math.max(2,Math.ceil((hi-lo)/.25)),us:number[]=[],hs:number[]=[];
 for(let i=0;i<=n;i++){const u=lo+(hi-lo)*i/n;us.push(u);hs.push(height(u));}
 // runs of one turn (no jump between samples), each a flat tread at the run's lowest height:
 // polygon clean-up merges nearly collinear points, and a chord across a slightly varying turn
 // would rise a hundredth into it
 const runs:{from:number;to:number;h:number}[]=[];
 for(let i=0;i<=n;i++){
  const last=runs[runs.length-1];
  // a tread is level to 0.05 mm: a turn that rises slowly into the rim gets small steps of its own
  if(last&&Math.abs(hs[i]-hs[i-1])<=.05&&Math.abs(hs[i]-hs[last.from])<=.05){last.to=i;last.h=Math.min(last.h,hs[i]);}
  else runs.push({from:i,to:i,h:hs[i]});
 }
 const out:Contour=[];
 runs.forEach((r,k)=>{
  // the riser between two treads stands on the lower one's side of the gap
  const next=runs[k+1];
  const x0=k===0?us[0]:(runs[k-1].h<r.h?us[r.from]:us[r.from-1]);
  const x1=!next?us[n]:(next.h<r.h?us[r.to+1]:us[r.to]);
  out.push([x0,-r.h],[x1,-r.h]);
 });
 return out;
}

/** A permanent, glued forming cradle. Only flat centre/rim lands get keyed tabs; no spiral turn
 * is severed or falsely treated as a rigid ring. The base and all mating slots share one schedule. */
/** The narrowest outer rim that holds a rim tab: the tab and its clearance, the cut gap, the
 * minimum land each side, and the sagitta of the curved outline across the padded slot's width. */
export function spiralRimMin(p:PopupParams,radius:number):number {
 const margin=Math.max(.6,.4*p.T,p.sheet?.minFeature??0),halfPad=(p.T+p.support.fit)/2+margin;
 return p.rings.gap/2+3*p.T+p.support.fit+2*margin+(radius-Math.sqrt(Math.max(0,radius*radius-halfPad*halfPad)));
}

/** Whether a box in (radius, height) space comes within the clearance of a fitting. A support sits on
 * a radial line, so its nearest point to the axis is at radius `u0` across its whole thickness. */
function hitsFitting(a:AccessorySolid,u0:number,u1:number,z0:number,z1:number):boolean {
 const c=ACCESSORY_CLEARANCE;
 if(a.kind==='cylinder')return u0<a.r+c&&z1>a.z0-c&&z0<a.z1+c;
 const du=Math.max(0,u0),dz=Math.max(z0-a.zc,0,a.zc-z1);
 return Math.hypot(du,dz)<a.r+c&&u1>=0;
}
/** A fitting's keep-out in a support's own plane (u along the radius, v = -height). */
function fittingKeepout(a:AccessorySolid):Contour {
 const c=ACCESSORY_CLEARANCE;
 if(a.kind==='sphere')return circle(0,-a.zc,a.r+c);
 return rect(-a.r-c,-(a.z1+c),2*(a.r+c),a.z1-a.z0+2*c);
}

export function spiralSupports(p:PopupParams,blank:GenPart,surface:RadialSurface,radius:number,opening:number,ctx:BuildContext,prefix='',fittings:AccessorySolid[]=[]) {
 const {T}=p,fit=p.support.fit,n=p.spiral.count,foot=p.spiral.clearance;
 if(!Number.isInteger(n)||n<3||n>4)throw Error('Use 3 or 4 spiral support ribs.');
 if(!Number.isFinite(foot)||foot<2*T||foot>150)throw Error(`Spiral base clearance must be at least ${(2*T).toFixed(1)} mm (twice the stock thickness), and at most 150 mm.`);
 if(!Number.isFinite(fit)||fit<0||fit>1)throw Error('Spiral joint clearance must be between 0 and 1 mm.');
 const tab=3*T,margin=Math.max(.6,.4*T,p.sheet?.minFeature??0),start=surface.samples[0][0],end=surface.samples.at(-1)![0];
 const lo=Math.max(2*T,opening/2+T),hi=Math.sqrt(radius*radius-T*T/4)-margin;
 if(hi-lo<tab+2*margin)throw Error('The spiral support is too short. Enlarge the outline or reduce the centre opening.');
 const wood=[blank.outer,...blank.holes];
 const baseOuter=circle(0,0,radius),baseHoles:Contour[]=opening?[circle(0,0,opening/2)]:[];
 // the padded rim slot's outer corners, half its width off the radius, stay inside the outline
 const halfPad=(T+fit)/2+margin;
 const rimLo=end+p.rings.gap/2+tab/2+fit/2+margin,rimHi=Math.sqrt(Math.max(0,radius*radius-halfPad*halfPad))-tab/2-fit/2-margin;
 if(rimLo>rimHi)throw Error(`Outer rim is too narrow for ${T} mm stock. Increase it to at least ${(Math.ceil(spiralRimMin(p,radius)*10)/10).toFixed(1)} mm.`);
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
     // the tab, its key and the key's way in stay clear of the fittings round the centre
     if(fittings.some(a=>hitsFitting(a,u-tab/2-fit/2-margin,u+tab/2+fit/2+margin,h-.3,h+4*T+fit)))continue;
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
 const saddles:Contour[]=[];
 for(let i=0;i<n;i++){
  const angle=angles[i],a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  // each support follows the turns it actually passes under (they differ from rib to rib)
  const saddle=spiralSaddle(surface,T,lo,hi,angle);saddles.push(saddle);
  const body:Contour=[...saddle,[hi,foot],[lo,foot]],tabs:Contour[]=[],eyes:Contour[]=[];
  for(const j of joints.filter(v=>v.rib===i)){
   // the tab reaches 0.3 mm into the body: a tread may sit up to 0.05 mm low (level steps) plus the 0.01 mm relief
   tabs.push(rect(j.u-tab/2,-j.height-3*T-fit,tab,3*T+fit+.3));eyes.push(j.eye);
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
   const clash=fittings.find(a=>hitsFitting(a,u-tab/2,u+tab/2,-foot-T,-foot+.02));
   if(clash)throw Error(`A spiral support's base joint meets the ${clash.what}. Enlarge the outline or reduce the centre opening.`);
   baseJoints.push({rib:i,u,angle,slot});baseHoles.push(slot);
   tabs.push(rect(u-tab/2,foot-.02,tab,T+.02));
  }
  // A 0.01 mm normal relief absorbs the polygon kernel's 0.001 mm rounding even at steep
  // profile transitions. Locating tabs are added afterwards and keep their exact joint sizes.
  const relieved=contours(offsetShapes(unionShapes([body]),-.01,'miter'));
  // the support is cut back round the fittings (a bulb hanging under the centre, a socket's shade
  // ring, a tealight, a vase) with a clearance; its joints were chosen clear of them
  const carved=differenceShapes(contours(unionShapes([...relieved,...tabs])),[...eyes,...fittings.map(fittingKeepout)]);
  if(fittings.length&&carved.length!==1)throw Error(`A spiral support would be cut in two by the clearance round the ${fittings.map(a=>a.what).join(' and ')}. Enlarge the centre disc or base clearance, or use a smaller fitting.`);
  const solids=lighten(carved,T);
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
 return {parts,slots:joints.map(j=>j.slot),joints,baseJoints,saddle:saddles[0],saddles,loading,
  marks:contours(intersectShapes(marks,contours(differenceShapes(wood,joints.map(j=>j.slot))))) };
}
