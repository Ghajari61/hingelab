"use client";

import { useEffect, useRef, useState } from "react";
import { BUNDLED_FONTS, type FontScript } from "@/lib/letters";
import type { StoredFontMeta } from "./fontStore";
import { ensurePreviewFace, previewFamily } from "./runtime";

const ARABIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/u;
const LATIN = /[A-Za-z\u00c0-\u024f]/u;

/** Scripts the text needs that a font's tags do not list. */
function lacks(scripts: FontScript[], text: string) {
  if (ARABIC.test(text) && !scripts.includes("arabic")) return "No Persian";
  if (LATIN.test(text) && !scripts.includes("latin")) return "No Latin";
  return null;
}

function Chevron({ open }: { open: boolean }) {
  return <svg className={`chev${open ? " open" : ""}`} width="8" height="8" viewBox="0 0 8 8"><path d="M2 1l4 3-4 3z" fill="currentColor" /></svg>;
}

/** Font list with live previews of the typed text, plus uploads stored on this device. */
export function FontPicker({
  fontId, text, uploads, onPick, onUpload, onDelete,
}: {
  fontId: string;
  text: string;
  uploads: StoredFontMeta[];
  onPick: (id: string) => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [, setLoaded] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 28) || "Aa";

  const ids = open ? [...BUNDLED_FONTS.map((f) => f.id), ...uploads.map((u) => u.id)] : [fontId];
  const idKey = ids.join("|");
  useEffect(() => {
    for (const id of idKey.split("|")) ensurePreviewFace(id).then(() => setLoaded((n) => n + 1), () => {});
  }, [idKey]);

  const current = BUNDLED_FONTS.find((f) => f.id === fontId)?.name ?? uploads.find((u) => u.id === fontId)?.name ?? "Uploaded font";
  const family = (id: string) => `"${previewFamily(id)}", var(--font-ui)`;

  const option = (id: string, name: string, tag: string | null) => (
    <button
      key={id}
      type="button"
      role="option"
      className="fp-opt"
      aria-selected={id === fontId}
      onClick={() => { onPick(id); setOpen(false); }}
    >
      <span className="fp-head"><span className="fp-name">{name}</span>{tag && <span className="fp-tag">{tag}</span>}</span>
      <span className="fp-prev" dir="auto" style={{ fontFamily: family(id) }}>{preview}</span>
    </button>
  );

  return (
    <div className="fontpick">
      <button type="button" className="fp-opt" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(!open)}>
        <span className="fp-head"><span className="fp-name">{current}</span><Chevron open={open} /></span>
        <span className="fp-prev" dir="auto" style={{ fontFamily: family(fontId) }}>{preview}</span>
      </button>
      {open && (
        <div className="fp-list" role="listbox" aria-label="Fonts">
          {BUNDLED_FONTS.map((f) => option(f.id, `${f.name} · ${f.note}`, lacks(f.scripts, text)))}
          {uploads.length > 0 && <div className="fp-group">Your fonts (this device)</div>}
          {uploads.map((u) => (
            <div className="fp-row" key={u.id}>
              {option(u.id, u.name, null)}
              <button type="button" className="fp-del" title={`Remove ${u.name} from this device`} aria-label={`Remove ${u.name}`} onClick={() => onDelete(u.id)}>×</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn-auto" onClick={() => { if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M7 10V2M4 5l3-3 3 3M2 12h10" /></svg>Upload font…
      </button>
      <p className="note">Uploaded .ttf or .otf files stay in this browser on this device and are never shared. You are responsible for having a license that lets you use the font this way.</p>
      <input
        ref={fileRef}
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf,application/x-font-ttf,application/x-font-otf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
        }}
      />
    </div>
  );
}
