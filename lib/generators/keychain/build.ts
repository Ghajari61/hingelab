import {raisedLetters} from "../textOps";
import { differenceShapes, intersectShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, circle, ellipse, rect, pointInContour } from "../geom";
import { orient, shapeOutline } from "../shapes";
import { motif } from "../motifs";
import { textBlock } from "../weld";
import { material2 } from "../material2";
import { MATERIALS } from "@/lib/hinge/defaults";
import { frameOf, turn } from "../leather/view3d";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import type { KeychainParams } from "./params";
const closed=(c:Contour):Contour=>[...c,c[0]];
const largest=(ss:Shape[]):Shape|null=>(ss.length?ss.reduce((a,b)=>(b.area>a.area?b:a)):null);
const areaOut=(subject:Contour[],clip:Contour[])=>differenceShapes(subject,clip).reduce((n,s)=>n+s.area,0);

/** The body outline with its ring tab and hole, joined to the actual edge of the shape. */
function bodyOf(p:KeychainParams){
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
  if(shapes.length!==1)return {error:"The ring attachment cannot join this shape. Choose another shape or a wider body."} as const;
  const outer=shapes[0].outer,hole=orient(ellipse(cx,cy,r,r,96));
  if(!hole.every(pt=>pointInContour(pt,outer)))return {error:"The ring hole needs more surrounding material."} as const;
  return {W,H,base,outer,hole,cx,cy,r,R};
}

/** The name, second line and symbol as one block (and each glyph's outlines, for No Weld). */
function contentOf(p:KeychainParams,ctx:BuildContext,H:number){
  const missing:string[]=[];
  const title=textBlock(ctx,p.text.name,p.text.fontId,p.text.size,{spacing:p.text.spacing,missing});
  const sub=textBlock(ctx,p.text.subtitle,p.text.fontId,p.text.size*.42,{missing});
  if(title.loading||sub.loading)return {loading:true} as const;
  if(missing.length)return {error:"This font cannot draw: "+missing.join(" ")+". Choose a font that supports your text."} as const;
  const content:Contour[]=[...title.contours];
  // each glyph's outlines (a motif is one glyph), moved with the content, for No Weld raised letters
  const groups:Contour[][]=title.glyphs?.length?[...title.glyphs]:title.contours.length?[title.contours]:[];
  const below=(c:Contour)=>c.map(([x,y])=>[x,y+title.height/2+3+sub.height/2] as Pt);
  if(sub.contours.length){content.push(...sub.contours.map(below));groups.push(...(sub.glyphs?.length?sub.glyphs:[sub.contours]).map(g=>g.map(below)));}
  if(p.motif!=="none"){const m=motif(p.motif,Math.min(14,H*.35),0,-title.height/2-9);content.push(...m);groups.push(m);}
  return {content,groups};
}

/** Content scaled down (never up) and centred in an area until it lies wholly inside it. */
function fitInto(content:Contour[],groups:Contour[][],area:Shape[]){
  if(!content.length)return {fitted:[] as Contour[],groups:[] as Contour[][],scale:1};
  const zone=shapeContours(area),ab=bboxOf(zone);
  const b=bboxOf(content),mx=(b.x0+b.x1)/2,my=(b.y0+b.y1)/2,ax=(ab.x0+ab.x1)/2,ay=(ab.y0+ab.y1)/2;
  let scale=Math.min(1,(ab.x1-ab.x0)/Math.max(1,b.x1-b.x0),(ab.y1-ab.y0)/Math.max(1,b.y1-b.y0));
  for(let i=0;i<60;i++,scale*=.92){
    const fit=(c:Contour)=>c.map(([x,y])=>[(x-mx)*scale+ax,(y-my)*scale+ay] as Pt);
    const fitted=content.map(fit);
    if(areaOut(fitted,zone)<.001)return {fitted,groups:groups.map(g=>g.map(fit)),scale};
  }
  return null;
}

