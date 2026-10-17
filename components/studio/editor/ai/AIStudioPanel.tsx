"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  Ban, Box, Brush, Check, Cloud, Contrast, Expand, Eye, ImagePlus, Layers, Loader2, Maximize2, MessageSquare, Mountain, PenTool, RotateCcw,
  Scissors, Send, Sparkles, Trash2, Wand2, ZoomIn,
} from "lucide-react";
import { EmptyState, NumberInput, PanelSection, ProgressBar, SegmentedControl, Select, Slider, Tabs } from "@/components/ui";
import { locate } from "@/lib/studio/scene";
import type { ImageNode } from "@/lib/studio/types";
import { ADJUST_NEUTRAL, type AdjustOptions } from "@/lib/imaging/adjust";
import { CUTOUT_DEFAULTS } from "@/lib/imaging/cutout";
import { DITHER_ALGOS, ENGRAVE_MATERIALS, engraveMaterial, type DitherAlgo, type EngraveMaterialId } from "@/lib/imaging/dither";
import { CARTOON_DEFAULTS } from "@/lib/imaging/lineart";
import { LAYER_DEFAULTS } from "@/lib/imaging/relief";
import { dailyNote, type CloudOp } from "@/lib/ai/studio/credits";
import { planLabel } from "@/lib/plans";
import { DESIGN_KITS } from "@/lib/ai/studio/kits";
import { MAX_STUDIO_PROMPT } from "@/lib/ai/studio/request";
import { STYLE_PRESETS, styleById } from "@/lib/ai/studio/styles";
import { useEditor, useEditorApi } from "../store";
import { pickImage, readNodeImage } from "./assets";
import { imaging } from "./imagingClient";
import { cancel, clearHistory, creditsStore, forget, jobsStore, openWorkspace, type Job, type JobInput } from "./jobs";
import { AssistantChat } from "./AssistantChat";
import type { VectorizeStart } from "./VectorizeDialog";
import { imageWidth, LIBRARY_TO_ENGRAVE, useAIRunner, type AIStudioProps, type PictureSet } from "./useAIRunner";

export type { AIStudioProps } from "./useAIRunner";

type Tab = "create" | "image" | "laser" | "assistant" | "jobs";

/** AI Studio, compact: pictures from text and photos, image clean-up, laser preparation and an assistant, as layers on the canvas. */
export function AIStudioPanel(props: AIStudioProps) {
  const { toast, viewCenter, beforeLeave } = props;
  const r = useAIRunner(props);
  const docId = useEditor((s) => s.doc.id);
  const image = useEditor(pickImage);
  const [tab, setTab] = useState<Tab>("create");
  const used = useStore(creditsStore, (s) => s.used);
  const jobs = useStore(jobsStore, (s) => s.jobs);
  const mine = useMemo(() => jobs.filter((j) => j.docId === docId), [jobs, docId]);
  const active = mine.filter((j) => j.status === "running" || j.status === "queued").length;
  const { status, cloudBlock } = r;

  const shared: Shared = { run: r.run, makeSet: r.makeSet, runRecipe: r.runRecipe, image, cloudBlock, costOf: r.costOf, setTab };
  return (
    <div className="ai-studio" data-testid="ai-studio">
      <div className="ai-credits" data-testid="ai-credits">
        <Cloud size={14} aria-hidden />
        {status?.signedIn && status.cloud
          ? <span>{planLabel(status.plan)}: {status.daily} credits a day · {used} used here today</span>
          : <span>{cloudBlock ?? dailyNote("free")}</span>}
      </div>
      <button type="button" className="ui-btn primary ai-open-ws" onClick={() => openWorkspace(true)} data-testid="ai-open-workspace">
        <Maximize2 size={14} aria-hidden /> Open the full AI Studio
      </button>
      <Tabs label="AI Studio" value={tab} onChange={setTab} tabs={[
        { id: "create", label: "Create" }, { id: "image", label: "Image" }, { id: "laser", label: "Laser" },
        { id: "assistant", label: "Assistant" }, { id: "jobs", label: active ? `Jobs (${active})` : "Jobs" },
      ]} />
      <div className="ai-body">
        {tab === "create" && <CreateTab {...shared} />}
        {tab === "image" && <ImageTab {...shared} openEdit={r.setEdit} />}
        {tab === "laser" && <LaserTab {...shared} openVectorize={r.setVectorize} toParametric={() => { if (image) void r.toParametric(image); }} />}
        {tab === "assistant" && <AssistantChat cloudBlock={cloudBlock} cost={r.costOf("assistant")} toast={toast} viewCenter={viewCenter} beforeLeave={beforeLeave}
          makeImage={(prompt, style, count) => { if (r.makeSet({ prompt, style, count })) setTab("jobs"); }}
          runRecipe={(id, words, fields) => { if (r.runRecipe(id, words, fields)) setTab("jobs"); }} />}
        {tab === "jobs" && <JobsTab jobs={mine} run={r.run} docId={docId} />}
      </div>
      {r.dialogs(image, () => setTab("jobs"))}
    </div>
  );
}

