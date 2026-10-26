import { differenceShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, circle, ellipse, rect, pointInContour } from "../geom";
import { orient, shapeOutline } from "../shapes";
import { motif } from "../motifs";
import { textBlock } from "../weld";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import type { KeychainParams } from "./params";
const closed=(c:Contour):Contour=>[...c,c[0]];
export function buildKeychain(p:KeychainParams,ctx:BuildContext):GenOutput {
  const fail=(error:string):GenOutput=>({parts:[],stats:[],error});
  const W=p.width,H=p.height, base=orient(shapeOutline(p.shape,W,H,p.corner));
  const r=p.ring.diameter/2, R=r+p.ring.wall;
  // Find the actual edge at the attachment centre; curved and concave bodies need a real overlap.
  const top=p.ring.side==="top", right=p.ring.side==="right";
  let edge=0;
  for(let i=0;i<=1000;i++) {
    const v=i/1000*(top?H:W),pt:Pt=top?[W/2,v]:[right?W-v:v,H/2];
    if(pointInContour(pt,base)){edge=top?pt[1]:pt[0];break;}
  }
  const cx=top?W/2:edge+(right?R*.6:-R*.6),cy=top?edge-R*.6:H/2;
  const neck=top?rect(cx-p.ring.wall,cy,2*p.ring.wall,Math.max(R, H/2-cy)):
    rect(Math.min(cx,W/2),cy-p.ring.wall,Math.abs(cx-W/2),2*p.ring.wall);
  const shapes=unionShapes([base,orient(circle(cx,cy,R)),orient(neck)]);
  if(shapes.length!==1)return fail("The ring attachment cannot join this shape. Choose another shape or a wider body.");
  const outer=shapes[0].outer,hole=orient(ellipse(cx,cy,r,r,96));
  if(!hole.every(pt=>pointInContour(pt,outer)))return fail("The ring hole needs more surrounding material.");
  const missing:string[]=[];
  const title=textBlock(ctx,p.text.name,p.text.fontId,p.text.size,{spacing:p.text.spacing,missing});
  const sub=textBlock(ctx,p.text.subtitle,p.text.fontId,p.text.size*.42,{missing});
  if(title.loading||sub.loading)return {parts:[],stats:[],notice:"Loading the font."};
  if(missing.length)return fail("This font cannot draw: "+missing.join(" ")+". Choose a font that supports your text.");
  const content:Contour[]=[...title.contours];
  if(sub.contours.length)content.push(...sub.contours.map(c=>c.map(([x,y])=>[x,y+title.height/2+3+sub.height/2] as Pt)));
  if(p.motif!=="none")content.push(...motif(p.motif,Math.min(14,H*.35),0,-title.height/2-9));
  const safe=differenceShapes(shapeContours(offsetShapes([makeShape(base,[])],-p.margin)), [circle(cx,cy,r+p.margin)]);
  if(!safe.length)return fail("Reduce the content margin or increase the body size.");
  let fitted:Contour[]=[];
  if(content.length){
    const b=bboxOf(content),mx=(b.x0+b.x1)/2,my=(b.y0+b.y1)/2;
    let scale=Math.min(1,(W-2*p.margin)/Math.max(1,b.x1-b.x0),(H-2*p.margin)/Math.max(1,b.y1-b.y0));
    for(let i=0;i<60;i++,scale*=.92){
      fitted=content.map(c=>c.map(([x,y])=>[(x-mx)*scale+W/2,(y-my)*scale+H/2] as Pt));
      if(differenceShapes(fitted,shapeContours(safe)).reduce((n,s)=>n+s.area,0)<.001)break;
      if(i===59)return fail("The text cannot fit this shape. Increase its size or shorten the text.");
    }
    if(p.style==="layered"&&p.text.size*scale<3)return fail("Raised letters would be too small. Increase the body size or shorten the name.");
  }
  const engrave:Contour[]=[],score:Contour[]=[];
  const rim=offsetShapes([makeShape(base,[])],-1.5);
  if(p.border==="score")score.push(...shapeContours(rim).map(closed));
  if(p.border==="engrave")engrave.push(...shapeContours(differenceShapes(shapeContours(rim),shapeContours(offsetShapes(rim,-.45)))));
  const parts:GenPart[]=[{id:"keychain",name:"Keychain body",outer,holes:[hole],engrave,score,place:{x:0,y:0,z:0}}];
  if(p.style==="engrave")engrave.push(...fitted);
  if(p.style==="score")score.push(...fitted.map(closed));
  if(p.style==="layered"){
    score.push(...fitted.map(closed));
    unionShapes(fitted).forEach((s,i)=>parts.push({id:`detail-${i+1}`,name:`Raised detail ${i+1}`,outer:s.outer,holes:s.holes,place:{x:0,y:0,z:p.T},tone:.65}));
  }
  return {parts,stats:[{label:"Body",value:`${W} × ${H} mm`},{label:"Ring hole",value:`${p.ring.diameter} mm`},{label:"Ring wall",value:`${p.ring.wall} mm`}],assembly:["Cut internal holes before the outer contour. Engrave or score before releasing the part.",...(p.style==="layered"?["Use the scored guides to glue the raised details onto the body. Small letter counters are separate parts."]:[]),"Sand edges, finish the wood, then thread a split ring through the hole. Test a sample with your actual material and hardware."]};
}
