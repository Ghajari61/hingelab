"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  ArrowLeft, Brush, Check, CircleAlert, Cloud, Copy, Eye, Heart, ImagePlus, Layers, Lightbulb, Loader2, Mountain, PenTool,
  RefreshCw, ScanSearch, Sparkles, Star, Trash2, Type, Wand2, Workflow, X,
} from "lucide-react";
import { EmptyState, SegmentedControl, Select } from "@/components/ui";
import { locate } from "@/lib/studio/scene";
import { materialById } from "@/lib/studio/library";
import { getLocalAsset } from "@/lib/studio/localStore";
import type { ImageNode } from "@/lib/studio/types";
import type { Readiness } from "@/lib/imaging/readiness";
import { planLabel } from "@/lib/plans";
import { dailyNote } from "@/lib/ai/studio/credits";
import { briefLine, METHOD_NAMES, METHOD_SHORT, nextStep, PRODUCT_NAMES } from "@/lib/ai/studio/brief";
import { INSPIRATION } from "@/lib/ai/studio/inspiration";
import { DESIGN_KITS, KIT_CATEGORIES, kitFont, type DesignKit, type KitCategory } from "@/lib/ai/studio/kits";
import { BRIEF_METHODS, BRIEF_PRODUCTS, MAX_IMAGE_PROMPT, MAX_STUDIO_PROMPT, MAX_VARIATIONS, type BriefMethod, type BriefProduct, type CritiqueResponse, type EnhanceResponse, type LaserBrief } from "@/lib/ai/studio/request";
import { STYLE_GROUPS, STYLE_PRESETS, styleById, type StyleGroup } from "@/lib/ai/studio/styles";
import { styleArt } from "@/lib/ai/studio/styleArt";
import type { StyleId } from "@/lib/ai/studio/styles";
import { useEditor, useEditorApi } from "../store";
import { addImage, decodeImage, readNodeImage, uploadUrl } from "./assets";
import { critiquePicture, enhancePrompt } from "./cloud";
import { imaging } from "./imagingClient";
import { creditsStore, forget, jobsStore, openWorkspace, spent, type Job, type JobInput } from "./jobs";
import type { TargetId } from "./targets";
import { LIBRARY_TO_ENGRAVE, imageWidth, useAIRunner, type AIStudioProps, type PictureSet } from "./useAIRunner";

type Center = "results" | "recipes" | "pipelines" | "inspire";
interface Ref { url: string; name: string }
interface Favourite { prompt: string; style?: string; product?: BriefProduct; method?: BriefMethod; at: number }

const FAV_KEY = "hingelab-ai-favourites";
const PICTURE_TOOLS = new Set(["generate", "restyle"]);
const PRODUCT_TARGET: Partial<Record<BriefProduct, TargetId>> = { topper: "topper", sign: "sign", trophy: "trophy", lamp: "lamp", puzzle: "puzzle" };
const credits = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

function loadFavourites(): Favourite[] {
  try { const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as Favourite[]; return Array.isArray(v) ? v.filter((f) => typeof f?.prompt === "string").slice(0, 40) : []; } catch { return []; }
}

/** A style's preview picture. */
function StyleArt({ id }: { id: StyleId }) {
  return <span className="aiw-art" aria-hidden dangerouslySetInnerHTML={{ __html: styleArt(id) }} />;
}

/** A picture on the canvas, shown from this device's copy. */
function NodePicture({ docId, node, alt }: { docId: string; node: ImageNode; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true, made: string | null = null;
    void getLocalAsset(docId, node.assetId).then((bytes) => {
      if (!live || !bytes) return;
      made = URL.createObjectURL(new Blob([bytes as BlobPart]));
      setUrl(made);
    });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [docId, node.assetId]);
  return url ? <img src={url} alt={alt} draggable={false} /> : <span className="aiw-ph"><Loader2 size={18} className="spin" aria-hidden /></span>;
}

const GRADE_TEXT: Record<Readiness["grade"], string> = { ready: "Ready to cut", good: "Good", fix: "Needs a fix", redo: "Make again" };

function ScoreBadge({ r }: { r?: Readiness }) {
  if (!r) return <span className="aiw-score pending" title="Checking for the laser…"><Loader2 size={11} className="spin" aria-hidden /></span>;
  return <span className={`aiw-score ${r.grade}`} title={`Laser readiness: ${GRADE_TEXT[r.grade]}`}>{r.score}</span>;
}

/**
 * The full AI Studio: a Laser Brief, the Creative Director, sets of variations with a laser
 * readiness score, recipes, one-click pipelines and an inspiration gallery. It covers the canvas;
 * every result is still a normal image on the canvas underneath.
 */
