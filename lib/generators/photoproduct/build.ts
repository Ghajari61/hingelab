import {buildGeneratedProduct} from "@/lib/photoproduct/generated";
import { MATERIALS } from "@/lib/hinge/defaults";
import { differenceShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, circle, ellipse, pointInContour, rect, regularPolygon, stadium, transform } from "../geom";
import { orient, shapeOutline } from "../shapes";
import { bridgeIslands, textBlock, weld } from "../weld";
import { motif } from "../motifs";
import { buildKeychain } from "../keychain/build";
import { mergeKeychain } from "../keychain/params";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import type { PhotoProductParams } from "./params";

const failed=(error:string):GenOutput=>({parts:[],stats:[],error});
const closed=(c:Contour):Contour=>[...c,c[0]];
const shifted=(cs:Contour[],x:number,y:number)=>cs.map(c=>c.map(([a,b])=>[a+x,b+y] as Pt));
function snowflake(x:number,y:number,r:number,width:number):Contour[]{
 const cuts:Contour[]=[];
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3,dx=Math.cos(a),dy=Math.sin(a);
  cuts.push(stadium(x,y,x+r*dx,y+r*dy,width));
  for(const s of [-1,1])cuts.push(stadium(x+r*.57*dx,y+r*.57*dy,x+r*.57*dx+r*.3*Math.cos(a+s*Math.PI/3),y+r*.57*dy+r*.3*Math.sin(a+s*Math.PI/3),width*.85));
 }
 return cuts;
}
function pawProduct(p:PhotoProductParams,ctx:BuildContext):GenOutput{
 if(p.size.width<70||p.size.depth<70)return failed("For this connected paw design, use at least 70 mm width and height, or choose a simple tag.");
 const toes=[[17,42,13,18,-27],[37,25,14,20,-13],[63,25,14,20,13],[83,42,13,18,27]];
 const oval=(x:number,y:number,rx:number,ry:number,rot:number)=>transform(ellipse(0,0,rx,ry,96),{x,y,rot});
 const solids=toes.map(([x,y,rx,ry,a])=>orient(oval(x,y,rx,ry,a)));
 solids.push(orient(ellipse(50,71,35,30,128)),orient(circle(50,5,7,.01)),orient(stadium(50,6,50,22,11)));
 if(p.paw.wings){
  const wing:Contour=[[-22,13],[-18,11],[-6,21],[10,25],[18,36],[9,47],[-3,43],[-14,36],[-5,37],[-18,27],[-7,31],[-22,17]];
  solids.push(orient(wing),orient(wing.map(([x,y])=>[100-x,y] as Pt)));
 }
 const raw=unionShapes(solids);if(raw.length!==1)return failed("The paw outline could not be joined.");
 const b=bboxOf([raw[0].outer]),sx=p.size.width/(b.x1-b.x0),sy=p.size.depth/(b.y1-b.y0);
 const map=(c:Contour):Contour=>c.map(([x,y])=>[(x-b.x0)*sx,(y-b.y0)*sy]);
 const outer=map(raw[0].outer),f=p.paw.frame/Math.min(sx,sy);
 if(f>9)return failed("The paw frame is too wide for these windows. Reduce frame width or increase the design size.");
 const windows=toes.map(([x,y,rx,ry,a])=>map(oval(x,y,rx-f,ry-f,a)));
 windows.push(map(ellipse(50,73,31-f,26-f,128)));
 const [hx,hy]=map([[50,5]])[0],hole=ellipse(hx,hy,p.paw.hole/2,p.paw.hole/2,96);
 if(!circle(hx,hy,p.paw.hole/2+2,.01).every(q=>pointInContour(q,outer)))return failed("The hanging hole needs at least 2 mm of surrounding material. Reduce its diameter or enlarge the design.");
 const backing=differenceShapes([outer],[hole]);
 let front=differenceShapes([outer],[...windows,hole]);
 const missing:string[]=[];
 const text=textBlock(ctx,p.text.name,p.text.fontId,p.text.size,{missing});
 const subtitle=textBlock(ctx,p.text.subtitle,p.text.fontId,p.text.size*.4,{missing});
 if(text.loading||subtitle.loading)return {parts:[],stats:[],notice:"Loading the font."};
 if(missing.length)return failed("Choose a font supporting every character: "+missing.join(" "));
 let content=text.contours;
 if(subtitle.contours.length)content=[...content,...shifted(subtitle.contours,0,text.height/2+3+subtitle.height/2)];
 const pad=windows[4],padBox=bboxOf([pad]),ccx=(padBox.x0+padBox.x1)/2,ccy=(padBox.y0+padBox.y1)/2+3*sy;
 let fitted:Contour[]=[];
 if(content.length){
  const cb=bboxOf(content),cx=(cb.x0+cb.x1)/2,cy=(cb.y0+cb.y1)/2;
  let scale=Math.min(1,(padBox.x1-padBox.x0-8)/Math.max(1,cb.x1-cb.x0),(padBox.y1-padBox.y0-14)/Math.max(1,cb.y1-cb.y0));
  const safe=offsetShapes([makeShape(pad,[])],-1.5);
  for(let i=0;i<50;i++,scale*=.92){
   fitted=content.map(c=>c.map(([x,y])=>[ccx+(x-cx)*scale,ccy+(y-cy)*scale] as Pt));
   if(differenceShapes(fitted,shapeContours(safe)).reduce((n,s)=>n+s.area,0)<.001)break;
   if(i===49)return failed("The name cannot fit this pad. Shorten the text or enlarge the design.");
  }
  if(scale*p.text.size<3)return failed("The fitted name is below 3 mm. Enlarge the paw or shorten the name.");
 }
 const details:Contour[]=[];
 if(fitted.length){const name=weld(fitted,{border:.25,bridge:Math.max(2,p.T*.65),minHole:.6});if(!name)return failed("The name is too thin to connect.");details.push(...shapeContours([name]));}
 if(p.paw.detail!=="none"){
  for(const [x,y,r] of [[37,24,.85],[83,42,.85],[50,56.5,1]]){
   const [cx,cy]=map([[x,y]])[0],size=p.paw.detailSize*r;
   details.push(...(p.paw.detail==="snowflake"?snowflake(cx,cy,size,Math.max(1.5,p.T*.5)):motif("heart",size*2,cx,cy)));
  }
 }
 const baseZ=p.paw.backing?p.paw.backThickness:0;
 const parts:GenPart[]=[];
 if(p.paw.backing)parts.push({id:"paw-backing",name:"01 · Colored backing",outer:backing[0].outer,holes:backing[0].holes,t:p.paw.backThickness,color:p.paw.backColor,stock:`${p.paw.backMaterial}-${p.paw.backThickness}mm`,material:"second",place:{x:0,y:0,z:0},score:p.paw.connected?[]:details.map(closed)});
 if(p.paw.connected){
  front=bridgeIslands(unionShapes([...shapeContours(front),...details]),Math.max(2,p.T*.65));
  front=differenceShapes(shapeContours(front),[hole]);
  if(front.length!==1)return failed("The front has disconnected details. Increase frame or detail size.");
 }else if(!p.paw.backing)return failed("Separate details require a backing to glue onto. Enable the colored backing or connected front.");
 if(front.length!==1)return failed("The paw frame is disconnected.");
 parts.push({id:"paw-front",name:"02 · Paw front",outer:front[0].outer,holes:front[0].holes,t:p.T,stock:`front-${p.T}mm`,place:{x:0,y:0,z:baseZ}});
 if(!p.paw.connected)unionShapes(details).forEach((s,i)=>parts.push({id:`paw-detail-${i+1}`,name:`Detail ${i+1}`,outer:s.outer,holes:s.holes,t:p.T,stock:`front-${p.T}mm`,place:{x:0,y:0,z:baseZ}}));
 return {parts,stacked:true,...(p.paw.backing?{materials:{main:MATERIALS[p.material]?.name??p.material,second:`${MATERIALS[p.paw.backMaterial]?.name??p.paw.backMaterial} · actual ${p.paw.backThickness} mm`,secondK:p.paw.backKerf}}:{}),stats:[{label:"Overall size",value:`${p.size.width} × ${p.size.depth} mm`},{label:"Hanging hole",value:`${p.paw.hole} mm`}],assembly:["01. Cut the backing and front from their labeled stocks. Internal contours first; outer boundaries last.","02. Sand the edges and dry-align both outlines and the hanging hole.",p.paw.connected?"03. Glue the connected front onto the colored backing, if enabled.":"03. Glue the frame and each separate name or motif detail onto the backing using the scored guides.","04. Let the adhesive cure before fitting a cord or ring. Test the actual stock and adhesive on a sample."]};
}

