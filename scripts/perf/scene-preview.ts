/** CPU-only preview benchmark (not network/GPU time).
 * npx vite-node -c vitest.config.ts scripts/perf/scene-preview.ts [--check]
 */
import * as THREE from 'three';
import { ALL_GENERATORS } from '../../lib/generators/all';
import { generatorScene } from '../../lib/generators/scene3d';
import { CTX } from '../../lib/generators/__tests__/ctx';

let exceeded = false;
for (const def of ALL_GENERATORS) {
  const p = def.defaults(), out = def.build(p, CTX);
  if (out.error) throw Error(`${def.id}: ${out.error}`);
  const start = performance.now(), scene = generatorScene(out, p.T);
  scene.group.traverse(o => { if (o instanceof THREE.Mesh) new THREE.EdgesGeometry(o.geometry, 28).dispose(); });
  scene.explode!(1); scene.explode!(0);
  const load = performance.now() - start, frames: number[] = [];
  for (let i = 0; i < 61; i++) {
    const t = performance.now();
    scene.explode!(i / 60);
    frames.push(performance.now() - t);
  }
  frames.sort((a,b) => a-b);
  const median = frames[30];
  console.log(`${def.id}: prepare ${load.toFixed(1)} ms, motion median ${median.toFixed(3)} ms`);
  exceeded ||= median > 16 || load > 2000;
  scene.dispose();
}
if (process.argv.includes('--check') && exceeded) throw Error('3D CPU preview exceeded the preparation/motion budget.');
