"use client";

import type { StoreApi } from "zustand";
import { newId } from "@/lib/studio/doc";
import { getLocalAsset, putLocalAsset } from "@/lib/studio/localStore";
import { locate } from "@/lib/studio/scene";
import type { Document, GroupNode, ImageNode, Mat, PathNode, Subpath, Vec } from "@/lib/studio/types";
import { fitWithin, type Img } from "@/lib/imaging/image";
import type { EditorState } from "../store";

type Api = StoreApi<EditorState>;

export const pickImage = (s: { doc: Document; selection: string[] }): ImageNode | null => {
  if (s.selection.length !== 1) return null;
  const n = locate(s.doc.root, s.selection[0])?.node;
  return n?.type === "image" ? n : null;
};

export async function decodeImage(src: Blob, maxSide = 4096): Promise<Img> {
  const bmp = await createImageBitmap(src);
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const width = Math.max(1, Math.round(bmp.width * k)), height = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement("canvas");
    c.width = width; c.height = height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("This browser can't read pictures.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, width, height);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } finally {
    bmp.close();
  }
}

/** The selected image's pixels, at most `maxSide` on the long side. */
export async function readNodeImage(docId: string, node: ImageNode, maxSide = 2048): Promise<Img> {
  const bytes = await getLocalAsset(docId, node.assetId);
  if (!bytes) throw new Error("This image isn't stored on this device.");
  return decodeImage(new Blob([bytes as BlobPart]), maxSide);
}

/** PNG keeps transparency; JPEG is flattened onto white (for sending photos to the AI). */
export async function encodeImage(img: Img, type: "image/png" | "image/jpeg" = "image/png", quality = 0.9): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("This browser can't make pictures.");
  const data = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  if (type === "image/jpeg") {
    const t = document.createElement("canvas");
    t.width = img.width; t.height = img.height;
    t.getContext("2d")!.putImageData(data, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.drawImage(t, 0, 0);
  } else {
    ctx.putImageData(data, 0, 0);
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture could not be encoded."))), type, quality));
}

export const blobToDataUrl = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error("The picture could not be read."));
  r.readAsDataURL(b);
});

export async function dataUrlToBlob(url: string): Promise<Blob> {
  const [head, data] = url.split(",");
  const mime = head.slice(5, head.indexOf(";"));
  return new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: mime });
}

/** A picture for the cloud tools: JPEG (or PNG when it has transparency to keep), long side ≤ `max`. */
export async function uploadUrl(img: Img, max = 1536, png = false): Promise<string> {
  return blobToDataUrl(await encodeImage(fitWithin(img, max), png ? "image/png" : "image/jpeg", 0.9));
}

const unit = (t: Mat): Mat => {
  const sx = Math.hypot(t[0], t[1]) || 1, sy = Math.hypot(t[2], t[3]) || 1;
  return [t[0] / sx, t[1] / sx, t[2] / sy, t[3] / sy, t[4], t[5]];
};

/** `t` followed by a move of (dx, dy) in its own coordinates. */
const shifted = (t: Mat, dx: number, dy: number): Mat => [t[0], t[1], t[2], t[3], t[0] * dx + t[2] * dy + t[4], t[1] * dx + t[3] * dy + t[5]];

/** Where a new picture goes. */
export type Placement =
  /** Same box as the source image, just above it. */
  | { kind: "over"; source: ImageNode; grow?: { left: number; top: number; right: number; bottom: number } }
  /** Beside the source image (to its right), at the given width. */
  | { kind: "beside"; source: ImageNode; widthMm?: number }
  /** Centred on a point of the page. */
  | { kind: "at"; center: Vec; widthMm: number };

export interface NewImage {
  blob: Blob;
  name: string;
  /** History entry, e.g. "AI: Smart Adjust". */
  label: string;
  pxW: number;
  pxH: number;
  place: Placement;
  layer?: number;
  dither?: ImageNode["dither"];
  /** Changes made in the same undo step (e.g. the engrave layer's settings). */
  also?: (d: Document) => void;
}

