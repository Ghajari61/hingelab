import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { computeParametric, loadSource } from '../engine';
import { mergeParametricParams } from '../defaults';
import { flatPartsObject, partsObject, disposeTree } from '@/components/parametric/scene';
import { assertFlatSurface } from '@/lib/three/__tests__/previewAssertions';
import { manifold } from './helpers';
import { layoutSheets } from '../sheetLayout';
import { allSheetsSVG } from '../export';
import { assertFlatMatchesSVG } from '@/lib/three/__tests__/flatExportAssertions';

describe('parametric preview', () => {
 for (const method of ['parallel','stacked','waffle','radial','curveNormal','folded'] as const) it(`${method}: cut layout and reusable motion`, async () => {
  const p=mergeParametricParams({method,source:{kind:'library',id:'sphere',detail:6}});
  const r=computeParametric(p,await loadSource(p),await manifold());
  const offsets=layoutSheets(r.sheets).rects;
  const flat=flatPartsObject(r,p.material.T,offsets,p), assembled=partsObject(r,p.material.T,0,'wood',false);
  try {
   assertFlatSurface(flat);
   assertFlatMatchesSVG(flat,allSheetsSVG(r,p));
   const geometry:THREE.BufferGeometry[]=[];
   expect(assembled.children.some(o=>o instanceof THREE.LineSegments),'the shared viewport owns edge overlays').toBe(false);
   assembled.traverse(o=>{if(o instanceof THREE.Mesh)geometry.push(o.geometry)});
   for(let i=0;i<=30;i++)assembled.explode(i);
   const after:THREE.BufferGeometry[]=[];
   assembled.traverse(o=>{if(o instanceof THREE.Mesh)after.push(o.geometry)});
   expect(after).toEqual(geometry);
   assembled.explode(0);
   const fromZero=partsObject(r,p.material.T,30);
   assembled.explode(30);
   expect(new THREE.Box3().setFromObject(assembled)).toEqual(new THREE.Box3().setFromObject(fromZero));
   disposeTree(fromZero);
  } finally {disposeTree(flat);disposeTree(assembled)}
 },60000);
});
