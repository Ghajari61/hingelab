import type { GenPreset } from "../types";
import type { PhotoProductParams } from "./params";
export const PHOTO_PRESETS:GenPreset<PhotoProductParams>[]=[
 {id:"studio-paw-ornament",name:"Paw ornament example",note:"Example recipe, not AI analysis. Upload your own product photos to reconstruct a design.",params:{recipe:"paw",size:{width:100,depth:105},text:{name:"Lucy"}}},
 {id:"studio-heart-box",name:"Heart hinge box example",note:"Glue-assembled box with two neutral-length wall strips. Physical bend test required.",params:{recipe:"heartbox",size:{width:140,depth:128,height:30}}},
 {id:"studio-name-tag",name:"Personalized tag example",note:"A simple editable tag recipe. Upload a photo to choose proportions and text.",params:{recipe:"tag",size:{width:70,depth:35},text:{name:"SAM",fontId:"archivo-black",size:14}}},
 {id:"winged-paw",name:"Winged memorial paw",note:"Connected name and snowflakes, colored backing, and optional wings.",params:{recipe:"paw",paw:{wings:true},size:{width:144,depth:103},text:{name:"Juno"}}},
 {id:"solid-heart-box",name:"Solid heart box",note:"Solid removable lid with a locating ring and explicit per-side clearance.",params:{recipe:"heartbox",box:{lid:"solid"},size:{width:140,depth:128,height:30}}},
 {id:"layered-paw",name:"Separate raised details",note:"Frame, name and decorative details are separate parts glued onto scored backing guides.",params:{recipe:"paw",paw:{connected:false},text:{name:"Luna"}}},
];
