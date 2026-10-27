import {z} from 'zod';
import {unionShapes,differenceShapes,shapeContours} from '@/lib/letters/polygon';
import {rect,ellipse,bboxOf,pointInContour} from '@/lib/generators/geom';
import {orient} from '@/lib/generators/shapes';
import {textBlock} from '@/lib/generators/weld';
import type {BuildContext,Contour,GenOutput,GenPart,Pt} from '@/lib/generators/types';
const expr=z.string().min(1).max(160);
const point=z.tuple([z.number().min(-4).max(4),z.number().min(-4).max(4)]);
const profile=z.object({kind:z.enum(['rectangle','ellipse','polygon']),x:expr,y:expr,w:expr,h:expr,points:z.array(point).max(160),count:expr,dx:expr,dy:expr}).strict();
export const GeneratedModelSchema=z.object({
 parameters:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9_]{0,23}$/),label:z.string().min(1).max(60),value:z.number().finite().min(-4000).max(4000),min:z.number().finite().min(-4000).max(4000),max:z.number().finite().min(-4000).max(4000),step:z.number().min(.01).max(100)}).strict()).max(24),
 parts:z.array(z.object({id:z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),name:z.string().min(1).max(70),count:expr,width:expr,height:expr,thickness:expr,outline:profile,additions:z.array(profile).max(12),holes:z.array(profile).max(40),cuts:z.array(profile).max(12),score:z.array(profile).max(12),engraving:z.object({text:z.string().max(100),font:z.enum(['pacifico','archivo-black','vazirmatn','lalezar']),size:expr,x:expr,y:expr}).strict().nullable(),pose:z.object({x:expr,y:expr,z:expr,rx:expr,ry:expr,rz:expr,dx:expr,dy:expr,dz:expr,drz:expr}).strict()}).strict()).min(1).max(48),
 assembly:z.array(z.string().max(300)).min(1).max(24),limitations:z.array(z.string().max(300)).min(1).max(16),
}).strict().superRefine((m,ctx)=>{
 const ids=new Set<string>();for(const p of m.parameters){if(ids.has(p.id)||p.min>=p.max||p.value<p.min||p.value>p.max||['i','j','pi','pw','ph','sin','cos','tan','sqrt','abs','min','max','floor','ceil','round'].includes(p.id))ctx.addIssue({code:'custom',message:'Invalid or duplicate parameter '+p.id});ids.add(p.id);}
 const parts=new Set<string>();for(const p of m.parts){if(parts.has(p.id))ctx.addIssue({code:'custom',message:'Duplicate part id'});parts.add(p.id);}
});
export type GeneratedModel=z.infer<typeof GeneratedModelSchema>;
/** Small arithmetic interpreter. Never evaluates JavaScript, property access, assignments or imports. */
export function evaluateDimension(source:string,vars:Record<string,number>):number{
 if(source.length>160)throw Error('Expression is too long');
 const tokens=source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+*/%,^-]/g)??[];
 if(tokens.join('')!==source.replace(/\s/g,'')||tokens.length>100)throw Error('Invalid arithmetic expression');let at=0,depth=0;
 const fn:Record<string,(...x:number[])=>number>={sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,min:Math.min,max:Math.max,floor:Math.floor,ceil:Math.ceil,round:Math.round};
 function atom():number{if(++depth>20)throw Error('Expression nesting limit');let n:number;const t=tokens[at++];if(t==='+'||t==='-')n=(t==='-'?-1:1)*atom();else if(t==='('){n=parse(0);if(tokens[at++]!==')')throw Error('Unclosed expression');}else if(t&&/^(?:\d|\.)/.test(t))n=Number(t);else if(t&&Object.hasOwn(fn,t)&&tokens[at]==='('){at++;const args=[parse(0)];while(tokens[at]===','){at++;args.push(parse(0));if(args.length>8)throw Error('Too many arguments');}if(tokens[at++]!==')')throw Error('Invalid function');n=fn[t](...args);}else if(t==='pi')n=Math.PI;else if(t&&Object.hasOwn(vars,t))n=vars[t];else throw Error('Unknown dimension: '+t);depth--;return n;}
 function parse(min:number):number{let a=atom();const precedence:Record<string,number>={'+':1,'-':1,'*':2,'/':2,'%':2,'^':3};while(at<tokens.length){const op=tokens[at],p=precedence[op];if(!p||p<min)break;at++;const b=parse(p+(op==='^'?0:1));a=op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:op==='/'?a/b:op==='%'?a%b:Math.pow(a,b);if(!Number.isFinite(a)||Math.abs(a)>1e7)throw Error('Dimension result exceeds limit');}return a;}
 const result=parse(0);if(at!==tokens.length||!Number.isFinite(result)||Math.abs(result)>1e7)throw Error('Invalid dimension result');return result;
}
const area=(c:Contour)=>Math.abs(c.reduce((s,a,i)=>{const b=c[(i+1)%c.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2);
function validRing(c:Contour){
 if(c.length<3||area(c)<.1)throw Error('Part profile has no usable area');
 const cross=(a:Pt,b:Pt,c:Pt)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=0;i<c.length;i++)for(let j=i+2;j<c.length;j++){if(i===0&&j===c.length-1)continue;const a=c[i],b=c[(i+1)%c.length],d=c[j],e=c[(j+1)%c.length];if(cross(a,b,d)*cross(a,b,e)<-1e-9&&cross(d,e,a)*cross(d,e,b)<-1e-9)throw Error('Self-intersecting profile');}
}
export function buildGeneratedProduct(model:GeneratedModel,size:{width:number;depth:number;height:number},T:number,values:Record<string,number>,ctx:BuildContext):GenOutput{
 try{
 if(![size.width,size.depth,size.height,T].every(Number.isFinite)||Math.min(size.width,size.depth,size.height)<1||T<.5||T>50)throw Error('Invalid overall dimensions or thickness');
 const checked=GeneratedModelSchema.parse(model),scope:Record<string,number>={W:size.width,D:size.depth,H:size.height,T};
 for(const p of checked.parameters){const v=values[p.id]??p.value;if(!Number.isFinite(v)||v<p.min||v>p.max)throw Error(p.label+' is outside its limits');scope[p.id]=v;}
 const parts:GenPart[]=[];let operations=0,vertices=0;
 const count=(text:string,v:Record<string,number>,max:number)=>{const x=evaluateDimension(text,v);if(!Number.isInteger(x)||x<1||x>max)throw Error('Repeat count exceeds limit');return x;};
 for(const part of checked.parts){const n=count(part.count,scope,128);if(parts.length+n>160)throw Error('Part count limit is 160');
 for(let i=0;i<n;i++){
 const v={...scope,i},ev=(s:string)=>evaluateDimension(s,v),w=ev(part.width),h=ev(part.height),t=ev(part.thickness);
 if(w<1||h<1||w>4000||h>4000||t<.5||t>50)throw Error(part.name+': invalid physical dimensions');Object.assign(v,{pw:w,ph:h});
 const profiles=(p:z.infer<typeof profile>,open=false):Contour[]=>{const rings:Contour[]=[];for(let j=0;j<count(p.count,v,128);j++){
 if(++operations>6000)throw Error('Geometry complexity limit');const q={...v,j},e=(s:string)=>evaluateDimension(s,q),x=(e(p.x)+j*e(p.dx))*w,y=(e(p.y)+j*e(p.dy))*h,a=e(p.w)*w,b=e(p.h)*h;
 if(a<=0||b<=0||Math.max(Math.abs(x),Math.abs(y),a,b)>8000)throw Error('Profile dimensions exceed limit');
 const c:Contour=p.kind==='rectangle'?rect(x,y,a,b):p.kind==='ellipse'?ellipse(x+a/2,y+b/2,a/2,b/2,80):p.points.map(([u,k])=>[x+u*a,y+k*b] as Pt);
 if(c.length<(open?2:3))throw Error('Profile needs more points');vertices+=c.length;if(vertices>100000)throw Error('Geometry vertex limit');if(!open)validRing(c);rings.push(c);
 }return rings;};
 const outline=profiles(part.outline);if(outline.length!==1)throw Error('Each repeated part must have one outline');
 const adds=part.additions.flatMap(p=>profiles(p));const solid=unionShapes([...outline,...adds].map(c=>orient(c)));if(solid.length!==1)throw Error(part.name+': additions must be connected');
 const holes=part.holes.flatMap(p=>profiles(p));const shape=holes.length?differenceShapes(shapeContours(solid),holes):solid;
 if(shape.length!==1||area(shape[0].outer)<1)throw Error(part.name+': cuts disconnect or erase the part');
 const paths=(list:z.infer<typeof profile>[])=>list.flatMap(p=>profiles(p,true)).map(c=>{if(c.some(pt=>!pointInContour(pt,shape[0].outer)))throw Error(part.name+': toolpath outside part');return c;});
 const engrave:Contour[]=[];
 if(part.engraving?.text){const g=part.engraving,missing:string[]=[];const text=textBlock(ctx,g.text,g.font,ev(g.size),{missing});if(text.loading)throw Error('Engraving font is unavailable');if(missing.length)throw Error('Font does not cover the engraving text');const gx=ev(g.x),gy=ev(g.y);for(const c of text.contours)engrave.push(c.map(([x,y])=>[x+gx,y+gy] as Pt));if(engrave.some(c=>c.some(pt=>!pointInContour(pt,shape[0].outer))))throw Error('Engraving extends outside '+part.name);}
 const p=part.pose,x=ev(p.x)+i*ev(p.dx),y=ev(p.y)+i*ev(p.dy),z=ev(p.z)+i*ev(p.dz),rx=ev(p.rx)*Math.PI/180,ry=ev(p.ry)*Math.PI/180,rz=(ev(p.rz)+i*ev(p.drz))*Math.PI/180;
 if([x,y,z].some(a=>Math.abs(a)>8000))throw Error('Assembly position exceeds limit');const [cx,sx,cy,sy,cz,sz]=[Math.cos(rx),Math.sin(rx),Math.cos(ry),Math.sin(ry),Math.cos(rz),Math.sin(rz)];
 const m=[cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,x,sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,y,-sy,cy*sx,cy*cx,z];
 const b=bboxOf([shape[0].outer]);if(b.x1-b.x0>4000||b.y1-b.y0>4000)throw Error('Part exceeds size limit');
 parts.push({id:part.id+'-'+(i+1),name:String(parts.length+1).padStart(2,'0')+' · '+part.name+(n>1?' '+(i+1):''),outer:shape[0].outer,holes:shape[0].holes,cuts:paths(part.cuts),score:paths(part.score),engrave,t,stock:'wood-'+t+'mm',place:{x,y,z,m}});
 }}
 return {parts,stats:[{label:'Generated parts',value:String(parts.length)},{label:'Overall target',value:`${size.width} × ${size.depth} × ${size.height} mm`}],assembly:[...checked.assembly,...checked.limitations]};
 }catch(e){return {parts:[],stats:[],error:e instanceof Error?e.message:'Invalid generated geometry'};}
}
