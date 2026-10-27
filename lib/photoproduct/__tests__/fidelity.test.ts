import {describe,it,expect} from 'vitest';
import {buildGeneratedProduct} from '../generated';
import {reviewViewsSVG} from '../reviewViews';
import {CTX} from '@/lib/generators/__tests__/ctx';
import {generatedTable} from './generated-fixture';
import {Resvg} from '@resvg/resvg-js';
describe('photo reconstruction geometry fidelity',()=>{
 it('varies actual rib vertices by copy index instead of extruding one repeated silhouette',()=>{
  const model=generatedTable();model.parts=model.parts.slice(0,1);
  const p=model.parts[0];p.count='3';p.outline={...p.outline,kind:'polygon',points:[[0,0],[1,0],['1-i*0.1',1],[0,1]]};
  const out=buildGeneratedProduct(model,{width:100,depth:80,height:50},3,{},CTX);
  expect(out.error).toBeUndefined();expect(out.parts[0].outer).not.toEqual(out.parts[2].outer);
  p.outline.points[2][0]='globalThis.process()';expect(buildGeneratedProduct(model,{width:100,depth:80,height:50},3,{},CTX).error).toBeTruthy();
 });
 it('renders actual assembled contours in four undistorted views suitable for visual correction',()=>{
  const out=buildGeneratedProduct(generatedTable(),{width:300,depth:200,height:100},3,{},CTX);
  const svg=reviewViewsSVG(out);expect(svg).toContain('ISOMETRIC');expect(svg).toContain('FRONT');expect(svg).not.toMatch(/NaN|Infinity|<script/);
  const image=new Resvg(svg,{font:{loadSystemFonts:false}}).render();expect(image.width).toBe(960);expect(image.height).toBe(760);
 });
});
