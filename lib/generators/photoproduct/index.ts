import {generatedUsesVariable} from "@/lib/photoproduct/generated";
import { MATERIALS } from "@/lib/hinge/defaults";

import type { GeneratorDef, SectionSpec } from "../types";

import { namedFile } from "../util";

import { buildPhotoProduct } from "./build";

import { mergePhotoProduct, type PhotoProductParams } from "./params";



const paw=(p:PhotoProductParams)=>p.recipe==="paw",box=(p:PhotoProductParams)=>p.recipe==="heartbox";

const sections:SectionSpec<PhotoProductParams>[]=[

 {id:"size",step:"dimensions",title:"Dimensions",open:true,show:p=>p.recipe!=="custom"||["W","D","H"].some(v=>generatedUsesVariable(p.generated,v as "W"|"D"|"H")),help:"Nominal millimetres. Known measurements in the photo panel override inferred values during analysis.",fields:[

  {kind:"number",key:"size.width",show:p=>p.recipe!=="custom"||generatedUsesVariable(p.generated,"W"),label:"Width",unit:"mm",min:10,max:3000,step:1,help:"Overall product width. Generated part formulas follow W."},

  {kind:"number",key:"size.depth",show:p=>p.recipe!=="custom"||generatedUsesVariable(p.generated,"D"),label:"Depth / height",unit:"mm",min:10,max:3000,step:1,help:"Overall product depth. Generated part formulas follow D."},

  {kind:"number",key:"size.height",label:"Overall height",unit:"mm",min:1,max:3000,step:1,show:p=>box(p)||(p.recipe==="custom"&&generatedUsesVariable(p.generated,"H")),help:"Overall product height. Generated part formulas follow H."},

 ]},

 {id:"text",title:"Personalization",open:true,show:p=>p.recipe!=="custom"&&!box(p),help:"Names use outlined fonts and are fitted into the usable area.",fields:[

  {kind:"text",key:"text.name",label:"Name",maxLength:80,help:"The name on the product, in its original language."},

  {kind:"text",key:"text.subtitle",label:"Second line",maxLength:80,help:"Optional phone number, date or short message."},

  {kind:"font",key:"text.fontId",label:"Font",sample:p=>p.text.name+p.text.subtitle,help:"Choose a font covering every character. Fabrication files contain paths."},

  {kind:"number",key:"text.size",label:"Letter height",unit:"mm",min:3,max:40,step:.5,help:"Maximum height before automatic fitting."},

 ]},

 {id:"paw",title:"Paw construction",open:true,show:paw,help:"A connected front or separate details glued to a backing.",fields:[

  {kind:"toggle",key:"paw.wings",label:"Memorial wings",help:"Add wings to the overall outline."},

  {kind:"toggle",key:"paw.connected",label:"Connect names and motifs",help:"Join the lettering and details to the frame to avoid floating islands."},

  {kind:"toggle",key:"paw.backing",label:"Colored backing",help:"Cut a second backing stock behind the windows."},

  {kind:"choice",key:"paw.backMaterial",label:"Backing stock",show:p=>p.paw.backing,options:["acr2","birch3","bass3","card2"].map(v=>({v,text:MATERIALS[v].name})),apply:(p,v)=>({...p,paw:{...p.paw,backMaterial:v,backThickness:MATERIALS[v]?.T??p.paw.backThickness,backKerf:MATERIALS[v]?.K??p.paw.backKerf}}),help:"Second material, packed on its own sheets. Check its actual thickness and kerf."},

  {kind:"number",key:"paw.backKerf",label:"Backing kerf",unit:"mm",min:0,max:2,step:.01,show:p=>p.paw.backing,help:"Measured kerf for the backing stock. Applied once and independently of the wooden front."},

  {kind:"choice",key:"paw.backColor",label:"Backing color",show:p=>p.paw.backing,options:[{v:"#258e92",text:"Teal"},{v:"#bbcafa",text:"Lavender"},{v:"#cc6f89",text:"Rose"},{v:"#d9b98c",text:"Natural"}],help:"Preview color of the backing stock. Select the actual matching stock before cutting."},

  {kind:"number",key:"paw.backThickness",label:"Backing thickness",unit:"mm",min:1,max:8,step:.5,show:p=>p.paw.backing,help:"Actual second-stock thickness; backing and front are nested separately."},

  {kind:"number",key:"paw.frame",label:"Frame width",unit:"mm",min:2,max:12,step:.5,help:"Material around the paw windows."},

  {kind:"number",key:"paw.hole",label:"Hanging hole diameter",unit:"mm",min:2,max:10,step:.5,help:"A circular nominal hole with a checked surrounding wall."},

  {kind:"choice",key:"paw.detail",label:"Decorative motif",options:[{v:"snowflake",text:"Snowflake"},{v:"heart",text:"Heart"},{v:"none",text:"None"}],help:"Decoration within the paw windows."},

  {kind:"number",key:"paw.detailSize",label:"Detail radius",unit:"mm",min:3,max:12,step:.5,show:p=>p.paw.detail!=="none",help:"Size of decorative details. Small features still require a physical sample."},

 ]},

 {id:"box",step:"construction",title:"Heart box & lid",open:true,show:box,help:"Glue construction with a floor, two curved wall strips, rim, lid and locating ring.",fields:[

  {kind:"choice",key:"box.lid",label:"Lid",options:[{v:"honeycomb",text:"Honeycomb"},{v:"solid",text:"Solid"}],help:"Lattice decoration or a solid removable lid."},

  {kind:"number",key:"box.rim",label:"Rim width",unit:"mm",min:6,max:18,step:.5,help:"Floor-edge to rim-opening distance."},

  {kind:"number",key:"box.clearance",label:"Lid side clearance",unit:"mm",min:.1,max:1.5,step:.05,help:"Per-side clearance between the locating ring and the rim opening, before tested kerf compensation."},

  {kind:"number",key:"box.hex",label:"Honeycomb radius",unit:"mm",min:4,max:18,step:.5,show:p=>p.box.lid==="honeycomb",help:"Radius of each hexagonal opening."},

  {kind:"number",key:"box.web",label:"Honeycomb web",unit:"mm",min:2,max:8,step:.5,show:p=>p.box.lid==="honeycomb",help:"Nominal material between adjacent hexagons."},

 ]},

 {id:"hinge",step:"construction",title:"Living hinge",open:false,show:box,help:"Slits are intentional open cut paths. Test the actual plywood before bending.",fields:[

  {kind:"number",key:"box.pitch",label:"Column pitch",unit:"mm",min:1.5,max:5,step:.1,help:"Distance between staggered slit columns."},

  {kind:"number",key:"box.slit",label:"Slit length",unit:"mm",min:5,max:30,step:.5,help:"Maximum length of each hinge cut."},

  {kind:"number",key:"box.bridge",label:"Uncut bridge",unit:"mm",min:1.5,max:5,step:.5,help:"Material between slits in a column."},

  {kind:"number",key:"box.edge",label:"Solid edge margin",unit:"mm",min:2,max:8,step:.5,help:"Uncut bands along the top and bottom of each wall. Ends retain a 10 mm glue margin."},

 ]},

 {id:"tag",title:"Tag outline",open:true,show:p=>p.recipe==="tag",help:"An engraved name tag with a reinforced ring tab.",fields:[

  {kind:"choice",key:"tag.shape",label:"Shape",options:["rounded","circle","heart","tag","hexagon","pill"].map(v=>({v,text:v[0].toUpperCase()+v.slice(1)})),help:"The tag's body shape."},

  {kind:"number",key:"tag.hole",label:"Ring hole",unit:"mm",min:2,max:10,step:.5,help:"Nominal ring-hole diameter."},

 ]},

];

