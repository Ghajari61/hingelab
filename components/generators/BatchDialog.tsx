"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { MAX_ZIP_ROWS, parseRows } from "@/lib/batch/rows";
import { EXPORT_FORMATS, FORMAT_INFO, loadExport, type ExportFormat } from "@/lib/export/profiles";
import type { AnyGenerator, BuildContext, GenBase } from "@/lib/generators/types";
import { loadMaterials } from "@/lib/materials/library";
import { loadPrefs } from "@/lib/studio/prefs";
import { batchZip, photoField } from "./batchZip";
import "@/components/shell/export-dialog.css";
import "./batch.css";

type P = GenBase & Record<string, unknown>;

/**
 * Batch personalisation: names pasted or read from a CSV (with optional dates and photos), built one
 * by one on this device into a ZIP with a folder of files per row. Nothing is uploaded.
 */
export default function BatchDialog({ def, params, ctx, start, pro, base, onClose, toast, capOf, onUpgrade }: {
  def: AnyGenerator;
  params: P;
  ctx: BuildContext;
  /** Names already in the batch field, to start from. */
  start: string;
  pro: boolean;
  base: string;
  onClose: () => void;
  toast: (msg: string) => void;
  /** Why this many rows is over the plan, or null when it is allowed. */
  capOf?: (count: number) => string | null;
  onUpgrade?: (message: string) => void;
}) {
  const [text, setText] = useState(start);
  const [photos, setPhotos] = useState<File[]>([]);
  const [formats, setFormats] = useState<ExportFormat[]>(["svg"]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cancel = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseRows(text), [text]);
  const cap = capOf?.(parsed.rows.length) ?? null;
  const hasPhoto = !!photoField(def, params);
  const photoNames = useMemo(() => new Set(photos.map((f) => f.name.toLowerCase())), [photos]);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("textarea")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { cancel.current = true; close.current(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  async function readCSV(f: File) {
    if (f.size > 2 * 1024 * 1024) { setErr("That file is larger than 2 MB."); return; }
    setText(await f.text());
    setErr(null);
  }

  async function run() {
    if (!parsed.rows.length || progress) return;
    if (cap) { setErr(cap); return; }
    cancel.current = false;
    setErr(null);
    setProgress({ done: 0, total: parsed.rows.length });
    try {
      const machine = loadExport(loadPrefs().machineId).machine;
      const m = loadMaterials().find((x) => x.id === params.material);
      const r = await batchZip({
        def, params, ctx, rows: parsed.rows, photos, formats, machine, pro,
        mat: m && Object.keys(m.laser).length ? { name: m.name, laser: m.laser } : undefined,
        onProgress: (done, total) => setProgress({ done, total }), cancelled: () => cancel.current,
      });
      if (!r) { toast("Batch cancelled"); setProgress(null); return; }
      const a = document.createElement("a");
      const url = URL.createObjectURL(new Blob([r.zip as BlobPart], { type: "application/zip" }));
      a.href = url;
      a.download = `${base}-batch.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast(`Downloading ${a.download}: ${r.made} of ${parsed.rows.length} rows${r.failed.length ? `, ${r.failed.length} skipped (see summary.csv)` : ""}`);
      if (r.failed.length && !r.made) { setErr(`No row could be built: ${r.failed[0].why}`); setProgress(null); return; }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The batch could not be made.");
      setProgress(null);
    }
  }

  const toggle = (f: ExportFormat) => setFormats((o) => (o.includes(f) ? (o.length > 1 ? o.filter((x) => x !== f) : o) : [...o, f]));
  const shown = parsed.rows.slice(0, 8);
  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget && !progress) onClose(); }}>
      <div className="modal exp batch" role="dialog" aria-modal="true" aria-label="Batch personalisation" ref={ref}>
        <header>Batch personalisation<button type="button" aria-label="Close" onClick={() => { cancel.current = true; onClose(); }}>×</button></header>
        <div className="mb">
          <p className="exp-about">One set of files per row, each with that row&apos;s name{hasPhoto ? ", date and photo" : " and date"}. Paste names (one per line), paste from a spreadsheet, or load a CSV with a header row such as <code>name,date{hasPhoto ? ",photo" : ""}</code>.</p>
          <textarea
            className="textin" rows={6} aria-label="Batch rows" spellCheck={false} dir="auto"
            placeholder={"Ana\nBen\nCy\n\nor a CSV:\nname,date\nAna & Ben,12.06.2027"}
            value={text} onChange={(e) => setText(e.target.value)}
          />
          <div className="batch-acts">
            <button type="button" className="btn-auto" onClick={() => csvRef.current?.click()}>Load CSV…</button>
            <input ref={csvRef} type="file" hidden accept=".csv,.tsv,.txt,text/csv,text/plain" aria-label="Load CSV" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readCSV(f); e.target.value = ""; }} />
            {hasPhoto && (
              <>
                <button type="button" className="btn-auto" onClick={() => photoRef.current?.click()}>Choose photos…</button>
                <input ref={photoRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" aria-label="Choose photos" onChange={(e) => { setPhotos([...(e.target.files ?? [])]); e.target.value = ""; }} />
              </>
            )}
            {photos.length > 0 && <span className="note">{photos.length} photo{photos.length > 1 ? "s" : ""} chosen</span>}
          </div>
          <p className="note" role="status">
            {parsed.rows.length
              ? `${parsed.rows.length} row${parsed.rows.length > 1 ? "s" : ""}${parsed.header ? " (header row found)" : ""}${parsed.dropped ? `; ${parsed.dropped} more left out (up to ${MAX_ZIP_ROWS})` : ""}.`
              : "No rows yet."}
          </p>
          {shown.length > 0 && (
            <table className="batch-rows">
              <thead><tr><th>#</th><th>Name</th><th>Date</th>{hasPhoto && <th>Photo</th>}</tr></thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td><td dir="auto">{r.name}</td><td dir="auto">{r.date}</td>
                    {hasPhoto && <td className={r.photo && !photoNames.has(r.photo.split(/[\\/]/).pop()!.toLowerCase()) ? "miss" : ""}>{r.photo ? (photoNames.has(r.photo.split(/[\\/]/).pop()!.toLowerCase()) ? r.photo : `${r.photo} (not chosen)`) : ""}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {parsed.rows.length > shown.length && <p className="note">…and {parsed.rows.length - shown.length} more.</p>}
          <div className="exp-row">
            <span className="rowlabel">Files for each row</span>
            <div className="iconseg full" role="group" aria-label="Files for each row">
              {EXPORT_FORMATS.map((f) => <button key={f} type="button" aria-pressed={formats.includes(f)} onClick={() => toggle(f)}>{FORMAT_INFO[f].name}</button>)}
            </div>
          </div>
          {progress && (
            <div className="batch-prog" role="status" aria-live="polite">
              <progress max={progress.total} value={progress.done} aria-label="Batch progress" />
              <span>Building row {Math.min(progress.done + 1, progress.total)} of {progress.total}…</span>
            </div>
          )}
          {(cap || err) && <p className="note err" role="alert">{cap ?? err}</p>}
          <p className="exp-note">The files are made on your device; names and photos are not uploaded.</p>
          <div className="rename-row">
            <button type="button" className="btn-ghost-sm" onClick={() => { if (progress) cancel.current = true; else onClose(); }}>{progress ? "Cancel batch" : "Close"}</button>
            {cap && onUpgrade
              ? <button type="button" className="btn-export" onClick={() => onUpgrade(cap)}>Upgrade</button>
              : <button type="button" className="btn-export" disabled={!parsed.rows.length || !!progress} onClick={() => void run()}><Download size={16} aria-hidden />Download ZIP</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
