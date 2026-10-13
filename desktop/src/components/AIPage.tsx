import { useEffect, useRef, useState } from "react";
import { ArrowRight, Crown, Globe, ImagePlus, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import type { AIDesign, AIMatch } from "../../../lib/ai/types";
import { MAX_IMAGE_CHARS, MAX_PROMPT } from "../../../lib/ai/types";
import type { DCatalog } from "../../../lib/desktop/types";
import { ipc, type AppError } from "../ipc";

/** Longest side of the photo sent to the designer, px. */
const PHOTO_PX = 1024;

const EXAMPLES = [
  "A round cookie jar with a lid, 12 cm across and 15 cm tall",
  "Wall sign that says Cafe Luna, about 60 cm wide",
  "Small box with a sliding lid, 18 × 11 × 6 cm",
  "Letter box spelling ARIA, 15 cm tall",
];

const MATCH: Record<AIMatch, string> = { exact: "Exact match", close: "Close match", loose: "Nearest product" };

/** The page's last answer, kept while the app runs so a trip to the workspace and back finds it. */
let kept: { prompt: string; design: AIDesign } | null = null;

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
 * usual); Letters and Parametric open in the website's editor inside the window.
 */
export function AIPage({ catalog, plan, online, onOpen, onOnline, onUpgrade }: {
  catalog: DCatalog | null; plan: "free" | "pro"; online: boolean;
  onOpen: (product: string, params: Record<string, unknown>) => void;
  onOnline: (path: string) => void;
  onUpgrade: () => void;
}) {
  const [prompt, setPrompt] = useState(kept?.prompt ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<AIDesign | null>(kept?.design ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type)) { setError("Use a JPEG, PNG or WebP photo."); return; }
    try { setPhoto(await photoJpeg(file)); setError(null); } catch { setError("That photo could not be read. Try another one."); }
  }

  async function submit() {
    if (busy) return;
    if (!prompt.trim() && !photo) { setError("Describe the product or add a photo of it."); return; }
    const n = ++run.current;
    setBusy(true); setElapsed(0); setError(null);
    try {
      const d = await ipc.aiDesign({ prompt: prompt.trim(), ...(photo ? { image: photo } : {}) });
      if (n !== run.current) return;
      setDesign(d);
      kept = { prompt: prompt.trim(), design: d };
    } catch (e) {
      if (n !== run.current) return;
      const err = e as AppError;
      setError(err.kind === "network" ? "Could not reach HingeLab. Check your connection and try again." : err.message);
    } finally {
      if (n === run.current) setBusy(false);
    }
  }

  const native = !!design && !!catalog?.products.some((p) => p.id === design.product);
  const preview = design?.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(design.svg)}` : null;

  function open() {
    if (!design) return;
    if (native) onOpen(design.product, { ...design.params, name: design.name });
    else onOnline(design.open ?? `/app/editor/local?p=${design.product}`);
  }

  return (
    <div className="page ai-page">
      <header className="page-head">
        <h1><Sparkles size={22} aria-hidden /> AI designer</h1>
        <p>Describe a product or add a photo of one. The designer picks the closest HingeLab product and fills in its settings; then fine-tune it like any other design.</p>
      </header>

      <section className="card ai-form" onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); void addPhoto(f); } }}>
        <label htmlFor="ai-prompt"><b>What would you like to make?</b></label>
        <textarea
          id="ai-prompt"
          value={prompt}
          maxLength={MAX_PROMPT}
          rows={4}
          placeholder="For example: a hexagon gift box, 10 cm across and 6 cm tall, with a removable lid"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); void submit(); } }}
          disabled={busy}
        />
        <div className="ai-examples" aria-label="Examples">
          {EXAMPLES.map((x) => <button key={x} type="button" className="ai-chip" disabled={busy} onClick={() => setPrompt(x)}>{x}</button>)}
        </div>
        <div className={`ai-photo${photo ? " has" : ""}`}>
          {photo ? (
            <>
              <img src={photo} alt="Your photo" />
              <button type="button" className="btn" onClick={() => setPhoto(null)} disabled={busy}><X size={14} aria-hidden />Remove photo</button>
            </>
          ) : (
            <button type="button" className="ai-photo-add" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImagePlus size={18} aria-hidden />
              <span><b>Add a photo</b> of the product (optional), or paste one with Ctrl+V.</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => void submit()} disabled={busy || !online || (!prompt.trim() && !photo)}>
            {busy ? <Loader2 size={15} className="spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
            {busy ? "Designing…" : "Design it"}
          </button>
          {busy && <button type="button" className="btn ghost" onClick={() => { run.current++; setBusy(false); }}>Cancel</button>}
          <span className="fine" role="status" aria-live="polite">
            {busy ? `Working for ${elapsed} s. This usually takes 10 to 30 seconds.` : !online ? "The AI designer needs an internet connection." : "Ctrl+Enter also starts it."}
          </span>
        </div>
        {error && <p className="ai-error" role="alert">{error}</p>}
      </section>

      {design && !busy && (
        <section className="card ai-result" aria-label="Your design">
          <div className="ai-preview">
            {preview ? <img src={preview} alt={`Cut file of ${design.name}`} /> : <p>{design.error ?? (design.locked ? "The preview of this design needs Pro." : native ? "Open the design to see its preview." : "This product's preview opens in the online editor.")}</p>}
          </div>
          <div className="ai-info">
            <div className="row">
              <span className="ai-tag">{design.productName}</span>
              <span className={`ai-tag ${design.match}`}>{MATCH[design.match]}</span>
            </div>
            <h2>{design.name}</h2>
            <p className="ai-summary">{design.summary}</p>
            {design.notes.length > 0 && <ul className="ai-notes">{design.notes.map((t) => <li key={t}>{t}</li>)}</ul>}
            {design.locked && plan === "free" && (
              <p className="ai-locked">{design.locked} <button type="button" className="link-btn" onClick={onUpgrade}><Crown size={13} aria-hidden />Upgrade to Pro</button></p>
            )}
            <div className="row">
              <button type="button" className="btn primary" onClick={open}>
                {native ? <>Open in workspace<ArrowRight size={15} aria-hidden /></> : <><Globe size={15} aria-hidden />Open in the online editor</>}
              </button>
              <button type="button" className="btn ghost" onClick={() => { setDesign(null); setPrompt(""); setPhoto(null); setError(null); kept = null; }}><RotateCcw size={14} aria-hidden />Start over</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
