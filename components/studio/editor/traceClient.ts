"use client";

import { traceRaster, type TraceOptions, type TraceResult } from "@/lib/studio/trace";
import { getLocalAsset } from "@/lib/studio/localStore";

export interface TraceRequest { id: number; width: number; height: number; rgba: Uint8ClampedArray; options: TraceOptions }
export type TraceResponse = { id: number; result: TraceResult; ms: number } | { id: number; error: string };

export interface TraceRaster { width: number; height: number; rgba: Uint8ClampedArray }

/** Reads a project image from this device and scales it so its longer side is at most `maxSide` pixels. */
export async function loadTraceRaster(docId: string, assetId: string, maxSide: number): Promise<TraceRaster | null> {
  const bytes = await getLocalAsset(docId, assetId);
  if (!bytes) return null;
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const width = Math.max(1, Math.round(bmp.width * k)), height = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, width, height);
    return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
  } finally {
    bmp.close();
  }
}

/**
 * One tracing worker per editor tab. Only the newest request matters for a live preview, so a request
 * that is overtaken resolves with null instead of its (stale) result.
 */
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: { result: TraceResult; ms: number } | null) => void; reject: (e: Error) => void }>();

function traceWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("./trace.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<TraceResponse>) => {
    const m = e.data, p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if ("error" in m) p.reject(new Error(m.error));
    else p.resolve({ result: m.result, ms: m.ms });
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "The trace worker stopped."));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function traceAsync(r: TraceRaster, options: TraceOptions): Promise<{ result: TraceResult; ms: number } | null> {
  const id = ++seq;
  for (const [k, p] of pending) if (k < id) { p.resolve(null); pending.delete(k); }
  const w = traceWorker();
  if (!w) {
    const t0 = performance.now();
    return Promise.resolve({ result: traceRaster({ width: r.width, height: r.height, data: r.rgba }, options), ms: performance.now() - t0 });
  }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, width: r.width, height: r.height, rgba: r.rgba, options } satisfies TraceRequest);
  });
}
