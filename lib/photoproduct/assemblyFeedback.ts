import type {GenOutput,GenPart} from '@/lib/generators/types';
import {partWorld} from './joinery';

/** Bounded, measured CAD evidence for the model reviewer. Never trust prose about fit. */
export function assemblyFeedback(out:GenOutput){
 const round=(n:number)=>Number(n.toFixed(2));
 const measure=(p:GenPart)=>{
  const bounds=Array.from({length:3},()=>[Infinity,-Infinity]);
  for(const [x,y] of p.outer)for(const z of [0,p.t!]){
   const world=partWorld(p,x,y,z);
   for(let k=0;k<3;k++){bounds[k][0]=Math.min(bounds[k][0],world[k]);bounds[k][1]=Math.max(bounds[k][1],world[k]);}
  }
  return {id:p.id,thickness:p.t,origin:partWorld(p,0,0).map(round),normal:[2,6,10].map(k=>round(p.place!.m![k])),bounds:bounds.map(a=>a.map(round))};
 };
 const all=out.parts.map(measure),byGroup=new Map<string,typeof all>();
 for(const p of all){const id=p.id.replace(/-\d+$/,'');const group=byGroup.get(id)??[];group.push(p);byGroup.set(id,group);}
 const samples=[...byGroup.values()].flatMap(group=>[...new Set([0,Math.floor(group.length/2),group.length-1])].map(i=>group[i])).slice(0,30);
 const joints=out.joinery?.joints??[];
 return {units:'mm',boundsAxes:'[[minX,maxX],[minY,maxY],[minZ,maxZ]]',actualSize:[0,1,2].map(k=>round(Math.max(...all.map(p=>p.bounds[k][1]))-Math.min(...all.map(p=>p.bounds[k][0])))),partCount:all.length,pairedJoints:joints.filter(j=>j.kind!=='glue').length,glueContacts:joints.filter(j=>j.kind==='glue').length,groups:out.joinery?.groups??all.length,unconnected:out.joinery?.unconnected.slice(0,40)??[],samples};
}

/** A revision may not hide unresolved construction behind a cosmetic change. */
export function revisionPreservesAssembly(before:GenOutput,after:GenOutput){
 const a=before.joinery,b=after.joinery;
 if(!a||!b)return true;
 const mechanical=(out:GenOutput)=>out.joinery!.joints.filter(j=>j.kind!=='glue').length;
 if(mechanical(before)>0&&mechanical(after)===0)return false;
 if(a.groups===1&&b.groups>1)return false;
 // Penalize the fraction of disconnected components, allowing a legitimate change of rib count.
 return (b.groups-1)/Math.max(1,after.parts.length-1)<=(a.groups-1)/Math.max(1,before.parts.length-1)+.001;
}
