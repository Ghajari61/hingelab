"use client";

import { platform } from "@hingelab/platform";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Check, Download, ImagePlus, Info, Layers, Library, Loader2, PenTool, Redo2, RotateCcw, ScanEye, Sparkles, Undo2, Wand2, X } from "lucide-react";
import { AI_START_KEY, isAIProduct, MAX_IMAGE_NOTE, MAX_PROMPT, reviseOf, type AIDesign, type AIMatch, type AIOpen } from "@/lib/ai/types";
import { previewSvg } from "@/lib/ai/preview";
import { photoJpeg } from "@/lib/ai/photo";
import { hasPro, type Plan } from "@/lib/plans";

/** The last answer, so a reload or a trip to the editor and back keeps it. */
const LAST_KEY = "hingelab-ai-last";

const EXAMPLES = [
  "Round phone stand with a crescent moon cut-out",
  "Cat keychain with the name Luna",
  "Wall sign that says Cafe Luna, about 60 cm wide",
  "A round cookie jar with a lid, 12 cm across and 15 cm tall",
  "Snowflake ornaments, 8 cm, set of four",
];

const MATCH: Record<AIMatch, string> = { exact: "Exact match", close: "Close match", loose: "Nearest product" };

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
/** AI edits kept for Undo. */
const MAX_EDITS = 20;

