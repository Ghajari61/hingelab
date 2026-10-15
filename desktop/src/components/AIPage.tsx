import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Box, Check, Crown, Download, Globe, ImagePlus, Info, Layers, Loader2, PenTool, Redo2, RotateCcw, Save, ScanEye, Sparkles, Undo2, Wand2, X } from "lucide-react";
import type { AIDesign, AIMatch } from "../../../lib/ai/types";
import { MAX_IMAGE_CHARS, MAX_IMAGE_NOTE, MAX_PROMPT, reviseOf } from "../../../lib/ai/types";
import { previewSvg } from "../../../lib/ai/preview";
import type { DCatalog } from "../../../lib/desktop/types";
import { ipc, type AppError } from "../ipc";

/** Longest side of the photo sent to the designer, px. */
const PHOTO_PX = 1024;

const EXAMPLES = [
  "Round phone stand with a crescent moon cut-out",
  "Cat keychain with the name Luna",
  "Wall sign that says Cafe Luna, about 60 cm wide",
  "A round cookie jar with a lid, 12 cm across and 15 cm tall",
];

const MATCH: Record<AIMatch, string> = { exact: "Exact match", close: "Close match", loose: "Nearest product" };

/** The page's last answer, kept while the app runs so a trip to the workspace and back finds it. */
let kept: { prompt: string; design: AIDesign; fromPhoto: boolean; history: AIDesign[]; future: AIDesign[] } | null = null;

/** AI edits kept for Undo. */
const MAX_EDITS = 20;

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

/**
 * Describe a product or show a photo; the server's AI designer answers with settings for one of
 * the products. Hinge Box and generator designs open in the workspace (built on the server as
 * usual), and so do the designer's own drawings; Letters and Parametric open in the website's
 * editor inside the window.
 */
