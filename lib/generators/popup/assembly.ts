import { differenceShapes, intersectShapes, shapeContours, unionShapes } from '@/lib/letters/polygon';
import { bboxOf, pointInContour, rect, transform } from '../geom';
import { placePoint } from '../place';
import type { BuildContext, Contour, GenPart } from '../types';
import type { Ring } from './build';
import type { PopupParams } from './params';

/** Bounding box of a contour, padded by `pad`. */
const boxOf = (c: Contour, pad = 0) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of c) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]; };
/** The contours whose boxes meet `c`'s: the only ones a clip against `c` can touch (a big pop-up has hundreds of slots). */
export function nearContours(cs: Contour[], c: Contour, pad = 0.01): Contour[] { const [a0, b0, a1, b1] = boxOf(c, pad); return cs.filter(h => { const [x0, y0, x1, y1] = boxOf(h); return x1 >= a0 && x0 <= a1 && y1 >= b0 && y0 <= b1; }); }

/**
 * The cuts clipped to a strip of half-width `half` along the ray at `angle` (degrees) out to
 * `reach`. Anything that lies inside the strip meets exactly these pieces of the cuts. Ring slots
 * are long arcs whose boxes meet most of the strip, so clipping them once is much cheaper than
 * clipping every slot against every block.
 */
export function stripCuts(cuts:Contour[],angle:number,half:number,reach:number):{strip:Contour;pieces:Contour[]} {
  const strip=transform(rect(-reach,-half,2*reach,2*half),{rot:angle});
  const near=nearContours(cuts,strip);
  return {strip,pieces:near.length?shapeContours(intersectShapes(near,[strip])):[]};
}

/** Distance from the origin to the nearest point of a contour's boundary. */
function clearRadius(c:Contour) {
  let d=Infinity;
  for(let i=0;i<c.length;i++){const [ax,ay]=c[i],[bx,by]=c[(i+1)%c.length],ex=bx-ax,ey=by-ay,l=ex*ex+ey*ey;
    const t=l?Math.max(0,Math.min(1,-(ax*ex+ay*ey)/l)):0;d=Math.min(d,Math.hypot(ax+t*ex,ay+t*ey));}
  return d;
}
/**
 * The cuts that can reach a ring (rings and slots are centred on the origin): those whose boxes meet
 * its outline, less those wholly outside the disc round it and those wholly inside the disc its
 * opening clears round the centre (a disc that touches no edge of the opening lies inside it).
 * Subtracting every slot of a large bowl from every ring dominated its build time.
 */
export function ringCuts(r:{outer:Contour;inner?:Contour|null},cuts:Contour[]):Contour[] {
  // the ring lies inside the disc through its farthest corner; a cut whose edges all stay outside
  // that disc and that does not surround the centre cannot reach it
  const reach=Math.max(...r.outer.map(([x,y])=>Math.hypot(x,y)))+.01;
  let near=nearContours(cuts,r.outer).filter(c=>clearRadius(c)<=reach||pointInContour([0,0],c));
  if(r.inner&&pointInContour([0,0],r.inner)){const clear=clearRadius(r.inner)-.01;near=near.filter(c=>c.some(([x,y])=>Math.hypot(x,y)>=clear));}
  return near;
}

/** Project each connected polygon onto the rib axis. Unlike a centre-line crossing this
 * includes every point through the full stock thickness, including angled and curved edges. */
function projectedSpans(material:Contour[], angle:number, thickness:number) {
  const local=material.map(c=>transform(c,{rot:-angle})), b=bboxOf(local);
  if(!Number.isFinite(b.x0))return [];
  return intersectShapes(local,[rect(b.x0-1,-thickness/2,b.x1-b.x0+2,thickness)])
    .map(s=>bboxOf([s.outer])).map(b=>[b.x0,b.x1] as const);
}

/** A ring lowered from above must never cross wood above its underside. Cap the rib
 * everywhere that the ring's retained material overlaps its full-thickness footprint.
 * Joint openings are already subtracted, so their locating tabs survive this relief. */
