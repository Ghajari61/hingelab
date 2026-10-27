import {describe,it,expect} from "vitest";
import {unzipSync,strFromU8} from "fflate";
import {PHOTO_PRODUCT} from "@/lib/generators/photoproduct";
import {arrangeGenerator,genSVG} from "@/lib/generators/output";
import {CTX} from "@/lib/generators/__tests__/ctx";
import {photoBuildPackage} from "../package";
import {readPhotoRequest} from "../request";
describe("fabrication package",()=>{
 it("includes kerfed per-part SVGs, an editable project and explicit assembly assumptions",()=>{
  const p=PHOTO_PRODUCT.merge({recipe:"heartbox",size:{width:140,depth:128}}),a=arrangeGenerator(PHOTO_PRODUCT,p,CTX),svg=genSVG(PHOTO_PRODUCT,a.params,a.lay!);
  const files=unzipSync(photoBuildPackage(p,a,svg,JSON.stringify({app:"HingeLab",product:"photoproduct",params:p})));
  expect(Object.keys(files).filter(k=>k.startsWith("parts/")&&k.endsWith(".svg"))).toHaveLength(6);
  expect(strFromU8(files["README.txt"])).toMatch(/do not compensate twice/i);
  expect(strFromU8(files["editable-project.oclc"])).toContain('"photoproduct"');
  expect(strFromU8(files["parts/01-floor.svg"])).toMatch(/width="144\.15mm"/);
  for(const [name,data] of Object.entries(files))if(name.startsWith("parts/")){const text=strFromU8(data);expect(text).toContain("mm");expect(text).not.toMatch(/NaN|Infinity|<text[ >]/);}
 });
 it("refuses invalid models instead of exporting a stale preview",()=>{
  const p=PHOTO_PRODUCT.merge({recipe:"heartbox",size:{width:30,depth:30}}),a=arrangeGenerator(PHOTO_PRODUCT,p,CTX);
  expect(()=>photoBuildPackage(p,a,"<svg/>","{}")).toThrow(/valid parts/);
 });
});
describe("bounded HTTP input",()=>{
 it("rejects an over-limit streamed body even when content-length is missing",async()=>{
  const request=new Request("https://hingelab.test/api/ai/photoproduct",{method:"POST",body:"x".repeat(2_200_000)});
  await expect(readPhotoRequest(request)).rejects.toMatchObject({status:413});
 });
});
