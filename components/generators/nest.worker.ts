/** Nests parts by their outlines off the main thread, reporting progress as parts are placed. */
import { nestOutlines } from "@/lib/nest/outline";
import type { NestRequest, NestResponse } from "./useNestWorker";

self.onmessage = (e: MessageEvent<NestRequest>) => {
  const { id, parts, spec } = e.data;
  const post = (r: NestResponse) => (self as unknown as { postMessage(r: NestResponse): void }).postMessage(r);
  let last = 0;
  try {
    const t0 = performance.now();
    const res = nestOutlines(parts, spec, (done, total) => {
      const now = performance.now();
      if (now - last > 80) { last = now; post({ id, progress: done / total }); }
    });
    post({ id, res, ms: performance.now() - t0 });
  } catch (err) {
    post({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
