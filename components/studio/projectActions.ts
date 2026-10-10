"use client";

import { createDocument, IDENTITY, newId, type NewDocumentOptions } from "@/lib/studio/doc";
import { openHingelab, packHingelab, projectFileName, type OpenedFile } from "@/lib/studio/file";
import { getLocalAsset, listLocalProjects, newLocalId, putLocalAsset, saveLocalProject } from "@/lib/studio/localStore";
import { uniqueName } from "@/lib/studio/naming";
import { documentThumbnail } from "@/lib/studio/thumbnail";
import type { Document, GeneratorNode, ImageNode } from "@/lib/studio/types";

export const editorPath = (id: string, panel?: string) => `/editor/${id}${panel ? `?panel=${panel}` : ""}`;

export async function existingNames(): Promise<string[]> {
  return (await listLocalProjects()).map((p) => p.name);
}

/** Creates a project on this device and returns its id. */
export async function createLocalProject(o: Omit<NewDocumentOptions, "id"> & { generatorId?: string }): Promise<string> {
  const id = newLocalId();
  const doc = createDocument({ ...o, id, name: uniqueName(o.name, await existingNames()) });
  if (o.generatorId) {
    const g: GeneratorNode = { id: newId(), type: "generator", generatorId: o.generatorId, version: 0, params: null, transform: [...IDENTITY], layer: 2 };
    doc.root.children.push(g);
    doc.origin = { kind: "generator", id: o.generatorId };
  }
  await saveLocalProject(doc, documentThumbnail(doc));
  return id;
}

/** A project opened from a .hingelab file becomes a new project on this device. */
export async function importProjectFile(file: File): Promise<{ id: string } | { legacy: Extract<OpenedFile, { kind: "legacy" }> }> {
  const opened = openHingelab(new Uint8Array(await file.arrayBuffer()));
  if (opened.kind === "legacy") return { legacy: opened };
  const id = newLocalId();
  const doc: Document = { ...opened.doc, id, name: uniqueName(opened.doc.name, await existingNames()) };
  for (const [assetId, bytes] of Object.entries(opened.assets)) await putLocalAsset(id, assetId, bytes);
  await saveLocalProject(doc, documentThumbnail(doc));
  return { id };
}

/** "Import image to trace…": a new document sized to the image, with the image placed on it. */
export async function createProjectFromImage(file: File, materialId: string, machineId: string): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { w, h } = await imageSize(file);
  const mmW = Math.min(300, w * 25.4 / 96), mmH = mmW * (h / w);
  const id = newLocalId();
  const name = uniqueName(file.name.replace(/\.[^.]+$/, "") || "Image", await existingNames());
  const doc = createDocument({ id, name, sheet: { w: Math.ceil(mmW + 20), h: Math.ceil(mmH + 20) }, materialId, machineId });
  const assetId = newId();
  doc.assets.push({ id: assetId, kind: "image", name: file.name, mime: file.type, bytes: bytes.length });
  const img: ImageNode = { id: newId(), type: "image", assetId, w: mmW, h: mmH, transform: [1, 0, 0, 1, 10 + mmW / 2, 10 + mmH / 2], layer: 0, name: file.name };
  doc.root.children.push(img);
  await putLocalAsset(id, assetId, bytes);
  await saveLocalProject(doc, documentThumbnail(doc));
  return id;
}

function imageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error("That image could not be read.")); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Renders an SVG string to PNG bytes (for thumbnail.png in .hingelab files). */
export async function svgToPng(svg: string, size = 256): Promise<Uint8Array | undefined> {
  try {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = url; });
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    c.getContext("2d")!.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

/** File → Save to Computer: downloads the project as a .hingelab file. */
export async function downloadProject(doc: Document, thumbnailSvg?: string): Promise<void> {
  const assets: Record<string, Uint8Array> = {};
  for (const a of doc.assets) {
    const bytes = await getLocalAsset(doc.id, a.id);
    if (bytes) assets[a.id] = bytes;
  }
  const thumbnail = await svgToPng(thumbnailSvg ?? documentThumbnail(doc));
  const zip = packHingelab({ doc, assets, thumbnail });
  downloadBytes(zip, projectFileName(doc.name), "application/zip");
}

export function downloadBytes(bytes: Uint8Array | string, name: string, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
