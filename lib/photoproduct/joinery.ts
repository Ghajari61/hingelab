import type {Contour,GenPart,Pt} from '@/lib/generators/types';
import {differenceShapes,intersectShapes,unionShapes,signedArea,pointInShape,pointInContour,shapeContours} from '@/lib/letters/polygon';

export interface JoinerySettings {mode:'auto'|'off';clearance:number;tabWidth:number;spacing:number;minWeb:number}
export const DEFAULT_JOINERY:JoinerySettings={mode:'auto',clearance:.15,tabWidth:3,spacing:12,minWeb:1};
type V=[number,number,number];
export interface PhotoJoint {id:string;kind:'tab-slot'|'cross-lap'|'glue';a:string;b:string;at:V;slotWidth:number;mateSlotWidth?:number;depth:number;instruction:string}
export interface JoineryReport {joints:PhotoJoint[];unconnected:string[];groups:number;warnings:string[];clearance:number}
const add=(a:V,b:V):V=>a.map((x,i)=>x+b[i]) as V;
const sub=(a:V,b:V):V=>a.map((x,i)=>x-b[i]) as V;
const mul=(a:V,k:number):V=>a.map(x=>x*k) as V;
const dot=(a:V,b:V)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normal=(p:GenPart):V=>[p.place!.m![2],p.place!.m![6],p.place!.m![10]];
export function partWorld(p:GenPart,x:number,y:number,z=0):V{const m=p.place!.m!;return [0,1,2].map(i=>m[4*i]*x+m[4*i+1]*y+m[4*i+2]*z+m[4*i+3]) as V;}
function local(p:GenPart,w:V):V{const m=p.place!.m!,v=sub(w,[m[3],m[7],m[11]]);return [0,1,2].map(i=>m[i]*v[0]+m[i+4]*v[1]+m[i+8]*v[2]) as V;}
const positive=(c:Contour):Contour=>signedArea(c)<0?[...c].reverse():c;
const contours=(p:GenPart)=>[positive(p.outer),...p.holes.map(h=>[...positive(h)].reverse())];
const area=(cs:Contour[])=>Math.abs(cs.reduce((s,c)=>s+signedArea(c),0));
const shape=(p:GenPart)=>({outer:p.outer,holes:p.holes,area:0,bbox:{x0:0,y0:0,x1:0,y1:0},group:0});
function rectangle(a:Pt,u:Pt,v:Pt,l:number,r:number,b:number,t:number):Contour{return [[l,b],[r,b],[r,t],[l,t]].map(([x,y])=>[a[0]+u[0]*x+v[0]*y,a[1]+u[1]*x+v[1]*y] as Pt);}
function filled(p:GenPart,c:Contour){return differenceShapes([positive(c)],contours(p)).reduce((s,q)=>s+q.area,0)<.01;}
function replace(p:GenPart,cs:Contour[]):GenPart|null{const s=unionShapes(cs);return s.length===1&&s[0].area>1?{...p,outer:s[0].outer,holes:s[0].holes}:null;}
function cut(p:GenPart,c:Contour):GenPart|null{return replace(p,shapeContours(differenceShapes(contours(p),[positive(c)])));}
function toolpathOverlap(p:GenPart,c:Contour){
 const cross=(a:Pt,b:Pt,d:Pt)=>(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
 const intersects=(a:Pt,b:Pt,d:Pt,e:Pt)=>Math.max(a[0],b[0])>=Math.min(d[0],e[0])&&Math.max(d[0],e[0])>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])>=Math.min(d[1],e[1])&&Math.max(d[1],e[1])>=Math.min(a[1],b[1])&&cross(a,b,d)*cross(a,b,e)<=0&&cross(d,e,a)*cross(d,e,b)<=0;
 return [...p.cuts??[],...p.score??[],...p.engrave??[]].some(line=>line.some(pt=>pointInContour(pt,c))||line.some((pt,i)=>i>0&&c.some((q,k)=>intersects(line[i-1],pt,q,c[(k+1)%c.length]))))||(p.engrave??[]).some(line=>line.length>=3&&c.some(pt=>pointInContour(pt,line)));
}
function connectedGroups(parts:GenPart[],joints:PhotoJoint[]){
 const sets=parts.map(p=>new Set([p.id]));for(const j of joints){const a=sets.find(s=>s.has(j.a))!,b=sets.find(s=>s.has(j.b))!;if(a!==b){for(const id of b)a.add(id);sets.splice(sets.indexOf(b),1);}}
 return sets;
}
/** Deterministic, nominal-mm joinery. Kerf is deliberately absent: the shared exporter applies it once.
 * Only observed geometric contact is eligible. No snapping of detached parts, invented supports or
 * changes to a reference silhouette. Skipped contacts remain visible in the assembly report.
 */