export function AIPage({ catalog, plan, online, onOpen, onOnline, onUpgrade }: {
  catalog: DCatalog | null; plan: "free" | "pro"; online: boolean;
  /** in3d: open the workspace on the 3D view instead of the user's usual start view. */
  onOpen: (product: string, params: Record<string, unknown>, in3d?: boolean) => void;
  onOnline: (path: string) => void;
  onUpgrade: () => void;
}) {
  const [prompt, setPrompt] = useState(kept?.prompt ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<AIDesign | null>(kept?.design ?? null);
  const [fromPhoto, setFromPhoto] = useState(kept?.fromPhoto ?? false);
  const [editText, setEditText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  /** Designs before each AI edit, newest last; and those undone, next first. */
  const [history, setHistory] = useState<AIDesign[]>(kept?.history ?? []);
  const [future, setFuture] = useState<AIDesign[]>(kept?.future ?? []);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saveNote, setSaveNote] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  useEffect(() => {
    if (!busy && !editing) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [busy, editing]);

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type)) { setError("Use a JPEG, PNG or WebP photo."); return; }
    try { setPhoto(await photoJpeg(file)); setError(null); } catch { setError("That photo could not be read. Try another one."); }
  }

  async function submit() {
    if (busy || editing) return;
    if (!prompt.trim() && !photo) { setError("Describe the product or add a photo of it."); return; }
    const n = ++run.current;
    setBusy(true); setElapsed(0); setError(null);
    try {
      const d = await ipc.aiDesign({ prompt: prompt.trim(), ...(photo ? { image: photo, ...(photoNote.trim() ? { imageNote: photoNote.trim() } : {}) } : {}) });
      if (n !== run.current) return;
      setDesign(d);
      setFromPhoto(!!photo);
      setHistory([]); setFuture([]); setEditText(""); setEditError(null);
      kept = { prompt: prompt.trim(), design: d, fromPhoto: !!photo, history: [], future: [] };
    } catch (e) {
      if (n !== run.current) return;
      const err = e as AppError;
      setError(err.kind === "network" ? "Could not reach HingeLab. Check your connection and try again." : err.message);
    } finally {
      if (n === run.current) setBusy(false);
    }
  }

  async function edit() {
    if (!design || editing || busy || !editText.trim()) return;
    const n = ++run.current;
    setEditing(true); setElapsed(0); setEditError(null);
    try {
      const d = await ipc.aiDesign({ prompt: editText.trim(), revise: reviseOf(design) });
      if (n !== run.current) return;
      const h = [...history, design].slice(-MAX_EDITS);
      setHistory(h);
      setFuture([]);
      setDesign(d);
      setEditText("");
      kept = { prompt: prompt.trim(), design: d, fromPhoto, history: h, future: [] };
    } catch (e) {
      if (n !== run.current) return;
      const err = e as AppError;
      setEditError(err.kind === "network" ? "Could not reach HingeLab. Check your connection and try again." : err.message);
    } finally {
      if (n === run.current) setEditing(false);
    }
  }

  function show(d: AIDesign, h: AIDesign[], f: AIDesign[]) {
    setHistory(h);
    setFuture(f);
    setDesign(d);
    setEditError(null);
    kept = { prompt: prompt.trim(), design: d, fromPhoto, history: h, future: f };
  }

  function undoEdit() {
    const prev = history[history.length - 1];
    if (!prev || !design || editing) return;
    show(prev, history.slice(0, -1), [design, ...future]);
  }

  function redoEdit() {
    const next = future[0];
    if (!next || !design || editing) return;
    show(next, [...history, design].slice(-MAX_EDITS), future.slice(1));
  }

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) step through the AI edits, outside text fields.
  const keys = useRef({ undoEdit, redoEdit });
  keys.current = { undoEdit, redoEdit };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); keys.current.undoEdit(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); keys.current.redoEdit(); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  const native = !!design && (design.product === "art" ? !!catalog?.art : !!catalog?.products.some((p) => p.id === design.product));
  const drawn = design?.product === "art" && !!design.svg;
  const preview = design?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(previewSvg(design.svg))}` : null;

  useEffect(() => { setSaveNote(null); }, [design]);

  async function saveDrawn(how: "save" | "export") {
    if (!design?.svg || saving) return;
    if (plan === "free") {
      setSaveNote({ text: "Saving and exporting need Pro. Upgrade to download cut files.", ok: false });
      return;
    }
    setSaving(true); setSaveNote(null);
    try {
      const id = await ipc.keepSvg(design.svg, design.fileName ?? design.name);
      const out = how === "save" ? await ipc.saveDesign(id) : await ipc.exportDesign(id);
      if (out.path) setSaveNote({ text: `Saved ${out.path.split(/[\\/]/).pop()}`, ok: true });
    } catch (e) {
      setSaveNote({ text: (e as AppError).message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  function open(in3d = false) {
    if (!design) return;
    if (native) onOpen(design.product, { ...design.params, name: design.name }, in3d);
    else onOnline(design.open ?? `/app/editor/local?p=${design.product}`);
  }

  const step = elapsed < 6 ? 0 : elapsed < 35 ? 1 : elapsed < 60 ? 2 : 3;
  const startOver = () => { setDesign(null); setPrompt(""); setPhoto(null); setPhotoNote(""); setError(null); setHistory([]); setFuture([]); setEditText(""); setEditError(null); kept = null; };

  return (
    <div className="page ai-page">
      <div className="ai-glow" aria-hidden />
      <header className="ai-hero">
        <span className="ai-eyebrow"><Sparkles size={14} aria-hidden /> AI designer</span>
        <h1>Describe it. <span className="ai-grad">Get a laser-ready file.</span></h1>
        <p>The designer draws an original cut and engrave file, looks at its own drawing and fixes it. Boxes, hinges and other engineered products are built with HingeLab&apos;s tested generators.</p>
      </header>

      <form
        className={`ai-composer${dragging ? " drag" : ""}`}
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
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
          onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); void submit(); } }}
          disabled={busy}
        />
        {photo && (
          <div className="ai-attach">
            <img src={photo} alt="Your photo" />
            <div className="ai-photo-note">
              <label htmlFor="ai-photo-note"><b>About this photo</b> <span className="fine">(optional)</span></label>
              <textarea
                id="ai-photo-note"
                dir="auto"
                value={photoNote}
                maxLength={MAX_IMAGE_NOTE}
                rows={2}
                placeholder="What it is, its real size, the text to put on it, what to keep or change"
                onChange={(e) => setPhotoNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); void submit(); } }}
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
          <span className="ai-hint">{!online ? "The AI designer needs an internet connection." : dragging ? "Drop the photo here" : "Drop or paste a photo · Ctrl + Enter to start"}</span>
          {busy && <button type="button" className="btn ghost" onClick={() => { run.current++; setBusy(false); }}>Cancel</button>}
          <button type="submit" className="btn primary ai-go" disabled={busy || editing || !online || (!prompt.trim() && !photo)}>
            {busy ? <Loader2 size={15} className="spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
            {busy ? "Designing…" : "Design it"}
          </button>
        </div>
      </form>
      {error && <p className="ai-error" role="alert">{error}</p>}

      {!design && !busy && (
        <>
          <div className="ai-try" aria-label="Examples">
            <span>Try</span>
            {EXAMPLES.map((x) => <button key={x} type="button" className="ai-chip" onClick={() => setPrompt(x)}>{x}</button>)}
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
            <p className="fine" role="status" aria-live="polite">Working for {elapsed} s. Engineered products take about 15 seconds; an original drawing up to two minutes.</p>
          </div>
        </section>
      )}

      {design && !busy && (
        <section className="ai-result" aria-label="Your design">
          <div className="ai-preview">
            {preview ? <img src={preview} alt={`Cut file of ${design.name}`} /> : <p>{design.error ?? (design.locked ? "The preview of this design needs Pro." : native ? "Open the design to see its preview." : "This product's preview opens in the online editor.")}</p>}
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
              <div className="ai-notes"><Info size={15} aria-hidden /><ul>{design.notes.map((t) => <li key={t} dir="auto">{t}</li>)}</ul></div>
            )}
            {design.product === "parametric" && fromPhoto && (
              <p className="fine">To turn your photo itself into the relief, choose Source → Photo in the online editor and add the same photo, or use the AI designer on the website, which hands the photo over by itself.</p>
            )}
            {design.locked && plan === "free" && (
              <p className="ai-locked">{design.locked} <button type="button" className="link-btn" onClick={onUpgrade}><Crown size={13} aria-hidden />Upgrade to Pro</button></p>
            )}
            <form className="ai-edit" onSubmit={(e) => { e.preventDefault(); void edit(); }}>
              <label htmlFor="ai-edit"><Wand2 size={14} aria-hidden /><b>Edit with AI</b></label>
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
                {editing && <button type="button" className="btn ghost" onClick={() => { run.current++; setEditing(false); }}>Cancel</button>}
                <button type="submit" className="btn primary" disabled={editing || !online || !editText.trim()}>
                  {editing ? <Loader2 size={15} className="spin" aria-hidden /> : <ArrowUp size={15} aria-hidden />}
                  {editing ? "Editing…" : "Apply"}
                </button>
              </div>
              {editing && <span className="fine" role="status" aria-live="polite">Working for {elapsed} s.{design.product === "art" ? " Redrawing can take a minute or two." : ""}</span>}
              {editError && <p className="ai-error" role="alert">{editError}</p>}
              {(history.length > 0 || future.length > 0) && !editing && (
                <span className="ai-undo">
                  <button type="button" className="ai-link-btn" onClick={undoEdit} disabled={!history.length} title="Undo the last AI edit (Ctrl+Z)"><Undo2 size={14} aria-hidden />Undo edit</button>
                  <button type="button" className="ai-link-btn" onClick={redoEdit} disabled={!future.length} title="Redo the AI edit (Ctrl+Y)"><Redo2 size={14} aria-hidden />Redo edit</button>
                </span>
              )}
            </form>
            <div className="ai-actions">
              {drawn ? (
                <>
                  {native && <button type="button" className="btn primary" title="Resize it, choose the material and see its parts in 3D" onClick={() => open()} disabled={editing}>Open in workspace<ArrowRight size={15} aria-hidden /></button>}
                  {native && <button type="button" className="btn" title="Open it in the workspace on the 3D view" onClick={() => open(true)} disabled={editing}><Box size={15} aria-hidden />Open in 3D</button>}
                  {plan === "pro" ? (
                    <>
                      <button type="button" className={native ? "btn" : "btn primary"} onClick={() => void saveDrawn("save")} disabled={editing || saving}><Save size={15} aria-hidden />Save SVG…</button>
                      <button type="button" className="btn" onClick={() => void saveDrawn("export")} disabled={editing || saving}><Download size={15} aria-hidden />Export</button>
                    </>
                  ) : (
                    <button type="button" className="btn" onClick={onUpgrade} disabled={editing}><Crown size={15} aria-hidden />Upgrade to download</button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" className="btn primary" onClick={() => open()} disabled={editing}>
                    {native ? <>Open in workspace<ArrowRight size={15} aria-hidden /></> : <><Globe size={15} aria-hidden />Open in the online editor</>}
                  </button>
                  {native && <button type="button" className="btn" title="Open it in the workspace on the 3D view" onClick={() => open(true)} disabled={editing}><Box size={15} aria-hidden />Open in 3D</button>}
                </>
              )}
              <button type="button" className="ai-link-btn" disabled={editing} onClick={startOver}><RotateCcw size={14} aria-hidden />Start over</button>
            </div>
            {saveNote && <p className={saveNote.ok ? "ai-saved" : "ai-error"} role={saveNote.ok ? "status" : "alert"}>{saveNote.ok && <Check size={14} aria-hidden />}{saveNote.text}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
