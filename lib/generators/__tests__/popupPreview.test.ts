import { describe, expect, it } from 'vitest';
import { POPUP } from '../popup';
import { popupGeometry } from '../popup/build';
import { differenceShapes, shapeContours, unionShapes } from '@/lib/letters/polygon';
import { generatorScene } from '../scene3d';
import type { GenOutput } from '../types';
import { CTX } from './ctx';

const area = (s: ReturnType<typeof unionShapes>) => s.reduce((a, x) => a + x.area, 0);

describe('Pop-up preview is the actual cut material', () => {
  for (const preset of POPUP.presets) it(preset.id, () => {
    const p = POPUP.merge(preset.params), g = popupGeometry(p, CTX), blank = g.parts[0];
    // Compare every height with an independent intersection of the final cut blank and ring plan.
    // A hole inside the centre opening must never become a wooden island at this ring's height.
    for (const z of new Set(g.rings.map(r => r.height))) {
      const regions = g.rings.filter(r => r.height === z).flatMap(r =>
        shapeContours(differenceShapes([r.outer], r.inner ? [r.inner] : [])));
      const expected = differenceShapes(regions, blank.holes);
      const actual = unionShapes(shapeContours(blank.views3d!.filter(v => v.place.z === z).flatMap(v =>
        unionShapes([v.outer, ...v.holes], [], true))));
      expect(area(differenceShapes(shapeContours(actual), shapeContours(expected))), 'extra wood in empty space').toBeLessThan(.05);
      expect(area(differenceShapes(shapeContours(expected), shapeContours(actual))), 'missing wood at joints').toBeLessThan(.05);
      expect(actual.length, 'phantom islands from nested holes').toBe(expected.length);
    }
  }, 30_000);
});

const build = (id: string) => {
  const p = POPUP.merge(POPUP.presets.find(x => x.id === id)!.params);
  return { p, out: POPUP.build(p, CTX) };
};
function wraps(out: GenOutput, t: number, e: number) {
  const s = generatorScene(out, t, e);
  return { s, byId: new Map(s.group.children[0].children.filter(x => x.userData.partId).map(x => [x.userData.partId as string, x])) };
}
it('rigid assemblies cannot collapse through their own supports; explode separates every ring and rib', () => {
  const { p, out } = build('studio-ripple-bowl');
  expect(out.parts.some(x => x.views3d?.some(v => v.frames?.length))).toBe(false);
  const a = wraps(out, p.T, 0), b = wraps(out, p.T, 1);
  try {
    expect(a.s.fold).toBeUndefined();
    for (const [id, part] of a.byId) {
      const exploded = b.byId.get(id)!;
      expect(exploded, id).toBeTruthy();
      expect(part.matrix.elements, `${id} must leave its seat`).not.toEqual(exploded.matrix.elements);
    }
  } finally { a.s.dispose(); b.s.dispose(); }
});
it('non-folding pendants retain cords and fittings in the assembled scene only', () => {
  const { p, out } = build('bell-pendant');
  const a = wraps(out, p.T, 0), b = wraps(out, p.T, 1);
  try {
    expect(a.s.group.getObjectByName('Hardware')).toBeTruthy();
    expect(b.s.group.getObjectByName('Hardware')?.visible ?? false).toBe(false);
  } finally { a.s.dispose(); b.s.dispose(); }
});
