import { describe, expect, it } from 'vitest';
import { ALL_GENERATORS } from '../all';
import { arrangeGenerator, flatOf, genSVG } from '../output';
import { flatScene } from '@/lib/three/flat';
import { assertFlatSurface } from '@/lib/three/__tests__/previewAssertions';
import { CTX } from './ctx';

describe('every generator flat preview', () => {
 for (const def of ALL_GENERATORS) it(`${def.id}: defaults and every preset`, () => {
  for (const preset of [{id:'default',params:def.defaults()},...def.presets]) {
   const p=def.merge(preset.params), a=arrangeGenerator(def,p,CTX);
   expect(a.lay, preset.id).not.toBeNull();
   expect('error' in a.result, preset.id).toBe(false);
   const scene=flatScene(flatOf(a.lay!),p.T);
   try {assertFlatSurface(scene.group)} finally {scene.dispose()}
   expect(genSVG(def,p,a.lay!)).not.toMatch(/NaN|Infinity|undefined/);
  }
 },120000);
});
