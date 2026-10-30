import {noWeldField} from "../textOps";
import type { GeneratorDef, SectionSpec } from "../types";
import { SHAPE_KINDS, SHAPE_NAMES, shapeArt } from "../shapes";
import { MOTIF_IDS, MOTIF_NAMES } from "../motifs";
import { namedFile } from "../util";
import { buildKeychain, BUILD_NAMES } from "./build";
import { material2, material2Fields } from "../material2";
import { BUILDS, mergeKeychain, type KeychainParams } from "./params";
import { KEYCHAIN_PRESETS } from "./presets";
const sections:SectionSpec<KeychainParams>[]=[
 {id:"body",step:"dimensions",title:"Shape & size",open:true,help:"The keychain body; the reinforced ring tab extends beyond these dimensions.",fields:[
  {kind:"choice",key:"shape",label:"Shape",shuffle:true,options:SHAPE_KINDS.map(v=>({v,text:SHAPE_NAMES[v]})),help:"Choose the outline of the keychain body."},
  {kind:"number",key:"width",label:"Body width",unit:"mm",min:25,max:180,step:1,help:"Width without the ring tab."},
  {kind:"number",key:"height",label:"Body height",unit:"mm",min:20,max:120,step:1,help:"Height without the ring tab."},
  {kind:"number",key:"corner",label:"Corner radius",unit:"mm",min:0,max:30,step:.5,help:"Corner rounding for shapes that support it."},
  {kind:"number",key:"margin",label:"Content margin",unit:"mm",min:1.5,max:8,step:.5,help:"Minimum space from content to the body edge. Text automatically shrinks to fit."},
 ]},
 {id:"build",title:"Construction",open:true,help:"One layer, or several glued layers: a photo frame, a shaker with beads inside, a disc that spins, a cover that swings open, a two-tone outline or a layered landscape.",fields:[
  {kind:"choice",key:"build",label:"Build",options:BUILDS.map(v=>({v,text:BUILD_NAMES[v]})),
   apply:(p,v)=>{const q=structuredClone(p);q.build=v as KeychainParams["build"];
     // a clear cover for photos and shakers, a contrasting acrylic for the outline
     if(v==="outline"&&q.stack.mat2==="acrylic-clear")q.stack.mat2="acrylic-black";
     if((v==="frame"||v==="shaker")&&q.stack.mat2!=="acrylic-clear"){q.stack.mat2="acrylic-clear";q.stack.T2=material2("acrylic-clear").T;}
     if(v!=="flat"&&q.width<45){q.width=Math.max(q.width,v==="frame"||v==="locket"?50:48);q.height=Math.max(q.height,v==="frame"||v==="spinner"||v==="locket"?50:36);}
     return q;},
   help:"Photo frame: a window and a pocket for a photo. Shaker: a clear front over a space for beads. Spinner: a disc turning freely between two rims. Swivel locket: a cover that swings open on the ring. Two-tone outline: a front on a bigger backing. Layered scene: mountains and hills on the sky."},
  {kind:"number",key:"stack.frame",label:"Frame width",unit:"mm",min:2.5,max:15,step:.5,show:p=>["frame","shaker","spinner","locket","scene"].includes(p.build),help:"The solid rim round the window, pocket or disc."},
  {kind:"choice",key:"stack.window",label:"Window shape",options:[{v:"match",text:"Same as the body"},{v:"circle",text:"Circle"},{v:"heart",text:"Heart"},{v:"rounded",text:"Rounded rectangle"}],show:p=>p.build==="frame",help:"The opening that shows the photo."},
  {kind:"toggle",key:"stack.cover",label:"Clear cover",show:p=>p.build==="frame",help:"A clear acrylic layer over the photo, cut from the second material."},
  {kind:"number",key:"stack.depth",label:"Shaker depth (layers)",unit:"",min:1,max:4,step:1,show:p=>p.build==="shaker",help:"How many wall layers make the space for the beads."},
  {kind:"number",key:"stack.border",label:"Outline width",unit:"mm",min:1.5,max:8,step:.5,show:p=>p.build==="outline",help:"How far the backing shows round the front."},
  ...material2Fields<KeychainParams>("stack",p=>p.build==="outline"||((p.build==="frame")&&p.stack.cover)||p.build==="shaker"),
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
  noWeldField<KeychainParams>("text.noWeld",p=>p.style==="layered","raised letters",["raised"]),
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
 fileName:p=>namedFile("keychain",p.name,p.shape),summary:p=>`${SHAPE_NAMES[p.shape]} · ${p.width} × ${p.height} mm · ${p.build==="flat"?p.style:BUILD_NAMES[p.build]}`,
 help:{intro:["Create personalized laser-cut keychains with names, motifs and a reinforced ring tab. Text is exported as vector paths, not installed-font text."],tips:[
      "No Weld (with Raised letters): every glyph, dot and counter is cut as its own raised piece instead of fusing where letters touch.","Measure the wire on your split ring and test a sample before a production run.","Use Job options to generate a batch of names or repeat copies on a sheet.","For raised lettering, glue every small detail over its scored guide. Choose engraving for very small text.","Layered builds: glue the layers in order, lined up on the ring hole. Photo frames, shakers and outlines can use clear or coloured acrylic as the second material.","Body size excludes the ring tab. The preview and SVG include the complete outline."],keywords:["keychain","keyring","name tag","pet tag","bag charm","photo keychain","shaker keychain","spinner","locket","layered keychain"]},
};
