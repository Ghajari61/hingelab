import {describe,it,expect} from 'vitest';
import {generateDesign} from '../products';
import type {GenerateResponse} from '../types';
import {POPUP_PRESETS} from '@/lib/generators/popup/presets';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir=process.env.POPUP_QA_OUTPUT; if(dir) mkdirSync(dir,{recursive:true});
describe('Pop-up Windows server generation',()=>{
for(const pr of POPUP_PRESETS)it(pr.name,async()=>{
 const r=await generateDesign({product:'popup',preset:pr.id,model:true},'pro');const b=r.body as GenerateResponse;
 expect(r.status,JSON.stringify(b.error)).toBe(200);expect(b.error).toBeUndefined();expect(b.svg).toContain('mm');expect(b.svg).not.toMatch(/NaN|Infinity/);expect(b.width).toBeGreaterThan(0);expect(b.height).toBeGreaterThan(0);expect(b.model?.objects.length).toBeGreaterThan(0);
 if(dir) writeFileSync(`${dir}/${pr.id}.svg`,b.svg!);
 if(dir) writeFileSync(`${dir}/${pr.id}.json`,JSON.stringify({preset:pr.name,fileName:b.fileName,width:b.width,height:b.height,objects:b.model!.objects.length,issues:b.issues,sha256:createHash('sha256').update(b.svg!).digest('hex')},null,2));
 const edited=await generateDesign({product:'popup',params:b.params,change:{key:'outline.width',value:260},model:true},'pro');expect(edited.status).toBe(200);expect((edited.body as GenerateResponse).params).toMatchObject({outline:{width:260}});
 const free=await generateDesign({product:'popup',preset:pr.id},'free');expect(free.status).toBe(403);expect((free.body as GenerateResponse).svg).toBeUndefined();
},60000);
});
