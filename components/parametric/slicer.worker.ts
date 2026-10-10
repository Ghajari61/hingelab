/**
 * Parametric slicing worker: loads manifold-3d from /manifold, keeps the prepared source mesh
 * between runs (re-prepared only when the source or its settings change), and slices on request.
 */
import type { ManifoldToplevel } from "manifold-3d";
import { computeParametric, loadSource, type ParametricParams } from "@/lib/parametric";
import type { PreparedMesh } from "@/lib/parametric/source/mesh";
import type { SlicerRequest, SlicerResponse } from "./slicerProtocol";

let wasm: Promise<ManifoldToplevel> | null = null;
function manifold() {
  wasm ??= (async () => {
    const url = "/manifold/manifold.js";
    const mod = (await import(/* webpackIgnore: true */ url)) as { default: (o?: object) => Promise<ManifoldToplevel> };
    const w = await mod.default({ locateFile: () => "/manifold/manifold.wasm" });
    w.setup();
    return w;
  })();
  wasm.catch(() => { wasm = null; });
  return wasm;
}

let cache: { key: string; src: PreparedMesh } | null = null;
const sourceKey = (p: ParametricParams, fileKey: string) => JSON.stringify([p.source, p.sourceSettings, fileKey]);

const post = (m: SlicerResponse, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(m: SlicerResponse, t: Transferable[]): void }).postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<SlicerRequest>) => {
  const req = e.data;
  try {
    const w = await manifold();
    const key = sourceKey(req.params, req.fileKey ?? "");
    if (!cache || cache.key !== key) {
      const t0 = performance.now();
      cache = { key, src: await loadSource(req.params, req.file) };
      post({ id: req.id, type: "progress", stage: `Model ready (${Math.round(performance.now() - t0)} ms)` });
    }
    const t0 = performance.now();
    const result = computeParametric(req.params, cache.src, w);
    const mesh = req.wantMesh ? { positions: cache.src.mesh.positions.slice(), indices: cache.src.mesh.indices.slice() } : undefined;
    post({ id: req.id, type: "result", result, mesh, ms: performance.now() - t0, askUnits: cache.src.askUnits }, mesh ? [mesh.positions.buffer, mesh.indices.buffer] : []);
  } catch (err) {
    post({ id: req.id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
