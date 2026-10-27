import type {Contour,GenPart,Pt} from '@/lib/generators/types';
import {differenceShapes,intersectShapes,signedArea} from '@/lib/letters/polygon';
import {bboxOf,rect} from '@/lib/generators/geom';
import {strokeText} from '@/lib/parametric/label';
import {partWorld,toolpathOverlap,type JoinerySettings,type JoineryReport,type PhotoJoint} from './joinery';

const positive=(c:Contour):Contour=>signedArea(c)<0?[...c].reverse():c;
const loops=(p:GenPart)=>[positive(p.outer),...p.holes.map(h=>[...positive(h)].reverse())];
const local=(p:GenPart,y:number,z:number):Pt=>{const m=p.place!.m!,dy=y-m[7],dz=z-m[11];return [m[4]*dy+m[8]*dz,m[5]*dy+m[9]*dz];};
const box=(x0:number,y0:number,x1:number,y1:number)=>rect(x0,y0,x1-x0,y1-y0);
const ribBox=(p:GenPart,y0:number,y1:number,z0:number,z1:number)=>[[y0,z0],[y1,z0],[y1,z1],[y0,z1]].map(([y,z])=>local(p,y,z));
const filled=(p:GenPart,c:Contour)=>differenceShapes([positive(c)],loops(p)).reduce((s,q)=>s+q.area,0)<.01;
function subtract(p:GenPart,cuts:Contour[]):GenPart{
 if(cuts.some(c=>toolpathOverlap(p,c)))throw Error(`Support slot overlaps a toolpath on ${p.name}.`);
 const s=differenceShapes(loops(p),cuts.map(positive));
 if(s.length!==1||s[0].area<1)throw Error(`Support slots disconnect ${p.name}; increase the rib wall width.`);
 return {...p,outer:s[0].outer,holes:s[0].holes};
}
/** First material interval above the exterior bottom at world Y. Holes are retained. */
function bottomSpan(projected:Contour[],y:number):[number,number]|null{
 const hits:number[]=[];
 for(const c of projected)for(let i=0;i<c.length;i++){
  const a=c[i],b=c[(i+1)%c.length];
  if((a[0]<y)===(b[0]<y)||Math.abs(a[0]-b[0])<1e-9)continue;
  hits.push(a[1]+(y-a[0])/(b[0]-a[0])*(b[1]-a[1]));
 }
 hits.sort((a,b)=>a-b);
 if(hits.length<2)return null;
 return [hits[0],hits[1]];
}
type Station={p:GenPart;x:number;lo:number;hi:number;mid:number};
const yzLoops=(p:GenPart)=>loops(p).map(loop=>loop.map(pt=>{const w=partWorld(p,...pt);return [w[1],w[2]] as Pt;}));
/** Exact orthogonal-slab intersections: all remaining rail material must lie BELOW the rib.
 * This proves non-interference for the entire positive-Z insertion sweep, not just a few frames.
 */
export function verifyRibInsertion(ribs:GenPart[],rails:GenPart[],clearance:number):number{
 let smallest=Infinity;
 for(const rib of ribs)for(const rail of rails){
  const x=rib.place!.m![3],rb=bboxOf([rail.outer]);if(rb.x1<=x||rb.x0>=x+rib.t!)continue;
  const y=rail.place!.m![7];
  const r=intersectShapes(yzLoops(rib),[box(y-rail.t!, -10000,y,10000)]);
  const s=intersectShapes(loops(rail),[box(x,-10000,x+rib.t!,10000)]);
  if(!r.length||!s.length)continue;
  const gap=Math.min(...r.map(p=>p.bbox.y0))-Math.max(...s.map(p=>p.bbox.y1));
  if(gap<clearance-.02)throw Error(`Insertion interference between ${rib.id} and ${rail.id}; geometry not exported.`);
  smallest=Math.min(smallest,gap);
 }
 for(let a=0;a<rails.length;a++)for(let b=a+1;b<rails.length;b++){
  const p=rails[a],q=rails[b],py=p.place!.m![7],qy=q.place!.m![7];
  if(Math.min(py,qy)-Math.max(py-p.t!,qy-q.t!)<=.001)continue;
  if(intersectShapes(loops(p),loops(q)).reduce((s,p)=>s+p.area,0)>.01)throw Error('Support sections overlap as solids.');
 }
 if(!Number.isFinite(smallest))throw Error('No supported insertion path found.');
 return smallest;
}

