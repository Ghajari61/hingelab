import {generatedTable} from "./generated-fixture";
import { describe,it,expect } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { MockLanguageModelV4 } from "ai/test";
import { AnalysisSchema,parsePhotoRequest,type ProductPhoto,type ProductAnalysis } from "../contracts";
import { analyzeProductPhotos } from "../analyze";
import { applyProductAnalysis } from "../apply";
import { mergePhotoProduct } from "@/lib/generators/photoproduct/params";
export function photo(id="p1"):ProductPhoto{
 const bytes=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="tan"/></svg>',{font:{loadSystemFonts:false}}).render().asPng();
 return {id,name:id+".png",data:"data:image/png;base64,"+Buffer.from(bytes).toString("base64"),width:64,height:64,digest:createHash("sha256").update(bytes).digest("hex")};
}
export const specification=(ids=["p1"]):Extract<ProductAnalysis,{name:string}>=>({family:"paw",title:"Pet paw",summary:"A layered paw ornament.",width:100,depth:105,height:30,thickness:3,name:"Juno",subtitle:"",font:"pacifico",wings:true,connected:true,snowflakes:true,backing:true,honeycomb:false,shape:"rounded",frameWidth:4,holeDiameter:5,detailRadius:6,backThickness:2,letterHeight:16,rimWidth:10,hexRadius:8,hexWeb:3,lidClearance:.4,observations:["Paw windows and name are visible."],assumptions:["Dimensions and stock thickness are estimated."],uncertainties:["The back is not visible."],views:ids.map(photoId=>({photoId,view:"front",quality:"useful",evidence:"Paw outline visible."})),confidence:"medium"});
const measurements={width:0,depth:0,height:0,thickness:0};
const usage={inputTokens:{total:10,noCache:10,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:20,text:20,reasoning:undefined}};
function mock(legacy:ReturnType<typeof specification>){const {title,summary,width,depth,height,thickness,observations,assumptions,uncertainties,views,confidence}=legacy;const answer={family:"custom",title,summary,width,depth,height,thickness,observations,assumptions,uncertainties,views,confidence,model:generatedTable()};const calls:unknown[]=[];return {calls,model:new MockLanguageModelV4({doGenerate:async opts=>{calls.push(opts.prompt);return {content:[{type:"text",text:JSON.stringify(answer)}],finishReason:{unified:"stop",raw:undefined},usage,warnings:[]} as never;}})};}
describe("photo input boundary",()=>{
 it("accepts one or five references and rejects zero, six, duplicate ids and malicious image data",()=>{
  for(const count of [1,5])expect(parsePhotoRequest(JSON.stringify({photos:Array.from({length:count},(_,i)=>photo("p"+i)),note:"",measurements})).photos).toHaveLength(count);
  for(const photos of [[],Array.from({length:6},(_,i)=>photo("p"+i)),[photo(),photo()],[{...photo(),data:"https://example.com/a.png"}],[{...photo(),data:"data:image/svg+xml;base64,PHN2Zz4="}],[{...photo(),width:10000}],[{...photo(),height:80}]])expect(()=>parsePhotoRequest(JSON.stringify({photos,note:"",measurements}))).toThrow();
 });
 it("rejects oversized bodies and unbounded AI specifications",()=>{
  expect(()=>parsePhotoRequest("x".repeat(2_200_000))).toThrow(/large/);
  expect(AnalysisSchema.safeParse({...specification(),width:Infinity}).success).toBe(false);
  expect(AnalysisSchema.safeParse({...specification(),code:"eval()"}).success).toBe(false);
 });
});
describe("joint multi-view model analysis",()=>{
 it("sends all five photos in one request, validates their ids and keeps measured dimensions authoritative",async()=>{
  const ids=["p1","p2","p3","p4","p5"],m=mock(specification(ids));
  const out=await analyzeProductPhotos({photos:ids.map(photo),note:"same product",measurements:{...measurements,width:125}},"test",{model:m.model});
  expect(m.calls).toHaveLength(1);expect(JSON.stringify(m.calls)).toContain("p5");expect(out.analysis.width).toBe(125);expect(out.analysis.uncertainties.join(" ")).toMatch(/Repeated photos/);
 });
 it("refuses incomplete or contradictory reference bookkeeping",async()=>{
  const m=mock(specification(["wrong-id"]));await expect(analyzeProductPhotos({photos:[photo()],note:"",measurements},"test",{model:m.model})).rejects.toThrow(/valid product specification/);
 });
 it("does not invent a supported product when all views are unrelated",async()=>{
  const a=specification();a.views[0].quality="unrelated";const m=mock(a);
  expect((await analyzeProductPhotos({photos:[photo()],note:"",measurements},"test",{model:m.model})).analysis.family).toBe("unreconstructable");
 });
});
describe("regeneration and persistence",()=>{
 it("preserves manual edits and measurements while updating unedited inferred values",()=>{
  const first=applyProductAnalysis(mergePhotoProduct({}),specification()).params;
  const edited=mergePhotoProduct({...first,text:{...first.text,name:"Lucy"},size:{...first.size,width:150},references:[photo()]});
  const second=applyProductAnalysis(edited,{...specification(),width:180,depth:130,name:"Max"});
  expect(second.params.text.name).toBe("Lucy");expect(second.params.size.width).toBe(150);expect(second.params.size.depth).toBe(130);expect(second.preserved).toContain("text.name");
  const reopened=mergePhotoProduct(JSON.parse(JSON.stringify(second.params)));expect(reopened.references).toHaveLength(1);expect(reopened.text.name).toBe("Lucy");
 });
 it("can explicitly replace edits and never replaces a model with an unsupported reconstruction",()=>{
  const current=mergePhotoProduct({text:{name:"Mine"}});
  expect(applyProductAnalysis(current,specification(),false).params.text.name).toBe("Juno");
  const unsupported=applyProductAnalysis(current,{...specification(),family:"unsupported"}).params;
  expect(unsupported.recipe).toBe(current.recipe);expect(unsupported.text.name).toBe("Mine");
 });
});

describe("general photo model edit preservation",()=>{it("keeps manually edited part geometry and parameter values when regenerating",()=>{const old=specification();const {title,summary,width,depth,height,thickness,observations,assumptions,uncertainties,views,confidence}=old;const custom={family:"custom" as const,title,summary,width,depth,height,thickness,observations,assumptions,uncertainties,views,confidence,model:generatedTable()};const first=applyProductAnalysis(mergePhotoProduct({}),custom).params;first.generated!.parts[0].width="W-5";first.values.apron=55;const second=applyProductAnalysis(first,custom);expect(second.params.generated?.parts[0].width).toBe("W-5");expect(second.params.values.apron).toBe(55);expect(second.preserved).toContain("part.top");expect(applyProductAnalysis(first,custom,false).params.generated?.parts[0].width).toBe("W");});});
