"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { OPEN_ACCEPT, oclcName } from "@/lib/projects/ext";
import type { ClassicSection } from "@/lib/projects/file";
import type { OpenedFileRef } from "@/lib/presets";
import type { OpenedHere } from "./projectFiles";

const PROJECT = /\.(oclc|hingelab|json)$/i;
const files = () => import("./projectFiles");

/**
 * File › Save, Save as…, Open… and Import… for one editor. After the first save (or an open) the
 * editor keeps the file: Save writes over it without asking, Save as… picks a new one. The title and
 * status bar show the file's name, with a dot while there are unsaved changes. Import takes a
 * project's settings without taking over its file, or hands other files to `importOther`.
 */
export function useProjectFile({ section, params, fileBase, write, load, toast, opened, cloudImport, importAccept, importOther }: {
  section: ClassicSection;
  /** The settings; any change after a save marks the file unsaved. */
  params: unknown;
  /** The name a new file is offered under. */
  fileBase: () => string;
  /** The file's contents. */
  write: () => Promise<string>;
  /** Puts an opened file's settings in the editor (one undo step). */
  load: (f: OpenedHere) => void;
  toast: (m: string) => void;
  /** A file handed over from another section. */
  opened?: OpenedFileRef;
  cloudImport?: (text: string) => Promise<string | null>;
  /** What File › Import… offers besides project files (an `accept` list). */
  importAccept?: string;
  /** Imports a file that is not a project (a font, model, picture or drawing). */
  importOther?: (f: File) => void | Promise<void>;
}): {
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  open: () => Promise<void>;
  openFile: (f: File, h?: FileSystemFileHandle | null) => Promise<void>;
  /** File › Import…: picks a file to import. */
  importPick: () => void;
  importFile: (f: File) => Promise<void>;
  /** The editor applied a file's settings: the current settings are the saved state. */
  markClean: () => void;
  /** File › New: the next save asks for a file again. */
  forget: () => void;
  fileName: string | null;
  dirty: boolean;
  status: string | null;
  input: ReactElement;
} {
  const handle = useRef<FileSystemFileHandle | null>(opened?.handle ?? null);
  const [fileName, setFileName] = useState<string | null>(opened?.name ?? null);
  const savedSnap = useRef<string | null>(null);
  const pending = useRef(false);
  const [tick, setTick] = useState(0);
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const snap = useMemo(() => JSON.stringify(params), [params]);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    savedSnap.current = snap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, tick]);

  // Loaded early so Open… still runs inside the click that asked for it.
  useEffect(() => { void files(); }, []);

  const markClean = () => { pending.current = true; setTick((t) => t + 1); };
  const forget = () => { handle.current = null; savedSnap.current = null; setFileName(null); };
  const dirty = fileName !== null && savedSnap.current !== null && savedSnap.current !== snap;

  useEffect(() => {
    if (!fileName) return;
    const before = document.title;
    document.title = `${dirty ? "• " : ""}${fileName} — HingeLab`;
    return () => { document.title = before; };
  }, [fileName, dirty]);

  async function saveTo(asNew: boolean) {
    if (busy.current) return;
    busy.current = true;
    try {
      const at = snapRef.current;
      const { canKeepFiles, downloadFile, isAbort, pickSaveHandle, writeHandle } = await files();
      const text = await write();
      const suggested = oclcName(fileName ?? fileBase());
      let h = asNew ? null : handle.current;
      if (!h && canKeepFiles()) {
        try { h = await pickSaveHandle(suggested); } catch (e) { if (isAbort(e)) return; h = null; }
      }
      if (h) {
        await writeHandle(h, text);
        handle.current = h;
        savedSnap.current = at;
        setFileName(h.name);
        setTick((t) => t + 1);
        toast(`Saved ${h.name}`);
        return;
      }
      if (!downloadFile(suggested, text, "application/json")) { toast("This browser blocked the download"); return; }
      savedSnap.current = at;
      setFileName(suggested);
      setTick((t) => t + 1);
      toast(`Downloading ${suggested}`);
    } catch (e) {
      toast(`Could not save: ${e instanceof Error ? e.message : String(e)}. Try File › Save project as…`);
    } finally {
      busy.current = false;
    }
  }

  async function openFile(f: File, h: FileSystemFileHandle | null = null, settingsOnly = false) {
    try {
      const r = await (await files()).openProjectFile(f, h, section, toast, cloudImport);
      if (!r) return;
      load(r);
      const fonts = r.fonts ? ` and added ${r.fonts} font${r.fonts > 1 ? "s" : ""} on this device` : "";
      if (settingsOnly) { toast(`Imported the settings from ${r.name}${fonts}. Ctrl+Z undoes it.`); return; }
      handle.current = r.handle;
      setFileName(r.name);
      markClean();
      toast(`Opened ${r.name}${fonts}`);
    } catch {
      toast("That file is not a HingeLab project.");
    }
  }

  async function importFile(f: File) {
    if (PROJECT.test(f.name)) { await openFile(f, null, true); return; }
    if (!importOther) { toast("Import takes HingeLab project files (.oclc) here."); return; }
    try { await importOther(f); } catch (e) { toast(e instanceof Error ? e.message : `${f.name} could not be imported`); }
  }

  const live = useRef({ openFile, importFile });
  live.current = { openFile, importFile };
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented) return;
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      if (PROJECT.test(f.name)) void live.current.openFile(f);
      else void live.current.importFile(f);
    };
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => { document.removeEventListener("dragover", over); document.removeEventListener("drop", drop); };
  }, []);

  async function open() {
    const { canKeepFiles, pickOpenHandle } = await files();
    if (canKeepFiles()) {
      try {
        const h = await pickOpenHandle();
        if (h) await openFile(await h.getFile(), h);
        return;
      } catch { /* fall back to the plain file input */ }
    }
    if (inputRef.current) { inputRef.current.value = ""; inputRef.current.click(); }
  }

  const importPick = () => { if (importRef.current) { importRef.current.value = ""; importRef.current.click(); } };

  const input = (
    <>
      <input
        ref={inputRef} type="file" accept={OPEN_ACCEPT} hidden aria-label="Open a project file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); }}
      />
      <input
        ref={importRef} type="file" accept={[".oclc,.hingelab,.json", importAccept].filter(Boolean).join(",")} hidden aria-label="Import a file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }}
      />
    </>
  );

  return {
    save: () => saveTo(false),
    saveAs: () => saveTo(true),
    open,
    openFile: (f, h) => openFile(f, h ?? null),
    importPick,
    importFile,
    markClean,
    forget,
    fileName,
    dirty,
    status: fileName ? (dirty ? `${fileName} • unsaved changes` : `Saved to ${fileName}`) : null,
    input,
  };
}
