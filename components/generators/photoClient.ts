"use client";

import type { PhotoSpec, Subject } from "@/lib/imaging/photoSpec";
import type { Made, Printed, PrintRequest } from "./photoPipeline";

export type PhotoRequest =
  | { id: number; kind: "make"; blob: Blob; spec: PhotoSpec }
  | { id: number; kind: "subject"; blob: Blob; tol: number }
  | { id: number; kind: "print"; blob: Blob; req: PrintRequest };
export type PhotoResponse =
  | { id: number; kind: "make"; made: Made }
  | { id: number; kind: "subject"; subject: Subject | null }
  | { id: number; kind: "print"; printed: Printed }
  | { id: number; kind: "error"; error: string };

/** A problem with the photo the user can act on; the message is written for them. */
export class PhotoError extends Error {}

/** Largest original accepted, bytes. */
const MAX_ORIGINAL = 40 * 1024 * 1024;

type Body = PhotoRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: PhotoResponse) => void; reject: (e: Error) => void }>();

function photoWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  worker = new Worker(new URL("./photo.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<PhotoResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.kind === "error") p.reject(new Error(e.data.error));
    else p.resolve(e.data);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || "The photo worker stopped."));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

async function run(body: Body): Promise<PhotoResponse> {
  const w = photoWorker();
  if (!w) {
    const m = await import("./photoPipeline");
    if (body.kind === "make") return { id: 0, kind: "make", made: await m.makePhoto(body.blob, body.spec) };
    if (body.kind === "subject") return { id: 0, kind: "subject", subject: await m.photoSubject(body.blob, body.tol) };
    return { id: 0, kind: "print", printed: await m.printPhoto(body.blob, body.req) };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...body, id } as PhotoRequest);
  });
}

export function checkOriginal(f: Blob) {
  if (f.size > MAX_ORIGINAL) throw new PhotoError("That photo is larger than 40 MB. Use a smaller copy of it.");
}

export async function makePhoto(blob: Blob, spec: PhotoSpec): Promise<Made> {
  try {
    const r = await run({ kind: "make", blob, spec });
    return (r as Extract<PhotoResponse, { kind: "make" }>).made;
  } catch {
    throw new PhotoError("That photo could not be read. Try a JPEG or PNG.");
  }
}

/** Width / height of a picture file. */
export async function photoAspect(blob: Blob): Promise<number> {
  try {
    const b = await createImageBitmap(blob);
    const a = b.width / b.height;
    b.close();
    return a;
  } catch {
    throw new PhotoError("That photo could not be read. Try a JPEG or PNG.");
  }
}

interface FaceBox { boundingBox: DOMRectReadOnly }
type FaceDetectorCtor = new (o?: { maxDetectedFaces?: number; fastMode?: boolean }) => { detect(img: ImageBitmapSource): Promise<FaceBox[]> };

/**
 * The photo's subject: the largest face where the browser can find faces (no model is downloaded),
 * otherwise the subject on a plain background. Null when neither is clear.
 */
export async function findSubject(blob: Blob, tol: number): Promise<Subject | null> {
  const FD = (globalThis as { FaceDetector?: FaceDetectorCtor }).FaceDetector;
  if (FD) {
    try {
      const bmp = await createImageBitmap(blob);
      const faces = await new FD({ maxDetectedFaces: 8, fastMode: true }).detect(bmp);
      const W = bmp.width, H = bmp.height;
      bmp.close();
      const f = faces.map((x) => x.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (f) return { u: (f.x + f.width / 2) / W, v: (f.y + f.height / 2) / H, h: f.height / H, face: true };
    } catch {
      // The face detector is optional; fall back to the subject.
    }
  }
  const r = await run({ kind: "subject", blob, tol });
  return (r as Extract<PhotoResponse, { kind: "subject" }>).subject;
}

export async function printPhoto(blob: Blob, req: PrintRequest): Promise<Printed> {
  const r = await run({ kind: "print", blob, req });
  return (r as Extract<PhotoResponse, { kind: "print" }>).printed;
}

/** A data URL as a file (decoded here: the page may not fetch data: URLs). */
export function blobOfDataUrl(url: string): Blob {
  const comma = url.indexOf(",");
  const type = /^data:([^;,]+)/.exec(url)?.[1] ?? "application/octet-stream";
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
