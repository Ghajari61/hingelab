import { expect, it } from 'vitest';
import { computeParametric, loadSource } from '../engine';
import { mergeParametricParams } from '../defaults';
import { allSheetsSVG, sheetSVG } from '../export';
import { layoutSheets } from '../sheetLayout';
import { readScene } from '@/lib/export/scene';
import { manifold } from './helpers';
import { flatPartsObject, disposeTree } from '@/components/parametric/scene';
import { assertFlatMatchesSVG } from '@/lib/three/__tests__/flatExportAssertions';
import { makeExport } from '@/lib/export/bundle';
import { defaultExport } from '@/lib/export/profiles';
import { strFromU8, unzipSync } from 'fflate';

it('combined SVG uses the same grid, sheet offsets and marks as Lay Flat, including calibration', async () => {
  const p = mergeParametricParams({ method: 'stacked', source: { kind: 'library', id: 'sphere', detail: 6 } });
  p.material = { ...p.material, sheetW: 220, sheetH: 180, calibration: true };
  const r = computeParametric(p, await loadSource(p), await manifold());
  expect(r.sheets.length).toBeGreaterThan(1);
  const layout = layoutSheets(r.sheets), combined = readScene(allSheetsSVG(r, p));
  expect(combined.W).toBe(layout.W);
  expect(combined.H).toBe(layout.H);
  const expected = r.sheets.flatMap((_, i) => readScene(sheetSVG(r, i, p)).layers.flatMap(l => l.items.flatMap(it => it.polys.map(poly => ({
    label: l.label, closed: poly.closed, pts: poly.pts.map(([x,y]) => [+(x + layout.rects[i].x).toFixed(3), +(y + layout.rects[i].y).toFixed(3)]),
  })))));
  const actual = combined.layers.flatMap(l => l.items.flatMap(it => it.polys.map(poly => ({ label: l.label, closed: poly.closed, pts: poly.pts }))));
  const sorted = (items: unknown[]) => items.map(x => JSON.stringify(x)).sort();
  expect(sorted(actual)).toEqual(sorted(expected));
  const flat = flatPartsObject(r, p.material.T, layout.rects, p);
  try { assertFlatMatchesSVG(flat, allSheetsSVG(r, p)); } finally { disposeTree(flat); }
  const bundle = makeExport(allSheetsSVG(r,p), layout.rects, { ...defaultExport('co2-50'), format:'svg', split:true, merge:false }, 'parts');
  const files = Object.values(unzipSync(bundle.file.data as Uint8Array));
  expect(files.length).toBe(r.sheets.length);
  for (const [i,file] of files.entries()) {
    const split = readScene(strFromU8(file)), single = readScene(sheetSVG(r,i,p));
    expect(split.W).toBe(single.W);
    expect(split.H).toBe(single.H);
    const polys = (s: typeof single) => s.layers.flatMap(l => l.items.flatMap(it => it.polys));
    const a=polys(split), b=polys(single);
    expect(a.length).toBe(b.length);
    for(let j=0;j<a.length;j++) {
      expect(a[j].closed).toBe(b[j].closed);
      expect(a[j].pts.length).toBe(b[j].pts.length);
      a[j].pts.forEach((q,k) => q.forEach((v,axis) => expect(v).toBeCloseTo(b[j].pts[k][axis],3)));
    }
  }
}, 60000);
