import { depthInputSize, type DepthMap } from "@/lib/parametric";

export interface DepthRequest {
  id: number;
  /** RGBA pixels already resized to the model input size. */
  rgba: Uint8ClampedArray;
  w: number;
  h: number;
}

export type DepthResponse =
  | { id: number; type: "progress"; stage: string }
  | { id: number; type: "result"; depth: DepthMap; ep: string; ms: number }
  | { id: number; type: "error"; error: string };

let worker: Worker | null = null;
let next = 1;
const pending = new Map<number, { resolve: (r: Extract<DepthResponse, { type: "result" }>) => void; reject: (e: Error) => void; stage?: (s: string) => void }>();

/** One depth worker per page, kept so the model loads only once. */
function depthWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./depth.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<DepthResponse>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === "progress") { p.stage?.(m.stage); return; }
    pending.delete(m.id);
    if (m.type === "result") p.resolve(m);
    else p.reject(new Error(m.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "The depth worker stopped."));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

/** A small JPEG of the photo for the Source panel. */
function photoPreview(bmp: ImageBitmap, long = 160) {
  const k = long / Math.max(bmp.width, bmp.height);
  const c = canvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

/** The depth map as a grey image (white = near). */
export function depthPreview(d: DepthMap, long = 160) {
  const src = canvas(d.w, d.h), ctx = src.getContext("2d")!;
  const img = ctx.createImageData(d.w, d.h);
  for (let i = 0; i < d.data.length; i++) {
    const v = Math.round(d.data[i] * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const k = long / Math.max(d.w, d.h);
  const c = canvas(Math.round(d.w * k), Math.round(d.h * k));
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

/** Photo → normalised depth map (Depth-Anything-V2-Small, 518 px on the long side) and previews. */
export async function estimateDepth(file: Blob, onStage?: (s: string) => void) {
  const bmp = await createImageBitmap(file);
  try {
    const { w, h } = depthInputSize(bmp.width, bmp.height);
    const c = canvas(w, h), ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const id = next++;
    const r = await new Promise<Extract<DepthResponse, { type: "result" }>>((resolve, reject) => {
      pending.set(id, { resolve, reject, stage: onStage });
      depthWorker().postMessage({ id, rgba, w, h } satisfies DepthRequest, [rgba.buffer]);
    });
    return { depth: r.depth, ep: r.ep, ms: r.ms, preview: photoPreview(bmp), depthPreview: depthPreview(r.depth) };
  } finally {
    bmp.close();
  }
}