/** Stores the picture on this device and adds it as a new image object (one undo step). Returns its id. */
export async function addImage(api: Api, n: NewImage): Promise<string | null> {
  const s = api.getState();
  const docId = s.doc.id, assetId = newId();
  const bytes = new Uint8Array(await n.blob.arrayBuffer());
  await putLocalAsset(docId, assetId, bytes);
  const aspect = n.pxH / n.pxW;
  const id = newId();
  const ok = api.getState().edit(n.label, (d) => {
    let w: number, h: number, transform: Mat, parent = d.root, index = d.root.children.length, layer = n.layer ?? 0;
    const p = n.place;
    if (p.kind === "at") {
      w = p.widthMm; h = w * aspect; transform = [1, 0, 0, 1, p.center.x, p.center.y];
    } else {
      const l = locate(d.root, p.source.id);
      if (!l || l.node.type !== "image") return false;
      const src = l.node;
      parent = l.parent; index = l.index + 1; layer = n.layer ?? src.layer;
      if (p.kind === "over") {
        const g = p.grow ?? { left: 0, top: 0, right: 0, bottom: 0 };
        w = src.w * (1 + g.left + g.right); h = src.h * (1 + g.top + g.bottom);
        transform = shifted(src.transform, (src.w * (g.right - g.left)) / 2, (src.h * (g.bottom - g.top)) / 2);
      } else {
        const sx = Math.hypot(src.transform[0], src.transform[1]) || 1;
        w = p.widthMm ?? src.w * sx; h = w * aspect;
        transform = shifted(unit(src.transform), (src.w * sx) / 2 + 10 + w / 2, 0);
      }
    }
    d.assets.push({ id: assetId, kind: "image", name: n.name, mime: n.blob.type || "image/png", bytes: bytes.length });
    const node: ImageNode = { id, type: "image", assetId, w, h, transform, layer, name: n.name, ...(n.dither ? { dither: n.dither } : {}) };
    parent.children.splice(index, 0, node);
    n.also?.(d);
    return true;
  });
  if (!ok) return null;
  api.getState().select([id]);
  return id;
}

export interface VectorPart { name: string; layer: number; subpaths: Subpath[] }

/**
 * Adds vector parts (mm, top-left origin of a w × h box) as one object: a path, or a group when
 * there are several. Centred on the source image (keeping its rotation) or on a page point.
 */
export function addVectors(api: Api, label: string, name: string, parts: VectorPart[], box: { w: number; h: number }, at: { source?: ImageNode; center?: Vec }): string | null {
  const live = parts.filter((p) => p.subpaths.length);
  if (!live.length) return null;
  const f = (s: Subpath[]) => s.map((sp) => ({
    closed: sp.closed,
    nodes: sp.nodes.map((n) => ({ x: n.x - box.w / 2, y: n.y - box.h / 2, ...(n.i ? { i: { x: n.i.x - box.w / 2, y: n.i.y - box.h / 2 } } : {}), ...(n.o ? { o: { x: n.o.x - box.w / 2, y: n.o.y - box.h / 2 } } : {}), ...(n.k ? { k: n.k } : {}) })),
  }));
  const id = newId();
  const ok = api.getState().edit(label, (d) => {
    let parent = d.root, index = d.root.children.length, transform: Mat = [1, 0, 0, 1, at.center?.x ?? 0, at.center?.y ?? 0];
    if (at.source) {
      const l = locate(d.root, at.source.id);
      if (l) { parent = l.parent; index = l.index + 1; transform = unit(l.node.transform); }
    }
    const paths: PathNode[] = live.map((p) => ({ id: newId(), type: "path", name: p.name, layer: p.layer, transform: [1, 0, 0, 1, 0, 0], subpaths: f(p.subpaths) }));
    const node: PathNode | GroupNode = paths.length === 1
      ? { ...paths[0], id, name, transform }
      : { id, type: "group", name, layer: live[0].layer, transform, children: paths };
    parent.children.splice(index, 0, node);
    return true;
  });
  if (!ok) return null;
  api.getState().select([id]);
  return id;
}

/** Cut layer for photo engraving: an existing image layer, else the first empty layer from C04 up, set to image mode. */
export function imageLayer(d: Document): number {
  const k = d.cutLayers.findIndex((l) => l.mode === "image");
  if (k >= 0) return k;
  const used = new Set<number>();
  const walk = (n: { layer: number; children?: unknown[] }) => { used.add(n.layer); (n.children as typeof n[] | undefined)?.forEach(walk); };
  d.root.children.forEach((c) => walk(c as never));
  for (let i = 4; i < d.cutLayers.length; i++) if (!used.has(i)) return i;
  return 0;
}

/** The layer that fills (engraves) areas: the first fill layer, else the current one. */
export const fillLayer = (d: Document, current: number) => {
  const k = d.cutLayers.findIndex((l) => l.mode === "fill");
  return k >= 0 ? k : current;
};

/** The first layer with this mode, else `fallback`. */
export const layerWithMode = (d: Document, mode: "cut" | "score" | "fill", fallback: number) => {
  const k = d.cutLayers.findIndex((l, i) => l.mode === mode && (mode !== "cut" || i >= 2));
  return k >= 0 ? k : fallback;
};
