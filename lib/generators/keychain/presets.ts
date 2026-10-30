import { SHAPE_KINDS, SHAPE_NAMES } from "../shapes";
import type { GenPreset } from "../types";
import type { KeychainParams } from "./params";
export const KEYCHAIN_PRESETS: GenPreset<KeychainParams>[] = [
  ...SHAPE_KINDS.map((shape,i)=>({id:`name-${shape}`,name:`${SHAPE_NAMES[shape]} name tag`,note:"Personalize the name, font and ring position. Dimensions are in millimetres.",params:{shape,width:shape==="rounded"?65:48,height:shape==="rounded"?28:42,text:{name:["SAM","AVA","NOAH","LUNA"][i%4]},ring:{side:i%3===0?"left" as const:"top" as const}}})),
  {id:"pet-id",name:"Pet ID charm",note:"Name and contact number with a paw motif.",params:{shape:"circle",width:42,height:42,text:{name:"MILO",subtitle:"555 0100"},motif:"paw",ring:{side:"top"}}},
  {id:"hotel-key",name:"Hotel room key",note:"Long rounded hotel fob with room number.",params:{shape:"pill",width:38,height:85,text:{name:"207",subtitle:"GUEST HOUSE",size:24},ring:{side:"top"}}},
  {id:"couple-heart",name:"Couple heart",note:"Two names on a heart-shaped gift.",params:{shape:"heart",width:60,height:52,text:{name:"A + S",subtitle:"FOREVER"},ring:{side:"left"}}},
  {id:"raised-name",name:"Layered name",note:"Cut raised letters separately and glue using the scored guides.",params:{style:"layered",width:80,height:32,text:{name:"OLIVIA",size:16}}},
  {id:"housewarming",name:"New home",note:"A house-shaped keyring with a personal address.",params:{shape:"house",width:52,height:55,text:{name:"HOME",subtitle:"24 OAK LANE"},ring:{side:"top"}}},
  {id:"adventure",name:"Adventure badge",note:"Mountain motif and initials on a shield.",params:{shape:"shield",width:50,height:58,text:{name:"EXPLORE"},motif:"mountains",ring:{side:"top"}}},
  // ---- layered keychains
  {id:"photo-frame",name:"Photo frame keychain",note:"A tiny frame: back, photo pocket, clear acrylic cover and front, the name under the window.",params:{build:"frame",shape:"rounded",width:50,height:62,corner:6,text:{name:"MOM",size:8},stack:{frame:5,window:"match",cover:true,mat2:"acrylic-clear",T2:2},ring:{side:"top"}}},
  {id:"heart-photo",name:"Heart window photo frame",note:"A heart-shaped window over the photo on a rounded frame.",params:{build:"frame",shape:"rounded",width:52,height:60,corner:10,text:{name:"LOVE",size:7},stack:{frame:4,window:"heart",cover:true,mat2:"acrylic-clear",T2:2},ring:{side:"top"}}},
  {id:"round-photo",name:"Round photo locket frame",note:"A circular photo window in a scalloped frame, no cover.",params:{build:"frame",shape:"scalloped",width:56,height:56,text:{name:"",subtitle:""},stack:{frame:6,window:"circle",cover:false},ring:{side:"top"}}},
  {id:"shaker-heart",name:"Heart shaker",note:"A clear front over a pocket of beads or glitter; the name engraved on the back shows through.",params:{build:"shaker",shape:"heart",width:56,height:50,text:{name:"MIA",size:10},stack:{frame:4,depth:2,mat2:"acrylic-clear",T2:2},ring:{side:"top"}}},
  {id:"shaker-star",name:"Star shaker",note:"A star with a deep shaker space (three walls).",params:{build:"shaker",shape:"star",width:60,height:58,text:{name:"",subtitle:""},motif:"star",stack:{frame:4.5,depth:3,mat2:"acrylic-clear",T2:2},ring:{side:"top"}}},
  {id:"spinner-coin",name:"Spinner coin",note:"A disc with your name turns freely between two rims: a fidget keyring.",params:{build:"spinner",shape:"circle",width:48,height:48,text:{name:"LUCKY",size:7},stack:{frame:4},ring:{side:"top"}}},
  {id:"spinner-hex",name:"Hexagon spinner",note:"A spinning initial in a hexagon frame.",params:{build:"spinner",shape:"hexagon",width:50,height:46,text:{name:"J",size:16},stack:{frame:4},ring:{side:"left"}}},
  {id:"swivel-locket",name:"Swivel heart locket",note:"The cover swings open on the ring to show a photo or a note.",params:{build:"locket",shape:"heart",width:50,height:46,text:{name:"US",size:10},stack:{frame:4.5},ring:{side:"left",diameter:4,wall:3}}},
  {id:"two-tone",name:"Two-tone outline name",note:"A blue acrylic front on a bigger birch backing, like a sticker outline.",params:{build:"outline",shape:"pill",width:70,height:26,text:{name:"OLIVER",size:11},stack:{border:3,mat2:"acrylic-blue",T2:3},ring:{side:"left"}}},
  {id:"mirror-raised",name:"Mirror outline with raised name",note:"Gold mirror front on a wood outline, the name raised on top.",params:{build:"outline",style:"layered",shape:"rounded",width:72,height:30,text:{name:"SOFIA",size:12},stack:{border:2.5,mat2:"acrylic-gold",T2:3},ring:{side:"left"}}},
  {id:"mountain-scene",name:"Mountain scene",note:"Three layers: sky with your text, mountains and hills.",params:{build:"scene",shape:"arch",width:50,height:60,text:{name:"WILD",size:8},stack:{frame:3.5},ring:{side:"top"}}},
  {id:"scene-badge",name:"Adventure scene badge",note:"A layered landscape in a shield.",params:{build:"scene",shape:"shield",width:52,height:60,text:{name:"",subtitle:""},motif:"sun",stack:{frame:4},ring:{side:"top"}}},
];
