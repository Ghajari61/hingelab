/** Repeatable CPU benchmark for the Lay Flat path, including edged-face preparation.
 * Run: npx vite-node -c vitest.config.ts scripts/perf/flat-preview.ts [--check]
 * Measures preview construction only, not network, fonts, or GPU frame time.
 */
import * as THREE from 'three';
import { POPUP } from '../../lib/generators/popup';
import { arrangeGenerator, flatOf } from '../../lib/generators/output';
import { flatScene } from '../../lib/three/flat';
import { CTX } from '../../lib/generators/__tests__/ctx';

let exceeded = false;
for (const id of ['kids-nursery-mobile', 'studio-ripple-bowl', 'precision-gallery-tower', 'snowflake-tree']) {
  const p = POPUP.merge(POPUP.presets.find(x => x.id === id)!.params);
  const a = arrangeGenerator(POPUP, p, CTX);
  if (!a.lay || 'error' in a.result) throw Error(`Cannot build ${id}`);
  const samples: number[] = [];
  for (let i = 0; i < 8; i++) {
    const start = performance.now(), scene = flatScene(flatOf(a.lay), p.T);
    scene.group.traverse(o => {
      if (o instanceof THREE.Mesh) new THREE.EdgesGeometry(o.geometry, 28).dispose();
    });
    if (i) samples.push(performance.now() - start);
    scene.dispose();
  }
  samples.sort((a, b) => a - b);
  const median = samples[3];
  console.log(`${id}: median ${median.toFixed(1)} ms (range ${samples[0].toFixed(1)}–${samples[6].toFixed(1)} ms)`);
  // A wide ceiling tolerates slower machines but catches the former multi-second triangulation.
  exceeded ||= median > 800;
}
if (process.argv.includes('--check') && exceeded) throw Error('Lay Flat exceeded its 800 ms median preview budget.');
