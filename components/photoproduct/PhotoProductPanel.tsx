"use client";
import { useEffect,useId,useRef,useState } from "react";
import { Camera,ChevronUp,ChevronDown,ImagePlus,LoaderCircle,RefreshCw,Star,Trash2,Upload,X } from "lucide-react";
import type { PhotoProductParams } from "@/lib/generators/photoproduct/params";
import { normalizeProductPhoto } from "@/lib/photoproduct/upload";
import { requestProductAnalysis } from "@/lib/photoproduct/client";
import { applyProductAnalysis } from "@/lib/photoproduct/apply";
import { MEASUREMENT_RANGES, measurementProblem, type ProductPhoto } from "@/lib/photoproduct/contracts";
import "./photoproduct.css";
type Props={params:PhotoProductParams;onApply:(p:PhotoProductParams)=>void;onGenerated:()=>void;onPackage:()=>Promise<void>;disabled?:boolean};
export function PhotoProductPanel({params,onApply,onGenerated,onPackage,disabled}:Props){
 const inputId=useId(),input=useRef<HTMLInputElement>(null),replaceInput=useRef<HTMLInputElement>(null),replaceId=useRef<string|null>(null);
 const latest=useRef(params),apply=useRef(onApply),serial=useRef(0),controller=useRef<AbortController|null>(null);latest.current=params;apply.current=onApply;
 const [selected,setSelected]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
 const [uploading,setUploading]=useState(false),[phase,setPhase]=useState<"idle"|"checking"|"analysis"|"building">("idle"),[preserve,setPreserve]=useState(true),[packing,setPacking]=useState(false),[dragging,setDragging]=useState(false);
 const busy=phase!=="idle",refs=params.references,main=refs.find(p=>p.id===selected)??refs[0];
 useEffect(()=>()=>{serial.current++;controller.current?.abort();},[]);
 function cancel(){serial.current++;controller.current?.abort();controller.current=null;setPhase("idle");}
 function writePhotos(photos:ProductPhoto[]){cancel();apply.current({...latest.current,references:photos});setError(null);setMessage("References changed. Analyze again to update the reconstruction.");}
 async function addFiles(files:File[],replacement:string|null=null){
  if(!files.length||disabled||uploading)return;
  const available=replacement?1:5-latest.current.references.length;
  if(files.length>available){setError("Use 1–5 photos. Remove an existing photo before adding more.");return;}
  cancel();setUploading(true);setError(null);setMessage(null);
  try{
   const converted:ProductPhoto[]=[];
   for(const file of files){
    const photo=await normalizeProductPhoto(file),others=latest.current.references.filter(p=>p.id!==replacement);
    if([...others,...converted].some(p=>p.digest===photo.digest))throw Error("This photo is already in the reference set. Choose another angle.");
    converted.push(photo);
   }
   const old=latest.current.references;
   const next=replacement?old.map(p=>p.id===replacement?converted[0]:p):[...old,...converted];
   writePhotos(next);setSelected(converted[0].id);setMessage("Photos are ready. Analyze them together to generate an editable model.");
  }catch(e){setError(e instanceof Error?e.message:"The photo could not be added.");}finally{setUploading(false);if(input.current)input.current.value="";if(replaceInput.current)replaceInput.current.value="";}
 }
 function move(id:string,delta:number){const arr=[...refs],i=arr.findIndex(p=>p.id===id),j=i+delta;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];writePhotos(arr);}
 async function analyze(){
  if(!refs.length||busy||uploading||disabled)return;
  const problem=measurementProblem(latest.current.measurements);if(problem){setError(problem);return;}
  const id=++serial.current,abort=new AbortController();controller.current=abort;setError(null);setMessage(null);setPhase("checking");
  const photos=[...refs],fingerprint=photos.map(p=>p.id+":"+p.digest).join("|");
  try{
   setPhase("analysis");
   const result=await requestProductAnalysis({photos,note:latest.current.note,measurements:latest.current.measurements},abort.signal);
   if(serial.current!==id||abort.signal.aborted)return;
   if(latest.current.references.map(p=>p.id+":"+p.digest).join("|")!==fingerprint)throw Error("The references changed during analysis. Analyze again.");
   setPhase("building");
   const next=applyProductAnalysis(latest.current,result.analysis,preserve,result.provider);apply.current(next.params);
   if(result.analysis.family==="unsupported")setMessage("This product is outside the supported recipes. The previous model has been kept; see the analysis below.");
   else{setMessage(next.preserved.length?`Model updated. Preserved ${next.preserved.length} settings you edited.`:"Editable reconstruction generated. Review estimated values and fabrication checks.");onGenerated();}
  }catch(e){if(abort.signal.aborted)setMessage("Analysis cancelled. The previous model is unchanged.");else setError(e instanceof Error?e.message:"Analysis failed. Your previous model is unchanged.");}
  finally{if(serial.current===id){setPhase("idle");controller.current=null;}}
 }
 const result=params.analysis.result;
 const stale=!!result&&(result.views.length!==refs.length||result.views.some(v=>!refs.some(p=>p.id===v.photoId)));
 let baseline: Record<string, unknown> | null = null;
 try { if (params.analysis.baseline) baseline = JSON.parse(params.analysis.baseline); } catch { /* Older example projects have no generated baseline. */ }
 const dimensionSources = (["width","depth",...(params.recipe === "heartbox" ? ["height"] : []),"thickness"] as const).map(key => {
  const value = key === "thickness" ? params.T : params.size[key as "width"|"depth"|"height"];
  const measured = params.measurements[key as keyof typeof params.measurements];
  const prior = key === "thickness" ? baseline?.T : (baseline?.size as Record<string, unknown> | undefined)?.[key];
  const source = measured > 0 && Math.abs(measured - value) < .001 ? "Measured" : (params.analysis.status === "example" || (result?.family === "unsupported" && !baseline)) ? "Example" : prior !== value ? "Edited" : "Estimated";
  return { key, value, source, conflict: measured > 0 && Math.abs(measured-value) >= .001 ? measured : null };
 });
 const known=(key:keyof PhotoProductParams["measurements"],raw:string)=>{
  const value=raw===""?0:Number(raw);if(!Number.isFinite(value))return;
  const next={...latest.current,measurements:{...latest.current.measurements,[key]:value}};
  apply.current(next);
 };
 return <section className="photo-product-panel" aria-label="Photo to Product references" aria-busy={busy||uploading}>
  <div className="photo-product-intro"><span className="photo-product-eyebrow"><Camera size={15} aria-hidden/> PHOTO TO PRODUCT</span><h3>From reference to real parts.</h3><p>Upload 1–5 views of one product. Get editable geometry, 3D and cutting files.</p></div>
  <div className={`photo-product-drop${dragging?" is-dragging":""}`} onDragOver={e=>{e.preventDefault();if(!disabled)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void addFiles(Array.from(e.dataTransfer.files));}}>
   <input id={inputId} ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={disabled||uploading} onChange={e=>void addFiles(Array.from(e.target.files??[]))}/>
   <input ref={replaceInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>void addFiles(Array.from(e.target.files??[]),replaceId.current)}/>
   <button type="button" className="photo-product-upload" onClick={()=>input.current?.click()} disabled={disabled||uploading||refs.length>=5} aria-controls={inputId}>{uploading?<LoaderCircle size={20} className="photo-product-spin" aria-hidden/>:<ImagePlus size={22} aria-hidden/>}<strong>{uploading?"Preparing photos…":refs.length?"Add another view":"Choose product photos"}</strong><span>{refs.length}/5 · JPEG, PNG or WebP · 12 MB each</span></button>
  </div>
  {main&&<figure className="photo-product-reference"><img src={main.data} alt={`Product reference: ${main.name}`} width={main.width} height={main.height}/><figcaption>{main.name}</figcaption></figure>}
  {!!refs.length&&<ol className="photo-product-photos" aria-label="Reference photos">{refs.map((photo,i)=><li key={photo.id}>
   <button type="button" className="photo-product-thumb" aria-label={`View photo ${i+1}: ${photo.name}`} aria-pressed={main?.id===photo.id} onClick={()=>setSelected(photo.id)}><img src={photo.data} alt=""/>{i===0&&<span>Main</span>}</button>
   <div className="photo-product-photo-actions">
    <button type="button" title="Make main reference" aria-label={`Make photo ${i+1} the main reference`} disabled={i===0||disabled||uploading} onClick={()=>writePhotos([photo,...refs.filter(p=>p.id!==photo.id)])}><Star size={13} aria-hidden/></button>
    <button type="button" title="Move earlier" aria-label={`Move photo ${i+1} earlier`} disabled={i===0||disabled||uploading} onClick={()=>move(photo.id,-1)}><ChevronUp size={13} aria-hidden/></button>
    <button type="button" title="Move later" aria-label={`Move photo ${i+1} later`} disabled={i===refs.length-1||disabled||uploading} onClick={()=>move(photo.id,1)}><ChevronDown size={13} aria-hidden/></button>
    <button type="button" title="Replace photo" aria-label={`Replace photo ${i+1}`} disabled={disabled||uploading} onClick={()=>{replaceId.current=photo.id;replaceInput.current?.click();}}><RefreshCw size={13} aria-hidden/></button>
    <button type="button" title="Remove photo" aria-label={`Remove photo ${i+1}`} disabled={disabled||uploading} onClick={()=>writePhotos(refs.filter(p=>p.id!==photo.id))}><Trash2 size={13} aria-hidden/></button>
   </div>
  </li>)}</ol>}
  <p className="photo-product-tip">Front, side, back and connection details help. Additional views are optional.</p>
  <details className="photo-product-details"><summary>Known measurements <span>optional · mm</span></summary><p>Leave unknown values empty. These constrain the next analysis; dimensions remain editable in the settings.</p><div className="photo-product-measurements">{(["width","depth","height","thickness"] as const).map(key=><label key={key}>{key[0].toUpperCase()+key.slice(1)}<input aria-label={`Known ${key} in millimetres`} type="number" min="0" max={MEASUREMENT_RANGES[key][1]} step={key==="thickness"?.1:1} value={params.measurements[key]||""} placeholder="Unknown" disabled={disabled||busy} onChange={e=>known(key,e.target.value)}/></label>)}</div></details>
  <details className="photo-product-details"><summary>Dimension sources</summary><dl className="photo-product-origins">{dimensionSources.map(d=><div key={d.key}><dt>{d.key}</dt><dd>{d.value} mm <span>{d.source}</span>{d.conflict!==null&&<small>Known value: {d.conflict} mm; the next analysis will use it.</small>}</dd></div>)}</dl></details>
  <label className="photo-product-note">About this product <span>optional</span><textarea value={params.note} maxLength={800} rows={2} placeholder="A name, a known feature, or a detail to keep…" disabled={disabled||busy} onChange={e=>onApply({...params,note:e.target.value})}/></label>
  <label className="photo-product-preserve"><input type="checkbox" checked={preserve} onChange={e=>setPreserve(e.target.checked)} disabled={busy||disabled}/> Keep my edited settings when regenerating</label>
  {!preserve&&<p className="photo-product-caution">Generating again will replace manual design settings with the new suggestions. Known measurements remain authoritative.</p>}
  <button type="button" className="photo-product-analyze" onClick={()=>void analyze()} disabled={disabled||uploading||busy||!refs.length}>{busy?<LoaderCircle size={17} className="photo-product-spin" aria-hidden/>:<Upload size={17} aria-hidden/>}{phase==="checking"?"Checking references…":phase==="analysis"?"Analyzing all views…":phase==="building"?"Building editable parts…":"Analyze & Generate"}</button>
  {busy&&<button type="button" className="photo-product-cancel" onClick={()=>{cancel();setMessage("Analysis cancelled. Previous model kept.");}}><X size={14} aria-hidden/> Cancel analysis</button>}
  {error&&<p className="photo-product-error" role="alert">{error}</p>}{message&&<p className="photo-product-message" role="status">{message}</p>}
  {params.analysis.status==="example"&&<p className="photo-product-example">Example recipe below. This model has not been generated from your photos.</p>}
  {result&&<details className="photo-product-report" open><summary>Analysis & assumptions</summary>{stale&&<p className="photo-product-caution">References changed since this analysis. Generate again to update it.</p>}<strong>{result.title}</strong><p>{result.summary}</p><p className="photo-product-evidence">Recognition evidence: {result.confidence}. This is not dimensional accuracy.</p>{[["Observed",result.observations],["Estimated / assumed",result.assumptions],["Uncertain",result.uncertainties]].map(([label,items])=><div key={label as string}><h4>{label as string}</h4><ul>{(items as string[]).map((item,i)=><li key={i}>{item}</li>)}</ul></div>)}<h4>Reference evidence</h4><ul>{result.views.map(v=><li key={v.photoId}>{refs.findIndex(p=>p.id===v.photoId)>=0?`Photo ${refs.findIndex(p=>p.id===v.photoId)+1}`:"Previous photo"}: {v.view}, {v.quality}. {v.evidence}</li>)}</ul></details>}
  <button type="button" className="photo-product-package" disabled={disabled||busy||packing} onClick={()=>{setPacking(true);void onPackage().catch(e=>setError(e instanceof Error?e.message:"Package export failed.")).finally(()=>setPacking(false));}}>{packing?<LoaderCircle className="photo-product-spin" size={15} aria-hidden/>:null} Download build package</button>
  <p className="photo-product-privacy">Analysis copies are saved with this project and sent to the configured AI service only when you analyze. Verify estimated dimensions and cut a sample before production.</p>
 </section>;
}

export default PhotoProductPanel;
