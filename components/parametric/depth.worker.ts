/**
 * Photo depth worker: Depth-Anything-V2-Small (Apache-2.0) in onnxruntime-web, on WebGPU when the
 * browser has an adapter, otherwise on WASM. ORT is loaded from /ort (copied on install); the
 * model from NEXT_PUBLIC_DEPTH_MODEL_URL or public/models, else from Hugging Face.
 */
import type * as OrtT from "onnxruntime-web";
import { depthInput, normaliseDepth } from "@/lib/parametric/source/relief";
import type { DepthRequest, DepthResponse } from "./depthProtocol";

const LOCAL = process.env.NEXT_PUBLIC_DEPTH_MODEL_URL || "/models/depth-anything-v2-small/model_quantized.onnx";
const REMOTE = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx";

const post = (m: DepthResponse, transfer: Transferable[] = []) =>
  (self as unknown as { postMessage(m: DepthResponse, t: Transferable[]): void }).postMessage(m, transfer);

async function fetchModel(id: number): Promise<Uint8Array> {
  let last = "";
  for (const url of [LOCAL, REMOTE]) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) { last = `${res.status} ${res.statusText}`; continue; }
      const total = Number(res.headers.get("content-length")) || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0, shown = -1;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        const pct = total ? Math.floor((got / total) * 100) : -1;
        if (pct !== shown && pct % 5 === 0) { shown = pct; post({ id, type: "progress", stage: total ? `Loading the depth model ${pct}%` : "Loading the depth model" }); }
      }
      const out = new Uint8Array(got);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      return out;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`The depth model could not be loaded (${last}).`);
}

let session: Promise<{ ort: typeof OrtT; s: OrtT.InferenceSession; ep: string }> | null = null;

function load(id: number) {
  session ??= (async () => {
    const url = "/ort/ort.webgpu.min.mjs";
    const ort = (await import(/* webpackIgnore: true */ url)) as typeof OrtT;
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    const model = await fetchModel(id);
    post({ id, type: "progress", stage: "Starting the depth model" });
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
    if (adapter) {
      try {
        return { ort, s: await ort.InferenceSession.create(model, { executionProviders: ["webgpu"] }), ep: "WebGPU" };
      } catch { /* fall back to WASM */ }
    }
    return { ort, s: await ort.InferenceSession.create(model, { executionProviders: ["wasm"] }), ep: "WASM" };
  })();
  session.catch(() => { session = null; });
  return session;
}

self.onmessage = async (e: MessageEvent<DepthRequest>) => {
  const { id, rgba, w, h } = e.data;
  try {
    const { ort, s, ep } = await load(id);
    post({ id, type: "progress", stage: `Reading depth from the photo (${ep})` });
    const t0 = performance.now();
    const input = new ort.Tensor("float32", depthInput(rgba, w, h), [1, 3, h, w]);
    const out = await s.run({ [s.inputNames[0]]: input });
    const t = out[s.outputNames[0]];
    const dims = t.dims;
    const oh = dims[dims.length - 2], ow = dims[dims.length - 1];
    const depth = normaliseDepth(t.data as Float32Array, ow, oh);
    input.dispose?.();
    post({ id, type: "result", depth, ep, ms: performance.now() - t0 }, [depth.data.buffer]);
  } catch (err) {
    post({ id, type: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