export const PHOTO_PRODUCT:GeneratorDef<PhotoProductParams>={

 id:"photoproduct",name:"Photo to Product",version:2,defaults:()=>mergePhotoProduct({}),merge:mergePhotoProduct,sections,presets:[],

 build:buildPhotoProduct,fonts:p=>p.recipe==="custom"?[...new Set((p.generated?.parts??[]).flatMap(q=>q.engraving?.text?[q.engraving.font]:[]))]:p.recipe!=="heartbox"&&(p.text.name.trim()||p.text.subtitle.trim())?[p.text.fontId]:[],

 check:p=>[{code:"PHOTO_ESTIMATE",level:"info",message:p.recipe==="custom"&&!p.generated?"Upload product photos to create a model. No template or example is loaded.":(p.analysis.result?.family==="unsupported"||p.analysis.result?.family==="unreconstructable")?"Unsupported product: the previous model is retained. This geometry was not reconstructed from the latest references.":p.analysis.status==="ai"?"Photo-based reconstruction: verify estimated dimensions, hidden details and the actual material with a sample.":"Example recipe. Upload 1–5 product photos for real AI analysis; this preview was not generated from a photo.",fixes:[]},...(p.recipe==="heartbox"?[{code:"PHOTO_GLUE",level:"info" as const,message:"Glue assembly with seams at the cleft and tip; no press-fit tabs are implied. Test hinge flexure and lid fit before production.",fixes:[]}]:[])],

 fileName:p=>namedFile("photo-product",p.name,p.recipe),summary:p=>p.recipe==="custom"?p.generated?`Photo-generated · ${p.generated.parts.length} part groups · ${p.size.width} × ${p.size.depth} × ${p.size.height} mm`:"Upload photos to begin":`${p.recipe} · ${p.size.width} × ${p.size.depth} mm · ${(p.analysis.result?.family==="unsupported"||p.analysis.result?.family==="unreconstructable")?"previous model retained":p.analysis.status==="ai"?"AI reconstruction":"example recipe"}`,

 help:{intro:["Upload one to five views of one product. AI designs a bounded parametric part model from your references. The geometry engine builds its parts, assembly preview and SVG; no ready-made product is selected."],tips:["Absolute dimensions cannot be recovered without a known measurement. Enter measured dimensions when available.","Use front, back, side or connection details of the same product. Five photos do not guarantee exact reconstruction.","Wooden products that can be represented by flat cut parts, layers and assemblies can be reconstructed. Solid carved surfaces and hidden construction may need an approximation.","The model is geometrically checked, not physically proven. Test material, kerf, glue and hinges on a sample."],keywords:["photo to product","multi-view","AI reconstruction","paw ornament","heart box"]},

};

