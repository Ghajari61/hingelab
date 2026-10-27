import * as THREE from 'three';
import { expect } from 'vitest';
import { readScene } from '@/lib/export/scene';
import { differenceShapes, shapeContours, totalArea, unionShapes } from '@/lib/letters/polygon';

/** Read the real cut file back and compare its filled regions with the extruded flat solids.
 * Open puzzle/hinge cuts are surface toolpaths, not additional closed blanks. */
export function assertFlatMatchesSVG(group: THREE.Group, svg: string) {
  const actual: [number, number][][] = [];
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !(o.geometry instanceof THREE.ExtrudeGeometry)) return;
    for (const shape of ([] as THREE.Shape[]).concat(o.geometry.parameters.shapes)) {
      const points = shape.extractPoints(1);
      for (const c of [points.shape, ...points.holes]) actual.push(c.map(v => [+v.x.toFixed(3), +(-v.y).toFixed(3)]));
    }
  });
  const sc = readScene(svg);
  const contours = sc.layers.filter(l => /Outline cut|Inner cuts/.test(l.label)).flatMap(l => l.items.flatMap(it => it.polys.filter(p => p.closed).map(p => p.pts)));
  const a = unionShapes(actual, [], true), e = unionShapes(contours, [], true);
  expect(a.length, 'number of cut regions').toBe(e.length);
  expect(a.reduce((n,s) => n+s.holes.length,0), 'number of openings').toBe(e.reduce((n,s) => n+s.holes.length,0));
  const delta = totalArea(differenceShapes(shapeContours(a), shapeContours(e))) + totalArea(differenceShapes(shapeContours(e), shapeContours(a)));
  // Both paths are at SVG's 0.001 mm precision. Boolean intersections can introduce a sub-grid vertex.
  expect(delta, 'cut contours, positions, sizes and gaps match to SVG precision').toBeLessThan(Math.max(.02, totalArea(e) * .00001));
}
