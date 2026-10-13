"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileUp, ImagePlus, Library, Loader2, Plus, Trash2, X } from "lucide-react";
import { MAX_EXAMPLE_DESCRIPTION, MAX_EXAMPLE_SVG, MAX_EXAMPLE_TAGS, MAX_EXAMPLE_TITLE, type AIExample } from "@/lib/ai/exampleLimits";
import { photoJpeg } from "@/lib/ai/photo";

/** The AI designer's example library: finished products the designer studies before it draws (curators only). */
export function ExampleLibrary() {
  const [list, setList] = useState<AIExample[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [svg, setSvg] = useState<{ text: string; name: string; url: string } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const svgRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/ai/examples", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { examples?: AIExample[]; error?: string } | null;
      if (!res.ok || !body?.examples) { setListError(body?.error ?? "The library could not be read."); return; }
      setList(body.examples); setListError(null);
    } catch {
      setListError("Could not reach HingeLab. Check your connection and try again.");
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => () => { if (svg) URL.revokeObjectURL(svg.url); }, [svg]);

  async function pickSvg(file: File | undefined) {
    if (!file) return;
    if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") { setNote({ ok: false, text: "Choose an SVG file. In LightBurn: File ▸ Export, as SVG." }); return; }
    const text = await file.text();
    if (text.length > MAX_EXAMPLE_SVG) { setNote({ ok: false, text: "The SVG is too large (2.5 MB at most)." }); return; }
    setSvg({ text, name: file.name, url: URL.createObjectURL(file) });
    if (!title) setTitle(file.name.replace(/\.svg$/i, "").replace(/[-_]+/g, " ").slice(0, MAX_EXAMPLE_TITLE));
    setNote(null);
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type)) { setNote({ ok: false, text: "Use a JPEG, PNG or WebP photo." }); return; }
    try { setPhoto(await photoJpeg(file)); setNote(null); } catch { setNote({ ok: false, text: "That photo could not be read. Try another one." }); }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !svg || !title.trim()) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch("/api/ai/examples", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), tags: tags.trim(), svg: svg.text, photo }),
      });
      const body = (await res.json().catch(() => null)) as { warnings?: string[]; error?: string } | null;
      if (!res.ok) { setNote({ ok: false, text: body?.error ?? "The example could not be saved. Try again." }); return; }
      setTitle(""); setDescription(""); setTags(""); setSvg(null); setPhoto(null);
      setNote({ ok: true, text: ["Added to the library.", ...(body?.warnings ?? [])].join(" ") });
      void load();
    } catch {
      setNote({ ok: false, text: "Could not reach HingeLab. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(x: AIExample) {
    if (!window.confirm(`Remove "${x.title}" from the library?`)) return;
    setRemoving(x.id);
    try {
      const res = await fetch(`/api/ai/examples/${x.id}`, { method: "DELETE" });
      if (res.ok) setList((l) => l?.filter((e) => e.id !== x.id) ?? null);
      else setListError("The example could not be removed. Try again.");
    } catch {
      setListError("Could not reach HingeLab. Check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <main className="boxes ai-page ai-lib">
      <div className="ai-glow" aria-hidden />
      <header className="ai-hero">
        <span className="ai-eyebrow"><Library size={14} aria-hidden /> Example library</span>
        <h1>Teach the designer <span className="ai-grad">your style.</span></h1>
        <p className="ai-sub">Add products you have made: the cut file and a photo of the finished piece. Before it draws an original design, the AI designer looks at the two examples that fit the request best and learns their style, detail and sizes. Only you see this page.</p>
        <Link href="/app/ai" className="ai-link-btn"><ArrowLeft size={14} aria-hidden /> Back to the AI designer</Link>
      </header>

      <form className="ai-lib-form" onSubmit={add}>
        <div className="ai-lib-files">
          <button type="button" className={`ai-lib-drop${svg ? " has" : ""}`} onClick={() => svgRef.current?.click()} disabled={busy}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {svg ? <img src={svg.url} alt={`Cut file ${svg.name}`} /> : <><FileUp size={22} aria-hidden /><b>Cut file (SVG)</b><span>Real size in mm, text as paths. Red cuts, blue scores, black fills engrave.</span></>}
          </button>
          <input ref={svgRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { void pickSvg(e.target.files?.[0]); e.target.value = ""; }} />
          <div className={`ai-lib-drop${photo ? " has" : ""}`}>
            <button type="button" className="ai-lib-drop-btn" onClick={() => photoRef.current?.click()} disabled={busy}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo ? <img src={photo} alt="Photo of the finished product" /> : <><ImagePlus size={22} aria-hidden /><b>Photo of the product</b><span>Optional, but it helps a lot: the finished piece on a plain background.</span></>}
            </button>
            {photo && <button type="button" className="ai-icon-btn" aria-label="Remove photo" title="Remove photo" onClick={() => setPhoto(null)} disabled={busy}><X size={16} aria-hidden /></button>}
          </div>
          <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <div className="ai-lib-fields">
          <label htmlFor="ex-title" className="ai-label">Title</label>
          <input id="ex-title" dir="auto" value={title} maxLength={MAX_EXAMPLE_TITLE} onChange={(e) => setTitle(e.target.value)} placeholder="Cat keychain with a name" disabled={busy} required />
          <label htmlFor="ex-desc" className="ai-label">What makes it good <span className="ai-optional">(optional)</span></label>
          <textarea id="ex-desc" dir="auto" value={description} maxLength={MAX_EXAMPLE_DESCRIPTION} rows={4} onChange={(e) => setDescription(e.target.value)} disabled={busy}
            placeholder="3 mm birch plywood, 60 mm tall. The name is engraved in a bold script across the body; the face is scored; a 5 mm ring hole at the top. Customers love it as a gift." />
          <label htmlFor="ex-tags" className="ai-label">Words customers use <span className="ai-optional">(optional)</span></label>
          <input id="ex-tags" dir="auto" value={tags} maxLength={MAX_EXAMPLE_TAGS} onChange={(e) => setTags(e.target.value)} placeholder="keychain, cat, pet, name, gift" disabled={busy} />
          <div className="ai-actions">
            <button type="submit" className="btn-primary" disabled={busy || !svg || !title.trim()}>
              {busy ? <Loader2 size={15} className="spin" aria-hidden /> : <Plus size={15} aria-hidden />} {busy ? "Adding…" : "Add to library"}
            </button>
          </div>
          {note && <p className={note.ok ? "ai-status" : "auth-msg err"} role={note.ok ? "status" : "alert"}>{note.text}</p>}
        </div>
      </form>

      <section aria-label="Examples in the library" className="ai-lib-list">
        <h2>{list ? `${list.length} example${list.length === 1 ? "" : "s"}` : "Examples"}</h2>
        {listError && <p className="auth-msg err" role="alert">{listError}</p>}
        {!list && !listError && <p className="ai-status"><Loader2 size={14} className="spin" aria-hidden /> Loading…</p>}
        {list?.length === 0 && <p className="ai-status">No examples yet. Start with five to ten of your best sellers; the designer gets better with every good one.</p>}
        {list && list.length > 0 && (
          <ul className="ai-lib-grid">
            {list.map((x) => (
              <li key={x.id}>
                <div className="ai-lib-pics">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/ai/examples/${x.id}/render`} alt={`Cut file of ${x.title}`} loading="lazy" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {x.hasPhoto && <img src={`/api/ai/examples/${x.id}/photo`} alt={`Photo of ${x.title}`} loading="lazy" />}
                </div>
                <b dir="auto">{x.title}</b>
                <span className="ai-lib-size">{Math.round(x.width)} × {Math.round(x.height)} mm</span>
                {x.description && <p dir="auto">{x.description}</p>}
                {x.tags && <p className="ai-lib-tags" dir="auto">{x.tags}</p>}
                <button type="button" className="ai-link-btn" onClick={() => void remove(x)} disabled={removing === x.id}>
                  {removing === x.id ? <Loader2 size={14} className="spin" aria-hidden /> : <Trash2 size={14} aria-hidden />} Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