export function AIWorkspace(props: AIStudioProps) {
  const r = useAIRunner(props);
  const api = useEditorApi();
  const { docId, cloudBlock, costOf, status } = r;
  const doc = useEditor((s) => s.doc);
  const used = useStore(creditsStore, (s) => s.used);
  const jobs = useStore(jobsStore, (s) => s.jobs);
  const sheet = doc.sheets[0];
  const material = sheet ? materialById(sheet.materialId) : undefined;

  const [brief, setBrief] = useState<LaserBrief>(() => ({ product: "canvas", method: "cut", material: material?.name ?? "", widthMm: 120 }));
  const [idea, setIdea] = useState("");
  const [direction, setDirection] = useState<EnhanceResponse | null>(null);
  const [directing, setDirecting] = useState(false);
  const [style, setStyle] = useState<StyleId>("line-art");
  const [group, setGroup] = useState<StyleGroup | "All">("All");
  const [count, setCount] = useState(2);
  const [aspect, setAspect] = useState<"square" | "wide" | "tall">("square");
  const [quality, setQuality] = useState<"medium" | "high">("medium");
  const [transparent, setTransparent] = useState(false);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [center, setCenter] = useState<Center>("results");
  const [selected, setSelected] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, Readiness>>({});
  const [reviews, setReviews] = useState<Record<string, CritiqueResponse>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const refInput = useRef<HTMLInputElement>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => { setFavourites(loadFavourites()); }, []);
  useEffect(() => () => ctl.current?.abort(), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".ui-dialog")) openWorkspace(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // ---------------------------------------------------------------- results

  const mine = useMemo(() => jobs.filter((j) => j.docId === docId && PICTURE_TOOLS.has(j.input.tool)), [jobs, docId]);
  const pending = mine.filter((j) => j.status === "queued" || j.status === "running");
  const results = useMemo(() => {
    const out: { node: ImageNode; job: Job }[] = [];
    for (const j of mine) {
      if (j.status !== "done") continue;
      for (const id of j.resultIds) {
        const n = locate(doc.root, id)?.node;
        if (n?.type === "image") out.push({ node: n, job: j });
      }
    }
    return out;
  }, [mine, doc.root]);
  const failed = mine.filter((j) => j.status === "failed").slice(0, 3);
  const current = results.find((x) => x.node.id === selected) ?? null;
  useEffect(() => { if (!selected && results[0]) setSelected(results[0].node.id); }, [results, selected]);

  // The laser readiness score of every result, measured here, once.
  const method = brief.method;
  useEffect(() => {
    let live = true;
    const todo = results.filter((x) => !scores[x.node.id]).slice(0, 4);
    if (!todo.length) return;
    void (async () => {
      for (const { node } of todo) {
        try {
          const img = await readNodeImage(docId, node, 480);
          const res = await imaging({ op: "readiness", img, options: { method, widthMm: imageWidth(node), thicknessMm: material?.thickness ?? 3 } });
          if (live && res.kind === "readiness") setScores((s) => ({ ...s, [node.id]: res.readiness }));
        } catch { /* not on this device */ }
      }
    })();
    return () => { live = false; };
  }, [results, scores, docId, method, material?.thickness]);

  // ---------------------------------------------------------------- making

  const finalPrompt = (direction?.prompt ?? idea).trim();
  const withBrief = (p: string) => [p, briefLine(brief)].filter(Boolean).join("\n");
  const unit = costOf("generate") + (quality === "high" ? r.highExtra : 0);
  const textForPiece = direction?.text.join("  ·  ") ?? "";

  const askForIdea = (message: string) => { setError(message); ideaRef.current?.focus(); };

  const make = (over: Partial<PictureSet> = {}) => {
    const { prompt: overPrompt, ...rest } = over;
    const p = (overPrompt ?? finalPrompt).trim();
    if (p.length < 3) { askForIdea("Write your idea in the box above first (a few words in any language), then press Make."); return; }
    setError(null);
    const step = nextStep(brief);
    const ok = r.makeSet({
      style, count, aspect, widthMm: brief.widthMm ?? 120, quality: r.highQuality ? quality : "medium", transparent,
      refs: refs.map((x) => x.url), label: direction?.title || "AI Studio",
      ...(textForPiece ? { text: textForPiece, font: kitFont(undefined, textForPiece) } : {}),
      ...(PRODUCT_TARGET[brief.product] && step === "vectorize" ? { then: "vectorize" as const, target: PRODUCT_TARGET[brief.product] as DesignKit["target"] } : {}),
      ...rest,
      prompt: withBrief(p).slice(0, MAX_IMAGE_PROMPT),
    });
    if (ok) { setCenter("results"); setSelected(null); }
  };

  const direct = async () => {
    if (idea.trim().length < 2) { askForIdea("Write your idea in the box first, in any language. The Creative Director turns it into a detailed brief."); return; }
    setDirecting(true); setError(null);
    const c = new AbortController(); ctl.current = c;
    try {
      const d = await enhancePrompt({ prompt: idea.trim(), style, brief }, c.signal);
      spent(d.credits);
      setDirection(d);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : "The Creative Director could not answer.");
    } finally {
      setDirecting(false);
    }
  };

  const review = async (node: ImageNode, prompt: string) => {
    setReviewing(node.id); setError(null);
    const c = new AbortController(); ctl.current = c;
    try {
      const img = await readNodeImage(docId, node, 1024);
      const res = await critiquePicture({ image: await uploadUrl(img, 1024), prompt, brief }, c.signal);
      spent(res.credits);
      setReviews((s) => ({ ...s, [node.id]: res }));
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : "The picture could not be reviewed.");
    } finally {
      setReviewing(null);
    }
  };

  const addRefs = async (files: FileList | null) => {
    if (!files) return;
    const next = [...refs];
    for (const f of Array.from(files).slice(0, 3 - refs.length)) {
      try { next.push({ url: await uploadUrl(await decodeImage(f, 1024), 768), name: f.name }); } catch { setError(`${f.name} could not be read.`); }
    }
    setRefs(next.slice(0, 3));
  };

  const refFromSelection = async () => {
    const s = api.getState(), id = s.selection[0], n = id ? locate(s.doc.root, id)?.node : null;
    if (!n || n.type !== "image") { setError("Select a picture on the canvas first, or choose a file."); return; }
    const url = await uploadUrl(await readNodeImage(docId, n, 1024), 768);
    setRefs((x) => [...x, { url, name: n.name ?? "Canvas picture" }].slice(0, 3));
  };

  const saveFavourite = (f: Omit<Favourite, "at">) => {
    const next = [{ ...f, at: Date.now() }, ...favourites.filter((x) => x.prompt !== f.prompt)].slice(0, 40);
    setFavourites(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* storage full */ }
  };

  /** The next laser step for a result, from the brief. */
  const finish = (node: ImageNode, how: "vectorize" | "centerline" | "engrave" | "layers") => {
    api.getState().select([node.id]);
    if (how === "engrave") r.run({ tool: "engrave", label: "Photo engraving", sourceId: node.id, options: { material: LIBRARY_TO_ENGRAVE[sheet?.materialId ?? ""] ?? "wood", widthMm: brief.widthMm ?? imageWidth(node) } });
    else if (how === "layers") r.run({ tool: "relief", label: "Stacked relief", sourceId: node.id, options: { levels: 5, widthMm: brief.widthMm ?? 200 } });
    else r.setVectorize({ lines: how === "centerline", target: PRODUCT_TARGET[brief.product], widthMm: brief.widthMm });
  };

  const showOnCanvas = (ids: string[]) => { api.getState().select(ids); openWorkspace(false); };

  // ---------------------------------------------------------------- pipelines

  /** Runs a job, then the next one on its result, as each finishes. */
  const chain = useCallback((first: JobInput, next: ((resultId: string) => JobInput | (() => void))[]) => {
    const id = r.run(first);
    if (!id) return;
    setCenter("results");
    if (!next.length) return;
    const off = jobsStore.subscribe((s) => {
      const j = s.jobs.find((x) => x.id === id);
      if (!j || j.status === "queued" || j.status === "running") return;
      off();
      if (j.status !== "done" || !j.resultIds[0]) return;
      const step = next[0](j.resultIds[0]);
      if (typeof step === "function") step();
      else chain(step, next.slice(1));
    });
  }, [r]);

  const selectedImage = (): ImageNode | null => {
    const s = api.getState(), id = s.selection[0], n = id ? locate(s.doc.root, id)?.node : null;
    return n?.type === "image" ? n : null;
  };

  const withSource = async (file: File | null): Promise<ImageNode | null> => {
    if (!file) {
      const n = selectedImage();
      if (!n) setError("Select a picture on the canvas, or choose a file.");
      return n;
    }
    const img = await decodeImage(file, 3000);
    const c = props.viewCenter();
    const id = await addImage(api, { blob: file, name: file.name, label: "AI: Add picture", pxW: img.width, pxH: img.height, place: { kind: "at", center: c, widthMm: brief.widthMm ?? 150 } });
    const n = id ? locate(api.getState().doc.root, id)?.node : null;
    return n?.type === "image" ? n : null;
  };

  const pipelines: { id: string; name: string; blurb: string; icon: ReactNode; cloud: boolean; go: (src: ImageNode) => void }[] = [
    { id: "pet", name: "Pet photo to engraving", blurb: "Clean up, then dither for your material", icon: <Mountain size={18} />, cloud: false,
      go: (src) => chain({ tool: "enhance", label: "Auto Enhance", sourceId: src.id }, [(id) => ({ tool: "engrave", label: "Photo engraving", sourceId: id, options: { material: LIBRARY_TO_ENGRAVE[sheet?.materialId ?? ""] ?? "wood", widthMm: brief.widthMm ?? 120 } })]) },
    { id: "shadow", name: "Photo to shadow box", blurb: "Depth on this computer, cut into 5 sheets", icon: <Layers size={18} />, cloud: false,
      go: (src) => chain({ tool: "relief", label: "Stacked relief", sourceId: src.id, options: { levels: 5, widthMm: brief.widthMm ?? 200 } }, []) },
    { id: "sketch", name: "Sketch to clean cut file", blurb: "Redrawn as clean line art, then traced", icon: <PenTool size={18} />, cloud: true,
      go: (src) => chain({ tool: "restyle", label: "Sketch to design", prompt: idea.trim(), style: "line-art", sourceId: src.id, options: { sketch: true } },
        [(id) => () => { api.getState().select([id]); r.setVectorize({ lines: false, widthMm: brief.widthMm }); }]) },
    { id: "logo", name: "Logo to sign", blurb: "Background removed, traced onto a sign", icon: <Wand2 size={18} />, cloud: false,
      go: (src) => chain({ tool: "quickCutout", label: "Quick Cutout", sourceId: src.id, options: { tolerance: 0.18 } },
        [(id) => () => { api.getState().select([id]); r.setVectorize({ target: "sign", widthMm: brief.widthMm }); }]) },
  ];
  const [pipeFile, setPipeFile] = useState<File | null>(null);
  const runPipeline = async (p: (typeof pipelines)[number]) => {
    if (p.cloud && cloudBlock) { setError(cloudBlock); return; }
    setError(null);
    const src = await withSource(pipeFile);
    if (src) { p.go(src); setPipeFile(null); }
  };

  // ---------------------------------------------------------------- recipes

  const [category, setCategory] = useState<KitCategory | "All">("All");
  const [recipe, setRecipe] = useState<DesignKit | null>(null);
  const [recipeWords, setRecipeWords] = useState("");
  const [recipeFields, setRecipeFields] = useState<Record<string, string>>({});
  const recipes = DESIGN_KITS.filter((k) => category === "All" || k.category === category);

  const styles = STYLE_PRESETS.filter((s) => group === "All" || s.group === group);
  const recent = useMemo(() => {
    const seen = new Set<string>(), out: { prompt: string; style?: string }[] = [];
    for (const j of mine) {
      const p = j.input.prompt?.split("\n")[0]?.trim();
      if (p && !seen.has(p)) { seen.add(p); out.push({ prompt: p, style: j.input.style }); }
      if (out.length >= 8) break;
    }
    return out;
  }, [mine]);

  const fill = (p: { prompt: string; style?: string; product?: BriefProduct; method?: BriefMethod; widthMm?: number }) => {
    setIdea(p.prompt); setDirection(null);
    if (p.style && styleById(p.style)) setStyle(p.style as StyleId);
    setBrief((b) => ({ ...b, ...(p.product ? { product: p.product } : {}), ...(p.method ? { method: p.method } : {}), ...(p.widthMm ? { widthMm: p.widthMm } : {}) }));
  };

  const currentReview = current ? reviews[current.node.id] : undefined;
  const currentScore = current ? scores[current.node.id] : undefined;
  const basePrompt = (j: Job) => (j.input.prompt ?? "").split("\n")[0];

  return (
    <div className="aiw" data-testid="ai-workspace" role="dialog" aria-label="AI Studio">
      <header className="aiw-top">
        <button type="button" className="ui-btn ghost" onClick={() => openWorkspace(false)} data-testid="aiw-close"><ArrowLeft size={14} aria-hidden /> Back to the canvas</button>
        <h2><Sparkles size={16} aria-hidden /> AI Studio</h2>
        <span className="aiw-credits"><Cloud size={13} aria-hidden />
          {status?.signedIn && status.cloud ? `${planLabel(status.plan)} · ${status.daily} credits a day · ${used} used today` : cloudBlock ?? dailyNote("free")}
        </span>
      </header>

      <div className="aiw-body">
        {/* ------------------------------------------------ composer */}
        <aside className="aiw-compose" aria-label="Compose">
          <section className="aiw-card">
            <h3>Laser Brief</h3>
            <div className="aiw-grid2">
              <Select label="Piece" value={brief.product} onChange={(v) => setBrief({ ...brief, product: v as BriefProduct })} testId="aiw-product"
                options={BRIEF_PRODUCTS.map((p) => ({ value: p, label: PRODUCT_NAMES[p] }))} />
              <label className="aiw-field"><span>Width</span>
                <span className="aiw-num"><input type="number" min={10} max={3000} value={brief.widthMm ?? 120} onChange={(e) => setBrief({ ...brief, widthMm: Math.max(10, Math.min(3000, Number(e.target.value) || 120)) })} aria-label="Width in mm" /><i>mm</i></span>
              </label>
            </div>
            <SegmentedControl label="Laser" value={brief.method} onChange={(v) => setBrief({ ...brief, method: v as BriefMethod })} full
              options={BRIEF_METHODS.map((m) => ({ value: m, label: METHOD_SHORT[m], title: METHOD_NAMES[m] }))} />
            <label className="aiw-field"><span>Material</span>
              <input className="ui-text" value={brief.material} maxLength={80} placeholder="Birch plywood 3 mm" onChange={(e) => setBrief({ ...brief, material: e.target.value })} />
            </label>
          </section>

          <section className="aiw-card">
            <h3>Your idea</h3>
            <textarea ref={ideaRef} className="ui-text aiw-idea" rows={4} maxLength={MAX_STUDIO_PROMPT} dir="auto" value={idea} data-testid="aiw-prompt"
              placeholder="Describe it in any language: a fox asleep under a crescent moon, نقش اسلیمی با انار…" onChange={(e) => { setIdea(e.target.value); setDirection(null); }} />
            <button type="button" className="ui-btn aiw-director" disabled={directing || !!cloudBlock} onClick={() => void direct()} data-testid="aiw-direct">
              {directing ? <Loader2 size={14} className="spin" aria-hidden /> : <Lightbulb size={14} aria-hidden />} Creative Director ({credits(costOf("enhance"))})
            </button>
            {direction && (
              <div className="aiw-direction" data-testid="aiw-direction">
                <div className="hd"><b>{direction.title}</b><button type="button" className="ui-icon-btn" aria-label="Discard the brief" onClick={() => setDirection(null)}><X size={13} /></button></div>
                <textarea className="ui-text" rows={5} value={direction.prompt} maxLength={MAX_STUDIO_PROMPT} aria-label="Design brief" onChange={(e) => setDirection({ ...direction, prompt: e.target.value })} />
                {direction.elements.length > 0 && <div className="aiw-chips">{direction.elements.map((e) => <span key={e} className="aiw-chip">{e}</span>)}</div>}
                {direction.text.length > 0 && <p className="dlg-note"><Type size={12} aria-hidden /> Set as real text afterwards: {direction.text.map((t) => <b key={t} dir="auto"> {t}</b>)}</p>}
              </div>
            )}
          </section>

          <section className="aiw-card">
            <div className="aiw-sh"><h3>Style</h3><span>{styleById(style)?.name}</span></div>
            <div className="aiw-groups" role="tablist" aria-label="Style group">
              {(["All", ...STYLE_GROUPS] as const).map((g) => <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => setGroup(g)}>{g}</button>)}
            </div>
            <div className="aiw-styles" role="radiogroup" aria-label="Style">
              {styles.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={style === s.id} title={s.blurb} onClick={() => setStyle(s.id)} data-testid={`aiw-style-${s.id}`}>
                  <StyleArt id={s.id} /><span>{s.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="aiw-card">
            <h3>Options</h3>
            <SegmentedControl label="Variations" value={String(count)} onChange={(v) => setCount(Number(v))} full
              options={Array.from({ length: MAX_VARIATIONS }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
            <SegmentedControl label="Shape" value={aspect} onChange={setAspect} full options={[{ value: "square", label: "Square" }, { value: "wide", label: "Wide" }, { value: "tall", label: "Tall" }]} />
            {r.highQuality
              ? <SegmentedControl label="Quality" value={quality} onChange={setQuality} full options={[{ value: "medium", label: "Standard" }, { value: "high", label: `High (+${r.highExtra})` }]} />
              : <p className="dlg-note">High quality, with finer detail, comes with Pro.</p>}
            <label className="pn-check"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparent background</label>
            <div className="aiw-refs">
              <span className="aiw-label">References <small>(up to 3)</small></span>
              <div className="aiw-ref-row">
                {refs.map((x, i) => (
                  <span key={i} className="aiw-ref"><img src={x.url} alt={x.name} /><button type="button" aria-label={`Remove ${x.name}`} onClick={() => setRefs(refs.filter((_, k) => k !== i))}><X size={11} /></button></span>
                ))}
                {refs.length < 3 && <>
                  <button type="button" className="aiw-ref add" onClick={() => refInput.current?.click()} title="Choose a picture"><ImagePlus size={16} aria-hidden /></button>
                  <button type="button" className="ui-btn small" onClick={() => void refFromSelection()}>From canvas</button>
                </>}
                <input ref={refInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { void addRefs(e.target.files); e.target.value = ""; }} />
              </div>
            </div>
          </section>

          <div className="aiw-make">
            {error && <p className="aiw-err" role="alert"><CircleAlert size={13} aria-hidden /> {error}</p>}
            {!error && finalPrompt.length < 3 && !cloudBlock && <p className="dlg-note aiw-hint">Write your idea above, or pick one from Inspiration or Recipes.</p>}
            <button type="button" className="ui-btn primary lg" disabled={!!cloudBlock} onClick={() => make()} data-testid="aiw-make">
              <Sparkles size={15} aria-hidden /> Make {count === 1 ? "picture" : `${count} variations`} · {credits(count * unit)}
            </button>
            {finalPrompt.length >= 3 && <button type="button" className="ui-btn ghost small" onClick={() => saveFavourite({ prompt: finalPrompt, style, product: brief.product, method: brief.method })}><Star size={12} aria-hidden /> Save to favourites</button>}
          </div>
        </aside>

        {/* ------------------------------------------------ center */}
        <main className="aiw-center">
          <nav className="aiw-tabs" role="tablist" aria-label="AI Studio">
            {([["results", "Results", <Sparkles key="r" size={14} />], ["recipes", "Recipes", <Wand2 key="k" size={14} />], ["pipelines", "Pipelines", <Workflow key="p" size={14} />], ["inspire", "Inspiration", <Lightbulb key="i" size={14} />]] as const).map(([id, label, icon]) => (
              <button key={id} type="button" role="tab" aria-selected={center === id} onClick={() => setCenter(id)} data-testid={`aiw-tab-${id}`}>
                {icon}{label}{id === "results" && pending.length ? <em>{pending.length}</em> : null}
              </button>
            ))}
          </nav>

          {center === "results" && (
            <div className="aiw-scroll">
              {!results.length && !pending.length ? (
                <EmptyState icon={<Sparkles size={24} />} title="Your designs appear here">
                  Write an idea, pick a style and make two to four variations. Each one gets a laser readiness score, and every picture is also on the canvas.
                </EmptyState>
              ) : (
                <div className="aiw-results" data-testid="aiw-results">
                  {pending.map((j) => (
                    <div key={j.id} className="aiw-result pending">
                      <span className="aiw-ph"><Loader2 size={20} className="spin" aria-hidden /><small>{j.stage ?? "Waiting…"}</small></span>
                      <span className="nm">{j.input.label}</span>
                    </div>
                  ))}
                  {results.map(({ node, job }) => (
                    <button key={node.id} type="button" className={`aiw-result${selected === node.id ? " on" : ""}`} onClick={() => setSelected(node.id)} data-testid="aiw-result">
                      <NodePicture docId={docId} node={node} alt={job.input.label} />
                      <ScoreBadge r={scores[node.id]} />
                      {job.stage && /vector/i.test(job.stage) && <span className="aiw-vec" title={job.stage}><PenTool size={10} aria-hidden /> Vector</span>}
                      <span className="nm">{job.input.label}</span>
                    </button>
                  ))}
                  {failed.map((j) => (
                    <div key={j.id} className="aiw-result failed" role="alert">
                      <span className="aiw-ph"><CircleAlert size={20} aria-hidden /><small>{j.error}</small></span>
                      <span className="nm">{j.input.label} <button type="button" className="ui-icon-btn" aria-label="Dismiss" onClick={() => forget(j.id)}><X size={12} /></button></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {center === "recipes" && (
            <div className="aiw-scroll">
              <div className="aiw-groups wrap" role="tablist" aria-label="Recipe category">
                {(["All", ...KIT_CATEGORIES] as const).map((c) => <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}>{c}</button>)}
              </div>
              <div className="aiw-recipes">
                {recipes.map((k) => (
                  <button key={k.id} type="button" className={`aiw-recipe${recipe?.id === k.id ? " on" : ""}`} onClick={() => { setRecipe(k); setRecipeWords(""); setRecipeFields({}); }} data-testid={`aiw-recipe-${k.id}`}>
                    <StyleArt id={k.style} />
                    <span><b>{k.name}</b><small>{k.blurb}</small><em>{k.count} × · {PRODUCT_NAMES[k.product ?? "canvas"]}</em></span>
                  </button>
                ))}
              </div>
              {recipe && (
                <div className="aiw-card aiw-recipe-form" data-testid="aiw-recipe-form">
                  <div className="aiw-sh"><h3>{recipe.name}</h3><button type="button" className="ui-icon-btn" aria-label="Close" onClick={() => setRecipe(null)}><X size={13} /></button></div>
                  <label className="aiw-field"><span>{recipe.ask}</span>
                    <input className="ui-text" value={recipeWords} maxLength={200} placeholder={recipe.placeholder} dir="auto" onChange={(e) => setRecipeWords(e.target.value)} autoFocus />
                  </label>
                  {recipe.fields?.map((f) => (
                    <label key={f.key} className="aiw-field"><span>{f.label}</span>
                      <input className="ui-text" value={recipeFields[f.key] ?? ""} maxLength={120} placeholder={f.placeholder} dir="auto" onChange={(e) => setRecipeFields({ ...recipeFields, [f.key]: e.target.value })} />
                    </label>
                  ))}
                  {recipe.fields?.length ? <p className="dlg-note"><Type size={12} aria-hidden /> Words are set as real text in {kitFont(recipe, Object.values(recipeFields).join(" ")).replace(/-/g, " ")}, so they are always crisp and spelt right.</p> : null}
                  <button type="button" className="ui-btn primary" disabled={!!cloudBlock} data-testid="aiw-recipe-run"
                    onClick={() => { if (r.runRecipe(recipe.id, recipeWords, recipeFields, { quality: r.highQuality ? quality : "medium" })) { setCenter("results"); setSelected(null); } }}>
                    <Wand2 size={14} aria-hidden /> Make {recipe.count} variation{recipe.count === 1 ? "" : "s"} · {credits(recipe.count * unit)}
                  </button>
                </div>
              )}
            </div>
          )}

          {center === "pipelines" && (
            <div className="aiw-scroll">
              <p className="aiw-intro">One click from a picture to a laser file. Use the picture selected on the canvas, or choose one.</p>
              <label className="aiw-file">
                <ImagePlus size={14} aria-hidden /> {pipeFile ? pipeFile.name : "Choose a picture (or select one on the canvas)"}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setPipeFile(e.target.files?.[0] ?? null)} />
              </label>
              <div className="aiw-pipes">
                {pipelines.map((p) => (
                  <div key={p.id} className="aiw-card aiw-pipe">
                    <span className="ic">{p.icon}</span>
                    <span><b>{p.name}</b><small>{p.blurb}{p.cloud ? ` · ${credits(costOf("restyle"))}` : " · free"}</small></span>
                    <button type="button" className="ui-btn primary small" onClick={() => void runPipeline(p)} data-testid={`aiw-pipe-${p.id}`}>Run</button>
                  </div>
                ))}
                <div className="aiw-card aiw-pipe">
                  <span className="ic"><Heart size={18} /></span>
                  <span><b>Words and motif to cake topper</b><small>Write the motif in Your idea; the words come from the brief</small></span>
                  <button type="button" className="ui-btn primary small" disabled={!!cloudBlock} onClick={() => {
                    setBrief({ ...brief, product: "topper", method: "cut" });
                    make({ style: "silhouette", then: "vectorize", target: "topper", prompt: `Cake topper silhouette: ${finalPrompt || "hearts and stars"}` });
                  }} data-testid="aiw-pipe-topper">Run</button>
                </div>
              </div>
            </div>
          )}

          {center === "inspire" && (
            <div className="aiw-scroll">
              {favourites.length > 0 && <>
                <h3 className="aiw-h">Your favourites</h3>
                <div className="aiw-ideas">
                  {favourites.map((f) => (
                    <div key={f.at} className="aiw-idea-card">
                      <button type="button" onClick={() => fill(f)}>{f.style && styleById(f.style) ? <StyleArt id={f.style as StyleId} /> : null}<span>{f.prompt}</span></button>
                      <button type="button" className="ui-icon-btn" aria-label="Remove" onClick={() => { const next = favourites.filter((x) => x.at !== f.at); setFavourites(next); try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* full */ } }}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              </>}
              {recent.length > 0 && <>
                <h3 className="aiw-h">Recent in this project</h3>
                <div className="aiw-ideas">
                  {recent.map((x) => <div key={x.prompt} className="aiw-idea-card"><button type="button" onClick={() => fill(x)}><RefreshCw size={13} aria-hidden /><span>{x.prompt}</span></button></div>)}
                </div>
              </>}
              <h3 className="aiw-h">Ideas to start from</h3>
              <div className="aiw-gallery">
                {INSPIRATION.map((x) => (
                  <button key={x.id} type="button" className="aiw-insp" onClick={() => fill(x)} data-testid={`aiw-insp-${x.id}`}>
                    <StyleArt id={x.style} />
                    <b>{x.title}</b>
                    <small>{styleById(x.style)?.name} · {PRODUCT_NAMES[x.product]} · {METHOD_NAMES[x.method]}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* ------------------------------------------------ inspector */}
        <aside className="aiw-inspect" aria-label="Selected design">
          {!current ? (
            <EmptyState icon={<Eye size={22} />} title="Nothing selected">Pick a result to see how ready it is for the laser and what to do next.</EmptyState>
          ) : (
            <>
              <div className="aiw-preview"><NodePicture docId={docId} node={current.node} alt={current.job.input.label} /></div>
              <div className="aiw-card">
                <div className="aiw-sh"><h3>Laser readiness</h3>{currentScore ? <span className={`aiw-grade ${currentScore.grade}`}>{currentScore.score} · {GRADE_TEXT[currentScore.grade]}</span> : <Loader2 size={13} className="spin" aria-hidden />}</div>
                {currentScore && (
                  <ul className="aiw-checks" data-testid="aiw-checks">
                    {currentScore.checks.map((c) => (
                      <li key={c.id} className={c.ok ? "ok" : "bad"}>{c.ok ? <Check size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />}<span><b>{c.label}</b><small>{c.detail}</small></span></li>
                    ))}
                  </ul>
                )}
                {currentScore?.promptFix && (
                  <button type="button" className="ui-btn small" disabled={!!cloudBlock} onClick={() => make({ prompt: `${basePrompt(current.job)}\n${currentScore.promptFix}`, count: 1, style: (current.job.input.style as StyleId) ?? style })}>
                    <RefreshCw size={12} aria-hidden /> Fix and make again · {credits(unit)}
                  </button>
                )}
              </div>

              <div className="aiw-card">
                <div className="aiw-sh"><h3>Design review</h3><small>{credits(costOf("critique"))}</small></div>
                {currentReview ? (
                  <>
                    <p className="aiw-review"><b>{currentReview.score}/100</b> {currentReview.issues.length ? "" : "Looks ready to sell."}</p>
                    {currentReview.issues.length > 0 && <ul className="aiw-list">{currentReview.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
                    {currentReview.fix && <button type="button" className="ui-btn small" disabled={!!cloudBlock} onClick={() => make({ prompt: currentReview.fix, count: 2 })}><Sparkles size={12} aria-hidden /> Make the improved version</button>}
                  </>
                ) : (
                  <button type="button" className="ui-btn small" disabled={!!cloudBlock || reviewing === current.node.id} onClick={() => void review(current.node, basePrompt(current.job))} data-testid="aiw-review">
                    {reviewing === current.node.id ? <Loader2 size={12} className="spin" aria-hidden /> : <ScanSearch size={12} aria-hidden />} Review this design
                  </button>
                )}
              </div>

              <div className="aiw-card">
                <h3>Next step</h3>
                <div className="aiw-actions">
                  <button type="button" className="ui-btn primary small" onClick={() => finish(current.node, nextStep(brief))} data-testid="aiw-next">
                    <Wand2 size={12} aria-hidden /> {nextStep(brief) === "engrave" ? "Make the engraving" : nextStep(brief) === "layers" ? "Cut into layers" : nextStep(brief) === "centerline" ? "Trace centre-lines" : `Vectorize${PRODUCT_TARGET[brief.product] ? ` as ${PRODUCT_NAMES[brief.product].toLowerCase()}` : ""}`}
                  </button>
                  <button type="button" className="ui-btn small" disabled={!!cloudBlock} onClick={() => r.run({ tool: "restyle", label: "More like this", prompt: basePrompt(current.job), style: current.job.input.style, sourceId: current.node.id })}>
                    <Copy size={12} aria-hidden /> More like this
                  </button>
                  <button type="button" className="ui-btn small" disabled={!!cloudBlock} onClick={() => { api.getState().select([current.node.id]); r.setEdit("redraw"); }}><Brush size={12} aria-hidden /> Redraw part</button>
                  <button type="button" className="ui-btn small" onClick={() => showOnCanvas([current.node.id])}><Eye size={12} aria-hidden /> Show on canvas</button>
                </div>
                <CaptionForm onAdd={(text) => r.followUp(current.node.id, { text, font: kitFont(undefined, text) })} />
              </div>
            </>
          )}
        </aside>
      </div>
      {r.dialogs(current?.node ?? null)}
    </div>
  );
}

/** Real text under the selected picture. */
function CaptionForm({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form className="aiw-caption" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText(""); } }}>
      <input className="ui-text" value={text} maxLength={120} dir="auto" placeholder="Add a name or words as real text" aria-label="Words to add" onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="ui-btn small" disabled={!text.trim()}><Type size={12} aria-hidden /> Add</button>
    </form>
  );
}