/** Optional construction, not photo recognition. Original rib poses/outer silhouettes stay fixed.
 * Two curved tracks follow the actual lower material band. Each track is side-lapped into
 * sheet-sized sections; all rib slots open downward, so one downward insertion seats both tracks.
 */
export function engineerRibSupports(input:GenPart[],settings:JoinerySettings):{parts:GenPart[];report:JoineryReport}{
 const c=settings.clearance,t=input[0]?.t??0,web=settings.minWeb*t,maxLength=settings.railLength??500;
 if(input.length<4||input.length>128||!Number.isFinite(c)||c<0||c>1||!Number.isFinite(web)||web<t*.5||web>3*t||!Number.isFinite(maxLength)||maxLength<100||maxLength>2000)throw Error('Curved supports need 4–128 parallel ribs and valid fit settings.');
 if(input.some(p=>!p.place?.m||!p.t||Math.abs(p.t-t)>.001||Math.abs(p.place.m[2]-1)>1e-6||Math.abs(p.place.m[6])>1e-6||Math.abs(p.place.m[10])>1e-6))throw Error('Curved supports require equal-thickness ribs normal to +X; keep their in-plane twists.');
 const ribs=[...input].sort((a,b)=>a.place!.m![3]-b.place!.m![3]),xs=ribs.map(p=>p.place!.m![3]+t/2);
 if(xs.some((x,i)=>i>0&&x-xs[i-1]<t+c+web))throw Error('Ribs are too close for support slots and the minimum web. Increase length or reduce rib count.');
 const margin=t/2+c/2+web,capacity=Math.floor((maxLength-2*margin)/Math.max(...xs.slice(1).map((x,i)=>x-xs[i])))+1;
 if(capacity<4)throw Error('Maximum rail length is too small for an overlapping four-rib section.');
 const chunks:{start:number;end:number}[]=[];
 for(let start=0;start<ribs.length;){const end=Math.min(ribs.length-1,start+capacity-1);chunks.push({start,end});if(end===ribs.length-1)break;start=end-1;}
 if(input.length+chunks.length*2>160)throw Error('The ribs and support sections exceed the 160-part budget. Increase maximum rail length.');
 const bounds=ribs.map(p=>bboxOf([p.outer.map(([x,y])=>{const w=partWorld(p,x,y);return [w[1],w[2]] as Pt;})]));
 const projected=ribs.map(yzLoops);
 const lanes=ribs.map((_,i)=>chunks.flatMap((q,k)=>i>=q.start&&i<=q.end?[chunks.length===1?0:(k%2===0?-t/2:t/2)]:[]));
 const half=t+c/2+web,low=Math.max(...bounds.map(b=>b.x0))+half,high=Math.min(...bounds.map(b=>b.x1))-half;
 const candidates:{y:number;stations:Station[];score:number}[]=[];
 for(let k=1;k<48;k++){
  const y=low+(high-low)*k/48,stations:Station[]=[];
  for(let i=0;i<ribs.length;i++){
   const p=ribs[i],left=y+Math.min(...lanes[i])-t/2-c/2-web,right=y+Math.max(...lanes[i])+t/2+c/2+web,samples=[left,(left+right)/2,right];
   // Piecewise-linear contour extrema occur at ends or vertex Ys. Include topology transitions.
   for(const loop of projected[i])for(const pt of loop){const v=pt[0];if(v>left&&v<right)samples.push(v-1e-5,v+1e-5);}
   const spans=samples.map(v=>bottomSpan(projected[i],v));if(spans.some(s=>!s))break;
   const lo=Math.max(...spans.map(s=>s![0])),hi=Math.min(...spans.map(s=>s![1])),mid=(lo+hi)/2;
   if(hi-lo<2*web+c+2||!filled(p,ribBox(p,left,right,mid+c/2,mid+c/2+web)))break;
   stations.push({p,x:xs[i],lo,hi,mid});
  }
  if(stations.length===ribs.length)candidates.push({y,stations,score:stations.reduce((s,q)=>s+q.lo,0)/ribs.length});
 }
 const pairs=candidates.flatMap((a,i)=>candidates.slice(i+1).filter(b=>b.y-a.y>Math.max(2*half+web,(high-low)*.25)).map(b=>({a,b,score:a.score+b.score})));
 const best=pairs.sort((a,b)=>a.score-b.score)[0];
 if(!best)throw Error('No two continuous support tracks have enough solid material. Increase the rib wall width or reduce the minimum web; original geometry is preserved.');
 const ribCuts=new Map<string,Contour[]>(),rails:GenPart[]=[],joints:PhotoJoint[]=[];
 if(new Set(input.map(p=>p.id)).size!==input.length||input.some(p=>/^support-\d+-\d+$/.test(p.id)))throw Error('Support assembly needs unique rib IDs without the reserved support prefix.');
 const addJoint=(a:string,b:string,kind:PhotoJoint['kind'],at:[number,number,number],depth:number,instruction:string)=>joints.push({id:'J'+String(joints.length+1).padStart(3,'0'),kind,a,b,at,slotWidth:kind==='glue'?0:t+c,mateSlotWidth:kind==='glue'?undefined:t+c,depth,instruction});
 for(const [track,choice] of [best.a,best.b].entries()){
  const previous:GenPart[]=[];
  for(const [section,chunk] of chunks.entries()){
   const stations=choice.stations.slice(chunk.start,chunk.end+1),lane=chunks.length===1?0:(section%2===0?-t/2:t/2),y=choice.y+lane;
   const x0=stations[0].x-margin,x1=stations.at(-1)!.x+margin;
   const lower:Contour=[],upper:Contour=[];
   // The profile is straight between ribs, with small flat lands around each slot.
   for(const [i,s] of stations.entries()){
    const h=Math.min(margin,i? (s.x-stations[i-1].x)/2:margin,i<stations.length-1?(stations[i+1].x-s.x)/2:margin);
    for(const x of [s.x-h,s.x+h]){lower.push([x,s.lo-1]);upper.push([x,s.hi]);}
   }
   lower[0][0]=upper[0][0]=x0;lower.at(-1)![0]=upper.at(-1)![0]=x1;
   const id=`support-${track+1}-${section+1}`,name=`${String(input.length+rails.length+1).padStart(2,'0')}-R${track+1}${String.fromCharCode(65+section)}`;
   const original:GenPart={id,name,t,stock:`wood-${t}mm`,outer:positive([...lower,...upper.reverse()]),holes:[],place:{x:0,y:y+t/2,z:0,m:[1,0,0,0,0,0,-1,y+t/2,0,1,0,0]}};
   const top=Math.max(...original.outer.map(p=>p[1]))+1,railCuts:Contour[]=[];
   for(const s of stations){
    const cut=ribBox(s.p,y-t/2-c/2,y+t/2+c/2,Math.min(...bounds.map(b=>b.y0))-1,s.mid+c/2);
    const list=ribCuts.get(s.p.id)??[];list.push(cut);ribCuts.set(s.p.id,list);
    railCuts.push(box(s.x-t/2-c/2,s.mid-c/2,s.x+t/2+c/2,top));
    addJoint(s.p.id,id,'cross-lap',[s.x,y,s.mid],s.hi-s.lo,`Lower ${s.p.name} vertically onto rail ${track+1}${String.fromCharCode(65+section)}. Bottom-open rib slot and top-open rail slot meet at Z=${s.mid.toFixed(3)} mm; ${t+c} mm nominal width. Bond after the complete dry-fit.`);
   }
   const rail=subtract(original,railCuts);
   rail.labelAvoidScore=true;
   for(const s of stations)if(!filled(rail,box(s.x-t/2-c/2,s.mid-c/2-web,s.x+t/2+c/2,s.mid-c/2-.01)))throw Error('A support slot leaves too little material below it. Increase rib wall width.');
   // Score the matching manifest number below each notch, inside its checked solid web.
   rail.score=stations.flatMap(s=>{
    const number=String(input.findIndex(p=>p.id===s.p.id)+1).padStart(2,'0');
    const height=Math.min(3,web*.5,(t+c)*.7/(number.length*5/6));
    return strokeText(number,height,s.x,s.mid-c/2-web/2);
   });
   if(previous.length){const prev=previous.at(-1)!,contact=intersectShapes(loops(prev),loops(rail));if(contact.reduce((sum,p)=>sum+p.area,0)<9*t*t)throw Error('The side-lap rail splice is too small to bond. Increase rail length or rib wall width.');
    addJoint(prev.id,id,'glue',[(stations[0].x+stations[1].x)/2,choice.y,(stations[0].mid+stations[1].mid)/2],0,`Bond overlapping faces of ${prev.name} and ${name}, using the two shared numbered ribs as alignment jigs. Keep slot mouths clear and clamp until the adhesive cures.`);
   }
   previous.push(rail);rails.push(rail);
  }
 }
 const parts=input.map(p=>subtract(p,ribCuts.get(p.id)??[])).concat(rails);
 for(const p of parts.slice(0,input.length))if(p.holes.length!==input.find(q=>q.id===p.id)!.holes.length)throw Error('Support slots reach an existing hole; increase the solid rib wall.');
 // Every rib is connected to both tracks; overlapping sections share two ribs and a glue face.
 const groups=[new Set([parts[0].id])];let changed=true;
 while(changed){changed=false;for(const j of joints)if(groups[0].has(j.a)!==groups[0].has(j.b)){groups[0].add(j.a);groups[0].add(j.b);changed=true;}}
 if(groups[0].size!==parts.length)throw Error('Support assembly has a disconnected part.');
 const insertionClearance=verifyRibInsertion(parts.slice(0,input.length),rails,c);
 const steps=[`01. Cut and identify ribs 01–${String(input.length).padStart(2,'0')} and the ${rails.length} numbered rail sections. Engrave labels and cut inner features before outer contours.`,
  `02. Use the actual ${t} mm stock to test a ${t+c} mm nominal slot. Clearance ${c} mm is total gap; apply kerf compensation only once.`,
  '03. Place track 1 and track 2 parallel on a temporary level jig. Match A/B section letters; alternating sections overlap side to side at two shared rib positions.',
  '04. First lower the ribs at each splice vertically onto BOTH tracks. The ribs set the track spacing and align the overlapping rail faces. Do not thread rails through closed holes.',
  '05. Bond the overlapping rail faces with suitable wood adhesive, keeping slot mouths clear. Clamp with the splice ribs temporarily in place and allow the adhesive to cure.',
  `06. Lower all remaining numbered ribs from above onto the matching numbers scored below the rail notches. There is one ${c} mm nominal vertical relief at each complementary half-lap. Dry-fit the full assembly before bonding.`,
  '07. Bond the rib joints after confirming both shoulders seat consistently. Support the assembly on a stable plinth or mount; it is a decorative sculpture, not load-rated seating.'];
 return {parts,report:{joints,groups:1,unconnected:[],clearance:c,supportPlan:{ribCount:input.length,railCount:rails.length,maxRailLength:Math.max(...rails.map(p=>{const b=bboxOf([p.outer]);return b.x1-b.x0;})),tracks:[best.a.y,best.b.y],insertionClearance,steps},warnings:[`Curved supports added: ${input.length} original ribs + ${rails.length} rail sections. Lower each rib onto both tracks from above; keep its original indexed X position.`,`Side-lapped rail sections require adhesive and clamping. Nominal clearances and insertion direction are checked; use measured stock and a fit coupon.`,`Decorative sculpture only: load capacity and physical assembly have not been certified. Do not use it as seating without structural validation.`]}};
}
