import {cleanNoWeld} from "../textOps";
import { DEFAULTS, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { isShapeKind, type ShapeKind } from "../shapes";
import { isMotifId, type MotifId } from "../motifs";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
import { SECOND_MATERIALS } from "../material2";
export interface KeychainParams extends GenBase {
  shape: ShapeKind; width: number; height: number; corner: number; margin: number;
  style: "engrave" | "score" | "layered";
  text: { name: string; subtitle: string; fontId: string; size: number; spacing: number; /** Raised letters: each glyph its own piece instead of fusing where letters touch. */ noWeld: boolean };
  ring: { side: "left" | "right" | "top"; diameter: number; wall: number };
  border: "none" | "score" | "engrave";
  motif: "none" | MotifId;
  /** How it is built: one layer, or glued layers (photo frame, shaker, spinner, swivel locket, two-tone outline, scene). */
  build: "flat" | "frame" | "shaker" | "spinner" | "locket" | "outline" | "scene";
  stack: {
    /** Frame or rim width round a window, mm. */
    frame: number;
    /** The photo frame's window shape. */
    window: "match" | "circle" | "heart" | "rounded";
    /** A clear acrylic cover over the photo. */
    cover: boolean;
    /** Shaker walls (layers of the main material). */
    depth: number;
    /** The two-tone outline's width round the front. */
    border: number;
    mat2: string; T2: number;
  };
}
export const BUILDS = ["flat", "frame", "shaker", "spinner", "locket", "outline", "scene"] as const;
export const KEYCHAIN_DEFAULTS: KeychainParams = {
  name: "Personal keychain", material: "birch3", T: 3, K: DEFAULTS.K, bedW:600, bedH:400, gap:4,
  fit:{...FIT_OFF}, sheet:{...SHEET_DEFAULTS}, job:{...JOB_EXTRAS}, layers:clone(DEFAULTS.layers),
  shape:"rounded", width:65, height:28, corner:6, margin:3,
  style:"engrave", text:{name:"SAM",subtitle:"",fontId:"archivo-black",size:12,spacing:0,noWeld:false},
  ring:{side:"left",diameter:5,wall:3}, border:"score", motif:"none",
  build:"flat", stack:{frame:5,window:"match",cover:true,depth:2,border:3,mat2:"acrylic-clear",T2:3},
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
  p.text.noWeld=cleanNoWeld(p.text.noWeld);
  if(!["none","score","engrave"].includes(p.border))p.border="none";
  if(!["left","right","top"].includes(p.ring.side))p.ring.side="left";
  if(!isMotifId(p.motif))p.motif="none";
  if(!(BUILDS as readonly string[]).includes(p.build))p.build="flat";
  const L=p.stack;
  L.frame=n(L.frame,5,2.5,15);L.depth=Math.round(n(L.depth,2,1,4));L.border=n(L.border,3,1.5,8);L.T2=n(L.T2,3,1,6);
  if(!["match","circle","heart","rounded"].includes(L.window))L.window="match";
  L.cover=L.cover!==false;
  if(!(L.mat2 in SECOND_MATERIALS))L.mat2="acrylic-clear";
  return p;
}
