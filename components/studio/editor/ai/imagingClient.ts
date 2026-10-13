"use client";

import { runImaging, type ImagingRequest, type ImagingResult } from "@/lib/imaging/ops";

type Reply = { id: number; result: ImagingResult } | { id: number; error: string };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: ImagingResult) => void; reject: (e: Error) => void }>();

function stop(reason: Error, owner?: number) {
  for (const [id, p] of pending) p.reject(owner === undefined || id === owner ? reason : new Error("Stopped when another job was cancelled. Run it again."));
  pending.clear();
  worker?.terminate();
  worker = null;
}

function imagingWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./imaging.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const m = e.data, p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if ("error" in m) p.reject(new Error(m.error)); else p.resolve(m.result);
  };
  worker.onerror = (e) => stop(new Error(e.message || "The image worker stopped."));
  return worker;
}

export const cancelled = () => new DOMException("Cancelled", "AbortError");

/**
 * Runs one local image tool. Cancelling stops the worker (the tools have no checkpoints), which
 * also ends any other job running in it; those reject and can be run again.
 */
export function imaging(req: ImagingRequest, signal?: AbortSignal): Promise<ImagingResult> {
  if (signal?.aborted) return Promise.reject(cancelled());
  const w = imagingWorker();
  if (!w) {
    return new Promise((resolve, reject) => setTimeout(() => {
      try { resolve(runImaging(req)); } catch (e) { reject(e); }
    }, 0));
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onAbort = () => { if (pending.has(id)) stop(cancelled(), id); };
    signal?.addEventListener("abort", onAbort, { once: true });
    pending.set(id, {
      resolve: (r) => { signal?.removeEventListener("abort", onAbort); resolve(r); },
      reject: (e) => { signal?.removeEventListener("abort", onAbort); reject(e); },
    });
    w.postMessage({ id, req });
  });
}
