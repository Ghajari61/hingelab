import type {Issue} from '@/lib/issues';
import type {GenOutput} from '../types';
import {ringPlan,setsHeights,tiltDepth} from './build';
import type {PopupParams} from './params';
export function checkPopup(p:PopupParams,out:GenOutput):Issue<PopupParams>[] {
 const issues:Issue<PopupParams>[]=[];
 const add=(code:string,message:string,fix?:{label:string;safe?:boolean;apply:(q:PopupParams)=>PopupParams},level:'warn'|'error'|'info'='warn')=>issues.push({code:'popup-'+code,level,message,fixes:fix?[{id:code,safe:true,...fix}]:[]});
 if(out.error){add('geometry',out.error,undefined,'error');return issues;}
 const g=ringPlan(p);if(g.pitch<1.5*p.T)add('ring-width','Ring pitch is below 1.5 × material thickness.',{label:'Widen rings',apply:q=>({...q,rings:{...q.rings,by:'width',width:Math.ceil(q.T*1.5+q.rings.gap)}})});
 if(p.bridges.width<Math.max(p.T*1.5,p.sheet?.minFeature??0))add('bridges','Bridge lands are narrower than the material minimum.',{label:'Widen bridge lands',apply:q=>({...q,bridges:{...q.bridges,width:Math.max(q.T*1.5,q.sheet?.minFeature??0)}})});
 if(p.bridges.length>g.pitch*.7)add('flexure-length','Bridge relief length is limited to 70% of ring pitch to keep adjacent slots apart.',undefined,'info');
 if(g.collapsed)add('collapse','Concave offsets collapsed before the requested ring count.',{label:'Reduce count',apply:q=>({...q,rings:{...q.rings,by:'count',count:Math.max(2,g.loops.length-1)}})});
 if(p.outline.width>p.bedW-10||p.outline.height>p.bedH-10)add('bed','Blank exceeds the selected bed; never split a connected blank automatically.',{label:'Scale outline to bed',safe:false,apply:q=>{const s=Math.min((q.bedW-10)/q.outline.width,(q.bedH-10)/q.outline.height);return {...q,outline:{...q.outline,width:q.outline.width*s,height:q.outline.height*s},rings:{...q.rings,center:q.rings.center*s,rim:q.rings.rim*s}};}});
 if(p.support.kind==='tilt'){const depth=tiltDepth(g.loops.length,p.rings.gap,p.support.angle);if(Math.abs(depth-p.profile.depth)>Math.max(2,p.profile.depth*.1))add('tilt-depth','Computed tilted-cut depth differs from the target.',{label:'Match bevel angle',apply:q=>({...q,support:{...q.support,angle:Math.max(1,Math.min(15,Math.atan(g.loops.length*q.rings.gap/Math.max(1,q.profile.depth))*180/Math.PI))}})});add('bevel','Tilted cuts require bevel-capable equipment; a normal laser cuts perpendicular to the sheet.');}
 if(setsHeights(p))add('snap-bridges','The supports set every ring\'s height: snap the bridge lands once the rings sit in place.',undefined,'info');
 else if(p.profile.depth/g.loops.length>p.bridges.length*.3)add('strain','Target lift may exceed bridge flexure. Validate with a coupon; supports do not make brittle bridges flexible.',{label:'Reduce target depth',apply:q=>({...q,profile:{...q.profile,depth:g.loops.length*q.bridges.length*.25}})});
 if(!setsHeights(p)&&p.profile.kind!=='linear')add('support','This profile needs independent support at its ring heights.',{label:'Use profile ribs',apply:q=>({...q,support:{...q.support,kind:'ribs'}})});
 if((p.engraving.text||p.engraving.rim||p.engraving.monogram)&&p.engraving.size<4)add('text','Engraving is very small.',{label:'Enlarge text',apply:q=>({...q,engraving:{...q.engraving,size:4}})});
 if(p.extras.socket!=='none'||p.extras.tealight)add('led','LED bulbs / LED tealights only. Keep heat sources away from wood and adhesives.');
 if(p.mode==='sleeve'&&p.rings.center<p.extras.sleeveDiameter+2*p.T+1)add('sleeve','Sleeve opening needs material clearance.',{label:'Enlarge centre',apply:q=>({...q,rings:{...q.rings,center:q.extras.sleeveDiameter+2*q.T+2}})});
 if(p.pattern.kind!=='rings')add('spiral','Spiral preview uses ring-height samples; strip twisting and material strain require a physical prototype.',undefined,'info');
 return issues;
}
