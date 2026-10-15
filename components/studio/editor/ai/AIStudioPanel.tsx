"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  Ban, Box, Brush, Check, Cloud, Contrast, Expand, Eye, ImagePlus, Layers, Loader2, MessageSquare, Mountain, PenTool, RotateCcw,
  Scissors, Send, Sparkles, Trash2, Wand2, ZoomIn,
} from "lucide-react";
import { EmptyState, NumberInput, PanelSection, ProgressBar, SegmentedControl, Select, Slider, Tabs } from "@/components/ui";
import { locate } from "@/lib/studio/scene";
import { machineById, materialById } from "@/lib/studio/library";
import { getLocalAsset } from "@/lib/studio/localStore";
import type { Document, ImageNode, Vec } from "@/lib/studio/types";
import { ADJUST_NEUTRAL, type AdjustOptions } from "@/lib/imaging/adjust";
import { CUTOUT_DEFAULTS } from "@/lib/imaging/cutout";
import { DITHER_ALGOS, ENGRAVE_MATERIALS, engraveMaterial, type DitherAlgo, type EngraveMaterialId } from "@/lib/imaging/dither";
import { cropTo, nearestAspect, padTo, type FrameRect } from "@/lib/imaging/frame";
import { LINE_ART_DEFAULTS, PORTRAIT_DEFAULTS, CARTOON_DEFAULTS } from "@/lib/imaging/lineart";
import { depthImage, LAYER_DEFAULTS } from "@/lib/imaging/relief";
import type { ImagingRequest } from "@/lib/imaging/ops";
import type { Img } from "@/lib/imaging/image";
import { COSTS, dailyNote, type CloudOp } from "@/lib/ai/studio/credits";
import { planLabel } from "@/lib/plans";
import { DESIGN_KITS, kitPrompt, type DesignKit } from "@/lib/ai/studio/kits";
import { MAX_STUDIO_PROMPT } from "@/lib/ai/studio/request";
import { STYLE_PRESETS, styleById } from "@/lib/ai/studio/styles";
import { useEditor, useEditorApi } from "../store";
import { addImage, dataUrlToBlob, decodeImage, encodeImage, imageLayer, pickImage, readNodeImage, uploadUrl, type Placement } from "./assets";
import { cloudImage, studioStatus, type ImageAsk, type StudioStatus } from "./cloud";
import { imaging } from "./imagingClient";
import { cancel, clearHistory, creditsStore, enqueue, forget, jobsStore, loadCredits, loadHistory, spent, type Job, type JobContext, type JobInput, type JobOutput } from "./jobs";
import { openInGenerator, placeRelief } from "./targets";
import { AssistantChat } from "./AssistantChat";
import { EditDialog, type EditAsk } from "./EditDialog";
import { VectorizeDialog, type VectorizeStart } from "./VectorizeDialog";

export interface AIStudioProps {
  toast: (message: string, undo?: boolean) => void;
  notify: (message: string, action?: { label: string; run: () => void }) => void;
  viewCenter: () => Vec;
  /** Saves the project before leaving for a product editor. */
  beforeLeave: () => Promise<void>;
  /** Checks new cut geometry (doubled lines, open paths) like Trace Bitmap does. */
  preflight: (ids: string[], label: string, cut: boolean) => void;
}

type Tab = "create" | "image" | "laser" | "assistant" | "jobs";

const imageWidth = (n: ImageNode) => n.w * (Math.hypot(n.transform[0], n.transform[1]) || 1);
const LIBRARY_TO_ENGRAVE: Record<string, EngraveMaterialId> = { birch3: "wood", birch18: "wood", poplar3: "wood", mdf3: "wood", card2: "wood", acr3: "acrylic", leather2: "leather", "anod-al": "anodized" };
const WHITE: [number, number, number, number] = [255, 255, 255, 255];

