"use client";
import {useState} from 'react';
import {curvePoints} from '@/lib/generators/popup/build';
import type {PopupParams} from '@/lib/generators/popup/params';
/** Supplements the shared schema fields with visual editing; writes the same saved params. */
export function PopupTools({params,onApply}:{params:PopupParams;onApply:(p:PopupParams)=>void}){
 const [error,setError]=useState('');const [drag,setDrag]=useState<number|null>(null);
 let pts:[number,number][]=[];try{pts=curvePoints(params.profile.curve);}catch{}
 async function upload(file:File|undefined){if(!file)return;try{if(file.size>200000)throw Error('Use an SVG under 200 KB.');const doc=new DOMParser().parseFromString(await file.text(),'image/svg+xml');if(doc.querySelector('parsererror,script,foreignObject,use,image')||doc.querySelectorAll('path').length!==1||doc.querySelector('[transform]'))throw Error('Export a single closed SVG path with transforms applied.');const d=doc.querySelector('path')?.getAttribute('d');if(!d||!/[zZ]\s*$/.test(d))throw Error('The path must be closed.');onApply({...params,outline:{...params.outline,shape:'custom',path:d}});setError('');}catch(e){setError(e instanceof Error?e.message:'Cannot read this SVG.');}}
 return <details className="panel-section"><summary>Pop-up visual tools · Pro</summary><div style={{padding:12,display:'grid',gap:12}}>
 <label>Upload closed SVG outline<input type="file" accept=".svg,image/svg+xml" onChange={e=>void upload(e.target.files?.[0])}/></label>
 <p>Drag profile controls. Horizontal: centre → rim. Vertical: normalized height. Numeric controls remain available in Height &amp; profile.</p>
 <svg viewBox="0 0 280 150" role="group" aria-label="Custom profile curve" style={{width:'100%',touchAction:'none',background:'#f3f4f1',border:'1px solid #ccc'}} onPointerMove={e=>{if(drag===null)return;const b=e.currentTarget.getBoundingClientRect(),x=Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y=Math.max(0,Math.min(1,1-(e.clientY-b.top)/b.height));const next=pts.map((p,i)=>i===drag?[i===0?0:i===pts.length-1?1:Math.max(pts[i-1][0]+.01,Math.min(pts[i+1][0]-.01,x)),y]:p);onApply({...params,profile:{...params.profile,kind:'custom',curve:next.map(v=>v.map(n=>n.toFixed(3)).join(',')).join(';')}});}} onPointerUp={()=>setDrag(null)} onPointerCancel={()=>setDrag(null)}>
 <polyline points={pts.map(([x,y])=>`${x*280},${(1-y)*150}`).join(' ')} fill="none" stroke="#334940" strokeWidth="2"/>
 {pts.map(([x,y],i)=><circle key={i} cx={x*280} cy={(1-y)*150} r="6" fill="#334940" tabIndex={0} role="slider" aria-label={`Profile point ${i+1} height`} aria-valuenow={y} aria-valuemin={0} aria-valuemax={1} onKeyDown={e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const q=pts.map((v,j)=>j===i?[v[0],Math.max(0,Math.min(1,v[1]+(e.key==='ArrowUp'?.02:-.02)))]:v);onApply({...params,profile:{...params.profile,kind:'custom',curve:q.map(v=>v.join(',')).join(';')}});}} onPointerDown={e=>{e.preventDefault();e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);setDrag(i);}}/>)}
 </svg>{error&&<p role="alert">{error}</p>}
 <p>Free previews are available; downloads and advanced options use the existing Pro export gate. Test material flexure before manufacture.</p>
 </div></details>;
}