export function AIDesigner({ plan, curator = false }: { plan: Plan; curator?: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<AIDesign | null>(null);
  const [opening, setOpening] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** The photo the shown design was made from. */
  const [designPhoto, setDesignPhoto] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  /** Designs before each AI edit, newest last; and those undone, next first. */
  const [history, setHistory] = useState<AIDesign[]>([]);
  const [future, setFuture] = useState<AIDesign[]>([]);
  /** Curators: adding the shown design to the example library. */
  const [kept, setKept] = useState<{ busy?: boolean; ok?: boolean; text?: string }>({});
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

  const preview = useMemo(() => (design?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg(design.svg))}` : null), [design]);

  useEffect(() => { setKept({}); }, [design]);

  async function keepAsExample() {
    if (!design?.svg || kept.busy) return;
    setKept({ busy: true });
    try {
      const res = await fetch("/api/ai/examples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: design.name, description: design.summary, tags: "", svg: design.svg, photo: designPhoto }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setKept(res.ok ? { ok: true, text: "Added to the example library." } : { ok: false, text: body?.error ?? "It could not be added. Try again." });
    } catch {
      setKept({ ok: false, text: "Could not reach HingeLab. Check your connection and try again." });
    }
  }

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
      setHistory([]); setFuture([]); setEditText(""); setEditError(null);
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
      setHistory((h) => [...h, design].slice(-MAX_EDITS));
      setFuture([]);
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

  function show(d: AIDesign) {
    setDesign(d);
    setEditError(null);
    try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ prompt, design: d })); } catch { /* too large to keep */ }
  }

  function undoEdit() {
    const prev = history[history.length - 1];
    if (!prev || !design || editing) return;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [design, ...f]);
    show(prev);
  }

  function redoEdit() {
    const next = future[0];
    if (!next || !design || editing) return;
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, design].slice(-MAX_EDITS));
    show(next);
  }

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) step through the AI edits, outside text fields.
  const keys = useRef({ undoEdit, redoEdit });
  keys.current = { undoEdit, redoEdit };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); keys.current.undoEdit(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); keys.current.redoEdit(); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  async function openInStudio() {
    if (!design?.svg) return;
    setOpening(true);
    try {
      const [{ saveNewProject, editorPath }, { svgDocument }, { newLocalId }] = await Promise.all([
        import("@/components/studio/projectActions"), import("@/lib/studio/svgProject"), import("@/lib/studio/localStore"),
      ]);
      const { doc } = svgDocument([{ src: design.svg, name: design.name }], { id: newLocalId(), name: design.name });
      window.location.assign(editorPath(await saveNewProject(doc)));
    } catch {
      setOpening(false);
      setEditError("The design could not be opened in Studio. Download the SVG and import it instead.");
    }
  }

  function openInEditor() {
    if (!design) return;
    if (design.product === "art") { void openInStudio(); return; }
    setOpening(true);
    void handOff({ product: design.product, preset: design.preset, name: design.name, params: design.params }, design.summary, false, designPhoto);
  }

  function download() {
    if (!design?.svg) return;
    if (!hasPro(plan)) { setError("Saving and exporting need Pro. Upgrade to download cut files and keep cloud projects."); return; }
    void platform().saveFile({ name: design.fileName ?? fileName(design.name), data: design.svg, mime: "image/svg+xml", intent: "export" });
  }

  function startOver() {
    setDesign(null); setPrompt(""); setPhoto(null); setPhotoNote(""); setDesignPhoto(null); setError(null);
    setHistory([]); setFuture([]); setEditText(""); setEditError(null);
    sessionStorage.removeItem(LAST_KEY);
  }

  const step = elapsed < 6 ? 0 : elapsed < 35 ? 1 : elapsed < 60 ? 2 : 3;

  return (
    <main className="boxes ai-page">
      <div className="ai-glow" aria-hidden />
      <header className="ai-hero">
        <span className="ai-eyebrow"><Sparkles size={14} aria-hidden /> AI designer</span>
        <h1>Describe it. <span className="ai-grad">Get a laser-ready file.</span></h1>
        <p className="ai-sub">The designer draws an original cut and engrave file, looks at its own drawing and fixes it. Boxes, hinges and other engineered products are built with HingeLab&apos;s tested generators.</p>
        {curator && <Link href="/app/ai/examples" className="ai-link-btn"><Library size={14} aria-hidden /> Example library</Link>}
      </header>

      <form
        className={`ai-composer${dragging ? " drag" : ""}${busy ? " busy" : ""}`}
        onSubmit={submit}
        onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void addPhoto(f); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void addPhoto(e.dataTransfer.files[0]); }}
      >
        <label htmlFor="ai-prompt" className="sr-only">What would you like to make?</label>
        <textarea
          id="ai-prompt"
          dir="auto"
          value={prompt}
          maxLength={MAX_PROMPT}
          rows={3}
          placeholder="What would you like to make? For example: a round phone stand with a crescent moon cut-out, for 3 mm plywood"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(); }}
          disabled={busy}
        />
        {photo && (
          <div className="ai-attach">
            { }
            <img src={photo} alt="Your photo" />
            <div className="ai-photo-note">
              <label htmlFor="ai-photo-note" className="ai-label">About this photo <span className="ai-optional">(optional)</span></label>
              <textarea
                id="ai-photo-note"
                dir="auto"
                value={photoNote}
                maxLength={MAX_IMAGE_NOTE}
                rows={2}
                placeholder="What it is, its real size, the text to put on it, what to keep or change"
                onChange={(e) => setPhotoNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(); }}
                disabled={busy}
              />
            </div>
            <button type="button" className="ai-icon-btn" aria-label="Remove photo" title="Remove photo" onClick={() => { setPhoto(null); setPhotoNote(""); }} disabled={busy}><X size={16} aria-hidden /></button>
          </div>
        )}
        <div className="ai-bar">
          <button type="button" className="ai-tool" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImagePlus size={16} aria-hidden /> {photo ? "Change photo" : "Add photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="ai-hint">{dragging ? "Drop the photo here" : "Drop or paste a photo · Ctrl + Enter to start"}</span>
          {busy && <button type="button" className="btn-ghost" onClick={() => abortRef.current?.abort()}>Cancel</button>}
          <button type="submit" className="btn-primary ai-go" disabled={busy || (!prompt.trim() && !photo)}>
            {busy ? <Loader2 size={16} className="spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
            {busy ? "Designing…" : "Design it"}
          </button>
        </div>
      </form>
      {error && <p className="auth-msg err" role="alert">{error}</p>}

      {!design && !busy && (
        <>
          <div className="ai-try" aria-label="Examples">
            <span>Try</span>
            {EXAMPLES.map((x) => (
              <button key={x} type="button" className="ai-chip" onClick={() => setPrompt(x)}>{x}</button>
            ))}
          </div>
          <ul className="ai-features">
            <li><PenTool size={18} aria-hidden /><b>Original artwork</b><span>Drawn for your request, not picked from a template.</span></li>
            <li><ScanEye size={18} aria-hidden /><b>Checks its own drawing</b><span>Renders the file, measures it and fixes loose parts, open cuts and crowded text.</span></li>
            <li><Layers size={18} aria-hidden /><b>Ready for the laser</b><span>Real sizes in mm, text as outlines, and cut, score and engrave layers in LightBurn colours.</span></li>
          </ul>
        </>
      )}

      {busy && (
        <section className="ai-busy" aria-label="Designing">
          <div className="ai-busy-sheet" aria-hidden>
            <svg viewBox="0 0 200 120"><path d="M30 95C30 40 70 20 100 20s70 20 70 75" /><circle cx="100" cy="62" r="18" /><path d="M20 95h160" /></svg>
          </div>
          <div className="ai-busy-info">
            <ol className="ai-steps">
              {["Reading your request", "Drawing the design", "Checking the drawing", "Fixing what it found"].map((s, i) => (
                <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>{i < step ? <Check size={14} aria-hidden /> : <span className="ai-dot" aria-hidden />}{s}</li>
              ))}
            </ol>
            <p className="ai-status" role="status" aria-live="polite">Working for {elapsed} s. Engineered products take about 15 seconds; an original drawing up to two minutes.</p>
          </div>
        </section>
      )}

      {design && !busy && (
        <section className="ai-result" aria-label="Your design">
          <div className="ai-preview">
            {preview ? (
               
              <img src={preview} alt={`Cut file of ${design.name}`} />
            ) : (
              <p>{design.error ?? (design.locked ? "The preview of this design needs Pro." : "Open the design in the editor to see its preview.")}</p>
            )}
            {preview && (
              <div className="ai-legend" aria-label="Layers">
                <span><i className="cut" />Cut</span><span><i className="score" />Score</span><span><i className="engrave" />Engrave</span>
              </div>
            )}
          </div>
          <div className="ai-info">
            <div className="ai-tags">
              <span className="ai-tag">{design.productName}</span>
              <span className={`ai-tag ${design.match}`}>{MATCH[design.match]}</span>
            </div>
            <h2 dir="auto">{design.name}</h2>
            <p className="ai-summary" dir="auto">{design.summary}</p>
            {design.stats && design.stats.length > 0 && (
              <dl className="ai-stats">
                {design.stats.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
              </dl>
            )}
            {design.notes.length > 0 && (
              <div className="ai-notes"><Info size={15} aria-hidden /><ul>{design.notes.map((n) => <li key={n} dir="auto">{n}</li>)}</ul></div>
            )}
            {design.locked && plan === "free" && (
              <p className="ai-locked">{design.locked} <Link href="/app/billing">Upgrade to Pro</Link></p>
            )}
            <form className="ai-edit" onSubmit={edit}>
              <label htmlFor="ai-edit" className="ai-label"><Wand2 size={14} aria-hidden /> Edit with AI</label>
              <div className="ai-edit-row">
                <input
                  id="ai-edit"
                  dir="auto"
                  value={editText}
                  maxLength={MAX_PROMPT}
                  placeholder="Make it 20 cm wide, change the text to Sara…"
                  onChange={(e) => setEditText(e.target.value)}
                  disabled={editing}
                />
                {editing && <button type="button" className="btn-ghost" onClick={() => abortRef.current?.abort()}>Cancel</button>}
                <button type="submit" className="btn-primary" disabled={editing || !editText.trim()}>
                  {editing ? <Loader2 size={15} className="spin" aria-hidden /> : <ArrowUp size={15} aria-hidden />}
                  {editing ? "Editing…" : "Apply"}
                </button>
              </div>
              <span className="ai-status" role="status" aria-live="polite">{editing ? `Working for ${elapsed} s.${design.product === "art" ? " Redrawing can take a minute or two." : ""}` : ""}</span>
              {editError && <p className="auth-msg err" role="alert">{editError}</p>}
              {(history.length > 0 || future.length > 0) && !editing && (
                <span className="ai-undo">
                  <button type="button" className="ai-link-btn" onClick={undoEdit} disabled={!history.length} title="Undo the last AI edit (Ctrl+Z)"><Undo2 size={14} aria-hidden /> Undo edit</button>
                  <button type="button" className="ai-link-btn" onClick={redoEdit} disabled={!future.length} title="Redo the AI edit (Ctrl+Y)"><Redo2 size={14} aria-hidden /> Redo edit</button>
                </span>
              )}
            </form>
            <div className="ai-actions">
              <button type="button" className="btn-primary" onClick={openInEditor} disabled={opening}>
                {design.product === "art" ? "Open in Studio" : "Open in editor"} <ArrowRight size={16} aria-hidden />
              </button>
              {design.svg && hasPro(plan) && <button type="button" className="btn-ghost" onClick={download}><Download size={15} aria-hidden /> Download SVG</button>}
              {design.svg && !hasPro(plan) && <Link href="/app/billing" className="btn-ghost">Upgrade to download</Link>}
              {curator && design.product === "art" && design.svg && !kept.ok && (
                <button type="button" className="ai-link-btn" onClick={() => void keepAsExample()} disabled={kept.busy}>
                  {kept.busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Library size={14} aria-hidden />} Add to example library
                </button>
              )}
              <button type="button" className="ai-link-btn" onClick={startOver}><RotateCcw size={14} aria-hidden /> Start over</button>
            </div>
            {kept.text && <p className={kept.ok ? "ai-status" : "auth-msg err"} role={kept.ok ? "status" : "alert"}>{kept.text}</p>}
          </div>
        </section>
      )}
    </main>
  );
}
