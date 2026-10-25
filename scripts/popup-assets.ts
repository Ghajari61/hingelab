import {optimiseSVG} from './perf/svgo-presets.mjs';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {POPUP} from '../lib/generators/popup';
import {POPUP_PRESETS} from '../lib/generators/popup/presets';
import {CTX} from '../lib/generators/__tests__/ctx';
import {arrangeGenerator} from '../lib/generators/output';
import {assembledSVG} from '../lib/generators/thumb';
const small=(v:unknown):unknown=>Array.isArray(v)?(v.length>96&&v.every(q=>Array.isArray(q)&&q.length===2&&q.every(n=>typeof n==='number'))?v.filter((_,i)=>i%Math.ceil(v.length/96)===0):v.map(small)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,small(x)])):v;
const built=JSON.parse(readFileSync('lib/templates/built.json','utf8'));
mkdirSync('public/templates/thumbs',{recursive:true});mkdirSync('public/presets/popup',{recursive:true});
for(const preset of POPUP_PRESETS){const p=POPUP.merge(preset.params),out=POPUP.build(p,CTX),a=arrangeGenerator(POPUP,p,CTX);if(!a.lay||out.error)throw Error(preset.id+': '+out.error);const svg=optimiseSVG(assembledSVG(small(out) as typeof out,p.T));writeFileSync(`public/presets/popup/${preset.id}.svg`,svg);copyFileSync(`public/presets/popup/${preset.id}.svg`,`public/templates/thumbs/popup-${preset.id}.svg`);built[`popup-${preset.id}`]={w:a.lay.width,h:a.lay.height,sheets:a.sheets?.length??1,objects:out.parts.length,pro:POPUP.pro?.(p,out)};}
writeFileSync('lib/templates/built.json',JSON.stringify(built,null,1)+'\n');console.log('Generated 27 Pop-up thumbnails and measured template metadata.');
