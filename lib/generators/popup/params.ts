import {DEFAULTS,clone} from '@/lib/hinge/defaults';
import {JOB_EXTRAS,SHEET_DEFAULTS,type GenBase} from '../types';
import {mergeInto} from '../util';
export const SHAPES=['circle','ellipse','rounded','polygon','star','heart','flower','leaf','pumpkin','snowflake','custom'] as const;
export const PROFILES=['linear','dome','bell','vase','pagoda','flat-bottom','reverse','custom'] as const;
export interface PopupParams extends GenBase {
 stock:string;
 spiral:{supports:boolean;count:number;clearance:number};
 mode:'bowl'|'tower'|'hanging'|'sleeve'|'tiered';
 outline:{shape:typeof SHAPES[number];width:number;height:number;corner:number;sides:number;points:number;ratio:number;petals:number;petalDepth:number;path:string};
 pattern:{kind:'rings'|'spiral'|'multi';follow:'shape'|'circle';edge:'plain'|'wave'|'scallop'|'zigzag';amplitude:number;frequency:number;arms:number;segmented:boolean};
 rings:{by:'width'|'count'|'depth';width:number;count:number;center:number;rim:number;gap:number;variable:boolean};
 bridges:{keep:boolean;count:number;width:number;length:number;stagger:number;alternate:boolean};
 profile:{kind:typeof PROFILES[number];depth:number;belly:number;neck:number;tiers:number;curve:string};
 support:{coupon:boolean;labels:boolean;kind:'ribs'|'tilt'|'handles'|'cords'|'post'|'form';ribs:number;fit:number;angle:number;cordDiameter:number};
 extras:{base:boolean;feet:boolean;handles:boolean;finial:'none'|'star'|'ball'|'point';socket:'none'|'E14'|'E27'|'custom';socketDiameter:number;loop:boolean;tealight:boolean;tealightDiameter:number;sleeveDiameter:number;plantSeat:boolean;post:boolean};
 engraving:{text:string;rim:string;monogram:string;fontId:string;size:number;motif:'none'|'stars'|'snowflakes'|'leaves'|'hearts'|'mandala'|'nowruz'|'crescent';fill:boolean;/** Engraved (filled) or scored (outlines), for the text, monogram, rim text and motifs. */mark:'engrave'|'score'};
 sets:{count:number;scale:number;assemblyCard:boolean};
}
export const POPUP_DEFAULTS:PopupParams={spiral:{supports:true,count:3,clearance:12},name:'Pop-up bowl',material:'birch3',T:3,K:.15,bedW:600,bedH:400,gap:4,fit:{mode:'auto',sheets:1},sheet:{...SHEET_DEFAULTS},job:{...JOB_EXTRAS},layers:clone(DEFAULTS.layers),stock:'birch3',mode:'bowl',outline:{shape:'circle',width:240,height:240,corner:20,sides:6,points:5,ratio:.65,petals:6,petalDepth:.12,path:''},pattern:{kind:'rings',follow:'shape',edge:'plain',amplitude:1,frequency:16,arms:2,segmented:false},rings:{by:'width',width:10,count:9,center:45,rim:12,gap:.6,variable:false},bridges:{keep:false,count:2,width:5,length:12,stagger:90,alternate:true},profile:{kind:'dome',depth:32,belly:.7,neck:.3,tiers:3,curve:'0,0;0.25,0.1;0.5,0.35;0.75,0.7;1,1'},support:{coupon:false,labels:true,kind:'ribs',ribs:2,fit:.15,angle:5,cordDiameter:2},extras:{base:false,feet:false,handles:false,finial:'none',socket:'none',socketDiameter:40,loop:false,tealight:false,tealightDiameter:40,sleeveDiameter:55,plantSeat:false,post:false},engraving:{text:'',rim:'',monogram:'',fontId:'vazirmatn',size:7,motif:'none',fill:false,mark:'engrave'},sets:{count:1,scale:.65,assemblyCard:false}};
/** Migrate old saved spirals and switch patterns atomically, without retaining rigid ring seats. */
export function patternDefaults(p:PopupParams,kind:PopupParams['pattern']['kind']):PopupParams {
 if(kind==='rings')return {...p,pattern:{...p.pattern,kind},support:{...p.support,kind:p.support.kind==='form'?'ribs':p.support.kind}};
 return {...p,pattern:{...p.pattern,kind},support:{...p.support,kind:'form',coupon:p.spiral.supports?p.support.coupon:false},
  extras:{...p.extras,feet:false,loop:false,post:false},sets:{...p.sets,assemblyCard:false}};
}
export function mergePopup(raw:unknown):PopupParams {const p:PopupParams=mergeInto(clone(POPUP_DEFAULTS),raw);
 // saves from before scoring keep their engraving
 if(p.engraving.mark!=='score')p.engraving.mark='engrave';return patternDefaults(p,p.pattern.kind);}
export function modeDefaults(p:PopupParams,mode:PopupParams['mode']):PopupParams {return patternDefaults({...p,mode,rings:{...p.rings,center:mode==='sleeve'?Math.max(p.rings.center,p.extras.sleeveDiameter+6*p.T+2):p.rings.center},profile:{...p.profile,kind:mode==='tiered'?'pagoda':mode==='sleeve'?'vase':mode==='bowl'?'dome':'linear'},support:{...p.support,kind:mode==='hanging'?'cords':mode==='tower'?'post':'ribs'},extras:{...p.extras,loop:mode==='hanging',post:mode==='tower',finial:mode==='tower'?'star':'none'}},p.pattern.kind);}
