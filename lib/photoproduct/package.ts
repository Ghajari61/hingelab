import { zipSync,strToU8 } from "fflate";
import { genSVG,type GenArranged } from "@/lib/generators/output";
import { assembledSVG } from "@/lib/generators/thumb";
import { slug } from "@/lib/generators/util";
import { PHOTO_PRODUCT } from "@/lib/generators/photoproduct";
import type { PhotoProductParams } from "@/lib/generators/photoproduct/params";
/** Call only after the editor's normal export authorization has returned a fabrication SVG. */
export function photoBuildPackage(p:PhotoProductParams,a:GenArranged<PhotoProductParams>,authorizedSVG:string,project:string):Uint8Array{
 if("error" in a.result||!a.lay||!authorizedSVG.includes("<svg"))throw Error("Generate valid parts before exporting a build package.");
 const files:Record<string,Uint8Array>={"sheets.svg":strToU8(authorizedSVG),"editable-project.oclc":strToU8(project)};
 const parts=a.result.parts;
 const manifest=parts.map((pt,i)=>({number:i+1,id:pt.id,name:pt.name,stock:pt.tag??pt.src.stock??p.material,thickness:pt.src.t??p.T,file:`parts/${String(i+1).padStart(2,"0")}-${slug(pt.id,"part")}.svg`}));
 parts.forEach((pt,i)=>{
  const w=pt.bbox.x1-pt.bbox.x0,h=pt.bbox.y1-pt.bbox.y0;
  files[manifest[i].file]=strToU8(genSVG(PHOTO_PRODUCT,{...p,T:pt.src.t??p.T},{width:w+4,height:h+4,items:[{pt,i:0,w,h,ox:2-pt.bbox.x0,oy:2-pt.bbox.y0}]},"Individual part; kerf already applied once."));
 });
 files["parts.json"]=strToU8(JSON.stringify(manifest,null,2));
 files["assumptions.json"]=strToU8(JSON.stringify({status:"geometry checked; controller and physical construction unverified",measurements:p.measurements,analysis:p.analysis.result,dimensions:p.size,material:p.material,thickness:p.T,kerf:p.K},null,2));
 files["ASSEMBLY-PREVIEW.svg"]=strToU8(assembledSVG(a.result.out,p.T));
 files["README.txt"]=strToU8([
  "HINGELAB - PHOTO TO PRODUCT BUILD PACKAGE",p.name,"",`Recipe: ${p.recipe}. Material: ${p.material}, ${p.T} mm.`,
  "Dimensions inferred from photos are estimates unless listed as user measurements. Reference images and font assets are included in the editable project.",
  "sheets.svg and parts/*.svg are fabrication exports in millimetres. Kerf has already been applied by HingeLab; do not compensate twice.",
  "Map Outline cut and Inner cuts to cutting, Score lines to scoring, and Engrave to engraving in your controller. Colors alone are not universal machine commands.",
  "Cut inner features before outer profiles. Intentional hinge slits are open cut paths. Do not send ASSEMBLY-PREVIEW.svg to a laser.",
  "Part numbers, stocks and thicknesses are listed in parts.json. Each part SVG filename starts with its number.","",...(a.result.out.assembly??[]),"",
  "Test the actual material, kerf, lid fit, hinges and adhesive on a sample. Software checks are not proof of physical strength or controller compatibility.",
  "No laser power, speed or pass count is prescribed. Use measured settings for your machine and stock.",
 ].join("\n"));
 return zipSync(files,{level:6});
}
