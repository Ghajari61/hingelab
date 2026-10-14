"use client";

import { useRef, useState } from "react";
import { getPath, setPath } from "@/lib/generators/path";
import type { FieldSpec, GenBase, GenOutput, ImageSpec } from "@/lib/generators/types";
import { blobOfDataUrl, checkOriginal, findSubject, makePhoto, photoAspect, PhotoError, printPhoto } from "./photoClient";
import { loadOriginal, saveOriginal } from "./photoStore";

type P = GenBase & Record<string, unknown>;
type Look = NonNullable<ImageSpec<P>["look"]>;

export interface PhotoState {
  /** What is being done to the photo, while it is. */
  working?: string;
  note?: string;
  err?: string;
}

/**
 * Photo fields made from an original kept on this device: choosing a photo keeps the original and
 * makes the photo from it; changing one of its look settings makes it again (one undo step with the
 * setting); Centre on the subject and Print photo work from the original too.
 */
export function usePhotoLooks(
  fields: FieldSpec<P>[], params: P,
  onSet: (key: string, value: unknown, record: boolean, mat?: boolean) => void,
  onApply: (next: P) => void,
) {
  const latest = useRef(params);
  latest.current = params;
  const seq = useRef(0);
  const [state, setState] = useState<Record<string, PhotoState>>({});
  const put = (key: string, s: PhotoState) => setState((o) => ({ ...o, [key]: s }));

  const photos = fields.filter((f): f is ImageSpec<P> & { look: Look } => f.kind === "image" && !!f.look);
  const ownerOf = (key: string) => photos.find((f) => f.look.keys.includes(key));

  /** The original, or (for a photo chosen before originals were kept) the stored photo, kept now. */
  async function source(f: ImageSpec<P> & { look: Look }, p: P): Promise<{ blob: Blob; src?: string } | null> {
    const id = String(getPath(p, f.look.src) ?? "");
    const kept = await loadOriginal(id);
    if (kept) return { blob: kept };
    const image = String(getPath(p, f.key) ?? "");
    if (id || !image) return null;
    const blob = blobOfDataUrl(image);
    return { blob, src: await saveOriginal(blob, String(getPath(p, f.look.name) ?? "")) };
  }

  const missing = "The original photo is not on this device, so its look cannot change. Choose the photo again to change it.";

  async function restyle(f: ImageSpec<P> & { look: Look }, key: string, value: unknown) {
    const before = latest.current;
    const old = getPath(before, key);
    onSet(key, value, false);
    const id = ++seq.current;
    put(f.key, { working: "Making the photo…" });
    try {
      const src = await source(f, before);
      if (!src) { if (id === seq.current) { onSet(key, old, false); put(f.key, { err: missing }); } return; }
      const made = await makePhoto(src.blob, f.look.spec(setPath(before, key, value)));
      if (id !== seq.current) return;
      let next = setPath(setPath(latest.current, f.key, made.url), f.look.px, Math.max(made.width, made.height));
      if (src.src !== undefined) next = setPath(next, f.look.src, src.src);
      onApply(next);
      put(f.key, {});
    } catch (x) {
      if (id !== seq.current) return;
      onSet(key, old, false);
      put(f.key, { err: x instanceof PhotoError ? x.message : "The photo could not be made." });
    }
  }

  /** onSet, with photo look settings making the photo again when they are set for good. */
  const set = (key: string, value: unknown, record: boolean, mat?: boolean) => {
    const f = record ? ownerOf(key) : undefined;
    if (f && getPath(latest.current, f.key)) void restyle(f, key, value);
    else onSet(key, value, record, mat);
  };

  async function pick(f: ImageSpec<P> & { look: Look }, file: File) {
    checkOriginal(file);
    const id = ++seq.current;
    put(f.key, { working: "Preparing the photo…" });
    try {
      const aspect = await photoAspect(file);
      const src = await saveOriginal(file, file.name);
      const spec = f.look.spec(setPath(latest.current, f.aspectKey, aspect));
      const made = await makePhoto(file, spec);
      if (id !== seq.current) return;
      let next = setPath(latest.current, f.key, made.url);
      next = setPath(next, f.aspectKey, made.width / made.height);
      next = setPath(next, f.look.src, src);
      next = setPath(next, f.look.name, file.name.slice(0, 80));
      next = setPath(next, f.look.px, Math.max(made.width, made.height));
      onApply(next);
      put(f.key, src ? {} : { note: "This browser cannot keep the original photo, so its look cannot change later." });
    } catch (x) {
      put(f.key, {});
      throw x;
    }
  }

  const clear = (f: ImageSpec<P> & { look: Look }) => {
    ++seq.current;
    let next = setPath(latest.current, f.key, "");
    for (const k of [f.look.src, f.look.name]) next = setPath(next, k, "");
    onApply(setPath(next, f.look.px, 0));
    put(f.key, {});
  };

  async function centre(f: ImageSpec<P> & { look: Look }) {
    const centreOn = f.look.centre;
    if (!centreOn) return;
    const p = latest.current;
    put(f.key, { working: "Finding the subject…" });
    try {
      const src = await source(f, p);
      const blob = src?.blob ?? blobOfDataUrl(String(getPath(p, f.key)));
      const s = await findSubject(blob, f.look.spec(p).tol);
      if (!s) { put(f.key, { note: "No clear subject found. Use Zoom, Move across and Move down instead." }); return; }
      onApply(centreOn(latest.current, s));
      put(f.key, { note: s.face ? "Centred on the face." : "Centred on the subject." });
    } catch {
      put(f.key, { err: "The subject could not be found in this photo." });
    }
  }

  async function print(f: ImageSpec<P> & { look: Look }, out: GenOutput | null, fileName: string) {
    const p = latest.current;
    const href = String(getPath(p, f.key) ?? "");
    const im = out?.parts.flatMap((x) => x.images ?? []).find((x) => x.href === href && x.clip);
    if (!im || !im.clip || !f.look.paper) { put(f.key, { err: "The photo is not in the design yet. Try again in a moment." }); return; }
    put(f.key, { working: "Making the print…" });
    try {
      const kept = await loadOriginal(String(getPath(p, f.look.src) ?? ""));
      const r = await printPhoto(kept ?? blobOfDataUrl(href), {
        place: { x: im.x, y: im.y, w: im.w, h: im.h }, clip: im.clip, spec: f.look.spec(p), paper: f.look.paper(p),
        caption: `${fileName}: print at actual size (100 %), then cut along the dashed line.`,
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.pdf as BlobPart], { type: "application/pdf" }));
      a.download = `${fileName}-photo.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      const size = `${Math.round(r.w)} × ${Math.round(r.h)} mm`;
      put(f.key, kept
        ? { note: `Print PDF made: ${size} at ${r.dpi} dpi${r.custom ? ", on a page of its own size (it is larger than the paper)" : ""}.` }
        : { err: `Printed from the stored photo at ${r.dpi} dpi: the original is not on this device. Choose the photo again for a sharper print.` });
    } catch {
      put(f.key, { err: "The print PDF could not be made." });
    }
  }

  return { set, pick, clear, centre, print, stateOf: (key: string) => state[key] ?? {} };
}
