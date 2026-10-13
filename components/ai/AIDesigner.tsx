"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, ImagePlus, Loader2, RotateCcw, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { AI_START_KEY, isAIProduct, MAX_IMAGE_CHARS, MAX_IMAGE_NOTE, MAX_PROMPT, reviseOf, type AIDesign, type AIMatch, type AIOpen } from "@/lib/ai/types";
import type { Plan } from "@/lib/plans";

/** Longest side of the photo sent to the designer, px. */
const PHOTO_PX = 1024;
/** The last answer, so a reload or a trip to the editor and back keeps it. */
const LAST_KEY = "hingelab-ai-last";

const EXAMPLES = [
  "A round cookie jar with a lid, 12 cm across and 15 cm tall",
  "Wall sign that says Cafe Luna, about 60 cm wide",
  "Small box with a sliding lid, 18 × 11 × 6 cm",
  "Letter box spelling ARIA, 15 cm tall",
  "Wall clock, 30 cm across",
];

const MATCH: Record<AIMatch, string> = { exact: "Exact match", close: "Close match", loose: "Nearest product" };

/** The photo as a colour JPEG data URL, at most PHOTO_PX on its longest side and small enough to send. */
async function photoJpeg(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, PHOTO_PX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(bmp.width * k));
  cv.height = Math.max(1, Math.round(bmp.height * k));
  const g = cv.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  let q = 0.85, url = cv.toDataURL("image/jpeg", q);
  while (url.length > MAX_IMAGE_CHARS * 0.9 && q > 0.4) { q -= 0.1; url = cv.toDataURL("image/jpeg", q); }
  return url;
}

/** The design in an `open` link (`#open=<base64url JSON>`); anything malformed is ignored. */
function readOpen(hash: string): AIOpen | null {
  if (!hash.startsWith("#open=")) return null;
  try {
    const bin = atob(hash.slice(6).replace(/-/g, "+").replace(/_/g, "/"));
    const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Partial<AIOpen>;
    if (!isAIProduct(o.product) || typeof o.name !== "string" || !o.params || typeof o.params !== "object" || Array.isArray(o.params)) return null;
    return { product: o.product, preset: typeof o.preset === "string" ? o.preset : null, name: o.name.slice(0, 80) || "AI design", params: o.params };
  } catch {
    return null;
  }
}

/**
 * Leaves the design for the editor (over its preset, which carries Parametric's finish) and goes
 * there. A Parametric design also takes the photo, which the editor turns into the relief.
 */
async function handOff(o: AIOpen, note: string, replace = false, photo?: string | null) {
  let base: Record<string, unknown> & { params?: Record<string, unknown> } = {};
  if (o.preset && (o.product === "letters" || o.product === "parametric")) {
    const list = o.product === "letters" ? (await import("@/lib/letters/presets")).LETTER_PRESETS : (await import("@/lib/parametric/presets")).PARAMETRIC_PRESETS;
    base = (list as unknown as { id: string; params: Record<string, unknown> }[]).find((p) => p.id === o.preset) ?? {};
  }
  const preset = { ...base, id: `ai-${Date.now()}`, name: o.name, note, params: { ...base.params, ...o.params, name: o.name } };
  try {
    sessionStorage.setItem(AI_START_KEY, JSON.stringify({ product: o.product, preset: o.product === "parametric" && photo ? { ...preset, photo } : preset }));
  } catch {
    sessionStorage.setItem(AI_START_KEY, JSON.stringify({ product: o.product, preset }));
  }
  const to = `/app/editor/local?p=${o.product}&ai=1`;
  if (replace) window.location.replace(to); else window.location.href = to;
}

const fileName = (name: string) => (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "design") + ".svg";

