"use client";
import { MAX_PHOTO_CHARS,MAX_SOURCE_BYTES,rasterSize,type ProductPhoto } from "./contracts";
/**
 * Each reference is kept in the project (and its local autosave): five photos at 1280 px came to
 * about 1.9 MB, close to the browser's 5 MB local storage. 1024 px and about 210 KB per photo is
 * ample for recognising a product and keeps a full set near 1 MB.
 */
const TARGET_EDGE=1024,TARGET_CHARS=210_000;
export async function normalizeProductPhoto(file:File):Promise<ProductPhoto>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Choose JPEG, PNG or WebP photos. SVG and animated formats are not accepted.");
 if(!file.size||file.size>MAX_SOURCE_BYTES)throw Error("Each original photo must be under 12 MB.");
 const bytes=new Uint8Array(await file.arrayBuffer()),header=rasterSize(bytes);
 if(!header||header.mime!==file.type||header.width<32||header.height<32||header.width>16000||header.height>16000||header.width*header.height>24_000_000)throw Error("Use a readable photo between 32 pixels and 24 megapixels.");
 let bitmap:ImageBitmap;
 try{bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});}catch{throw Error("This photo could not be decoded. Try another image.");}
 try{
  let scale=Math.min(1,TARGET_EDGE/Math.max(bitmap.width,bitmap.height)),data="",width=0,height=0;
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");if(!ctx)throw Error("Photo processing is unavailable in this browser.");
  for(let attempt=0;attempt<8;attempt++){
   width=Math.round(bitmap.width*scale);height=Math.round(bitmap.height*scale);
   if(width<32||height<32)throw Error("This photo is too narrow for product analysis.");
   canvas.width=width;canvas.height=height;ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);
   data=canvas.toDataURL("image/jpeg",Math.max(.48,.86-attempt*.08));
   if(data.length<=TARGET_CHARS)break;
   if(attempt>3)scale*=.8;
  }
  if(data.length>MAX_PHOTO_CHARS)throw Error("This photo could not be reduced to the analysis limit.");
  const binary=Uint8Array.from(atob(data.split(",")[1]),c=>c.charCodeAt(0));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",binary))).map(x=>x.toString(16).padStart(2,"0")).join("");
  return {id:crypto.randomUUID(),name:file.name.slice(0,120)||"Product photo",data,width,height,digest};
 }finally{bitmap.close();}
}
