import { expect, it } from 'vitest';
import { ALL_GENERATORS } from '../all';
import { arrangeGenerator, flatOf, genSVG } from '../output';
import { CTX } from './ctx';
import { flatScene } from '@/lib/three/flat';
import { assertFlatMatchesSVG } from '@/lib/three/__tests__/flatExportAssertions';
import { flatArtworkSVG } from '@/lib/three/flatArtwork';
import { readScene } from '@/lib/export/scene';

it('numbered copies, calibration, mirroring, directional kerf and nesting preserve cut-file geometry', () => {
  const def=ALL_GENERATORS.find(g=>g.id==='boxes')!;
  const p=def.merge({ ...def.defaults(), bedW:280, bedH:220, job:{mirror:true,names:''}, sheet:{nest:'outline',calibration:true,labels:true,copies:2,kerfXY:true,kerfY:.35} });
  const a=arrangeGenerator(def,p,CTX);
  expect(a.lay).not.toBeNull();
  const svg=genSVG(def,a.params,a.lay!,'',a.sheets), flat=flatOf(a.lay!), scene=flatScene(flat,p.T);
  try { assertFlatMatchesSVG(scene.group,svg); } finally { scene.dispose(); }
  const ids=[...new Set([...svg.matchAll(/data-part="([^"]+)"/g)].map(m=>m[1]))];
  expect(ids.length).toBe(a.lay!.items.length);
  expect(ids.some(id=>id.includes('~2'))).toBe(true);
  const art=flatArtworkSVG(svg,flat,a.lay!.width,a.lay!.height);
  const score=readScene(svg).layers.find(l=>l.label.includes('Score'))!;
  expect(score.items.length).toBeGreaterThan(0);
  // No redrawn labels: every original vector stroke, image and layer is used verbatim.
  for(const item of score.items) expect(art).toContain(item.raw);
  const off={...a.params,layers:{...a.params.layers,hinge:{...a.params.layers.hinge,exp:false}}};
  expect(flatArtworkSVG(genSVG(def,off,a.lay!),flat,a.lay!.width,a.lay!.height)).not.toContain('id="hinge"');
},60000);
