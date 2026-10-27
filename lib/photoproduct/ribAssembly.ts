import type {Contour,GenOutput,GenPart} from '@/lib/generators/types';
import {intersectShapes,signedArea} from '@/lib/letters/polygon';
import {partWorld} from './joinery';

export interface GluePatch {jointId:string;hostId:string;kind:'splice'|'slot';outer:Contour;holes:Contour[];matrix:number[]}
export interface RibAssemblyStep {kind:'prepare'|'place'|'cure'|'finish';title:string;instruction:string;partId?:string;glue:string[];pause?:boolean}
export interface RibAssemblyPlan {parts:{id:string;number:number;name:string}[];steps:RibAssemblyStep[];patches:GluePatch[];rise:number}
const rect=(x0:number,y0:number,x1:number,y1:number):Contour=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const positive=(c:Contour):Contour=>signedArea(c)<0?[...c].reverse():c;
const loops=(p:GenPart)=>[positive(p.outer),...p.holes.map(h=>[...positive(h)].reverse())];

/** A presentation plan derived from the checked construction. Never edits fabrication geometry. */
export function ribAssemblyPlan(out:GenOutput):RibAssemblyPlan|null{
 const report=out.joinery,support=report?.supportPlan;
 if(out.error||!report||!support||report.groups!==1||report.unconnected.length||out.parts.length!==support.ribCount+support.railCount)return null;
 const ribs=out.parts.slice(0,support.ribCount),rails=out.parts.slice(support.ribCount),byId=new Map(out.parts.map(p=>[p.id,p]));
 if(!rails.every(p=>p.id.startsWith('support-')&&p.place?.m)||!ribs.every(p=>p.place?.m))return null;
 if(report.joints.some(j=>!byId.has(j.a)||!byId.has(j.b)))return null;
 const patches:GluePatch[]=[];
 for(const j of report.joints){
  if(j.kind==='glue'){
   const a=byId.get(j.a)!,b=byId.get(j.b)!;
   const face=(a.place!.m![7]+b.place!.m![7]-(a.t!+b.t!)/2)/2;
   for(const s of intersectShapes(loops(a),loops(b)))patches.push({jointId:j.id,hostId:a.id,kind:'splice',outer:s.outer,holes:s.holes,matrix:[1,0,0,0,0,0,1,face,0,1,0,0]});
  }else if(j.kind==='cross-lap'){
   const rail=byId.get(j.b)!;if(!rails.includes(rail))return null;
   const [x,y,z]=j.at,w=j.slotWidth/2,t=rail.t!/2,floor=z-report.clearance/2,top=z+j.depth/2;
   const base={jointId:j.id,hostId:rail.id,kind:'slot' as const,holes:[]};
   patches.push({...base,outer:rect(x-w,y-t,x+w,y+t),matrix:[1,0,0,0,0,1,0,0,0,0,1,floor]});
   for(const edge of [x-w,x+w])patches.push({...base,outer:rect(y-t,floor,y+t,top),matrix:[0,0,1,edge,1,0,0,0,0,1,0,0]});
  }else return null;
 }
 const parts=out.parts.map((p,i)=>({id:p.id,number:i+1,name:p.name}));
 const steps:RibAssemblyStep[]=[{kind:'prepare',title:'Prepare and dry-fit first',instruction:'Match the engraved part numbers to this guide. Measure the stock and test the slot fit. Dry-fit the complete set without adhesive first; this walkthrough shows the final bonding sequence. Keep the rails supported on a level temporary jig.',glue:[]}];
 // A sections of BOTH tracks first, then their adjacent side-lapped successors.
 const orderedRails=[...rails].sort((a,b)=>Number(a.id.split('-')[2])-Number(b.id.split('-')[2])||Number(a.id.split('-')[1])-Number(b.id.split('-')[1]));
 for(const rail of orderedRails){
  const glue=report.joints.filter(j=>j.kind==='glue'&&j.b===rail.id).map(j=>j.id);
  steps.push({kind:'place',partId:rail.id,title:`Position rail ${rail.name}`,instruction:glue.length?'Apply a thin coat of wood adhesive to the cyan overlapping face, then position this section beside its matching rail. Keep the slot mouths clear. Hold the faces together on the temporary jig.':'Place this rail on the temporary jig at its shown position. Keep both tracks parallel; the numbered ribs will set their exact spacing.',glue});
 }
 const shared=ribs.filter(p=>report.joints.filter(j=>j.kind==='cross-lap'&&j.a===p.id).length>2);
 const anchors=shared.length?shared:[ribs[0],ribs.at(-1)!];
 const addRib=(rib:GenPart,anchor:boolean)=>steps.push({kind:'place',partId:rib.id,title:`Seat rib ${String(out.parts.indexOf(rib)+1).padStart(2,'0')}${anchor?' · alignment':''}`,instruction:`Apply a thin coat to the highlighted slot shoulders and mating rib notches. Lower ${rib.name} straight down onto BOTH tracks; match the engraved notch numbers.${anchor?' This rib aligns the overlapping rail sections.':''} Seat both shoulders without forcing the wood.`,glue:report.joints.filter(j=>j.kind==='cross-lap'&&j.a===rib.id).map(j=>j.id)});
 anchors.forEach(p=>addRib(p,true));
 steps.push({kind:'cure',title:'Clamp and let the adhesive cure',instruction:'Check alignment and clamp the bonded rail faces and alignment ribs. Keep all other slot mouths clear. Follow the adhesive manufacturer’s curing time. Playback stops here: animation time is not curing time. Continue only when the support frame is stable.',glue:[],pause:true});
 ribs.filter(p=>!anchors.includes(p)).forEach(p=>addRib(p,false));
 steps.push({kind:'finish',title:`${parts.length}-piece assembly complete`,instruction:'Confirm all numbered ribs are fully seated and let every joint cure. Use Glue zones to review the bonding locations. Support or mount the sculpture securely; this guide does not certify seating strength.',glue:[]});
 const zs=out.parts.flatMap(p=>p.outer.map(([u,v])=>partWorld(p,u,v)[2]));
 return {parts,steps,patches,rise:Math.max(60,(Math.max(...zs)-Math.min(...zs))*.35)};
}

/** progress is local to a step. The first quarter exposes glue before the part descends. */
export function ribAssemblyFrame(plan:RibAssemblyPlan,index:number,progress:number){
 const i=Math.min(plan.steps.length-1,Math.max(0,Math.floor(Number.isFinite(index)?index:0))),step=plan.steps[i];
 const seated=new Set(plan.steps.slice(0,i).flatMap(s=>s.partId?[s.partId]:[]));
 const k=Math.min(1,Math.max(0,((Number.isFinite(progress)?progress:0)-.25)/.75)),ease=k*k*(3-2*k);
 return plan.parts.map(p=>({...p,active:p.id===step.partId,seated:seated.has(p.id)||(p.id===step.partId&&k===1),lift:p.id===step.partId?plan.rise*(1-ease):0,overview:step.kind==='prepare'}));
}
