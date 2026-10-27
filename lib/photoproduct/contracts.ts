import { z } from "zod";
import {GeneratedModelSchema} from "./generated";
export const MAX_PHOTOS=5;
export const MAX_PHOTO_CHARS=420_000;
export const MAX_PHOTO_BODY=MAX_PHOTOS*MAX_PHOTO_CHARS+24_000;
export const MAX_SOURCE_BYTES=12*1024*1024;
export const PhotoSchema=z.object({id:z.string().regex(/^[\w-]{1,64}$/),name:z.string().min(1).max(120),data:z.string().max(MAX_PHOTO_CHARS),width:z.number().int().min(32).max(1600),height:z.number().int().min(32).max(1600),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type ProductPhoto=z.infer<typeof PhotoSchema>;
/** Accepted known measurements, mm (0 = unknown). The schema, the panel, the merge and the server message share them. */
export const MEASUREMENT_RANGES={width:[10,3000],depth:[10,3000],height:[1,3000],thickness:[.5,30]} as const;
const known=(key:keyof typeof MEASUREMENT_RANGES)=>z.number().min(0).max(MEASUREMENT_RANGES[key][1]).refine(v=>v===0||v>=MEASUREMENT_RANGES[key][0]);
export const MeasurementsSchema=z.object({width:known("width"),depth:known("depth"),height:known("height"),thickness:known("thickness")}).strict();
/** A plain message for the first known measurement outside its range, or null. */
export function measurementProblem(m:{width:number;depth:number;height:number;thickness:number}):string|null{
 for(const key of ["width","depth","height","thickness"] as const){const v=m[key],[lo,hi]=MEASUREMENT_RANGES[key];if(v&&(!Number.isFinite(v)||v<lo||v>hi))return `Known ${key} must be between ${lo} and ${hi} mm, or left empty.`;}
 return null;
}
export const RequestSchema=z.object({photos:z.array(PhotoSchema).min(1).max(MAX_PHOTOS),note:z.string().max(800),measurements:MeasurementsSchema,features:z.literal('fidelity-joinery-v1').optional()}).strict();
export type PhotoAnalysisRequest=z.infer<typeof RequestSchema>;
const explanation=z.string().max(240);
const LegacyAnalysisSchema=z.object({
  family:z.enum(["paw","heartbox","tag","unsupported"]),title:z.string().min(1).max(80),summary:z.string().max(600),
  width:z.number().min(25).max(350),depth:z.number().min(25).max(350),height:z.number().min(8).max(100),thickness:z.number().min(1.5).max(6),
  name:z.string().max(80),subtitle:z.string().max(80),font:z.enum(["pacifico","archivo-black","vazirmatn","lalezar"]),
  wings:z.boolean(),connected:z.boolean(),snowflakes:z.boolean(),backing:z.boolean(),honeycomb:z.boolean(),
  shape:z.enum(["rounded","circle","heart","tag","hexagon","pill"]),
  frameWidth:z.number().min(2).max(12),holeDiameter:z.number().min(2).max(10),detailRadius:z.number().min(3).max(12),backThickness:z.number().min(1).max(6),letterHeight:z.number().min(3).max(40),
  rimWidth:z.number().min(6).max(18),hexRadius:z.number().min(4).max(18),hexWeb:z.number().min(2).max(8),lidClearance:z.number().min(.1).max(1.5),
  observations:z.array(explanation).max(12),assumptions:z.array(explanation).min(1).max(12),uncertainties:z.array(explanation).max(12),
  views:z.array(z.object({photoId:z.string().max(64),view:z.enum(["front","side","back","top","detail","unknown"]),quality:z.enum(["useful","blurry","duplicate","unrelated"]),evidence:explanation}).strict()).min(1).max(5),
  confidence:z.enum(["low","medium","high"]),
}).strict();
export const GeneratedAnalysisSchema=z.object({
 family:z.enum(["custom","unreconstructable"]),title:z.string().min(1).max(80),summary:z.string().max(600),
 width:z.number().min(10).max(3000),depth:z.number().min(10).max(3000),height:z.number().min(1).max(3000),thickness:z.number().min(.5).max(30),
 observations:z.array(explanation).max(12),assumptions:z.array(explanation).min(1).max(12),uncertainties:z.array(explanation).max(12),
 views:z.array(z.object({photoId:z.string().max(64),view:z.enum(["front","side","back","top","detail","unknown"]),quality:z.enum(["useful","blurry","duplicate","unrelated"]),evidence:explanation}).strict()).min(1).max(5),
 confidence:z.enum(["low","medium","high"]),model:GeneratedModelSchema.nullable(),
 review:z.object({status:z.enum(['compared','skipped']),message:z.string().max(240)}).strict().optional(),
}).strict();
export const AnalysisSchema=z.union([GeneratedAnalysisSchema,LegacyAnalysisSchema]);
export type ProductAnalysis=z.infer<typeof AnalysisSchema>;

/** Inspect raster headers before handing any bytes to an image decoder or model. */
export function rasterSize(bytes:Uint8Array):{width:number;height:number;mime:string}|null{
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length;
 if(n>24&&dv.getUint32(0)===0x89504e47&&dv.getUint32(4)===0x0d0a1a0a)return {width:dv.getUint32(16),height:dv.getUint32(20),mime:"image/png"};
 if(n>12&&bytes[0]===255&&bytes[1]===216){
  let i=2;
  while(i+4<n){
   if(bytes[i]!==255){i++;continue;}const m=bytes[i+1];
   if(m===0xd9||m===0xda)break;
   if(m===0xd8||m===1||(m>=0xd0&&m<=0xd7)){i+=2;continue;}
   const length=dv.getUint16(i+2);if(length<2||i+2+length>n)return null;
   if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m)&&length>=8)return {width:dv.getUint16(i+7),height:dv.getUint16(i+5),mime:"image/jpeg"};
   i+=length+2;
  }
 }
 if(n>=30&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP"){
  const type=String.fromCharCode(...bytes.slice(12,16));
  if(type==="VP8X")return {width:1+bytes[24]+256*bytes[25]+65536*bytes[26],height:1+bytes[27]+256*bytes[28]+65536*bytes[29],mime:"image/webp"};
  if(type==="VP8 "&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a)return {width:dv.getUint16(26,true)&0x3fff,height:dv.getUint16(28,true)&0x3fff,mime:"image/webp"};
  if(type==="VP8L"&&bytes[20]===0x2f)return {width:1+((bytes[21]|bytes[22]<<8)&0x3fff),height:1+((bytes[22]>>6|bytes[23]<<2|bytes[24]<<10)&0x3fff),mime:"image/webp"};
 }
 return null;
}
export function photoBytes(data:string):{bytes:Uint8Array;mime:string}|null{
 const m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);if(!m||m[2].length%4!==0)return null;
 try{const binary=atob(m[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return {bytes,mime:m[1]};}catch{return null;}
}
/**
 * Settings are merged on every edit and each merge re-checks the reference photos: decoding up to
 * five 400 KB data URLs each time froze the editor for seconds. A photo's check depends only on its
 * data and stated size, so results are kept for the last few photos seen.
 */
const CHECKED=new Map<string,{width:number;height:number;result:string|null}>();
export function validatePhoto(photo:ProductPhoto):string|null{
 const hit=CHECKED.get(photo.data);
 if(hit&&hit.width===photo.width&&hit.height===photo.height)return hit.result;
 const result=checkPhoto(photo);
 CHECKED.set(photo.data,{width:photo.width,height:photo.height,result});if(CHECKED.size>12)CHECKED.delete(CHECKED.keys().next().value!);
 return result;
}
function checkPhoto(photo:ProductPhoto):string|null{
 const decoded=photoBytes(photo.data);if(!decoded)return "Use a JPEG, PNG or WebP photo.";
 const size=rasterSize(decoded.bytes);
 if(!size||size.mime!==decoded.mime||size.width!==photo.width||size.height!==photo.height)return "The photo header or dimensions are invalid.";
 if(size.width<32||size.height<32||size.width>1600||size.height>1600||size.width*size.height>2_560_000)return "Photo dimensions exceed the analysis limit.";
 return null;
}
export function parsePhotoRequest(text:string):PhotoAnalysisRequest{
 if(text.length>MAX_PHOTO_BODY)throw Error("The photo set is too large.");
 let raw:unknown;try{raw=JSON.parse(text);}catch{throw Error("Send valid JSON.");}
 const checked=RequestSchema.safeParse(raw);
 if(!checked.success){const m=(raw as {measurements?:unknown})?.measurements;const problem=m&&typeof m==="object"?measurementProblem(m as {width:number;depth:number;height:number;thickness:number}):null;throw Error(problem??"Upload 1–5 normalized photos and valid dimensions.");}
 const ids=new Set<string>();for(const photo of checked.data.photos){const error=validatePhoto(photo);if(error)throw Error(error);if(ids.has(photo.id))throw Error("Each photo needs a unique identifier.");ids.add(photo.id);}
 return checked.data;
}
