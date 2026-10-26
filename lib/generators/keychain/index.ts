import type { GeneratorDef, SectionSpec } from "../types";
import { SHAPE_KINDS, SHAPE_NAMES, shapeArt } from "../shapes";
import { MOTIF_IDS, MOTIF_NAMES } from "../motifs";
import { namedFile } from "../util";
import { buildKeychain } from "./build";
import { mergeKeychain, type KeychainParams } from "./params";
import { KEYCHAIN_PRESETS } from "./presets";
const sections:SectionSpec<KeychainParams>[]=[
 {id:"body",step:"dimensions",title:"Shape & size",open:true,help:"The keychain body; the reinforced ring tab extends beyond these dimensions.",fields:[
  {kind:"choice",key:"shape",label:"Shape",shuffle:true,options:SHAPE_KINDS.map(v=>({v,text:SHAPE_NAMES[v]})),help:"Choose the outline of the keychain body."},
  {kind:"number",key:"width",label:"Body width",unit:"mm",min:25,max:180,step:1,help:"Width without the ring tab."},
  {kind:"number",key:"height",label:"Body height",unit:"mm",min:20,max:120,step:1,help:"Height without the ring tab."},
  {kind:"number",key:"corner",label:"Corner radius",unit:"mm",min:0,max:30,step:.5,help:"Corner rounding for shapes that support it."},
  {kind:"number",key:"margin",label:"Content margin",unit:"mm",min:1.5,max:8,step:.5,help:"Minimum space from content to the body edge. Text automatically shrinks to fit."},
 ]},
 {id:"text",title:"Name & lettering",open:true,help:"Text becomes vector paths, with automatic fitting inside the chosen shape.",fields:[
  {kind:"text",key:"text.name",label:"Name",maxLength:80,placeholder:"Your name",help:"Name, initials or a short message. Use Job options for a list of names."},
  {kind:"text",key:"text.subtitle",label:"Second line",maxLength:80,placeholder:"Phone, date or short message",help:"Optional smaller text below the name."},
  {kind:"font",key:"text.fontId",label:"Font",sample:p=>p.text.name+p.text.subtitle,shuffle:true,help:"Choose a font supporting the language of your text."},
  {kind:"number",key:"text.size",label:"Letter height",unit:"mm",min:3,max:40,step:.5,help:"Maximum letter height; long names are reduced to fit."},
  {kind:"number",key:"text.spacing",label:"Letter spacing",unit:"mm",min:-1,max:3,step:.1,help:"Extra spacing between letters."},
 ]},
 {id:"style",title:"Decoration",open:true,help:"Choose filled engraving, outline scoring or separately cut raised details.",fields:[
  {kind:"choice",key:"style",label:"Lettering finish",options:[{v:"engrave",text:"Engraved"},{v:"score",text:"Outline score"},{v:"layered",text:"Raised letters"}],help:"Raised letters are real cut parts, glued over alignment marks on the body."},
  {kind:"choice",key:"border",label:"Border",options:[{v:"none",text:"None"},{v:"score",text:"Score"},{v:"engrave",text:"Engrave"}],help:"Optional inset decorative border."},
  {kind:"choice",key:"motif",label:"Symbol",shuffle:true,options:[{v:"none",text:"None"},...MOTIF_IDS.map(v=>({v,text:MOTIF_NAMES[v]}))],help:"A decorative symbol above the name, fitted with the text."},
 ]},
 {id:"ring",step:"construction",title:"Ring attachment",open:true,help:"An integrated reinforced tab with a circular hole for your split ring.",fields:[
  {kind:"choice",key:"ring.side",label:"Ring position",shuffle:true,options:[{v:"left",text:"Left"},{v:"right",text:"Right"},{v:"top",text:"Top"}],help:"The tab is joined to the actual edge of the chosen shape."},
  {kind:"number",key:"ring.diameter",label:"Hole diameter",unit:"mm",min:2,max:12,step:.5,help:"Nominal hole diameter. The export applies your material kerf once."},
  {kind:"number",key:"ring.wall",label:"Material around hole",unit:"mm",min:2,max:8,step:.5,help:"Radial wall around the hole. Increase it for fragile stock and test a cut sample."},
 ]},
];
export const KEYCHAIN:GeneratorDef<KeychainParams>={
 id:"keychain",name:"Keychain",version:1,defaults:()=>mergeKeychain({}),merge:mergeKeychain,sections,presets:KEYCHAIN_PRESETS,
 build:buildKeychain,check:()=>[],fonts:p=>p.text.name.trim()||p.text.subtitle.trim()?[p.text.fontId]:[],batch:()=>"text.name",
 art:(key,value)=>key==="shape"?shapeArt(value as KeychainParams["shape"]):[],
 fileName:p=>namedFile("keychain",p.name,p.shape),summary:p=>`${SHAPE_NAMES[p.shape]} · ${p.width} × ${p.height} mm · ${p.style}`,
 help:{intro:["Create personalized laser-cut keychains with names, motifs and a reinforced ring tab. Text is exported as vector paths, not installed-font text."],tips:["Measure the wire on your split ring and test a sample before a production run.","Use Job options to generate a batch of names or repeat copies on a sheet.","For raised lettering, glue every small detail over its scored guide. Choose engraving for very small text.","Body size excludes the ring tab. The preview and SVG include the complete outline."],keywords:["keychain","keyring","name tag","pet tag","bag charm"]},
};