export function insertionReliefs(p:PopupParams,rings:Ring[],cuts:Contour[],angle:number):Contour[] {
  const top=-Math.max(...rings.map(r=>r.height))-p.T-1;
  const pad=Math.min(.03,Math.max(0,p.support.fit)/4);
  // Only wood under the rib matters: clip each ring to a strip round the rib axis (wider than the
  // projected band) and subtract only the cuts that reach it. A 700 mm bowl has hundreds of slots,
  // and subtracting all of them from every ring for every rib took most of half a minute.
  const reach=Math.max(...rings.map(r=>{const b=bboxOf([r.outer]);return Math.max(-b.x0,b.x1,-b.y0,b.y1);}))+1;
  const {strip,pieces:near}=stripCuts(cuts,angle,p.T+1,reach);
  return rings.flatMap(r=>{
    // the ring under the strip is two short blocks; only cuts whose boxes meet them can change them
    const under=shapeContours(intersectShapes(shapeContours(differenceShapes([r.outer],r.inner?[r.inner]:[])),[strip]));
    const touching=[...new Set(under.flatMap(c=>nearContours(near,c)))];
    const solid=touching.length?differenceShapes(under,touching):intersectShapes(under,[strip]);
    // Clip just inside the exact-fit boundary: zero-area contact at a slot edge must
    // not join both sides into one projected component (Clipper grid is 0.001 mm).
    return projectedSpans(shapeContours(solid),angle,p.T+pad*2-.002)
      .map(([lo,hi])=>rect(lo-pad,top,hi-lo+2*pad,-r.height-top));
  });
}

/** Exact vertical-sweep check for an upright constant-thickness rib: clip all of its
 * wood above the ring seat, project it onto plan, and intersect the actual ring solid.
 * This is continuous over the insertion travel, not a few sampled animation frames. */
export function ringInsertionInterference(ring: {outer:Contour;holes:Contour[];height:number},rib:GenPart,T:number):number {
  const b=bboxOf([rib.outer]), ceiling=-ring.height-.002;
  if(ceiling<=b.y0)return 0;
  const slices=intersectShapes(shapeContours(unionShapes([rib.outer,...rib.holes],[],true)),
    [rect(b.x0-1,b.y0-1,b.x1-b.x0+2,ceiling-b.y0+1)]);
  const projected=slices.map(s=>{const b=bboxOf([s.outer]);return rect(b.x0,0,b.x1-b.x0,T).map(([u,h])=>{
    const at=placePoint(rib.place!,u,0,h);return [at[0],at[1]] as [number,number];
  });});
  return intersectShapes(shapeContours(unionShapes([ring.outer,...ring.holes],[],true)),projected).reduce((n,s)=>n+s.area,0);
}

export const ringCode=(index:number)=>`L${String(index+1).padStart(2,'0')}`;
/** Lowest seats first; equal-height rings go outside-in. IDs always run rim to centre. */
export function ringAssemblyOrder(rings:Ring[],views:NonNullable<GenPart['views3d']>=[]) {
  return rings.map((r,index)=>{const code=ringCode(index),v=views.find(v=>v.name?.endsWith(code)),b=bboxOf([v?.outer??r.outer]);return {index,code,height:r.height,span:b.x1-b.x0};})
    .sort((a,b)=>a.height-b.height||a.index-b.index);
}

function rayRadius(c:Contour,a:number) {
  const q=transform(c,{rot:-a}),hits:number[]=[];
  for(let i=0;i<q.length;i++){const u=q[i],v=q[(i+1)%q.length];
    if((u[1]<=0&&v[1]>0)||(v[1]<=0&&u[1]>0)){const x=u[0]-u[1]*(v[0]-u[0])/(v[1]-u[1]);if(x>0)hits.push(x);}
  }
  return Math.min(...hits);
}

