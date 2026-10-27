import { AnalysisSchema, type ProductAnalysis } from "./contracts";
import { geometrySettings, mergePhotoProduct, PHOTO_DEFAULTS, type PhotoProductParams } from "@/lib/generators/photoproduct/params";
import { getPath, setPath } from "@/lib/generators/path";
const leaves=(v:unknown,prefix=""):string[]=>v&&typeof v==="object"&&!Array.isArray(v)?Object.entries(v).flatMap(([k,x])=>leaves(x,prefix?`${prefix}.${k}`:k)):[prefix];
export function applyProductAnalysis(current:PhotoProductParams,raw:ProductAnalysis,preserve=true,provider=""):{params:PhotoProductParams;preserved:string[]}{
 const result=AnalysisSchema.parse(raw);
 if(result.family==="unsupported"||result.family==="unreconstructable")return {params:{...current,analysis:{...current.analysis,status:"ai",result,provider}},preserved:[]};
 if("model" in result){
  if(!result.model)throw Error("No editable geometry was returned. Previous model kept.");
  const next=mergePhotoProduct({...current,name:result.title,recipe:"custom",generated:result.model,values:{},hiddenParts:[],size:{width:result.width,depth:result.depth,height:result.height},T:result.thickness});
  const preserved:string[]=[];let prior:Record<string,unknown>={};try{prior=JSON.parse(current.analysis.baseline||"{}");}catch{}
  if(preserve&&current.recipe==="custom"&&current.generated){
   const oldSize=prior.size as Record<string,number>|undefined;
   for(const key of ["width","depth","height"] as const)if(oldSize&&current.size[key]!==oldSize[key]){next.size[key]=current.size[key];preserved.push("size."+key);}
   if(typeof prior.T==="number"&&current.T!==prior.T){next.T=current.T;preserved.push("T");}
   for(const q of result.model.parameters){const old=current.values[q.id];if(Number.isFinite(old)&&old>=q.min&&old<=q.max){next.values[q.id]=old;preserved.push(q.id);}}
  }
  const baseline=JSON.stringify({size:{width:result.width,depth:result.depth,height:result.height},T:result.thickness});
  for(const key of ["width","depth","height"] as const)if(current.measurements[key])next.size[key]=current.measurements[key];if(current.measurements.thickness)next.T=current.measurements.thickness;
  next.analysis={status:"ai",result,baseline,provider};return {params:next,preserved};
 }
 const proposal=mergePhotoProduct({...current,name:result.title,recipe:result.family,size:{width:result.width,depth:result.depth,height:result.height},T:result.thickness,
  text:{...current.text,name:result.name,subtitle:result.subtitle,fontId:result.font,size:result.letterHeight},
  paw:{...current.paw,wings:result.wings,connected:result.connected,detail:result.snowflakes?"snowflake":"none",backing:result.backing,frame:result.frameWidth,hole:result.holeDiameter,detailSize:result.detailRadius,backThickness:result.backThickness},
  box:{...current.box,lid:result.honeycomb?"honeycomb":"solid",rim:result.rimWidth,hex:result.hexRadius,web:result.hexWeb,clearance:result.lidClearance},tag:{...current.tag,shape:result.shape,hole:result.holeDiameter}});
 const baseline=JSON.stringify(geometrySettings(proposal));let next=proposal;const preserved:string[]=[];
 if(preserve){
  let previous:unknown=geometrySettings(PHOTO_DEFAULTS);
  try{if(current.analysis.baseline)previous=JSON.parse(current.analysis.baseline);}catch{/* An old project has no usable generated baseline. */}
  for(const key of leaves(geometrySettings(current))){
   const value=getPath(current,key);
   if(JSON.stringify(value)!==JSON.stringify(getPath(previous,key))){next=setPath(next,key,value);preserved.push(key);}
  }
 }
 const m=current.measurements;
 next.size={width:m.width||next.size.width,depth:m.depth||next.size.depth,height:m.height||next.size.height};
 next.T=m.thickness||next.T;
 next.analysis={status:"ai",result,baseline,provider};
 return {params:next,preserved};
}