/** AI Studio: pictures from text and photos, image clean-up, laser preparation and an assistant, as layers on the canvas. */
export function AIStudioPanel(props: AIStudioProps) {
  const { toast, notify, viewCenter, beforeLeave, preflight } = props;
  const api = useEditorApi();
  const docId = useEditor((s) => s.doc.id);
  const image = useEditor(pickImage);
  const [tab, setTab] = useState<Tab>("create");
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [vectorize, setVectorize] = useState<VectorizeStart | null>(null);
  const [edit, setEdit] = useState<"redraw" | "expand" | null>(null);
  const used = useStore(creditsStore, (s) => s.used);
  const jobs = useStore(jobsStore, (s) => s.jobs);
  const mine = useMemo(() => jobs.filter((j) => j.docId === docId), [jobs, docId]);
  const active = mine.filter((j) => j.status === "running" || j.status === "queued").length;

  useEffect(() => { loadHistory(docId); loadCredits(); void studioStatus().then(setStatus); }, [docId]);

  const cloudBlock = !status ? "Checking the cloud tools…" : !status.cloud ? "The cloud tools are not set up on this server. The free tools on this computer still work."
    : !status.signedIn ? "Sign in to use the cloud tools." : null;

  // ------------------------------------------------------------------ jobs

  const sourceOf = useCallback((input: JobInput): ImageNode => {
    const n = input.sourceId ? locate(api.getState().doc.root, input.sourceId)?.node : null;
    if (!n || n.type !== "image") throw new Error("The image this job started from is no longer in the project.");
    return n;
  }, [api]);

  const hide = (id: string) => (d: Document) => { const l = locate(d.root, id); if (l) l.node.hidden = true; };

  const putImage = useCallback(async (img: Img, input: JobInput, place: Placement, extra: { hideSource?: boolean; layer?: number; dither?: ImageNode["dither"]; also?: (d: Document) => void } = {}) => {
    const blob = await encodeImage(img, "image/png");
    const src = place.kind === "at" ? null : place.source;
    const id = await addImage(api, {
      blob, name: `AI ${input.label}`, label: `AI: ${input.label}`, pxW: img.width, pxH: img.height, place, layer: extra.layer, dither: extra.dither,
      also: (d) => { if (src && extra.hideSource) hide(src.id)(d); extra.also?.(d); },
    });
    return id ? [id] : [];
  }, [api]);

  /** A local tool: read the source, run the tool in the worker, put the picture over (or beside) the source. */
  const localTool = useCallback((input: JobInput, req: (img: Img) => ImagingRequest, how: "over" | "beside", maxSide = 2048) => async (ctx: JobContext): Promise<JobOutput> => {
    const src = sourceOf(input);
    ctx.stage("Reading the image…", 0.1);
    const img = await readNodeImage(docId, src, maxSide);
    ctx.stage("Working on this computer…", 0.4);
    const r = await imaging(req(img), ctx.signal);
    if (r.kind !== "image") throw new Error("Unexpected result.");
    ctx.stage("Placing…", 0.9);
    return { ids: await putImage(r.img, input, how === "over" ? { kind: "over", source: src } : { kind: "beside", source: src }, { hideSource: how === "over" }) };
  }, [docId, putImage, sourceOf]);

  /** Sends a picture (padded to the model's shape) and returns the answer cropped back to the original. */
  const cloudPicture = useCallback(async (ctx: JobContext, ask: (url: string) => ImageAsk, img: Img, frame = true): Promise<Img> => {
    const framed = frame ? padTo(img, nearestAspect(img.width / img.height), WHITE) : { img, rect: { x: 0, y: 0, w: 1, h: 1 } as FrameRect };
    ctx.stage("Sending the picture…", 0.15);
    const url = await uploadUrl(framed.img, 1536);
    ctx.stage("The image model is working (up to a minute)…", 0.3);
    const r = await cloudImage(ask(url), ctx.signal);
    spent(r.credits);
    ctx.stage("Placing…", 0.9);
    const out = await decodeImage(await dataUrlToBlob(r.image));
    return frame ? cropTo(out, framed.rect) : out;
  }, []);

  const run = useCallback((input: JobInput): string | null => {
    const o = (input.options ?? {}) as Record<string, unknown>;
    const cloud = ["generate", "restyle", "redraw", "expand", "aiCutout"].includes(input.tool);
    if (cloud && cloudBlock) { toast(cloudBlock); return null; }
    let work: ((ctx: JobContext) => Promise<JobOutput>) | null = null;
    switch (input.tool) {
      case "adjust": work = localTool(input, (img) => ({ op: "adjust", img, options: o as Partial<AdjustOptions> }), "over"); break;
      case "enhance": work = localTool(input, (img) => ({ op: "enhance", img }), "over"); break;
      case "upscale": work = localTool(input, (img) => ({ op: "upscale", img, factor: o.factor === 4 ? 4 : 2 }), "over", 1024); break;
      case "quickCutout": work = localTool(input, (img) => ({ op: "cutout", img, options: { tolerance: Number(o.tolerance) || CUTOUT_DEFAULTS.tolerance } }), "over"); break;
      case "lineart": work = localTool(input, (img) => ({ op: "lineart", img, options: o.portrait ? PORTRAIT_DEFAULTS : { ...LINE_ART_DEFAULTS, detail: Number(o.detail) || LINE_ART_DEFAULTS.detail } }), "beside", 1600); break;
      case "cartoon": work = localTool(input, (img) => ({ op: "cartoon", img, options: { ...CARTOON_DEFAULTS, levels: Number(o.levels) || CARTOON_DEFAULTS.levels } }), "beside", 1600); break;
      case "engrave": work = async (ctx) => {
        const src = sourceOf(input);
        const m = engraveMaterial(String(o.material));
        const widthMm = Number(o.widthMm) || imageWidth(src);
        ctx.stage("Reading the image…", 0.1);
        const img = await readNodeImage(docId, src, 3000);
        ctx.stage("Dithering…", 0.4);
        const r = await imaging({ op: "engrave", img, options: { material: m.id, widthMm, ...(o.algo && o.algo !== "auto" ? { algo: o.algo as DitherAlgo } : {}), ...(Number(o.dpi) ? { dpi: Number(o.dpi) } : {}) } }, ctx.signal);
        if (r.kind !== "engrave") throw new Error("Unexpected result.");
        ctx.stage("Placing…", 0.9);
        const d = api.getState().doc, layer = imageLayer(d);
        const laser = machineById(d.sheets[0]?.machineId ?? "")?.laser ?? "co2";
        const lib = m.library ? materialById(m.library)?.engrave[laser] : null;
        const over = Math.abs(widthMm - imageWidth(src)) < 0.5;
        const ids = await putImage(r.img, input, over ? { kind: "over", source: src } : { kind: "beside", source: src, widthMm }, {
          hideSource: over, layer, dither: { mode: "threshold", threshold: 0.5, dpi: Math.round(r.dpi), invert: false },
          also: (doc) => {
            const L = doc.cutLayers[layer];
            if (L.mode !== "image") { L.mode = "image"; L.name = "Photo engrave"; L.air = false; }
            L.interval = Math.round((25.4 / r.dpi) * 1000) / 1000;
            if (o.setLayer !== false && lib) { L.speed = lib.speed; L.power = lib.power; L.passes = lib.passes; }
          },
        });
        return { ids, note: `${m.name}, ${Math.round(r.dpi)} DPI on ${d.cutLayers[layer] ? `layer C${String(layer).padStart(2, "0")}` : "the image layer"}` };
      }; break;
      case "depth": work = async (ctx) => {
        const src = sourceOf(input);
        ctx.stage("Loading the depth model…", 0.1);
        const bytes = await getLocalAsset(docId, src.assetId);
        if (!bytes) throw new Error("This image isn't stored on this device.");
        const { estimateDepth } = await import("@/components/parametric/depthProtocol");
        const r = await estimateDepth(new Blob([bytes as BlobPart]), (s) => ctx.stage(s, 0.4));
        return { ids: await putImage(depthImage(r.depth), input, { kind: "beside", source: src }) };
      }; break;
      case "relief": work = async (ctx) => {
        const src = sourceOf(input);
        ctx.stage("Loading the depth model…", 0.1);
        const bytes = await getLocalAsset(docId, src.assetId);
        if (!bytes) throw new Error("This image isn't stored on this device.");
        const { estimateDepth } = await import("@/components/parametric/depthProtocol");
        const r = await estimateDepth(new Blob([bytes as BlobPart]), (s) => ctx.stage(s, 0.35));
        ctx.stage("Cutting the depth into sheets…", 0.7);
        const widthMm = Number(o.widthMm) || imageWidth(src);
        const res = await imaging({ op: "layers", depth: r.depth, options: { ...LAYER_DEFAULTS, levels: Number(o.levels) || LAYER_DEFAULTS.levels }, vector: { widthMm, minAreaMm2: 6, connect: "islands", bridgeMm: 2, smooth: 1, optimize: 1 } }, ctx.signal);
        if (res.kind !== "layers") throw new Error("Unexpected result.");
        const id = placeRelief(api, res.sheets, res.widthMm, res.heightMm, viewCenter());
        if (!id) throw new Error("The depth map is flat: no sheets to cut. Try a photo with a clear subject.");
        preflight([id], "Stacked relief", true);
        return { ids: [id], note: `${res.sheets.filter((s) => s.length).length + 1} sheets, ${Math.round(res.widthMm)} × ${Math.round(res.heightMm)} mm` };
      }; break;
      case "generate": work = async (ctx) => {
        ctx.stage("The image model is working (up to a minute)…", 0.2);
        const aspect = (o.aspect as "square" | "wide" | "tall") ?? "square";
        const r = await cloudImage({ op: "generate", prompt: input.prompt ?? "", style: input.style, aspect }, ctx.signal);
        spent(r.credits);
        ctx.stage("Placing…", 0.9);
        const img = await decodeImage(await dataUrlToBlob(r.image));
        const widthMm = Number(o.widthMm) || 100, c = viewCenter(), k = Number(o.index) || 0;
        const ids = await putImage(img, input, { kind: "at", center: { x: c.x + k * (widthMm + 10), y: c.y }, widthMm });
        if (ids[0]) followUp(ids[0], o);
        return { ids, credits: r.credits };
      }; break;
      case "restyle": work = async (ctx) => {
        const src = sourceOf(input);
        ctx.stage("Reading the image…", 0.05);
        const img = await readNodeImage(docId, src, 1536);
        const out = await cloudPicture(ctx, (url) => ({ op: "restyle", prompt: input.prompt ?? "", style: input.style, image: url, sketch: !!o.sketch }), img);
        return { ids: await putImage(out, input, { kind: "beside", source: src }), credits: COSTS.restyle };
      }; break;
      case "aiCutout": work = async (ctx) => {
        const src = sourceOf(input);
        ctx.stage("Reading the image…", 0.05);
        const img = await readNodeImage(docId, src, 1536);
        const white = await cloudPicture(ctx, (url) => ({ op: "cutout", image: url }), img);
        const r = await imaging({ op: "whiteToAlpha", img: white, tolerance: 0.08 }, ctx.signal);
        if (r.kind !== "image") throw new Error("Unexpected result.");
        return { ids: await putImage(r.img, input, { kind: "over", source: src }, { hideSource: true }), credits: COSTS.cutout };
      }; break;
      case "redraw":
      case "expand": {
        const a = o as unknown as EditAsk;
        if (!a.image || !a.mask) { toast("Open the dialog again to repaint or expand."); return null; }
        work = async (ctx) => {
          const src = sourceOf(input);
          ctx.stage("The image model is working (up to a minute)…", 0.25);
          const r = await cloudImage({ op: a.op, prompt: input.prompt ?? "", image: a.image, mask: a.mask }, ctx.signal);
          spent(r.credits);
          ctx.stage("Placing…", 0.9);
          const out = await decodeImage(await dataUrlToBlob(r.image));
          if (a.op === "redraw") return { ids: await putImage(cropTo(out, a.rect), input, { kind: "over", source: src }, { hideSource: true }), credits: r.credits };
          const R = a.rect, grow = { left: R.x / R.w, top: R.y / R.h, right: (1 - R.x - R.w) / R.w, bottom: (1 - R.y - R.h) / R.h };
          return { ids: await putImage(out, input, { kind: "over", source: src, grow }, { hideSource: true }), credits: r.credits };
        };
        break;
      }
    }
    if (!work) return null;
    return enqueue(docId, input, cloud, work);
  }, [api, cloudBlock, cloudPicture, docId, localTool, preflight, putImage, sourceOf, toast, viewCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What a kit does after its picture is made. */
  const followUp = (id: string, o: Record<string, unknown>) => {
    const then = o.then as DesignKit["then"] | undefined, target = o.target as DesignKit["target"] | undefined;
    if (!then) {
      const style = styleById(String(o.style ?? ""));
      if (style && style.next !== "engrave") notify("Picture ready.", { label: "Vectorize", run: () => { api.getState().select([id]); setVectorize({ lines: style.next === "centerline" }); } });
      return;
    }
    const n = locate(api.getState().doc.root, id)?.node;
    if (!n || n.type !== "image") return;
    const base: JobInput = { tool: "", label: "", sourceId: id };
    if (then === "engrave" && target === "puzzle") {
      notify("Picture ready for the puzzle.", { label: "Open in Puzzle", run: () => void (async () => {
        const img = await readNodeImage(docId, n, 1024);
        await beforeLeave();
        openInGenerator("puzzle", "AI picture puzzle", { shape: { kind: "rect", width: 300, height: Math.round(300 * img.height / img.width) }, engrave: { kind: "image", image: await uploadUrl(img, 1024), aspect: img.width / img.height, zoom: 100 } });
      })() });
    } else if (then === "engrave") {
      run({ ...base, tool: "engrave", label: "Photo engraving", options: { material: LIBRARY_TO_ENGRAVE[api.getState().doc.sheets[0]?.materialId ?? ""] ?? "wood", widthMm: Number(o.widthMm) || 90 } });
    } else if (then === "layers") {
      run({ ...base, tool: "relief", label: "Stacked relief", options: { levels: 5, widthMm: Number(o.widthMm) || 200 } });
    } else {
      notify("Picture ready.", { label: "Vectorize", run: () => { api.getState().select([id]); setVectorize({ target: target === "relief" ? "canvas" : target, widthMm: Number(o.widthMm) || undefined }); } });
    }
  };

  const onEdit = (a: EditAsk) => {
    if (!image) return;
    run({ tool: a.op, label: a.op === "redraw" ? "Image Redraw" : "Creative Expand", prompt: a.prompt, sourceId: image.id, options: a as unknown as Record<string, unknown> });
    setTab("jobs");
  };

  const toParametric = async () => {
    if (!image) return;
    const img = await readNodeImage(docId, image, 1024);
    const { PARAMETRIC_PRESETS } = await import("@/lib/parametric/presets");
    const base = PARAMETRIC_PRESETS.find((p) => p.id === "head-stack");
    await beforeLeave();
    openInGenerator("parametric", image.name?.replace(/\.[a-z]+$/i, "") || "AI relief", (base?.params ?? { method: "stacked" }) as Record<string, unknown>, { photo: await uploadUrl(img, 1024), ...(base?.finish ? { finish: base.finish } : {}) });
  };

  const costOf = (op: CloudOp) => status?.costs?.[op] ?? COSTS[op];
  const shared = { run, image, cloudBlock, costOf, setTab };
  return (
    <div className="ai-studio" data-testid="ai-studio">
      <div className="ai-credits" data-testid="ai-credits">
        <Cloud size={14} aria-hidden />
        {status?.signedIn && status.cloud
          ? <span>{planLabel(status.plan)}: {status.daily} credits a day · {used} used here today</span>
          : <span>{cloudBlock ?? dailyNote("free")}</span>}
      </div>
      <Tabs label="AI Studio" value={tab} onChange={setTab} tabs={[
        { id: "create", label: "Create" }, { id: "image", label: "Image" }, { id: "laser", label: "Laser" },
        { id: "assistant", label: "Assistant" }, { id: "jobs", label: active ? `Jobs (${active})` : "Jobs" },
      ]} />
      <div className="ai-body">
        {tab === "create" && <CreateTab {...shared} />}
        {tab === "image" && <ImageTab {...shared} openEdit={setEdit} />}
        {tab === "laser" && <LaserTab {...shared} openVectorize={setVectorize} toParametric={() => void toParametric()} />}
        {tab === "assistant" && <AssistantChat cloudBlock={cloudBlock} cost={costOf("assistant")} toast={toast} viewCenter={viewCenter} beforeLeave={beforeLeave}
          makeImage={(prompt, style) => { run({ tool: "generate", label: "Text to image", prompt, style, options: { aspect: "square", style } }); setTab("jobs"); }} />}
        {tab === "jobs" && <JobsTab jobs={mine} run={run} docId={docId} />}
      </div>
      {vectorize && <VectorizeDialog open start={vectorize} onClose={() => setVectorize(null)} beforeLeave={beforeLeave} toast={toast}
        onDone={(id, label, cut) => { toast(`Added: ${label}`, true); if (cut) preflight([id], label, true); }} />}
      {edit && <EditDialog open mode={edit} cost={costOf(edit)} onClose={() => setEdit(null)} onSubmit={onEdit} />}
    </div>
  );
}

type Shared = {
  run: (i: JobInput) => string | null;
  image: ImageNode | null;
  cloudBlock: string | null;
  costOf: (op: CloudOp) => number;
  setTab: (t: Tab) => void;
};

const credits = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;

// ------------------------------------------------------------------ Create

function CreateTab({ run, image, cloudBlock, costOf, setTab }: Shared) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("line-art");
  const [aspect, setAspect] = useState<"square" | "wide" | "tall">("square");
  const [widthMm, setWidthMm] = useState(100);
  const [restyle, setRestyle] = useState("");
  const [sketch, setSketch] = useState(false);
  const [kit, setKit] = useState<string | null>(null);
  const [kitWords, setKitWords] = useState("");
  const go = (input: JobInput) => { if (run(input)) setTab("jobs"); };

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
          <NumberInput label="Width on the canvas" value={widthMm} min={10} max={2000} suffix="mm" onChange={(v) => setWidthMm(v)} />
          <button type="button" className="ui-btn primary" disabled={prompt.trim().length < 3 || !!cloudBlock} data-testid="ai-generate"
            onClick={() => go({ tool: "generate", label: "Text to image", prompt: prompt.trim(), style, options: { aspect, widthMm, style } })}>
            <Sparkles size={14} aria-hidden /> Make picture ({credits(costOf("generate"))})
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
      <PanelSection title="Design kits">
        <div className="ai-kits">
          {DESIGN_KITS.map((k) => (
            <div key={k.id} className={`ai-kit${kit === k.id ? " open" : ""}`}>
              <button type="button" className="choice" aria-expanded={kit === k.id} onClick={() => { setKit(kit === k.id ? null : k.id); setKitWords(""); }} data-testid={`ai-kit-${k.id}`}>
                <b>{k.name}</b><small>{k.blurb}</small>
              </button>
              {kit === k.id && (
                <div className="ai-stack">
                  <label className="ui-label" htmlFor={`kit-${k.id}`}>{k.ask}</label>
                  <input id={`kit-${k.id}`} className="ui-text" value={kitWords} maxLength={200} placeholder={k.placeholder} onChange={(e) => setKitWords(e.target.value)} />
                  <button type="button" className="ui-btn primary" disabled={!!cloudBlock} onClick={() => {
                    const p = kitPrompt(k, kitWords);
                    let ok = false;
                    for (let i = 0; i < k.count; i++) ok = !!run({ tool: "generate", label: `${k.name} ${i + 1}/${k.count}`, prompt: p, style: k.style, options: { aspect: "square", widthMm: k.widthMm, index: i, then: k.then, target: k.target, style: k.style } }) || ok;
                    if (ok) setTab("jobs");
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

function JobsTab({ jobs, run, docId }: { jobs: Job[]; run: (i: JobInput) => string | null; docId: string }) {
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