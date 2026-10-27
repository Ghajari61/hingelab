import type {GenOutput,GenPart,Contour} from '@/lib/generators/types';
import {partWorld} from './joinery';
type V=[number,number,number];
const dot=(a:V,b:V)=>a.reduce((s,n,i)=>s+n*b[i],0);
const views:{name:string;x:V;y:V;depth:V}[]=[
 {name:'FRONT · X / Z',x:[1,0,0],y:[0,0,-1],depth:[0,1,0]},
 {name:'SIDE · Y / Z',x:[0,1,0],y:[0,0,-1],depth:[-1,0,0]},
 {name:'TOP · X / Y',x:[1,0,0],y:[0,1,0],depth:[0,0,1]},
 {name:'ASSEMBLED · ISOMETRIC',x:[.7071,-.7071,0],y:[.4082,.4082,-.8165],depth:[.5774,.5774,.5774]},
];
/** Actual generated contour/pose projections, not an illustrative image or a product template. */
export function reviewViewsSVG(out:GenOutput):string{
 if(out.error||!out.parts.length||out.parts.length>160)throw Error('No bounded assembly to review');
 type Face={loops:V[][];shade:string;depth?:number};
 const faces:Face[]=[];let vertices=0;
 for(const p of out.parts){
  if(!p.place?.m||!p.t)throw Error('Missing assembly placement');
  const world=(c:Contour,t:number)=>c.map(([x,y])=>partWorld(p,x,y,t));
  const closed=(p:GenPart,t:number)=>[p.outer,...p.holes].map(c=>world(c,t));
  faces.push({loops:closed(p,0),shade:'#c89c63'},{loops:closed(p,p.t),shade:'#dfbd89'});
  for(const c of [p.outer,...p.holes])for(let i=0;i<c.length;i++){
   const a=c[i],b=c[(i+1)%c.length];faces.push({loops:[world([a,b],0).concat(world([b,a],p.t))],shade:'#ac804e'});
  }
  vertices+=p.outer.length+p.holes.reduce((s,h)=>s+h.length,0);if(vertices>100000)throw Error('Review geometry limit');
 }
 const panels=views.map((view,i)=>{
  let loX=Infinity,hiX=-Infinity,loY=Infinity,hiY=-Infinity;
  for(const f of faces)for(const c of f.loops)for(const v of c){const x=dot(v,view.x),y=dot(v,view.y);loX=Math.min(loX,x);hiX=Math.max(hiX,x);loY=Math.min(loY,y);hiY=Math.max(hiY,y);}
  const scale=Math.min(424/Math.max(1,hiX-loX),292/Math.max(1,hiY-loY));
  const ox=(480-(hiX-loX)*scale)/2,oy=48+(292-(hiY-loY)*scale)/2;
  const xy=(v:V)=>[(dot(v,view.x)-loX)*scale+ox,(dot(v,view.y)-loY)*scale+oy].map(n=>n.toFixed(2)).join(',');
  const ordered=faces.map(f=>({...f,depth:f.loops[0].reduce((s,v)=>s+dot(v,view.depth),0)/f.loops[0].length})).sort((a,b)=>a.depth-b.depth);
  const paths=ordered.map(f=>`<path d="${f.loops.map(c=>'M'+c.map(xy).join('L')+'Z').join('')}" fill="${f.shade}" fill-rule="evenodd" stroke="#6d5033" stroke-width=".45"/>`).join('');
  return `<g transform="translate(${i%2*480} ${Math.floor(i/2)*380})"><rect x="1" y="1" width="478" height="378" rx="12" fill="#f4f3f0"/><text x="20" y="29" font-family="sans-serif" font-size="14" fill="#333">${view.name}</text>${paths}<text x="20" y="366" font-family="sans-serif" font-size="12" fill="#555">${(hiX-loX).toFixed(1)} × ${(hiY-loY).toFixed(1)} mm · ${out.parts.length} parts</text></g>`;
 });
 return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="760" viewBox="0 0 960 760">${panels.join('')}</svg>`;
}
