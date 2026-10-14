"use client";

import { decodeContours } from "@/lib/generators/shadowbox/picPath";
import type { Levels } from "@/lib/imaging/levels";

type Body = { kind: "raster"; width: number; height: number; rgba: Uint8ClampedArray } | { kind: "svg"; text: string };
export type LevelsRequest = Body & { id: number };
export type LevelsResponse = ({ id: number } & Levels) | { id: number; error: string; friendly: boolean };

/** Tracing failed for a reason the user can act on; the message is written for them. */
export class TraceError extends Error {}

/** Longest side a picture is traced at, px (TRACE_SIDE in lib/imaging/levels, kept here so the editor does not load the tracer). */
const TRACE_SIDE = 600;
/** Longest side of the preview kept in the design, px. */
const THUMB_SIDE = 200;
/** Largest SVG file read, bytes. */
const MAX_SVG = 5 * 1024 * 1024;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: Levels) => void; reject: (e: Error) => void }>();

function levelsWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./levels.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<LevelsResponse>) => {
    const m = e.data, p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if ("error" in m) p.reject(m.friendly ? new TraceError(m.error) : new Error(m.error));
    else p.resolve({ levels: m.levels, aspect: m.aspect });
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "The tracing worker stopped."));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function run(req: Body): Promise<Levels> {
  if (typeof Worker === "undefined") {
    return import("@/lib/imaging/levels").then((m) => {
      try {
        return req.kind === "svg" ? m.svgLevels(req.text) : m.traceLevels({ width: req.width, height: req.height, data: req.rgba });
      } catch (err) {
        throw err instanceof m.PictureError ? new TraceError(err.message) : err;
      }
    });
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const msg: LevelsRequest = { ...req, id };
    levelsWorker().postMessage(msg, msg.kind === "raster" ? [msg.rgba.buffer] : []);
  });
}

const isSvg = (f: File) => f.type === "image/svg+xml" || /\.svg$/i.test(f.name);

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return { c, g: c.getContext("2d", { willReadFrequently: true })! };
}

/** A grey JPEG preview drawn from the first level's shapes (SVG files). */
function shapePreview(levels: string, aspect: number): string {
  const w = aspect >= 1 ? THUMB_SIDE : Math.max(1, Math.round(THUMB_SIDE * aspect));
  const h = aspect >= 1 ? Math.max(1, Math.round(THUMB_SIDE / aspect)) : THUMB_SIDE;
  const { c, g } = canvas(w, h);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  const k = Math.max(w, h) / 1000;
  g.beginPath();
  for (const ring of decodeContours(levels.split("|")[0])) ring.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
  g.fillStyle = "#222";
  g.fill("evenodd");
  return c.toDataURL("image/jpeg", 0.8);
}

export interface TracedPicture extends Levels { preview: string; name: string; ms: number }

/** Traces a picture or SVG file on this device: its outlines, a small grey preview and its name. */
export async function traceFile(f: File): Promise<TracedPicture> {
  const t0 = performance.now();
  const name = f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80);
  if (isSvg(f)) {
    if (f.size > MAX_SVG) throw new TraceError("That SVG is larger than 5 MB. Simplify it and try again.");
    const r = await run({ kind: "svg", text: await f.text() });
    return { ...r, preview: shapePreview(r.levels, r.aspect), name, ms: performance.now() - t0 };
  }
  const bmp = await createImageBitmap(f);
  try {
    const k = Math.min(1, TRACE_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const { g } = canvas(w, h);
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, 0, 0, w, h);
    const rgba = g.getImageData(0, 0, w, h).data;
    const t = Math.min(1, THUMB_SIDE / Math.max(w, h));
    const th = canvas(Math.max(1, Math.round(w * t)), Math.max(1, Math.round(h * t)));
    th.g.fillStyle = "#fff";
    th.g.fillRect(0, 0, th.c.width, th.c.height);
    th.g.filter = "grayscale(1)";
    th.g.drawImage(bmp, 0, 0, th.c.width, th.c.height);
    const preview = th.c.toDataURL("image/jpeg", 0.8);
    const r = await run({ kind: "raster", width: w, height: h, rgba });
    return { ...r, preview, name, ms: performance.now() - t0 };
  } finally {
    bmp.close();
  }
}