export function buildKeychain(p:KeychainParams,ctx:BuildContext):GenOutput {
  const fail=(error:string):GenOutput=>({parts:[],stats:[],error});
  const body=bodyOf(p);
  if("error" in body)return fail(body.error!);
  const {W,H,base,outer,hole,cx,cy,r}=body;
  const c=contentOf(p,ctx,H);
  if("loading" in c)return {parts:[],stats:[],notice:"Loading the font."};
  if("error" in c)return fail(c.error!);
  if(p.build!=="flat")return layered(p,body,c.content,c.groups);
  const safe=differenceShapes(shapeContours(offsetShapes([makeShape(base,[])],-p.margin)), [circle(cx,cy,r+p.margin)]);
  if(!safe.length)return fail("Reduce the content margin or increase the body size.");
  let fitted:Contour[]=[],fittedGroups:Contour[][]=[];
  if(c.content.length){
    const b=bboxOf(c.content),mx=(b.x0+b.x1)/2,my=(b.y0+b.y1)/2;
    let scale=Math.min(1,(W-2*p.margin)/Math.max(1,b.x1-b.x0),(H-2*p.margin)/Math.max(1,b.y1-b.y0));
    for(let i=0;i<60;i++,scale*=.92){
      const fit=(q:Contour)=>q.map(([x,y])=>[(x-mx)*scale+W/2,(y-my)*scale+H/2] as Pt);
      fitted=c.content.map(fit);fittedGroups=c.groups.map(g=>g.map(fit));
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
    // touching glyphs fuse into one detail; with No Weld every glyph, dot and counter stays its own piece
    const details=p.text.noWeld?raisedLetters({contours:fitted,glyphs:fittedGroups},{border:0,noWeld:true}):unionShapes(fitted);
    details.forEach((s,i)=>parts.push({id:`detail-${i+1}`,name:`Raised detail ${i+1}`,outer:s.outer,holes:s.holes,place:{x:0,y:0,z:p.T},tone:.65}));
  }
  return {parts,stats:[{label:"Body",value:`${W} × ${H} mm`},{label:"Ring hole",value:`${p.ring.diameter} mm`},{label:"Ring wall",value:`${p.ring.wall} mm`}],assembly:["Cut internal holes before the outer contour. Engrave or score before releasing the part.",...(p.style==="layered"?["Use the scored guides to glue the raised details onto the body. Small letter counters are separate parts."]:[]),"Sand edges, finish the wood, then thread a split ring through the hole. Test a sample with your actual material and hardware."]};
}

export const BUILD_NAMES:Record<KeychainParams["build"],string>={
  flat:"Single layer", frame:"Photo frame", shaker:"Shaker", spinner:"Spinner", locket:"Swivel locket", outline:"Two-tone outline", scene:"Layered scene",
};

type Body=Extract<ReturnType<typeof bodyOf>,{outer:Contour}>;

/**
 * The multi-layer keychains: every layer is the body's outline (with the ring tab and hole, so the
 * split ring goes through them all and they line up), glued in order from the back.
 */
function layered(p:KeychainParams,b:Body,content:Contour[],groups:Contour[][]):GenOutput {
  const fail=(error:string):GenOutput=>({parts:[],stats:[],error});
  const {W,H,base,outer,hole,cx,cy,R}=b, T=p.T, L=p.stack, m2=material2(L.mat2), T2=L.T2;
  const fr=L.frame, body=makeShape(outer,[]);
  const ringKeep=orient(circle(cx,cy,R+1));
  /** A layer: the body less its openings, one connected piece with the ring hole. */
  const layer=(cut:Contour[],what:string)=>{
    const s=largest(differenceShapes([outer],cut));
    if(!s||!hole.every((q)=>pointInContour(q,s.outer)))throw new Error(`The ${what} leaves too little material. Widen the frame or make the keychain bigger.`);
    return {outer:s.outer,holes:[...s.holes,hole]};
  };
  const second=(pt:GenPart):GenPart=>({...pt,material:"second",color:m2.color,t:T2,...(L.mat2==="acrylic-clear"?{clear:true}:{})});
  const inner=offsetShapes([makeShape(base,[])],-fr);
  const innerFree=differenceShapes(shapeContours(inner),[ringKeep]);
  if(!innerFree.length)return fail("The frame is too wide for this size. Make the frame narrower or the keychain bigger.");
  const engraveName=(area:Shape[],what:string)=>{
    const f=fitInto(content,groups,offsetShapes(area,-1));
    if(content.length&&!f)throw new Error(`The text cannot fit the ${what}. Shorten it or make the keychain bigger.`);
    return f?.fitted??[];
  };
  const parts:GenPart[]=[];
  const stats=[{label:"Construction",value:BUILD_NAMES[p.build]},{label:"Body",value:`${W} × ${H} mm`},{label:"Ring hole",value:`${p.ring.diameter} mm`}];
  const steps:string[]=[];
  try {
    switch(p.build){
      case "frame": {
        // window above a band for the name; the pocket under it opens on the side away from the ring
        const band=content.length?Math.min(H*.32,p.text.size+6):0;
        const ib=bboxOf(shapeContours(innerFree));
        const zone=intersectShapes(shapeContours(innerFree),[orient(rect(ib.x0,ib.y0,ib.x1-ib.x0,ib.y1-ib.y0-band))]);
        const zb=bboxOf(shapeContours(zone));
        if(zb.x1-zb.x0<12||zb.y1-zb.y0<12)throw new Error("The photo window would be too small. Make the keychain bigger or the frame narrower.");
        let win:Contour[];
        if(L.window==="match")win=shapeContours(zone);
        else{
          const ww=zb.x1-zb.x0,wh=zb.y1-zb.y0,k=L.window==="circle"?Math.min(ww,wh):0;
          const sh=orient(shapeOutline(L.window==="circle"?"circle":L.window==="heart"?"heart":"rounded",k||ww,k||wh,4));
          const sb=bboxOf([sh]),mx=(zb.x0+zb.x1)/2-(sb.x0+sb.x1)/2,my=(zb.y0+zb.y1)/2-(sb.y0+sb.y1)/2;
          win=shapeContours(intersectShapes([sh.map(([x,y])=>[x+mx,y+my] as Pt)],shapeContours(zone)));
        }
        const lip=2, pocketWin=shapeContours(offsetShapes(unionShapes(win),lip));
        const pb=bboxOf(pocketWin), openRight=p.ring.side!=="right";
        const slot=orient(openRight?rect((pb.x0+pb.x1)/2,pb.y0,W+20-(pb.x0+pb.x1)/2,pb.y1-pb.y0):rect(-20,pb.y0,(pb.x0+pb.x1)/2+20,pb.y1-pb.y0));
        const pocket=shapeContours(unionShapes([...pocketWin,slot]));
        const back=layer([],"back");
        const spacer=layer(pocket,"photo pocket");
        const front=layer(win,"window");
        const nameArea=intersectShapes(shapeContours(innerFree),[orient(rect(ib.x0,ib.y1-band,ib.x1-ib.x0,band))]);
        const name=band?engraveName(nameArea,"band under the window"):[];
        parts.push({id:"back",name:"Back",...back,engrave:[],place:{x:0,y:0,z:0}});
        parts.push({id:"pocket",name:"Photo pocket",...spacer,place:{x:0,y:0,z:T}});
        let z=2*T;
        if(L.cover){parts.push(second({id:"cover",name:"Clear cover",...layer([],"cover"),place:{x:0,y:0,z}}));z+=T2;}
        parts.push({id:"front",name:"Front frame",...front,engrave:p.style==="score"?[]:name,score:p.style==="score"?name.map(closed):[],place:{x:0,y:0,z}});
        const pw=Math.max(0,pb.x1-pb.x0-.5),ph=Math.max(0,pb.y1-pb.y0-.5);
        stats.push({label:"Photo",value:`trim to ${pw.toFixed(0)} × ${ph.toFixed(0)} mm, slides in from the ${openRight?"right":"left"}`});
        steps.push("Glue the photo pocket onto the back, keeping glue away from the pocket.",...(L.cover?["Glue the clear cover on the pocket (peel its film first)."]:[]),"Glue the front frame on top, lined up on the ring hole.",`Trim a photo to ${pw.toFixed(0)} × ${ph.toFixed(0)} mm and slide it in from the ${openRight?"right":"left"} edge.`);
        break;
      }
      case "shaker": {
        const cav=largest(innerFree)!;
        const cavity=[cav.outer,...cav.holes];
        const name=engraveName([cav],"window");
        parts.push({id:"back",name:"Back",...layer([],"back"),engrave:p.style==="score"?[]:name,score:p.style==="score"?name.map(closed):[],place:{x:0,y:0,z:0}});
        for(let i=0;i<L.depth;i++)parts.push({id:`spacer-${i+1}`,name:`Shaker wall ${i+1}`,...layer(cavity,"shaker wall"),place:{x:0,y:0,z:T*(i+1)}});
        parts.push(second({id:"cover",name:"Clear front",...layer([],"front"),place:{x:0,y:0,z:T*(L.depth+1)}}));
        // a frame over the clear front's edge hides the glue line
        parts.push({id:"rim",name:"Front frame",...layer(cavity,"front frame"),place:{x:0,y:0,z:T*(L.depth+1)+T2}});
        stats.push({label:"Shaker space",value:`${(T*L.depth).toFixed(1)} mm deep`});
        steps.push("Glue the shaker walls onto the back.","Pour in a pinch of beads, sequins or glitter, filling no more than a third.","Run glue round the top wall and press the clear front on, then glue the front frame over its edge; let it cure flat.");
        break;
      }
      case "spinner": {
        // the largest disc that fits the middle of the frame
        const mid:Pt=[W/2,H/2];
        let lo=3,hi=Math.min(W,H)/2;
        for(let i=0;i<30;i++){const rr=(lo+hi)/2;if(areaOut([orient(circle(mid[0],mid[1],rr))],shapeContours(innerFree))<.01)lo=rr;else hi=rr;}
        const rd=lo-.2, clr=.35, lip=Math.min(2.5,rd*.2);
        if(rd<8)throw new Error("The spinning disc would be too small. Make the keychain bigger or the frame narrower.");
        const disc=orient(circle(mid[0],mid[1],rd,.02));
        const name=engraveName([makeShape(orient(circle(mid[0],mid[1],rd-1.5)),[])],"disc");
        parts.push({id:"back",name:"Back rim",...layer([orient(circle(mid[0],mid[1],rd-lip))],"back rim"),place:{x:0,y:0,z:0}});
        parts.push({id:"ring",name:"Middle frame",...layer([orient(circle(mid[0],mid[1],rd+clr))],"middle frame"),place:{x:0,y:0,z:T}});
        parts.push({id:"disc",name:"Spinning disc",outer:disc,holes:[],engrave:p.style==="score"?[]:name,score:p.style==="score"?name.map(closed):[],place:{x:0,y:0,z:T},tone:.8});
        parts.push({id:"front",name:"Front rim",...layer([orient(circle(mid[0],mid[1],rd-lip))],"front rim"),place:{x:0,y:0,z:2*T}});
        stats.push({label:"Disc",value:`${(2*rd).toFixed(1)} mm across, ${clr} mm clearance`});
        steps.push("Glue the middle frame onto the back rim.","Drop the disc in (check it turns freely; sand its edge if it binds).","Glue the front rim on, keeping glue off the disc, and spin it once the glue has set.");
        break;
      }
      case "locket": {
        const recess=largest(innerFree)!;
        const sub=content.length?engraveName([recess],"cover"):[];
        parts.push({id:"base",name:"Base",...layer([],"base"),place:{x:0,y:0,z:0}});
        parts.push({id:"recess",name:"Photo recess",...layer([recess.outer,...recess.holes],"recess"),place:{x:0,y:0,z:T}});
        // the cover swings open on the ring hole (a Chicago screw or rivet through all three)
        const cover:GenPart={id:"cover",name:"Swivel cover",...layer([],"cover"),engrave:p.style==="score"?[]:sub,score:p.style==="score"?sub.map(closed):[],place:{x:0,y:0,z:2*T}};
        const m=frameOf([1,0,0],[0,1,0],[0,0,2*T]), n=12;
        cover.views3d=[{name:cover.name,outer:cover.outer,holes:cover.holes,engrave:cover.engrave,score:cover.score,place:{x:0,y:0,z:0,m},
          frames:Array.from({length:n+1},(_,i)=>turn(m,[cx,cy,0],[0,0,1],(1-i/n)*(p.ring.side==="right"?-1:1)*Math.PI*0.6)),apart:[0,0,40]}];
        parts.push(cover);
        const rb=bboxOf([recess.outer]);
        stats.push({label:"Photo",value:`trim to ${(rb.x1-rb.x0).toFixed(0)} × ${(rb.y1-rb.y0).toFixed(0)} mm in the shape of the recess`});
        steps.push("Glue the photo recess onto the base and set a photo or a note in it.",`Join base and cover through the ring hole with a ${p.ring.diameter} mm Chicago screw or rivet, loose enough to swing.`,"Thread the split ring through the screw's loop or a second hole.");
        break;
      }
      case "outline": {
        const back=largest(offsetShapes([body],L.border));
        if(!back)throw new Error("The outline cannot be made.");
        const name=fitInto(content,groups,differenceShapes(shapeContours(offsetShapes([makeShape(base,[])],-p.margin)),[ringKeep]));
        if(content.length&&!name)throw new Error("The text cannot fit this shape. Increase its size or shorten the text.");
        const f=name?.fitted??[];
        parts.push({id:"back",name:"Outline backing",outer:back.outer,holes:[...back.holes,hole],place:{x:0,y:0,z:0}});
        parts.push(second({id:"front",name:"Front",outer,holes:[hole],engrave:p.style==="engrave"?f:[],score:p.style!=="engrave"?f.map(closed):[],place:{x:0,y:0,z:T}}));
        if(p.style==="layered")(p.text.noWeld?raisedLetters({contours:f,glyphs:name!.groups},{border:0,noWeld:true}):unionShapes(f))
          .forEach((s,i)=>parts.push({id:`detail-${i+1}`,name:`Raised detail ${i+1}`,outer:s.outer,holes:s.holes,place:{x:0,y:0,z:T+T2},tone:.7}));
        stats.push({label:"Outline",value:`${L.border} mm round the front`});
        steps.push("Glue the front onto the backing, lined up on the ring hole; the backing shows as an even outline.",...(p.style==="layered"?["Glue the raised letters over their scored guides."]:[]));
        break;
      }
      case "scene": {
        // mountains behind, hills in front, the name in the sky above them
        const bb=bboxOf([base]), yM=bb.y0+(bb.y1-bb.y0)*.52, yH=bb.y0+(bb.y1-bb.y0)*.72, n=48;
        const ridge:Pt[]=Array.from({length:n+1},(_,i)=>{const x=-2+(W+4)*i/n,t=i/n;return [x,yM-(H*.16)*Math.abs(Math.sin(t*Math.PI*2.5))*(0.6+0.4*Math.sin(t*7))] as Pt;});
        const hills:Pt[]=Array.from({length:n+1},(_,i)=>{const x=-2+(W+4)*i/n,t=i/n;return [x,yH-H*.06*Math.sin(t*Math.PI*1.6+.4)] as Pt;});
        const down=(top:Pt[])=>orient([...top,[W+2,H+20],[-2,H+20]] as Contour);
        const keep=(c:Contour)=>largest(differenceShapes(shapeContours(intersectShapes([outer],[c])),[ringKeep]));
        const mtn=keep(down(ridge)), hill=keep(down(hills));
        if(!mtn||!hill)throw new Error("The scene does not fit this shape. Try a wider shape.");
        const sky=intersectShapes(shapeContours(innerFree),[orient(rect(bb.x0,bb.y0,W,Math.max(4,Math.min(...ridge.map((q)=>q[1]))-bb.y0-1.5)))]);
        const name=sky.length?engraveName(sky,"sky"):[];
        if(content.length&&!name.length)throw new Error("The text cannot fit above the mountains. Shorten it or make the keychain taller.");
        parts.push({id:"back",name:"Sky (back)",outer,holes:[hole],engrave:p.style==="score"?[]:name,score:p.style==="score"?name.map(closed):[],place:{x:0,y:0,z:0}});
        parts.push({id:"mountains",name:"Mountains",outer:mtn.outer,holes:mtn.holes,place:{x:0,y:0,z:T},tone:.8});
        parts.push({id:"hills",name:"Hills",outer:hill.outer,holes:hill.holes,place:{x:0,y:0,z:2*T},tone:.62});
        steps.push("Glue the mountains onto the back along the bottom edge, then the hills on the mountains.","Stain or paint the layers in different shades before gluing for more depth.");
        break;
      }
    }
  } catch(e){
    return fail(e instanceof Error?e.message:"These settings cannot be built.");
  }
  const mixed=parts.some((pt)=>pt.material==="second");
  return {
    parts,stats,
    assembly:["Cut internal holes before the outer contours. Engrave or score before releasing the parts.",...steps,"Sand the edges and thread a split ring through the hole. Test a sample with your actual material and hardware."],
    ...(mixed?{materials:{main:MATERIALS[p.material]?.name??`Main material ${T} mm`,second:`${m2.name} ${T2} mm`,secondK:m2.K}}:{}),
  };
}
