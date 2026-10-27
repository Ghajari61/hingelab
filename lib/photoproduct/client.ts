"use client";
import { platform } from "@hingelab/platform";
import { AnalysisSchema,parsePhotoRequest,type PhotoAnalysisRequest,type ProductAnalysis } from "./contracts";
export async function requestProductAnalysis(body:PhotoAnalysisRequest,signal:AbortSignal):Promise<{analysis:ProductAnalysis;provider:string}>{
 const text=JSON.stringify(body);parsePhotoRequest(text);
 const app=platform(),url=app.kind==="tauri"?"/api/desktop/photoproduct":"/api/ai/photoproduct";
 const init={method:"POST",headers:{"content-type":"application/json"},body:text};
 let rejectAbort:((reason:unknown)=>void)|null=null;
 const abort=()=>rejectAbort?.(new DOMException("Cancelled","AbortError"));
 const cancelled=new Promise<never>((_,reject)=>{rejectAbort=reject;signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();});
 try{
  const task=app.kind==="web"?fetch(url,{...init,signal,credentials:"same-origin"}):app.fetch(url,init);
  const reply=await Promise.race([task,cancelled]);
  const json=await reply.json().catch(()=>null) as {analysis?:unknown;provider?:unknown;error?:unknown;message?:unknown}|null;
  if(!reply.ok)throw Error(typeof json?.message==="string"?json.message:typeof json?.error==="string"?json.error:`Photo analysis failed (${reply.status}).`);
  const analysis=AnalysisSchema.safeParse(json?.analysis);if(!analysis.success)throw Error("The server returned an invalid reconstruction. Your previous model has been kept.");
  if(signal.aborted)throw new DOMException("Cancelled","AbortError");
  return {analysis:analysis.data,provider:typeof json?.provider==="string"?json.provider.slice(0,80):"configured provider"};
 }finally{signal.removeEventListener("abort",abort);}
}
