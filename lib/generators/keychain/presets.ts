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
];
