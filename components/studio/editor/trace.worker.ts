/** Trace Bitmap worker: runs `traceRaster` off the main thread so the dialog's preview stays responsive. */
import { traceRaster } from "@/lib/studio/trace";
import type { TraceRequest, TraceResponse } from "./traceClient";

self.onmessage = (e: MessageEvent<TraceRequest>) => {
  const { id, width, height, rgba, options } = e.data;
  const post = (m: TraceResponse) => (self as unknown as { postMessage(m: TraceResponse): void }).postMessage(m);
  try {
    const t0 = performance.now();
    const result = traceRaster({ width, height, data: rgba }, options);
    post({ id, result, ms: performance.now() - t0 });
  } catch (err) {
    post({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
