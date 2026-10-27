"use client";
import type {PhotoProductParams} from '@/lib/generators/photoproduct/params';
import type {JoineryReport} from '@/lib/photoproduct/joinery';

export function PhotoJoineryPanel({params:p,report,onApply,disabled}:{params:PhotoProductParams;report?:JoineryReport;onApply:(p:PhotoProductParams)=>void;disabled?:boolean}){
 if(p.recipe!=='custom'||!p.generated)return null;
 const mechanical=report?.joints.filter(j=>j.kind!=='glue')??[],glue=report?.joints.filter(j=>j.kind==='glue')??[];
 const update=(key:keyof PhotoProductParams['joinery'],value:string|number)=>onApply({...p,joinery:{...p.joinery,[key]:value}});
 return <section className="photo-joinery" aria-label="Automatic assembly connections">
  <div className="photo-joinery-heading"><h3>Assembly connections</h3><span>{p.joinery.mode==='off'?'Off':report?.groups===1?'Contact checked':'Review needed'}</span></div>
  <label className="photo-product-preserve"><input type="checkbox" checked={p.joinery.mode==='auto'} disabled={disabled} onChange={e=>update('mode',e.target.checked?'auto':'off')}/> Engineer matching joints automatically</label>
  <p>Tabs, slots and half-laps follow the actual contact between parts and each piece’s thickness. Changing dimensions rebuilds both sides together.</p>
  {p.joinery.mode==='auto'&&<>
   <div className="photo-joinery-summary"><strong>{mechanical.length}<small>paired joints</small></strong><strong>{glue.length}<small>glue contacts</small></strong><strong>{report?.groups??'—'}<small>assemblies</small></strong></div>
   <label className="photo-joinery-clearance">Total fit clearance <span>mm · before kerf</span><input aria-label="Total fit clearance" type="number" min="0" max="1" step=".05" value={p.joinery.clearance} disabled={disabled} onChange={e=>{if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber))update('clearance',Math.min(1,Math.max(0,e.target.valueAsNumber)));}}/></label>
   <p>Slot width = mating thickness + clearance. The default 0.15 mm is a starting assumption; use measured stock and a fit sample. Kerf is applied separately, once.</p>
   <details><summary>Joint proportions</summary><div className="photo-generated-grid">{([{key:'tabWidth',label:'Tab width × thickness',min:2,max:8},{key:'spacing',label:'Tab spacing × thickness',min:6,max:30},{key:'minWeb',label:'Minimum web × thickness',min:.5,max:3}] as const).map(f=><label key={f.key}>{f.label}<input type="number" min={f.min} max={f.max} step=".5" value={p.joinery[f.key]} disabled={disabled} onChange={e=>{if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber))update(f.key,Math.min(f.max,Math.max(f.min,e.target.valueAsNumber)));}}/></label>)}</div></details>
   {!!report?.warnings.length&&<div className="photo-product-caution" role="status">{report.warnings.map(w=><p key={w}>{w}</p>)}</div>}
   {!!report?.joints.length&&<details><summary>Matched parts & assembly steps ({report.joints.length})</summary><ol className="photo-joinery-list">{report.joints.map(j=><li key={j.id}><strong>{j.id} · {j.kind==='tab-slot'?'Tab & slot':j.kind==='cross-lap'?'Half-lap':'Glue face'}</strong><span>{j.a} ↔ {j.b}</span><p>{j.instruction}</p></li>)}</ol></details>}
  </>}
 </section>;
}