/** Describe a product or show a photo of it; get a ready design of the nearest HingeLab product. */
export function AIDesigner({ plan }: { plan: Plan }) {
  const [prompt, setPrompt] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<AIDesign | null>(null);
  const [opening, setOpening] = useState(false);
  /** The photo the shown design was made from. */
  const [designPhoto, setDesignPhoto] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  /** Designs before each AI edit, newest last. */
  const [history, setHistory] = useState<AIDesign[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const open = readOpen(window.location.hash);
    if (open) {
      setOpening(true);
      void handOff(open, "Made with the AI designer.", true);
      return;
    }
    try {
      const last = JSON.parse(sessionStorage.getItem(LAST_KEY) ?? "null") as { prompt?: string; design?: AIDesign } | null;
      if (last?.design) { setDesign(last.design); setPrompt(last.prompt ?? ""); }
    } catch { /* nothing kept */ }
  }, []);

  useEffect(() => {
    if (!busy && !editing) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy, editing]);

  const preview = useMemo(() => (design?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(design.svg)}` : null), [design]);

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type)) { setError("Use a JPEG, PNG or WebP photo."); return; }
    try { setPhoto(await photoJpeg(file)); setError(null); } catch { setError("That photo could not be read. Try another one."); }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || editing) return;
    if (!prompt.trim() && !photo) { setError("Describe the product or add a photo of it."); return; }
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true); setElapsed(0); setError(null);
    try {
      const res = await fetch("/api/ai/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), ...(photo ? { image: photo, ...(photoNote.trim() ? { imageNote: photoNote.trim() } : {}) } : {}) }),
        signal: ac.signal,
      });
      const body = (await res.json().catch(() => null)) as (AIDesign & { error?: string }) | { error?: string } | null;
      if (!res.ok || !body || !("product" in body)) {
        setError(body?.error ?? "The design could not be made. Try again.");
        return;
      }
      setDesign(body);
      setDesignPhoto(photo);
      setHistory([]); setEditText(""); setEditError(null);
      try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ prompt: prompt.trim(), design: body })); } catch { /* too large to keep */ }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("Could not reach HingeLab. Check your connection and try again.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function edit(e: React.FormEvent) {
    e.preventDefault();
    if (!design || editing || busy || !editText.trim()) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setEditing(true); setElapsed(0); setEditError(null);
    try {
      const res = await fetch("/api/ai/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: editText.trim(), revise: reviseOf(design) }),
        signal: ac.signal,
      });
      const body = (await res.json().catch(() => null)) as (AIDesign & { error?: string }) | { error?: string } | null;
      if (!res.ok || !body || !("product" in body)) {
        setEditError(body?.error ?? "The change could not be made. Try again.");
        return;
      }
      setHistory((h) => [...h, design].slice(-10));
      setDesign(body);
      setEditText("");
      try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ prompt, design: body })); } catch { /* too large to keep */ }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setEditError("Could not reach HingeLab. Check your connection and try again.");
    } finally {
      setEditing(false);
      abortRef.current = null;
    }
  }

  function undoEdit() {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setDesign(prev);
    setEditError(null);
    try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ prompt, design: prev })); } catch { /* too large to keep */ }
  }

  function openInEditor() {
    if (!design) return;
    setOpening(true);
    void handOff({ product: design.product, preset: design.preset, name: design.name, params: design.params }, design.summary, false, designPhoto);
  }

  function download() {
    if (!design?.svg) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([design.svg], { type: "image/svg+xml" }));
    a.download = fileName(design.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function startOver() {
    setDesign(null); setPrompt(""); setPhoto(null); setPhotoNote(""); setDesignPhoto(null); setError(null);
    setHistory([]); setEditText(""); setEditError(null);
    sessionStorage.removeItem(LAST_KEY);
  }

  return (
    <main className="boxes ai-page">
      <h1><Sparkles size={22} aria-hidden /> AI designer</h1>
      <p className="ai-sub">Describe a product or add a photo of one. The designer picks the closest HingeLab product, fills in its settings and makes the cut file, ready to fine-tune in the editor.</p>

      <form
        className="ai-form"
        onSubmit={submit}
        onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void addPhoto(f); } }}
      >
        <label htmlFor="ai-prompt" className="ai-label">What would you like to make?</label>
        <textarea
          id="ai-prompt"
          value={prompt}
          maxLength={MAX_PROMPT}
          rows={4}
          placeholder="For example: a hexagon gift box, 10 cm across and 6 cm tall, with a removable lid"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(); }}
          disabled={busy}
        />
        <div className="ai-examples" aria-label="Examples">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="ai-chip" disabled={busy} onClick={() => setPrompt(x)}>{x}</button>
          ))}
        </div>

        <div
          className={`ai-photo${photo ? " has" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void addPhoto(e.dataTransfer.files[0]); }}
        >
          {photo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Your photo" />
              <div className="ai-photo-note">
                <label htmlFor="ai-photo-note" className="ai-label">About this photo <span className="ai-optional">(optional)</span></label>
                <textarea
                  id="ai-photo-note"
                  dir="auto"
                  value={photoNote}
                  maxLength={MAX_IMAGE_NOTE}
                  rows={3}
                  placeholder="What it is, its real size, the text to put on it, what to keep or change. For example: make it 30 × 40 cm, with the name Sara instead of the face"
                  onChange={(e) => setPhotoNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(); }}
                  disabled={busy}
                />
                <button type="button" className="btn-ghost" onClick={() => { setPhoto(null); setPhotoNote(""); }} disabled={busy}><X size={14} aria-hidden /> Remove photo</button>
              </div>
            </>
          ) : (
            <button type="button" className="ai-photo-add" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImagePlus size={18} aria-hidden />
              <span><b>Add a photo</b> of the product (optional). You can also drop or paste one here.</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        <div className="ai-actions">
          <button type="submit" className="btn-primary" disabled={busy || (!prompt.trim() && !photo)}>
            {busy ? <Loader2 size={16} className="spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
            {busy ? "Designing…" : "Design it"}
          </button>
          {busy && <button type="button" className="btn-ghost" onClick={() => abortRef.current?.abort()}>Cancel</button>}
          <span className="ai-status" role="status" aria-live="polite">
            {busy ? `Working for ${elapsed} s. This usually takes 10 to 30 seconds.` : ""}
          </span>
        </div>
        {error && <p className="auth-msg err" role="alert">{error}</p>}
      </form>

      {design && !busy && (
        <section className="ai-result" aria-label="Your design">
          <div className="ai-preview">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt={`Cut file of ${design.name}`} />
            ) : (
              <p>{design.error ?? (design.locked ? "The preview of this design needs Pro." : "Open the design in the editor to see its preview.")}</p>
            )}
          </div>
          <div className="ai-info">
            <div className="ai-tags">
              <span className="ai-tag">{design.productName}</span>
              <span className={`ai-tag ${design.match}`}>{MATCH[design.match]}</span>
            </div>
            <h2>{design.name}</h2>
            <p className="ai-summary">{design.summary}</p>
            {design.stats && design.stats.length > 0 && (
              <dl className="ai-stats">
                {design.stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
              </dl>
            )}
            {design.notes.length > 0 && <ul className="ai-notes">{design.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            {design.locked && plan === "free" && (
              <p className="ai-locked">{design.locked} <Link href="/app/billing">Upgrade to Pro</Link></p>
            )}
            <form className="ai-edit" onSubmit={edit}>
              <label htmlFor="ai-edit" className="ai-label">Edit with AI</label>
              <div className="ai-edit-row">
                <input
                  id="ai-edit"
                  dir="auto"
                  value={editText}
                  maxLength={MAX_PROMPT}
                  placeholder="What should change? For example: make it 20 cm wide, or change the text to Sara"
                  onChange={(e) => setEditText(e.target.value)}
                  disabled={editing}
                />
                <button type="submit" className="btn-primary" disabled={editing || !editText.trim()}>
                  {editing ? <Loader2 size={15} className="spin" aria-hidden /> : <Wand2 size={15} aria-hidden />}
                  {editing ? "Editing…" : "Apply"}
                </button>
                {editing && <button type="button" className="btn-ghost" onClick={() => abortRef.current?.abort()}>Cancel</button>}
              </div>
              <span className="ai-status" role="status" aria-live="polite">{editing ? `Working for ${elapsed} s.` : ""}</span>
              {editError && <p className="auth-msg err" role="alert">{editError}</p>}
              {history.length > 0 && !editing && (
                <button type="button" className="btn-ghost ai-undo" onClick={undoEdit}><Undo2 size={15} aria-hidden /> Undo last edit</button>
              )}
            </form>
            <div className="ai-actions">
              <button type="button" className="btn-primary" onClick={openInEditor} disabled={opening}>
                Open in editor <ArrowRight size={16} aria-hidden />
              </button>
              {design.svg && <button type="button" className="btn-ghost" onClick={download}><Download size={15} aria-hidden /> Download SVG</button>}
              <button type="button" className="btn-ghost" onClick={startOver}><RotateCcw size={15} aria-hidden /> Start over</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
