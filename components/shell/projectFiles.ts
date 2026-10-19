"use client";

import { platform } from "@hingelab/platform";
import { productHref } from "@hingelab/app/routes";
/**
 * Opening and saving `.oclc` project files in the browser. Where the browser lets a page keep a file
 * (the File System Access API), Save writes over the same file; elsewhere each save downloads a copy.
 * A file from another section is handed to that section through IndexedDB, with its file handle, so
 * Save there still writes over the file that was opened.
 */
import { detectProject, MAX_PROJECT_BYTES, OPEN_TYPES, SAVE_TYPES, sectionName, type ClassicSection, type Section } from "@/lib/projects/file";
import { GENERATOR_INFO, isGeneratorId } from "@/lib/generators/ids";
import type { OpenedFileRef } from "@/lib/presets";

export interface Handoff { section: ClassicSection; params: Record<string, unknown>; version: number; name: string; handle?: FileSystemFileHandle | null; at: number }

const DB = "hingelab-handoff";
const STORE = "files";
const KEY = "open";

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function putHandoff(h: Handoff): Promise<void> {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(h, KEY);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
  d.close();
}

/** The file waiting for this page, removed as it is read. Hand-offs older than a minute are dropped. */
export async function takeHandoff(): Promise<Handoff | null> {
  try {
    const d = await db();
    const h = await new Promise<Handoff | null>((res, rej) => {
      const t = d.transaction(STORE, "readwrite");
      const s = t.objectStore(STORE);
      const q = s.get(KEY);
      q.onsuccess = () => { s.delete(KEY); res((q.result as Handoff | undefined) ?? null); };
      t.onerror = () => rej(t.error);
    });
    d.close();
    return h && Date.now() - h.at < 60_000 ? h : null;
  } catch {
    return null;
  }
}

type Picker = {
  showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>;
};
type Permissioned = FileSystemFileHandle & {
  queryPermission?: (o: unknown) => Promise<PermissionState>;
  requestPermission?: (o: unknown) => Promise<PermissionState>;
  createWritable?: () => Promise<{ write: (d: string | BlobPart) => Promise<void>; close: () => Promise<void> }>;
};

/** True where Save can write over a file the page keeps (not in automated browsers, which can't answer the dialog). */
export function canKeepFiles(): boolean {
  if (typeof window === "undefined" || navigator.webdriver) return false;
  try { if (window.self !== window.top) return false; } catch { return false; }
  return typeof (window as unknown as Picker).showSaveFilePicker === "function";
}

export const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === "AbortError";

export async function pickSaveHandle(suggestedName: string): Promise<FileSystemFileHandle> {
  return (window as unknown as Picker).showSaveFilePicker!({ suggestedName, types: SAVE_TYPES, excludeAcceptAllOption: false });
}

/** A file chosen with the system dialog, with its handle; null when the dialog is cancelled. */
export async function pickOpenHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const [h] = await (window as unknown as Picker).showOpenFilePicker!({ types: OPEN_TYPES, multiple: false, excludeAcceptAllOption: false });
    return h ?? null;
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** Writes `data` over the file, asking for permission again when the browser forgot it. */
export async function writeHandle(h: FileSystemFileHandle, data: string | Uint8Array): Promise<void> {
  const p = h as Permissioned;
  const opts = { mode: "readwrite" };
  if (p.queryPermission && (await p.queryPermission(opts)) !== "granted" && p.requestPermission && (await p.requestPermission(opts)) !== "granted") {
    throw new Error("permission to write the file was refused");
  }
  if (!p.createWritable) throw new Error("this browser can't write files");
  const w = await p.createWritable();
  await w.write(typeof data === "string" ? data : new Blob([data as BlobPart]));
  await w.close();
}

/** Starts a download of `data`; returns false when the browser refused. */
export function downloadFile(name: string, data: string | Uint8Array, mime: string): boolean {
  try {
    void platform().saveFile({ name, data, mime });
    return true;
  } catch {
    return false;
  }
}

/** A section's name for messages ("Hinge Box", "Clock", "Studio"). */
export const sectionTitle = (s: Section) => sectionName(s, isGeneratorId(s) ? GENERATOR_INFO[s].name : undefined);

export interface OpenedHere { params: Record<string, unknown>; version: number; name: string; handle: FileSystemFileHandle | null; fonts: number }

/**
 * Opens a project file: a file for `here` is returned to the editor (its fonts already added);
 * a Studio project opens in Studio; a file for another section opens there. `cloudImport` takes over
 * core-product files in a cloud project (they become new cloud projects). Returns null when the file
 * went elsewhere or could not be read (the reason is passed to `toast`).
 */
export async function openProjectFile(file: File, handle: FileSystemFileHandle | null, here: ClassicSection | null, toast: (m: string) => void, cloudImport?: (text: string) => Promise<string | null>): Promise<OpenedHere | null> {
  if (file.size > MAX_PROJECT_BYTES) { toast(`${file.name} is too large to be a project (over ${MAX_PROJECT_BYTES / 1024 / 1024} MB)`); return null; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const d = detectProject(bytes);
  if ("error" in d) { toast(d.error); return null; }
  if (d.section === "studio") {
    toast(`Opening ${file.name} in Studio…`);
    const { importProjectFile, editorPath } = await import("@/components/studio/projectActions");
    const r = await importProjectFile(file).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
    if ("id" in r && typeof r.id === "string") { window.location.assign(editorPath(r.id)); return null; }
    toast("error" in r && typeof r.error === "string" ? r.error : "That Studio project could not be opened");
    return null;
  }
  const { restoreProjectAssets } = await import("@/components/shell/projectFile");
  const fonts = await restoreProjectAssets(d.file).catch(() => 0);
  if (cloudImport && (d.section === "hinge" || d.section === "letters" || d.section === "parametric")) {
    toast(`Opening ${file.name} as a new cloud project…`);
    const err = await cloudImport(new TextDecoder().decode(bytes));
    if (err) toast(err);
    return null;
  }
  if (d.section === here) return { params: d.params, version: d.version, name: file.name, handle, fonts };
  toast(`Opening ${file.name} in ${sectionTitle(d.section)}…`);
  try {
    await putHandoff({ section: d.section, params: d.params, version: d.version, name: file.name, handle, at: Date.now() });
  } catch {
    toast("This browser blocked the hand-off between sections. Switch to the section and open the file there.");
    return null;
  }
  const to = productHref(d.section, platform().kind);
  platform().router.navigate(`${to}${to.includes("?") ? "&" : "?"}open=1`);
  return null;
}

/** The start preset a handed-off file becomes. */
export function handoffPreset(h: Handoff): { id: string; name: string; note: string; params: Record<string, unknown>; file: OpenedFileRef } {
  return { id: `file-${h.at}`, name: h.name, note: "", params: h.params, file: { name: h.name, version: h.version, handle: h.handle ?? null } };
}