export function engineerJoinery(input:GenPart[],settings:JoinerySettings):{parts:GenPart[];report:JoineryReport}{
 const parts=input.map(p=>({...p})),joints:PhotoJoint[]=[],warnings:string[]=[];
 const report:JoineryReport={joints,unconnected:[],groups:input.length,warnings,clearance:settings.clearance};
 if(settings.mode==='off')return {parts,report};
 if(![settings.clearance,settings.tabWidth,settings.spacing,settings.minWeb].every(Number.isFinite)||settings.clearance<0||settings.clearance>1||settings.tabWidth<2||settings.tabWidth>8||settings.spacing<6||settings.spacing>30||settings.minWeb<.5||settings.minWeb>3)throw Error('Invalid automatic joinery settings');
 if(parts.length>160||parts.some(p=>!p.place?.m||p.place.m.length!==12||!p.t))throw Error('Joinery needs bounded flat parts with assembly transforms and thickness');
 const insertions=new Map<string,V>();
 const compatible=(id:string,d:V)=>!insertions.has(id)||dot(insertions.get(id)!,d)>.999;
 const register=(kind:PhotoJoint['kind'],a:GenPart,b:GenPart,at:V,slotWidth:number,depth:number,instruction:string,mateSlotWidth?:number)=>joints.push({id:'J'+String(joints.length+1).padStart(3,'0'),kind,a:a.id,b:b.id,at,slotWidth,depth,instruction,mateSlotWidth});
 const bounds=(p:GenPart)=>{const result=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];for(const [x,y] of p.outer)for(const t of [0,p.t!]){const v=partWorld(p,x,y,t);for(let k=0;k<3;k++){result[k][0]=Math.min(result[k][0],v[k]);result[k][1]=Math.max(result[k][1],v[k]);}}return result;};
 const boxes=input.map(bounds); // Original contacts only; newly added tabs must not create new candidates.
 let contacts=0;
 pairs: for(let ai=0;ai<parts.length;ai++)for(let bi=ai+1;bi<parts.length;bi++){
  if(joints.length>=480){warnings.push('Automatic joint limit reached; review remaining contacts.');break pairs;}
  const a=parts[ai],b=parts[bi],na=normal(a),nb=normal(b),alignment=Math.abs(dot(na,nb));
  // Reject distant pairs before any polygon work, including repeated rib arrays.
  const ba=boxes[ai],bb=boxes[bi];if(ba.some(([lo,hi],k)=>lo>bb[k][1]+.01||hi<bb[k][0]-.01))continue;
  if(++contacts>1200){warnings.push('Contact complexity limit reached; review remaining parts.');break pairs;}
  if(alignment>.99999){
   const z=local(a,partWorld(b,0,0))[2],end=z+dot(na,nb)*b.t!;
   if(Math.min(Math.abs(Math.min(z,end)-a.t!),Math.abs(Math.max(z,end)))>.01)continue;
   const projected=contours(b).map(c=>c.map(([x,y])=>local(a,partWorld(b,x,y)).slice(0,2) as Pt));
   const overlap=intersectShapes(contours(a),projected);
   if(overlap.reduce((s,p)=>s+p.area,0)>=9*Math.max(a.t!,b.t!)**2)register('glue',a,b,partWorld(a,overlap[0].outer[0][0],overlap[0].outer[0][1],a.t!),0,0,`Align ${a.name} and ${b.name} face to face and bond with a suitable adhesive; this is not a mechanical lock.`);
   continue;
  }
  if(alignment>1e-5)continue; // Angled joints need a distinct bevel/fastener construction.
  let joined=false;
  for(const [si,ri] of [[ai,bi],[bi,ai]]){
   const sender=parts[si],receiver=parts[ri],rn=normal(receiver),sn=normal(sender),t=sender.t!,rt=receiver.t!,web=settings.minWeb*Math.max(t,rt),length=settings.tabWidth*t;
   const ring=positive(sender.outer);
   for(let k=0;k<ring.length;k++){
    const start=ring[k],end=ring[(k+1)%ring.length],len=Math.hypot(end[0]-start[0],end[1]-start[1]);if(len<length+2*web)continue;
    const u:Pt=[(end[0]-start[0])/len,(end[1]-start[1])/len],v:Pt=[u[1],-u[0]];
    const outward=sub(partWorld(sender,v[0],v[1]),partWorld(sender,0,0));
    const direction=dot(outward,rn);if(Math.abs(direction)<.99999||!compatible(sender.id,outward))continue;
    const c0=local(receiver,partWorld(sender,start[0],start[1])),c1=local(receiver,partWorld(sender,end[0],end[1]));
    const face=direction>0?0:rt;
    if(Math.abs(c0[2]-face)>.01||Math.abs(c1[2]-face)>.01)continue;
    const step=Math.max(length+2*web,settings.spacing*t),n=Math.max(1,Math.floor((len-2*web+step-length)/step));
    for(let q=0;q<Math.min(n,32);q++){
     if(joints.length>=480)break;
     const center=len/2+(q-(n-1)/2)*step,l=center-length/2,r=center+length/2;
     const root=rectangle(start,u,v,l-web,r+web,-Math.max(t,web),-.005);
     if(!filled(parts[si],root))continue;
     const tab=rectangle(start,u,v,l,r,-.02,rt);
     const pos:Pt=[start[0]+u[0]*center,start[1]+u[1]*center];
     const pc=local(receiver,partWorld(sender,pos[0],pos[1],t/2)),ru=local(receiver,add(partWorld(sender,pos[0],pos[1],t/2),sub(partWorld(sender,u[0],u[1]),partWorld(sender,0,0))));
     const rv=local(receiver,add(partWorld(sender,pos[0],pos[1],t/2),sn));
     const x:Pt=[ru[0]-pc[0],ru[1]-pc[1]],y:Pt=[rv[0]-pc[0],rv[1]-pc[1]],p:Pt=[pc[0],pc[1]],c=settings.clearance/2;
     const slot=rectangle(p,x,y,-length/2-c,length/2+c,-t/2-c,t/2+c);
     const margin=rectangle(p,x,y,-length/2-c-web,length/2+c+web,-t/2-c-web,t/2+c+web);
     if(!filled(parts[ri],margin)||toolpathOverlap(parts[ri],slot))continue;
     const nextS=replace(parts[si],[...contours(parts[si]),positive(tab)]),nextR=cut(parts[ri],slot);
     if(!nextS||!nextR||nextR.holes.length!==parts[ri].holes.length+1)continue;
     parts[si]=nextS;parts[ri]=nextR;insertions.set(sender.id,outward);joined=true;
     register('tab-slot',sender,receiver,partWorld(sender,pos[0],pos[1],t/2),t+settings.clearance,rt,`Insert tabs of ${sender.name} into ${receiver.name}; nominal slot ${Number((t+settings.clearance).toFixed(3))} mm for ${t} mm stock. Dry-fit before bonding.`);
    }
   }
  }
  if(joined)continue;
  // Intersecting perpendicular sheets: complementary edge-open half laps use ONE shared world line.
  const pa=partWorld(a,0,0,a.t!/2),pb=partWorld(b,0,0,b.t!/2);
  const origin=add(mul(na,dot(na,pa)),mul(nb,dot(nb,pb)));let d=cross(na,nb);
  if(d.find(v=>Math.abs(v)>1e-5)!<0)d=mul(d,-1);
  const spans=(p:GenPart)=>{
   const p0=local(p,origin),p1=local(p,add(origin,d)),u:Pt=[p1[0]-p0[0],p1[1]-p0[1]],v:Pt=[-u[1],u[0]],hits:number[]=[];
   for(const c of [p.outer,...p.holes])for(let i=0;i<c.length;i++){
    const q=c[i],r=c[(i+1)%c.length],a=(q[0]-p0[0])*v[0]+(q[1]-p0[1])*v[1],b=(r[0]-p0[0])*v[0]+(r[1]-p0[1])*v[1];
    if((a<0)===(b<0)||Math.abs(a-b)<1e-8)continue;
    const f=a/(a-b);hits.push((q[0]+f*(r[0]-q[0])-p0[0])*u[0]+(q[1]+f*(r[1]-q[1])-p0[1])*u[1]);
   }
   hits.sort((a,b)=>a-b);const ranges:[number,number][]=[];
   for(let i=1;i<hits.length;i++){const mid=(hits[i-1]+hits[i])/2;if(pointInShape([p0[0]+u[0]*mid,p0[1]+u[1]*mid],shape(p)))ranges.push([hits[i-1],hits[i]]);}
   return {p0:p0.slice(0,2) as Pt,u,v,ranges};
  };
  const sa=spans(a),sb=spans(b),web=settings.minWeb*Math.max(a.t!,b.t!);
  const overlap=sa.ranges.flatMap(ar=>sb.ranges.map(br=>({ar,br,lo:Math.max(ar[0],br[0]),hi:Math.min(ar[1],br[1])}))).find(q=>q.hi-q.lo>6*Math.max(a.t!,b.t!));
  if(!overlap)continue;
  const mid=(overlap.lo+overlap.hi)/2,c=settings.clearance/2;
  for(const sign of [1,-1]){
   if(!compatible(a.id,mul(d,sign))||!compatible(b.id,mul(d,-sign)))continue;
   const rangeA=sign===1?[overlap.ar[0]-1,mid+c]:[mid-c,overlap.ar[1]+1],rangeB=sign===1?[mid-c,overlap.br[1]+1]:[overlap.br[0]-1,mid+c];
   const ca=rectangle(sa.p0,sa.u,sa.v,rangeA[0],rangeA[1],-b.t!/2-c,b.t!/2+c),cb=rectangle(sb.p0,sb.u,sb.v,rangeB[0],rangeB[1],-a.t!/2-c,a.t!/2+c);
   // Material on both shoulders and at the closed end must survive. No new cuts through engraving.
   const shoulders=(p:GenPart,s:typeof sa,width:number,lo:number,hi:number)=>[-1,1].every(side=>filled(p,rectangle(s.p0,s.u,s.v,lo,hi,side*(width/2+c)+(side<0?-web:0),side*(width/2+c)+(side>0?web:0))));
   if(!shoulders(a,sa,b.t!,overlap.lo+web,overlap.hi-web)||!shoulders(b,sb,a.t!,overlap.lo+web,overlap.hi-web)||toolpathOverlap(a,ca)||toolpathOverlap(b,cb))continue;
   const nextA=cut(a,ca),nextB=cut(b,cb);if(!nextA||!nextB||area(contours(nextA))<.35*area(contours(a))||area(contours(nextB))<.35*area(contours(b)))continue;
   // A half-lap must open through each exterior edge, not stop inside an existing window.
   if(Math.abs(signedArea(nextA.outer))>=Math.abs(signedArea(a.outer))-.01||Math.abs(signedArea(nextB.outer))>=Math.abs(signedArea(b.outer))-.01)continue;
   parts[ai]=nextA;parts[bi]=nextB;insertions.set(a.id,mul(d,sign));insertions.set(b.id,mul(d,-sign));
   register('cross-lap',a,b,add(origin,mul(d,mid)),b.t!+settings.clearance,overlap.hi-overlap.lo,`Slide the open half-laps of ${a.name} and ${b.name} together to their shared midpoint. Each slot follows the other part's thickness.`,a.t!+settings.clearance);break;
  }
 }
 const groups=connectedGroups(parts,joints);report.groups=groups.length;report.unconnected=groups.filter(s=>s.size===1&&parts.length>1).flatMap(s=>[...s]);
 if(groups.length>1)warnings.push(`${groups.length} separate assemblies remain. Hidden, angled, moving or detached connections require review; no joint is invented across a gap.`);
 if(joints.some(j=>j.kind==='glue'))warnings.push('Face contacts marked glue require adhesive and clamping; they are not self-locking.');
 if(joints.length)warnings.push('Nominal joint geometry checked. Test the selected total clearance on measured stock; assembly access and load capacity are not physically verified.');
 return {parts,report};
}
