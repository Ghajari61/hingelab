"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BUNDLED_FONTS, FONT_CATEGORIES, type FontInfo, type FontScript } from "@/lib/letters";
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

type Filter = "all" | "persian" | "yours" | FontInfo["category"];

const UPLOAD_NOTE = "Uploaded .ttf, .otf or .woff files are kept in this browser on this device. When you are signed in, an export built on the server sends the font to HingeLab only to build that one file; it is not stored or shared. You are responsible for having a license that lets you use the font this way.";

const matches = (f: FontInfo, filter: Filter, q: string) =>
  (filter === "all" || (filter === "persian" ? f.scripts.includes("arabic") : f.category === filter)) &&
  (!q || `${f.name} ${f.note} ${f.category}`.toLowerCase().includes(q));

/** Font list with live previews of the typed text, search and style filters, plus uploads stored on this device. */
export function FontPicker({
  fontId, text, uploads, onPick, onUpload, onDelete, compact,
}: {
  /** The upload note goes in the button's tooltip (for docks with several font fields). */
  compact?: boolean;
  fontId: string;
  text: string;
  uploads: StoredFontMeta[];
  onPick: (id: string) => void;
  /** Omit to offer the bundled fonts only. */
  onUpload?: (file: File) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [, setLoaded] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 28) || "Aa";

  const load = useCallback((id: string) => { ensurePreviewFace(id).then(() => setLoaded((n) => n + 1), () => {}); }, []);
  useEffect(() => { load(fontId); }, [fontId, load]);

  // Previews load as their rows scroll into view, so opening the list does not fetch every font.
  useEffect(() => {
    if (!open || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        const id = (e.target as HTMLElement).dataset.font;
        if (id) load(id);
        io.unobserve(e.target);
      }
    }, { root: listRef.current, rootMargin: "120px 0px" });
    listRef.current?.querySelectorAll<HTMLElement>("[data-font]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [open, filter, query, load]);

  const toggle = () => {
    if (!open) {
      setFilter(ARABIC.test(text) ? "persian" : "all");
      setQuery("");
    }
    setOpen(!open);
  };

  const current = BUNDLED_FONTS.find((f) => f.id === fontId)?.name ?? uploads.find((u) => u.id === fontId)?.name ?? "Uploaded font";
  const family = (id: string) => `"${previewFamily(id)}", var(--font-ui)`;
  const q = query.trim().toLowerCase();
  // Fonts that can set the typed text come first.
  const shown = filter === "yours" ? [] : BUNDLED_FONTS
    .filter((f) => matches(f, filter, q))
    .map((f, i) => ({ f, i, tag: lacks(f.scripts, text) }))
    .sort((a, b) => Number(!!a.tag) - Number(!!b.tag) || a.i - b.i);
  const mine = uploads.filter((u) => (filter === "all" || filter === "yours") && (!q || u.name.toLowerCase().includes(q)));
  const chips: { id: Filter; name: string }[] = [
    { id: "all", name: "All" },
    { id: "persian", name: "Persian" },
    ...FONT_CATEGORIES.filter((c) => BUNDLED_FONTS.some((f) => f.category === c.id)),
    ...(uploads.length ? [{ id: "yours" as const, name: "Yours" }] : []),
  ];

  const option = (id: string, name: string, tags: { text: string; title?: string; warn?: boolean }[]) => (
    <button
      key={id}
      type="button"
      role="option"
      className="fp-opt"
      data-font={id}
      aria-selected={id === fontId}
      onClick={() => { onPick(id); setOpen(false); }}
    >
      <span className="fp-head">
        <span className="fp-name">{name}</span>
        {tags.length > 0 && <span className="fp-tags">{tags.map((t) => <span key={t.text} className={`fp-tag${t.warn ? "" : " soft"}`} title={t.title}>{t.text}</span>)}</span>}
      </span>
      <span className="fp-prev" dir="auto" style={{ fontFamily: family(id) }}>{preview}</span>
    </button>
  );

  return (
    <div className="fontpick" onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }}>
      <button type="button" className="fp-opt" aria-expanded={open} aria-haspopup="listbox" onClick={toggle}>
        <span className="fp-head"><span className="fp-name">{current}</span><Chevron open={open} /></span>
        <span className="fp-prev" dir="auto" style={{ fontFamily: family(fontId) }}>{preview}</span>
      </button>
      {open && (
        <>
          <input
            type="search"
            className="fp-search"
            placeholder={`Search ${BUNDLED_FONTS.length} free fonts`}
            aria-label="Search fonts"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="fp-chips" role="group" aria-label="Font style">
            {chips.map((c) => (
              <button key={c.id} type="button" className="fp-chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>{c.name}</button>
            ))}
          </div>
          <div className="fp-list" role="listbox" aria-label="Fonts" ref={listRef}>
            {shown.map(({ f, tag }) => option(f.id, `${f.name} · ${f.note}`, [
              ...(tag ? [{ text: tag, warn: true }] : []),
              ...(f.thin ? [{ text: "Thin", title: "Fine strokes: best engraved, or use Thicken so they cut cleanly." }] : []),
            ]))}
            {mine.length > 0 && <div className="fp-group">Your fonts (this device)</div>}
            {mine.map((u) => (
              <div className="fp-row" key={u.id}>
                {option(u.id, u.name, [])}
                <button type="button" className="fp-del" title={`Remove ${u.name} from this device`} aria-label={`Remove ${u.name}`} onClick={() => onDelete(u.id)}>×</button>
              </div>
            ))}
            {!shown.length && !mine.length && <p className="fp-empty">No fonts match. Try another word or pick All.</p>}
          </div>
        </>
      )}
      {onUpload && (
        <>
          <button type="button" className="btn-auto" title={compact ? UPLOAD_NOTE : undefined} onClick={() => { if (fileRef.current) { fileRef.current.value = ""; fileRef.current.click(); } }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M7 10V2M4 5l3-3 3 3M2 12h10" /></svg>Upload font…
          </button>
          {!compact && <p className="note">{UPLOAD_NOTE}</p>}
          <input
            ref={fileRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/x-font-ttf,application/x-font-otf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
        </>
      )}
    </div>
  );
}
