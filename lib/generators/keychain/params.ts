import { DEFAULTS, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isShapeKind, type ShapeKind } from "../shapes";
import { isMotifId, type MotifId } from "../motifs";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
export interface KeychainParams extends GenBase {
  shape: ShapeKind; width: number; height: number; corner: number; margin: number;
  style: "engrave" | "score" | "layered";
  text: { name: string; subtitle: string; fontId: string; size: number; spacing: number };
  ring: { side: "left" | "right" | "top"; diameter: number; wall: number };
  border: "none" | "score" | "engrave";
  motif: "none" | MotifId;
}
export const KEYCHAIN_DEFAULTS: KeychainParams = {
  name: "Personal keychain", material: "birch3", T: 3, K: DEFAULTS.K, bedW:600, bedH:400, gap:4,
  fit:{...FIT_OFF}, sheet:{...SHEET_DEFAULTS}, job:{...JOB_EXTRAS}, layers:clone(DEFAULTS.layers),
  shape:"rounded", width:65, height:28, corner:6, margin:3,
  style:"engrave", text:{name:"SAM",subtitle:"",fontId:"archivo-black",size:12,spacing:0},
  ring:{side:"left",diameter:5,wall:3}, border:"score", motif:"none",
};
export function mergeKeychain(raw: unknown): KeychainParams {
  const p=mergeInto(clone(KEYCHAIN_DEFAULTS),raw);
  const n=(v:number,d:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,Number.isFinite(v)?v:d));
  p.width=n(p.width,65,25,180);p.height=n(p.height,28,20,120);p.corner=n(p.corner,6,0,30);p.margin=n(p.margin,3,1.5,8);
  p.ring.diameter=n(p.ring.diameter,5,2,12);p.ring.wall=n(p.ring.wall,3,2,8);
  p.text.size=n(p.text.size,12,3,40);p.text.spacing=n(p.text.spacing,0,-1,3);
  p.text.name=p.text.name.slice(0,80);p.text.subtitle=p.text.subtitle.slice(0,80);
  if(!isShapeKind(p.shape))p.shape="rounded";
  if(!["engrave","score","layered"].includes(p.style))p.style="engrave";
  if(!["none","score","engrave"].includes(p.border))p.border="none";
  if(!["left","right","top"].includes(p.ring.side))p.ring.side="left";
  if(!isMotifId(p.motif))p.motif="none";
  return p;
}
