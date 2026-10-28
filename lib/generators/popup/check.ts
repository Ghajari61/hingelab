import type {Issue} from '@/lib/issues';
import type {GenOutput} from '../types';
import {buildPopup,ringPlan,setsHeights,tiltDepth} from './build';
import {bridgeStrain} from './engineering';
import type {PopupParams} from './params';
/** The opening cut through the centre disc (lamp socket, tealight or sleeve), as the build makes it. */
const centreOpening=(p:PopupParams)=>p.mode==='sleeve'?p.extras.sleeveDiameter:p.extras.socket!=='none'?(p.extras.socket==='E14'?28:p.extras.socket==='E27'?40:p.extras.socketDiameter):p.extras.tealight?p.extras.tealightDiameter:0;
/**
 * A one-click way out of the build errors a single choice can cause, so switching on a tealight or
 * a socket, or picking a narrow outline, never leaves the design stuck on an error.
 */
function geometryFix(p:PopupParams,error:string):{label:string;apply:(q:PopupParams)=>PopupParams}|undefined {
 // the smallest centre disc, in 2 mm steps, that holds the opening and still takes the rib joints
 if(/Centre opening needs a wider centre disc/.test(error))return {label:'Widen the centre disc',apply:q=>{
  const from=Math.ceil(centreOpening(q)+2*q.T+2);let r=q;
  for(let c=from;c<=from+60;c+=2){r={...q,rings:{...q.rings,center:c}};if(!buildPopup(r,{}).error)return r;}
  return r;
 }};
 if(/Centre disc and rim leave no room for rings/.test(error)){
  // the smallest centre that still holds the opening, the narrowest rim, then enough width
  return {label:'Make room for the rings',apply:q=>{
   const center=Math.max(5,Math.ceil(centreOpening(q)?centreOpening(q)+2*q.T+2:Math.min(q.rings.center,20))),rim=Math.max(3,Math.min(q.rings.rim,6));
   let r={...q,rings:{...q.rings,center,rim}};
   for(let k=0;k<10;k++){if(!buildPopup(r,{}).error)return r;r={...r,outline:{...r.outline,width:Math.round(r.outline.width*1.25),height:Math.round(r.outline.height*1.25)}};}
   return r;
  }};
 }
 // two ribs first (more room for each joint), then wider rings and a wider centre disc
 if(/No safe ring-to-rib joint layout/.test(error))return {label:p.support.ribs>2?'Use two ribs and wider rings':'Widen the rings',apply:q=>{
  let r:PopupParams={...q,support:{...q.support,ribs:2}};
  for(let k=0;k<12&&buildPopup(r,{}).error;k++)r={...r,rings:{...r.rings,by:'width',width:Math.max(r.rings.width+2,Math.ceil(3*r.T)),rim:Math.max(r.rings.rim,8),center:Math.max(r.rings.center,30)+(k>5?4:0)},
   // nested sets share the joints of a smaller copy: fewer copies once wider rings alone do not help
   sets:{...r.sets,count:k>3?Math.max(1,r.sets.count-1):r.sets.count}};
  return r;
 }};
 return undefined;
}
export function checkPopup(p:PopupParams,out:GenOutput):Issue<PopupParams>[] {
 const issues:Issue<PopupParams>[]=[];
 const add=(code:string,message:string,fix?:{label:string;safe?:boolean;apply:(q:PopupParams)=>PopupParams},level:'warn'|'error'|'info'='warn')=>issues.push({code:'popup-'+code,level,message,fixes:fix?[{id:code,safe:true,...fix}]:[]});
 if(out.error){add('geometry',out.error,geometryFix(p,out.error),'error');return issues;}
 const g=ringPlan(p);if(g.pitch<1.5*p.T)add('ring-width','Ring pitch is below 1.5 × material thickness.',{label:'Widen rings',apply:q=>({...q,rings:{...q.rings,by:'width',width:Math.ceil(q.T*1.5+q.rings.gap)}})});
 if(p.pattern.kind==='rings'&&(p.bridges.keep||!setsHeights(p))&&p.bridges.width<Math.max(p.T*1.5,p.sheet?.minFeature??0))add('bridges','Bridge lands are narrower than the material minimum.',{label:'Widen bridge lands',apply:q=>({...q,bridges:{...q.bridges,width:Math.max(q.T*1.5,q.sheet?.minFeature??0)}})});
 if(p.pattern.kind==='rings'&&(p.bridges.keep||!setsHeights(p))&&p.bridges.length>g.pitch*.7)add('flexure-length','Bridge relief length is limited to 70% of ring pitch to keep adjacent slots apart.',undefined,'info');
 if(g.collapsed)add('collapse','Concave offsets collapsed before the requested ring count.',{label:'Reduce count',apply:q=>({...q,rings:{...q.rings,by:'count',count:Math.max(2,g.loops.length-1)}})});
 if(p.outline.width>p.bedW-10||p.outline.height>p.bedH-10)add('bed','Blank exceeds the selected bed; never split a connected blank automatically.',{label:'Scale outline to bed',safe:false,apply:q=>{const s=Math.min((q.bedW-10)/q.outline.width,(q.bedH-10)/q.outline.height);return {...q,outline:{...q.outline,width:q.outline.width*s,height:q.outline.height*s},rings:{...q.rings,center:q.rings.center*s,rim:q.rings.rim*s}};}});
 if(p.pattern.kind!=='rings'){
  add('spiral',p.spiral.supports?'Continuous spiral: contoured supports and keyed flat lands set the target height. Glue base mortises and supported strip contacts after dry-fitting. Test actual stock for cracking, springback and load capacity; the preview is not a bending simulation.':'Continuous spiral: 3D shows a target form. Enable Spiral supports for a cuttable base and ribs, or use your own forming jig. Test the actual stock for cracking, springback and load capacity.',undefined,'info');
  if(p.extras.socket!=='none'||p.extras.tealight)add('led','LED bulbs / LED tealights only. Keep heat sources away from wood and adhesives.');
  return issues;
 }
 if(p.support.kind==='tilt'){const depth=tiltDepth(g.loops.length,p.rings.gap,p.support.angle);if(Math.abs(depth-p.profile.depth)>Math.max(2,p.profile.depth*.1))add('tilt-depth','Computed tilted-cut depth differs from the target.',{label:'Match bevel angle',apply:q=>({...q,support:{...q.support,angle:Math.max(1,Math.min(15,Math.atan(g.loops.length*q.rings.gap/Math.max(1,q.profile.depth))*180/Math.PI))}})});add('bevel','Tilted cuts require bevel-capable equipment; a normal laser cuts perpendicular to the sheet.');}
 if(setsHeights(p))add(p.bridges.keep?'snap-bridges':'released-rings',p.bridges.keep?'Remove holding lands flush before seating separate rings on the locating tabs.':'The SVG releases separate rings. Assemble the supports first, then follow the numbered ring order in Assembly.',undefined,'info');
 else{// Bridges are short guided beams (engineering.ts): with no support setting the heights they carry the whole drop.
  const st=bridgeStrain(p,g.rings,g.pitch);
  if(st.ratio>1)add('strain',`The bridges would bend ${st.ratio.toFixed(0)} times further than ${p.T} mm stock takes (a ${st.drop.toFixed(1)} mm drop between rings over ${st.length.toFixed(1)} mm lands), so they would crack. Rest the rings on supports that set their heights.`,p.pattern.kind==='rings'?{label:'Use profile ribs',apply:q=>({...q,support:{...q.support,kind:'ribs'}})}:{label:'Use cords',apply:q=>({...q,support:{...q.support,kind:'cords'}})});}
 if(!setsHeights(p)&&p.profile.kind!=='linear')add('support','This profile needs independent support at its ring heights.',{label:'Use profile ribs',apply:q=>({...q,support:{...q.support,kind:'ribs'}})});
 {// Neighbouring rings at different heights leave a slit in the wall: small things fall out of a bowl.
  let step=0;for(let i=0;i+1<g.rings.length;i++)step=Math.max(step,Math.abs(g.rings[i].height-g.rings[i+1].height));const slit=step-p.T;
  if(p.mode==='bowl'&&p.profile.kind!=='pagoda'&&!p.extras.plantSeat&&slit>12)add('wall-gap',`The wall opens up to ${slit.toFixed(0)} mm between rings near the rim; small things fall through. Narrower rings close the steps.`,{label:'Narrower rings',apply:q=>({...q,rings:{...q.rings,by:'width',width:Math.max(Math.ceil(1.5*q.T+q.rings.gap),Math.round(g.pitch*Math.min(.8,12/Math.max(1,slit))*10)/10),variable:true}})});
  if(p.mode==='hanging'&&step>6*g.pitch)add('hang-apart',`Neighbouring rings hang up to ${step.toFixed(0)} mm apart; narrower rings make the shape read as one piece.`,{label:'Narrower rings',apply:q=>({...q,rings:{...q.rings,by:'width',width:Math.max(Math.ceil(1.5*q.T+q.rings.gap),Math.round(g.pitch*.7*10)/10),variable:true}})},'info');}
 if(p.extras.base&&(['ribs','post','handles'].includes(p.support.kind)||p.extras.post))add('base-plate','With ribs the base is a floor plate under them; glue the ribs to it after dry-fitting.',undefined,'info');
 if((p.engraving.text||p.engraving.rim||p.engraving.monogram)&&p.engraving.size<4)add('text','Engraving is very small.',{label:'Enlarge text',apply:q=>({...q,engraving:{...q.engraving,size:4}})});
 if(p.extras.socket!=='none'&&p.mode==='hanging'){
  // The bulb hangs below the centre disc, inside the rings: the ring under the disc has a hole the
  // size of the disc, so a bulb wider than that (less a heat gap) touches it.
  const bulb=p.extras.socket==='E14'?45:p.extras.socket==='E27'?60:p.extras.socketDiameter+20,need=bulb+20;
  if(p.rings.center<need)add('bulb',`An LED bulb (about Ø ${bulb} mm) is wider than the hole under the centre disc (Ø ${p.rings.center} mm) and would touch the rings; keep 10 mm round it.`,{label:`Centre disc ${need} mm`,apply:q=>({...q,rings:{...q.rings,center:need}})});}
 if(p.extras.socket!=='none'||p.extras.tealight)add('led','LED bulbs / LED tealights only. Keep heat sources away from wood and adhesives.');
 if(p.mode==='sleeve'&&p.rings.center<p.extras.sleeveDiameter+4*p.T+1)add('sleeve','Sleeve opening needs material clearance.',{label:'Enlarge centre',safe:false,apply:q=>({...q,rings:{...q.rings,center:q.extras.sleeveDiameter+4*q.T+2}})});
 return issues;
}