/** Optional vector labels stay wholly on retained material, away from slots and openings. */
export function ringLabels(p:PopupParams,rings:Ring[],cuts:Contour[],ctx:BuildContext,prefix='') {
  const contours:Contour[]=[];let loading=false;
  for(const [i,r] of rings.entries()){
    const material=shapeContours(differenceShapes(shapeContours(differenceShapes([r.outer],r.inner?[r.inner]:[])),ringCuts(r,cuts)));
    let placed=false;
    for(const size of [2.4,2,1.6]){
      const text=ctx.text?.(prefix+ringCode(i),'archivo-black',size);
      if(!text){loading=true;break;}
      const b=bboxOf(text.contours),centred=transformAll(text.contours,-(b.x0+b.x1)/2,-(b.y0+b.y1)/2);
      for(let angle=15;angle<375&&!placed;angle+=15)for(const fraction of [.5,.75,.9,.25]){
        const ro=rayRadius(r.outer,angle),ri=r.inner?rayRadius(r.inner,angle):0;
        const radius=ri+(ro-ri)*fraction,a=angle*Math.PI/180;
        if(!Number.isFinite(radius))continue;
        const ink=centred.map(c=>transform(c,{rot:angle+90,x:radius*Math.cos(a),y:radius*Math.sin(a)}));
        // Include a small blank border round the label.
        const padded=transform(rect(-(b.x1-b.x0)/2-.2,-(b.y1-b.y0)/2-.2,b.x1-b.x0+.4,b.y1-b.y0+.4),{rot:angle+90,x:radius*Math.cos(a),y:radius*Math.sin(a)});
        if(differenceShapes([padded],nearContours(material,padded)).reduce((n,s)=>n+s.area,0)<.001){contours.push(...ink);placed=true;break;}
      }
      if(placed)break;
    }
    if(!placed&&!loading)throw Error(`No clear space for ${prefix+ringCode(i)}. Disable ring labels or widen rings.`);
  }
  return {contours,loading};
}
function transformAll(cs:Contour[],x:number,y:number){return cs.map(c=>transform(c,{x,y}));}

export interface AssemblyGroup {label:string;order:ReturnType<typeof ringAssemblyOrder>;radial:boolean;}
export function assemblySteps(p:PopupParams,parts:GenPart[],groups:AssemblyGroup[]):string[]{
  if(p.pattern.kind!=='rings'&&p.spiral.supports)return [
    `Measure the wood (${p.T.toFixed(2)} mm) and cut a coupon first. Mortise width is ${(p.T+p.support.fit).toFixed(2)} mm; total clearance ${p.support.fit.toFixed(2)} mm. Apply kerf compensation only once.`,
    'Engrave the part identifiers, cut all internal slots and key eyes, then the outer outlines. Keep each continuous spiral blank intact.',
    'For each size, lay B1 flat. Insert R1 and the other numbered supports vertically into the matching base mortises. Bottom tabs finish flush with the base underside. Dry-fit before gluing.',
    `Pre-form the spiral gradually toward its ${p.profile.depth.toFixed(1)} mm target rise. Never force a flat blank down over tabs at different heights. Stop if the stock cracks or resists; change stock, spacing or target rise and prototype again.`,
    'Lower the formed blank vertically onto the cradle. Align each rim slot R1, R2… with its rib. Where present, the centre tabs enter the flat centre lands. The contoured upper edges support the intermediate strip from below.',
    'Slide each K-number key sideways through the matching tab eye, above the blank, until its head reaches the side of the tab. A is the rim key; B is an optional centre key. Do not hammer the keys. Their small clearance allows insertion.',
    'After checking the target height, glue the base tab side faces and the rib-to-strip contact edges; keep glue out of the spiral cut gaps. Retaining keys prevent lift at the flat lands; secure them after the dry-fit for permanent assembly.',
    'Fit optional handles and finials last. Test the actual material and load capacity before use. Supports set geometric heights but do not validate wood bending or load capacity. LED lighting only.'
  ];
  if(p.pattern.kind!=='rings')return [
    `Measure the stock (${p.T.toFixed(2)} mm) and test the cut gap on a small sample. Apply kerf compensation only once.`,
    'Engrave first, cut the closed spiral slots next, then cut the exterior. Keep the blank supported on the laser bed.',
    'Lift the continuous blank carefully. Keep the strip connected at its ends; there are no separate rings or ring-seat ribs to assemble.',
    `Form gradually over a suitable jig toward the ${p.profile.depth.toFixed(1)} mm target height. The 3D shape is a target form, not a prediction of wood bending or springback. Stop if the stock cracks or resists; adjust spacing, height or material and test again.`,
    'Fit any optional handles, finial or base only after the formed prototype is stable. Verify their seating before gluing.',
    'Test actual stock and load capacity before use. Use LED lighting only.'
  ];
  const ribbed=parts.some(v=>/(^|-)rib-\d/.test(v.id)),separate=p.pattern.kind==='rings'&&(ribbed||p.support.kind==='cords');
  const steps=[`Measure the stock: ${p.T.toFixed(2)} mm. Cut a joint coupon before the full design. Slot clearance is ${p.support.fit.toFixed(2)} mm total; apply kerf compensation only once.`,
    'Engrave identifiers first, cut internal slots and ring gaps next, then cut exterior outlines. Keep the released pieces supported on the laser bed.',
    separate?(p.bridges.keep?'Cut every temporary holding land flush and clean the edges before assembly. Do not bend or force a connected blank onto the ribs.':'The SVG releases separate rings directly. Keep L01 (outer rim) through the last centre ring in order; each nested size has its own S prefix.'):'This continuous/flexure pattern needs a physical prototype; the ring-height preview is not a tested folding mechanism.'];
  if(ribbed)for(const group of groups){
    const prefix=group.label?`Size ${group.label.replace(/\D/g,'')}: `:'';
    steps.push(prefix+(group.radial?'Lay the hub flat. Lower each numbered radial rib vertically, inserting its bottom tab fully into the matching hub slot.':'Stand R1 upright (half-lap open at the top). Lower R2 from above through that opening; its half-lap opens at the bottom. Seat the shoulders without forcing them.'));
    for(const r of group.order)steps.push(`${group.label}${r.code}: lower vertically onto its matching tabs, underside at ${r.height.toFixed(2)} mm above the ring datum; outer width ${r.span.toFixed(1)} mm. Seat on the horizontal shoulders. Keep the same face upward.`);
  }
  if(p.support.kind==='cords')steps.push('Thread each size independently from its centre ring outward; tie a support knot under every ring and set the target heights shown in 3D before securing the suspension.');
  if(parts.some(v=>v.id.includes('handle-')))steps.push('Install handles after all rings: lower their tabs into the rim slots until both shoulders rest on the upper face.');
  if(parts.some(v=>v.id.endsWith('finial')))steps.push('Install the finial last, into its centre slot if supplied; a glue-on finial has no locating tab.');
  steps.push('Dry-fit the complete assembly first. Apply wood glue sparingly to the tab side faces and ring-to-rib shoulders, keeping the visible faces clean; clamp level while curing. Tabs locate the parts and are not snap locks.');
  if(p.extras.base||p.extras.feet||p.extras.plantSeat)steps.push('Fit the base/feet after checking that the supports sit level. Glue their bearing surfaces after the dry-fit.');
  steps.push('A physical test cut is still required for actual stock variation and load capacity. Use LED lighting only.');
  return steps;
}

