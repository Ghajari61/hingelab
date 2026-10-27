import * as THREE from 'three';
import { expect } from 'vitest';
import { intersectShapes, totalArea, unionShapes } from '@/lib/letters/polygon';
import type { Contour } from '@/lib/generators/types';

/** Check the real triangles and filled contours, not bounding-box overlap (nesting permits holes). */
export function assertFlatSurface(group: THREE.Group) {
  const regions: Contour[][] = [];
  let area = 0, expected = 0;
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !(o.geometry instanceof THREE.ExtrudeGeometry)) return;
    const shapes = ([] as THREE.Shape[]).concat(o.geometry.parameters.shapes);
    for (const shape of shapes) {
      const p = shape.extractPoints(1);
      const contours = [p.shape, ...p.holes].map(c => c.map(v => [v.x, v.y] as [number, number]));
      regions.push(contours);
      expected += totalArea(unionShapes(contours, [], true));
    }
    const pos = o.geometry.attributes.position, normal = o.geometry.attributes.normal;
    for (let i = 0; i < pos.count; i += 3) {
      if (normal.getZ(i) < .99) continue;
      area += Math.abs((pos.getX(i + 1) - pos.getX(i)) * (pos.getY(i + 2) - pos.getY(i)) - (pos.getX(i + 2) - pos.getX(i)) * (pos.getY(i + 1) - pos.getY(i))) / 2;
    }
  });
  expect(regions.length).toBeGreaterThan(0);
  expect(Number.isFinite(area)).toBe(true);
  expect(Math.abs(area - expected), 'triangles must preserve holes and islands').toBeLessThan(Math.max(.1, expected * 1e-6));
  const bounds = regions.map(cs => {
    const c = cs[0];
    return [Math.min(...c.map(p => p[0])), Math.min(...c.map(p => p[1])), Math.max(...c.map(p => p[0])), Math.max(...c.map(p => p[1]))];
  });
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = bounds[i], b = bounds[j];
    if (a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]) continue;
    expect(totalArea(intersectShapes(regions[i], regions[j])), `overlap between flat regions ${i} and ${j}`).toBeLessThan(.01);
  }
}
