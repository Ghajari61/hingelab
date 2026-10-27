import {GeneratedModelSchema,type GeneratedModel} from "@/lib/photoproduct/generated";
import { DEFAULTS, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { AnalysisSchema, MEASUREMENT_RANGES, PhotoSchema, validatePhoto, type ProductAnalysis, type ProductPhoto } from "@/lib/photoproduct/contracts";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
export interface PhotoProductParams extends GenBase {
 recipe:"custom"|"paw"|"heartbox"|"tag";
 generated:GeneratedModel|null; values:Record<string,number>; hiddenParts:string[];
 size:{width:number;depth:number;height:number};
 text:{name:string;subtitle:string;fontId:string;size:number};
 paw:{wings:boolean;frame:number;detail:"snowflake"|"heart"|"none";detailSize:number;connected:boolean;backing:boolean;backThickness:number;backMaterial:string;backKerf:number;backColor:string;hole:number};
 box:{rim:number;lid:"solid"|"honeycomb";hex:number;web:number;clearance:number;pitch:number;slit:number;bridge:number;edge:number};
 tag:{shape:"rounded"|"circle"|"heart"|"tag"|"hexagon"|"pill";hole:number};
 references:ProductPhoto[];
 measurements:{width:number;depth:number;height:number;thickness:number};
 analysis:{status:"example"|"ai";result:ProductAnalysis|null;baseline:string;provider:string};
 note:string;
}
export const PHOTO_DEFAULTS:PhotoProductParams={
 name:"Photo product",material:"birch3",T:3,K:DEFAULTS.K,bedW:600,bedH:400,gap:4,fit:{...FIT_OFF},sheet:{...SHEET_DEFAULTS},job:{...JOB_EXTRAS},layers:clone(DEFAULTS.layers),
 recipe:"custom",generated:null,values:{},hiddenParts:[],size:{width:100,depth:105,height:30},text:{name:"Lucy",subtitle:"",fontId:"pacifico",size:16},
 paw:{wings:false,frame:4,detail:"snowflake",detailSize:6,connected:true,backing:true,backThickness:2,backMaterial:"acr2",backKerf:.1,backColor:"#258e92",hole:5},
 box:{rim:10,lid:"honeycomb",hex:8,web:3,clearance:.4,pitch:2.5,slit:11,bridge:2,edge:3.5},tag:{shape:"rounded",hole:5},
 references:[],measurements:{width:0,depth:0,height:0,thickness:0},analysis:{status:"example",result:null,baseline:"",provider:""},note:"",
};
export function mergePhotoProduct(raw:unknown):PhotoProductParams{
 const p=mergeInto(clone(PHOTO_DEFAULTS),raw);
 const n=(v:number,d:number,a:number,b:number)=>Number.isFinite(v)?Math.max(a,Math.min(b,v)):d;
 if(!["custom","paw","heartbox","tag"].includes(p.recipe))p.recipe="custom";
 p.size.width=n(p.size.width,100,10,3000);p.size.depth=n(p.size.depth,105,10,3000);p.size.height=n(p.size.height,30,1,3000);
 p.text.name=p.text.name.slice(0,80);p.text.subtitle=p.text.subtitle.slice(0,80);p.text.size=n(p.text.size,16,3,40);
 p.paw.frame=n(p.paw.frame,4,2,12);p.paw.detailSize=n(p.paw.detailSize,6,3,12);p.paw.backThickness=n(p.paw.backThickness,2,1,8);p.paw.hole=n(p.paw.hole,5,2,10);
 if(!["snowflake","heart","none"].includes(p.paw.detail))p.paw.detail="none";
 if(!["acr2","birch3","bass3","card2"].includes(p.paw.backMaterial))p.paw.backMaterial="acr2";
 p.paw.backKerf=n(p.paw.backKerf,.1,0,2);
 if(!/^#[a-fA-F0-9]{6}$/.test(p.paw.backColor))p.paw.backColor="#258e92";
 const b=p.box;b.rim=n(b.rim,10,6,18);b.hex=n(b.hex,8,4,18);b.web=n(b.web,3,2,8);b.clearance=n(b.clearance,.4,.1,1.5);b.pitch=n(b.pitch,2.5,1.5,5);b.slit=n(b.slit,11,5,30);b.bridge=n(b.bridge,2,1.5,5);b.edge=n(b.edge,3.5,2,8);
 if(!["solid","honeycomb"].includes(b.lid))b.lid="solid";
 if(!["rounded","circle","heart","tag","hexagon","pill"].includes(p.tag.shape))p.tag.shape="rounded";
 p.tag.hole=n(p.tag.hole,5,2,10);
 p.references=(Array.isArray(p.references)?p.references:[]).slice(0,5).flatMap(ref=>{const q=PhotoSchema.safeParse(ref);return q.success&&!validatePhoto(q.data)?[q.data]:[];});
 for(const key of ["width","depth","height","thickness"] as const)p.measurements[key]=n(p.measurements[key],0,0,MEASUREMENT_RANGES[key][1]);
 const model=GeneratedModelSchema.safeParse(p.generated);p.generated=model.success?model.data:null;
 const input=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};const rawValues=input.values&&typeof input.values==="object"?input.values as Record<string,number>:{};p.values={};for(const q of p.generated?.parameters??[]){const value=rawValues[q.id];if(Number.isFinite(value))p.values[q.id]=Math.min(q.max,Math.max(q.min,value));}
 p.hiddenParts=(Array.isArray(p.hiddenParts)?p.hiddenParts:[]).filter(x=>typeof x==="string").slice(0,48);
 const result=AnalysisSchema.safeParse(p.analysis.result);p.analysis.result=result.success?result.data:null;
 p.analysis.status=p.analysis.status==="ai"&&p.analysis.result?"ai":"example";p.analysis.baseline=p.analysis.baseline.slice(0,10_000);p.analysis.provider=p.analysis.provider.slice(0,80);p.note=p.note.slice(0,800);
 return p;
}
export function geometrySettings(p:PhotoProductParams){return {recipe:p.recipe,size:p.size,T:p.T,text:p.text,paw:p.paw,box:p.box,tag:p.tag,generated:p.generated,values:p.values};}