type Shared = {
  run: (i: JobInput) => string | null;
  makeSet: (s: PictureSet) => boolean;
  runRecipe: (id: string, words: string, fields?: Record<string, string>) => boolean;
  image: ImageNode | null;
  cloudBlock: string | null;
  costOf: (op: CloudOp) => number;
  setTab: (t: Tab) => void;
};

const credits = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

// ------------------------------------------------------------------ Create

function CreateTab({ run, makeSet, runRecipe, image, cloudBlock, costOf, setTab }: Shared) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("line-art");
  const [aspect, setAspect] = useState<"square" | "wide" | "tall">("square");
  const [widthMm, setWidthMm] = useState(100);
  const [count, setCount] = useState<"1" | "2" | "4">("1");
  const [restyle, setRestyle] = useState("");
  const [sketch, setSketch] = useState(false);
  const [kit, setKit] = useState<string | null>(null);
  const [kitWords, setKitWords] = useState("");
  const [kitText, setKitText] = useState("");
  const go = (input: JobInput) => { if (run(input)) setTab("jobs"); };
  const n = Number(count);

  return (
    <>
      <PanelSection title="Text to image">
        <div className="ai-stack">
          <textarea className="ui-text ai-prompt" rows={3} maxLength={MAX_STUDIO_PROMPT} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="A fox curled up asleep under a crescent moon" aria-label="Describe the picture" data-testid="ai-prompt" />
          <div className="ai-styles" role="radiogroup" aria-label="Style">
            {STYLE_PRESETS.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={style === s.id} title={s.blurb} onClick={() => setStyle(s.id)} data-testid={`ai-style-${s.id}`}>{s.name}</button>
            ))}
          </div>
          <SegmentedControl label="Shape" value={aspect} onChange={setAspect} full options={[{ value: "square", label: "Square" }, { value: "wide", label: "Wide" }, { value: "tall", label: "Tall" }]} />
          <SegmentedControl label="Variations" value={count} onChange={setCount} full options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "4", label: "4" }]} />
          <NumberInput label="Width on the canvas" value={widthMm} min={10} max={2000} suffix="mm" onChange={(v) => setWidthMm(v)} />
          <button type="button" className="ui-btn primary" disabled={prompt.trim().length < 3 || !!cloudBlock} data-testid="ai-generate"
            onClick={() => { if (makeSet({ prompt: prompt.trim(), style, aspect, widthMm, count: n })) setTab("jobs"); }}>
            <Sparkles size={14} aria-hidden /> Make {n === 1 ? "picture" : `${n} variations`} ({credits(n * costOf("generate"))})
          </button>
        </div>
      </PanelSection>
      <PanelSection title="Image to design" defaultOpen={!!image}>
        {!image ? <p className="dlg-note">Select an image or a photo of a sketch on the canvas.</p> : (
          <div className="ai-stack">
            <textarea className="ui-text ai-prompt" rows={2} maxLength={MAX_STUDIO_PROMPT} value={restyle} onChange={(e) => setRestyle(e.target.value)}
              placeholder="Optional: what to change or keep" aria-label="What to change" />
            <label className="pn-check"><input type="checkbox" checked={sketch} onChange={(e) => setSketch(e.target.checked)} /> It is a hand sketch: clean it up into a design</label>
            <p className="dlg-note">Uses the style chosen above ({styleById(style)?.name}).</p>
            <button type="button" className="ui-btn" disabled={!!cloudBlock} data-testid="ai-restyle"
              onClick={() => go({ tool: "restyle", label: sketch ? "Sketch to design" : "Image to design", prompt: restyle.trim(), style, sourceId: image.id, options: { sketch } })}>
              <PenTool size={14} aria-hidden /> Redesign the selected image ({credits(costOf("restyle"))})
            </button>
          </div>
        )}
      </PanelSection>
      <PanelSection title="Recipes">
        <div className="ai-kits">
          {DESIGN_KITS.map((k) => (
            <div key={k.id} className={`ai-kit${kit === k.id ? " open" : ""}`}>
              <button type="button" className="choice" aria-expanded={kit === k.id} onClick={() => { setKit(kit === k.id ? null : k.id); setKitWords(""); setKitText(""); }} data-testid={`ai-kit-${k.id}`}>
                <b>{k.name}</b><small>{k.blurb}</small>
              </button>
              {kit === k.id && (
                <div className="ai-stack">
                  <label className="ui-label" htmlFor={`kit-${k.id}`}>{k.ask}</label>
                  <input id={`kit-${k.id}`} className="ui-text" value={kitWords} maxLength={200} placeholder={k.placeholder} onChange={(e) => setKitWords(e.target.value)} />
                  {k.fields?.[0] && (
                    <>
                      <label className="ui-label" htmlFor={`kit-${k.id}-text`}>{k.fields[0].label}</label>
                      <input id={`kit-${k.id}-text`} className="ui-text" value={kitText} maxLength={120} placeholder={k.fields[0].placeholder} onChange={(e) => setKitText(e.target.value)} dir="auto" />
                    </>
                  )}
                  <button type="button" className="ui-btn primary" disabled={!!cloudBlock} onClick={() => {
                    if (runRecipe(k.id, kitWords, k.fields?.[0] ? { [k.fields[0].key]: kitText } : undefined)) setTab("jobs");
                  }}>
                    <Wand2 size={14} aria-hidden /> Make {k.count} variation{k.count === 1 ? "" : "s"} ({credits(k.count * costOf("generate"))})
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </PanelSection>
    </>
  );
}

// ------------------------------------------------------------------ Image

function ImageTab({ run, image, cloudBlock, costOf, setTab, openEdit }: Shared & { openEdit: (m: "redraw" | "expand") => void }) {
  const docId = useEditor((s) => s.doc.id);
  const [adj, setAdj] = useState<AdjustOptions>(ADJUST_NEUTRAL);
  const [tolerance, setTolerance] = useState(Math.round(CUTOUT_DEFAULTS.tolerance * 100));
  const [detail, setDetail] = useState(50);
  const [levels, setLevels] = useState(CARTOON_DEFAULTS.levels);
  const [autoBusy, setAutoBusy] = useState(false);
  const lastImage = useRef<string | null>(null);
  useEffect(() => { if (image?.id !== lastImage.current) { lastImage.current = image?.id ?? null; setAdj(ADJUST_NEUTRAL); } }, [image?.id]);
  if (!image) return <EmptyState icon={<ImagePlus size={22} />} title="Select an image">Pick a photo or a picture on the canvas to adjust, enhance, cut out, redraw or turn into line art.</EmptyState>;
  const go = (tool: string, label: string, options?: Record<string, unknown>, prompt?: string) => { if (run({ tool, label, sourceId: image.id, options, prompt })) setTab("jobs"); };
  const auto = async () => {
    setAutoBusy(true);
    try {
      const img = await readNodeImage(docId, image, 800);
      const r = await imaging({ op: "auto", img });
      if (r.kind === "adjust") setAdj(r.options);
    } finally {
      setAutoBusy(false);
    }
  };
  return (
    <>
      <PanelSection title="Smart Adjust" onReset={() => setAdj(ADJUST_NEUTRAL)}>
        <div className="ai-stack">
          <button type="button" className="ui-btn" onClick={() => void auto()} disabled={autoBusy} data-testid="ai-auto-adjust">
            {autoBusy ? <Loader2 size={14} className="spin" aria-hidden /> : <Contrast size={14} aria-hidden />} Suggest levels for this image
          </button>
          <Slider label="Black point" min={0} max={200} value={adj.black} onChange={(v) => setAdj({ ...adj, black: v })} />
          <Slider label="White point" min={55} max={255} value={adj.white} onChange={(v) => setAdj({ ...adj, white: v })} />
          <Slider label="Mid-tones" min={0.3} max={3} step={0.05} value={adj.gamma} onChange={(v) => setAdj({ ...adj, gamma: v })} format={(v) => v.toFixed(2)} />
          <Slider label="Saturation" min={-100} max={100} value={adj.saturation} onChange={(v) => setAdj({ ...adj, saturation: v })} />
          <Slider label="Sharpen" min={0} max={2} step={0.05} value={adj.sharpen} onChange={(v) => setAdj({ ...adj, sharpen: v })} format={(v) => v.toFixed(2)} />
          <Slider label="Smooth noise" min={0} max={2} step={0.05} value={adj.denoise} onChange={(v) => setAdj({ ...adj, denoise: v })} format={(v) => v.toFixed(2)} />
          <button type="button" className="ui-btn primary" onClick={() => go("adjust", "Smart Adjust", { ...adj })} data-testid="ai-apply-adjust"><Check size={14} aria-hidden /> Apply</button>
        </div>
      </PanelSection>
      <PanelSection title="Enhance and upscale">
        <div className="ai-row">
          <button type="button" className="ui-btn" onClick={() => go("enhance", "Auto Enhance")} data-testid="ai-enhance"><Sparkles size={14} aria-hidden /> Auto enhance</button>
          <button type="button" className="ui-btn" onClick={() => go("upscale", "Upscale 2×", { factor: 2 })} data-testid="ai-upscale-2"><ZoomIn size={14} aria-hidden /> 2×</button>
          <button type="button" className="ui-btn" onClick={() => go("upscale", "Upscale 4×", { factor: 4 })}><ZoomIn size={14} aria-hidden /> 4×</button>
        </div>
        <p className="dlg-note">Runs on this computer, free. The result covers the original, which stays hidden underneath.</p>
      </PanelSection>
      <PanelSection title="Cutout">
        <div className="ai-stack">
          <NumberInput label="Background tolerance" value={tolerance} min={2} max={60} integer suffix="%" onChange={(v) => setTolerance(v)} />
          <div className="ai-row">
            <button type="button" className="ui-btn" onClick={() => go("quickCutout", "Quick Cutout", { tolerance: tolerance / 100 })} data-testid="ai-quick-cutout"><Scissors size={14} aria-hidden /> Quick (free)</button>
            <button type="button" className="ui-btn" disabled={!!cloudBlock} onClick={() => go("aiCutout", "AI Cutout")} data-testid="ai-cutout"><Scissors size={14} aria-hidden /> AI cutout ({credits(costOf("cutout"))})</button>
          </div>
          <p className="dlg-note">Quick removes a plain background touching the edges. AI cutout finds the subject on any background.</p>
        </div>
      </PanelSection>
      <PanelSection title="Redraw and expand">
        <div className="ai-row">
          <button type="button" className="ui-btn" disabled={!!cloudBlock} onClick={() => openEdit("redraw")} data-testid="ai-redraw"><Brush size={14} aria-hidden /> Image Redraw…</button>
          <button type="button" className="ui-btn" disabled={!!cloudBlock} onClick={() => openEdit("expand")} data-testid="ai-expand"><Expand size={14} aria-hidden /> Creative Expand…</button>
        </div>
        <p className="dlg-note">{credits(costOf("redraw"))} each. Paint over a part and say what goes there, or add room around the picture.</p>
      </PanelSection>
      <PanelSection title="Line art and cartoon">
        <div className="ai-stack">
          <Slider label="Detail" min={0} max={100} value={detail} onChange={setDetail} format={(v) => `${v}%`} />
          <div className="ai-row">
            <button type="button" className="ui-btn" onClick={() => go("lineart", "Line art", { detail: detail / 100 })} data-testid="ai-lineart"><PenTool size={14} aria-hidden /> Line art</button>
            <button type="button" className="ui-btn" onClick={() => go("lineart", "Portrait outline", { portrait: true })}><Eye size={14} aria-hidden /> Portrait outline</button>
          </div>
          <NumberInput label="Cartoon colours" value={levels} min={2} max={8} integer onChange={(v) => setLevels(v)} />
          <button type="button" className="ui-btn" onClick={() => go("cartoon", "Cartoon", { levels })} data-testid="ai-cartoon"><Sparkles size={14} aria-hidden /> Cartoon</button>
        </div>
      </PanelSection>
    </>
  );
}

// ------------------------------------------------------------------ Laser

function LaserTab({ run, image, setTab, openVectorize, toParametric }: Shared & { openVectorize: (s: VectorizeStart) => void; toParametric: () => void }) {
  const sheetMaterial = useEditor((s) => s.doc.sheets[0]?.materialId ?? "");
  const [material, setMaterial] = useState<EngraveMaterialId>(LIBRARY_TO_ENGRAVE[sheetMaterial] ?? "wood");
  const [algo, setAlgo] = useState<"auto" | DitherAlgo>("auto");
  const [widthMm, setWidthMm] = useState(100);
  const [dpi, setDpi] = useState(0);
  const [setLayer, setSetLayer] = useState(true);
  const [levels, setLevels] = useState(LAYER_DEFAULTS.levels);
  const [reliefW, setReliefW] = useState(200);
  useEffect(() => { if (image) { const w = Math.round(imageWidth(image)); setWidthMm(w); setReliefW(w); } }, [image?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!image) return <EmptyState icon={<ImagePlus size={22} />} title="Select an image">Pick a photo or a picture on the canvas to engrave, vectorize or turn into a relief.</EmptyState>;
  const m = engraveMaterial(material);
  const go = (tool: string, label: string, options?: Record<string, unknown>) => { if (run({ tool, label, sourceId: image.id, options })) setTab("jobs"); };
  return (
    <>
      <PanelSection title="Photo to engraving">
        <div className="ai-stack">
          <Select label="Material" value={material} onChange={setMaterial} testId="ai-engrave-material" options={ENGRAVE_MATERIALS.map((x) => ({ value: x.id, label: x.name }))} />
          <p className="dlg-note">{m.note}</p>
          <Select label="Dithering" value={algo} onChange={setAlgo} testId="ai-engrave-algo"
            options={[{ value: "auto", label: `Best for ${m.name.toLowerCase()} (${DITHER_ALGOS.find((a) => a.id === m.algo)?.name})` }, ...DITHER_ALGOS.map((a) => ({ value: a.id, label: a.name }))]} />
          <NumberInput label="Width" value={widthMm} min={5} max={2000} suffix="mm" onChange={(v) => setWidthMm(v)} />
          <NumberInput label="Resolution" value={dpi || m.dpi} min={50} max={1000} integer suffix="DPI" onChange={(v) => setDpi(v)} />
          <label className="pn-check"><input type="checkbox" checked={setLayer} onChange={(e) => setSetLayer(e.target.checked)} /> Set the engrave layer&apos;s power, speed and line interval</label>
          <button type="button" className="ui-btn primary" onClick={() => go("engrave", "Photo engraving", { material, algo, widthMm, dpi, setLayer })} data-testid="ai-engrave">
            <Mountain size={14} aria-hidden /> Make engraving
          </button>
        </div>
      </PanelSection>
      <PanelSection title="Vectorize">
        <div className="ai-stack">
          <button type="button" className="ui-btn" onClick={() => openVectorize({})} data-testid="ai-vectorize"><Wand2 size={14} aria-hidden /> Vectorize with cut check…</button>
          <button type="button" className="ui-btn" onClick={() => openVectorize({ lines: true })}><PenTool size={14} aria-hidden /> Centre-lines to score…</button>
          <p className="dlg-note">Smoothing, thinnest part and bridges, checked against your material and bed before it is placed. Also makes cake toppers, signs, lamp panels and generator outlines.</p>
          <div className="ai-row">
            <button type="button" className="ui-btn" onClick={() => openVectorize({ target: "topper" })}>Cake topper…</button>
            <button type="button" className="ui-btn" onClick={() => openVectorize({ target: "sign" })}>Sign…</button>
            <button type="button" className="ui-btn" onClick={() => openVectorize({ target: "lamp" })}>Lamp panel…</button>
            <button type="button" className="ui-btn" onClick={() => openVectorize({ target: "trophy" })}>Trophy…</button>
            <button type="button" className="ui-btn" onClick={() => openVectorize({ target: "puzzle" })}>Puzzle…</button>
          </div>
        </div>
      </PanelSection>
      <PanelSection title="Depth and relief">
        <div className="ai-stack">
          <button type="button" className="ui-btn" onClick={() => go("depth", "Depth map")} data-testid="ai-depth"><Layers size={14} aria-hidden /> Depth map</button>
          <NumberInput label="Sheets" value={levels} min={2} max={12} integer onChange={(v) => setLevels(v)} />
          <NumberInput label="Width" value={reliefW} min={30} max={1000} suffix="mm" onChange={(v) => setReliefW(v)} />
          <button type="button" className="ui-btn primary" onClick={() => go("relief", "Stacked relief", { levels, widthMm: reliefW })} data-testid="ai-relief">
            <Layers size={14} aria-hidden /> Make stacked relief
          </button>
          <button type="button" className="ui-btn" onClick={toParametric}><Box size={14} aria-hidden /> Open as a 3D relief in Parametric</button>
          <p className="dlg-note">The depth model runs on this computer. Sheets are cut on the cut layer; each has the next one&apos;s outline scored as a glue guide.</p>
        </div>
      </PanelSection>
    </>
  );
}

// ------------------------------------------------------------------ Jobs

const STATUS: Record<Job["status"], string> = { queued: "Waiting", running: "Working", done: "Done", failed: "Failed", cancelled: "Cancelled" };

export function JobsTab({ jobs, run, docId }: { jobs: Job[]; run: (i: JobInput) => string | null; docId: string }) {
  const api = useEditorApi();
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  if (!jobs.length) return <EmptyState icon={<Sparkles size={22} />} title="No jobs yet">What you make in AI Studio shows here, with progress, and stays in this project&apos;s history so you can run it again.</EmptyState>;
  const select = (ids: string[]) => {
    const doc = api.getState().doc, live = ids.filter((id) => locate(doc.root, id));
    if (live.length) api.getState().select(live);
    return live.length > 0;
  };
  return (
    <div className="ai-jobs" data-testid="ai-jobs">
      {jobs.map((j) => (
        <div key={j.id} className={`ai-job ${j.status}`} data-testid="ai-job" data-status={j.status}>
          <div className="hd">
            {j.cloud ? <Cloud size={13} aria-label="Cloud" /> : <Box size={13} aria-label="On this computer" />}
            <b>{j.input.label}</b>
            <span className="st">{STATUS[j.status]}{j.credits ? ` · ${credits(j.credits)}` : ""}</span>
          </div>
          {j.input.prompt ? <p className="pr">“{j.input.prompt}”{j.input.style ? ` · ${styleById(j.input.style)?.name ?? j.input.style}` : ""}</p> : null}
          {(j.status === "running" || j.status === "queued") && <>
            <ProgressBar value={j.progress} label={j.input.label} />
            <div className="ft"><span className="dlg-note">{j.stage ?? "Waiting for a free slot…"}</span><button type="button" className="ui-btn small" onClick={() => cancel(j.id)} data-testid="ai-job-cancel"><Ban size={13} aria-hidden /> Cancel</button></div>
          </>}
          {j.status === "failed" && <p className="err" role="alert">{j.error}</p>}
          {j.status === "done" && j.stage && <p className="dlg-note">{j.stage}</p>}
          {editing === j.id && (
            <div className="ai-stack">
              <textarea className="ui-text ai-prompt" rows={2} maxLength={MAX_STUDIO_PROMPT} value={text} onChange={(e) => setText(e.target.value)} aria-label="Changed prompt" autoFocus />
              <div className="ai-row">
                <button type="button" className="ui-btn primary small" onClick={() => { run({ ...j.input, prompt: text.trim() }); setEditing(null); }} disabled={text.trim().length < 2}><Send size={13} aria-hidden /> Run with this prompt</button>
                <button type="button" className="ui-btn small" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          )}
          {j.status !== "running" && j.status !== "queued" && editing !== j.id && (
            <div className="ft">
              {j.resultIds.length > 0 && <button type="button" className="ui-btn small" onClick={() => { if (!select(j.resultIds)) api.getState().select([]); }} title="Select the result on the canvas"><Eye size={13} aria-hidden /> Select</button>}
              <button type="button" className="ui-btn small" onClick={() => run(j.input)} title="Run again with the same settings"><RotateCcw size={13} aria-hidden /> Again</button>
              {j.input.prompt !== undefined && <button type="button" className="ui-btn small" onClick={() => { setEditing(j.id); setText(j.input.prompt ?? ""); }}><MessageSquare size={13} aria-hidden /> Edit prompt</button>}
              <span style={{ flex: 1 }} />
              <button type="button" className="ui-icon-btn" aria-label="Remove from history" onClick={() => forget(j.id)}><Trash2 size={13} /></button>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="ui-btn small" onClick={() => clearHistory(docId)}><Trash2 size={13} aria-hidden /> Clear history</button>
      <p className="dlg-note">Every result is a normal layer: move it, edit it, or undo it with Ctrl+Z.</p>
    </div>
  );
}