const curveLength=(cs:Contour)=>cs.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-cs[i][0],p[1]-cs[i][1]),0);
function heartBox(p:PhotoProductParams):GenOutput{
 const {width:W,depth:D,height:H}=p.size,T=p.T;
 if(W<95||D<85||H<14||T<1.5||T>6)return failed("This heart box needs at least 95 × 85 mm, 14 mm wall height and 1.5–6 mm stock.");
 if(p.box.edge*2+5>H)return failed("Reduce the hinge edge margin or increase wall height.");
 const outer=orient(shapeOutline("heart",W,D,0));
 const inset=(d:number)=>offsetShapes([makeShape(outer,[])],-d);
 const wallInset=T/2+2.5,neutral=inset(wallInset)[0]?.outer;
 const rim=inset(p.box.rim),lipOuter=inset(p.box.rim+p.box.clearance),lipInner=inset(p.box.rim+p.box.clearance+Math.max(3,T));
 if(!neutral||rim.length!==1||lipOuter.length!==1||lipInner.length!==1)return failed("The rim or lid locator is too wide for this heart. Reduce rim width or increase size.");
 const rimShape=differenceShapes([outer],shapeContours(rim)),lip=differenceShapes(shapeContours(lipOuter),shapeContours(lipInner));
 const notch=neutral.reduce((best,q,i)=>Math.abs(q[0]-W/2)*100+q[1]<Math.abs(neutral[best][0]-W/2)*100+neutral[best][1]?i:best,0);
 const tip=neutral.reduce((best,q,i)=>q[1]>neutral[best][1]?i:best,0);
 const walk=(a:number,b:number)=>{const c:Contour=[];for(let i=a;;i=(i+1)%neutral.length){c.push(neutral[i]);if(i===b)break;}return c;};
 const paths=[walk(notch,tip),walk(tip,notch)];
 const parts:GenPart[]=[
  {id:"floor",name:"01 · Floor",outer,holes:[],score:[closed(neutral)],place:{x:0,y:0,z:0}},
  {id:"top-rim",name:"02 · Top rim",outer:rimShape[0].outer,holes:rimShape[0].holes,place:{x:0,y:0,z:T+H}},
 ];
 const lid=offsetShapes([makeShape(outer,[])],1),safe=inset(p.box.rim+5),hexes:Contour[]=[];
 if(p.box.lid==="honeycomb"){
  const R=p.box.hex,pitch=Math.sqrt(3)*R+p.box.web,rowPitch=1.5*(R+p.box.web/Math.sqrt(3));
  const rows=Math.ceil(D/rowPitch)+2,cols=Math.ceil(W/pitch)+2;
  for(let row=-1;row<rows;row++)for(let col=-1;col<cols;col++){
   const hex=regularPolygon(6,R,0,col*pitch+(row%2?pitch/2:0),row*rowPitch);
   if(safe[0]&&hex.every(q=>pointInContour(q,safe[0].outer)))hexes.push(hex);
  }
  if(!hexes.length)return failed("No honeycomb cells fit. Reduce cell size or use a solid lid.");
 }
 const lidShape=differenceShapes(shapeContours(lid),hexes);
 if(lidShape.length!==1)return failed("The lid pattern is disconnected.");
 parts.push({id:"lid",name:"03 · Removable lid",outer:lidShape[0].outer,holes:lidShape[0].holes,place:{x:0,y:0,z:H+2*T}});
 parts.push({id:"lid-locator",name:"04 · Lid locating ring",outer:lip[0].outer,holes:lip[0].holes,place:{x:0,y:0,z:H+T}});
 paths.forEach((path,k)=>{
  const L=curveLength(path),cuts:Contour[]=[];
  for(let i=0,x=10;x<L-10;i++,x+=p.box.pitch)for(let y=p.box.edge+(i%2?p.box.slit/2:0);y<H-p.box.edge;y+=p.box.slit+p.box.bridge){const end=Math.min(y+p.box.slit,H-p.box.edge);if(end-y>=2)cuts.push([[x,y],[x,end]]);}
  const views:NonNullable<GenPart["views3d"]>=[];
  for(let i=0;i<path.length-1;i++){
   const a=path[i],b=path[i+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<.001)continue;
   const ux=(b[0]-a[0])/d,uy=(b[1]-a[1])/d;
   views.push({outer:rect(0,0,d,H),holes:[],soft:true,place:{x:0,y:0,z:0,m:[ux,0,-uy,a[0]+uy*T/2,uy,0,ux,a[1]-ux*T/2,0,-1,0,T+H]}});
  }
  parts.push({id:`wall-${k+1}`,name:`0${k+5} · Hinge wall ${k+1}`,outer:rect(0,0,L,H),holes:[],cuts,views3d:views});
 });
 return {parts,stats:[{label:"Footprint",value:`${W} × ${D} mm`},{label:"Closed height",value:`${H+3*T} mm`},{label:"Neutral perimeter",value:`${curveLength(closed(neutral)).toFixed(3)} mm`},{label:"Lid side clearance",value:`${p.box.clearance} mm`}],assembly:["01. Cut the six labeled parts from the measured stock. Score and hinge cuts before outer profiles.","02. Test the slit pattern on a coupon of the actual plywood; bend behavior cannot be verified from a photo.","03. Dry-form both wall halves along the floor's scored neutral-path guide. The seams meet at the heart cleft and bottom tip.","04. Glue the walls to the floor and the rim above them. This is glue construction: there are no hidden tabs or press-fit joints.","05. Center the locating ring under the lid and glue it there. Its outer edge has the specified per-side clearance to the rim opening.","06. After curing, test the removable lid and gently sand if needed. Do not force plywood around the sharp seams."]};
}
export function buildPhotoProduct(p:PhotoProductParams,ctx:BuildContext):GenOutput{
 if(p.recipe==="custom"){
  if(!p.generated)return {parts:[],stats:[{label:"Photo to Product",value:"Upload photos to generate your model"}]};
  const active={...p.generated,parts:p.generated.parts.filter(q=>!p.hiddenParts.includes(q.id))};
  return buildGeneratedProduct(active,p.size,p.T,p.values,ctx);
 }
 if(!Number.isFinite(p.T)||p.T<=0)return failed("Set a positive material thickness.");
 if(p.recipe==="paw")return pawProduct(p,ctx);
 if(p.recipe==="heartbox")return heartBox(p);
 if(p.size.width>180||p.size.depth>120)return failed("The supported name-tag recipe is limited to a 180 × 120 mm body. Reduce its dimensions or use a different construction.");
 return buildKeychain(mergeKeychain({...p,width:p.size.width,height:p.size.depth,shape:p.tag.shape,text:{text:p.text.name+(p.text.subtitle?"\n"+p.text.subtitle:""),fontId:p.text.fontId,size:p.text.size},ring:{side:"top",diameter:p.tag.hole,wall:3},style:"engrave"}),ctx);
}