/** Compact cuttable reference cards use the same identifiers and sequence as the screen. */
export function assemblyCards(p:PopupParams,ctx:BuildContext,groups:AssemblyGroup[]):GenPart[]{
  const rows=groups.flatMap(g=>g.order.map(r=>`${g.label}${r.code}   ${r.height.toFixed(2)} mm`));
  const pages:GenPart[]=[];
  for(let start=0;start<rows.length;start+=36){
    const engrave:Contour[]=[],page=rows.slice(start,start+36);
    const line=(s:string,x:number,y:number,size=2.6)=>{const t=ctx.text?.(s,'archivo-black',size);if(!t)return;const b=bboxOf(t.contours);engrave.push(...transformAll(t.contours,x-b.x0,y-b.y0));};
    line('POP-UP / ASSEMBLY ORDER',10,10,3.5);
    line('Supports first. Lower rings in this order.',10,20);
    line('Underside height from ring datum (mm).',10,27);
    line(`Stock ${p.T.toFixed(2)} mm / clearance ${p.support.fit.toFixed(2)} mm total`,10,34);
    for(const [i,row] of page.entries())line(row,10+Math.floor(i/12)*58,45+(i%12)*6);
    line('Dry-fit, then glue. Handles / finial last.',10,123);
    pages.push({id:pages.length?`assembly-card-${pages.length+1}`:'assembly-card',name:`Assembly order ${pages.length+1}`,outer:rect(0,0,190,138),holes:[],engrave,score:[[[10,116],[15,120],[20,116]]],place:{x:p.outline.width+pages.length*200,y:0,z:0}});
  }
  return pages;
}
