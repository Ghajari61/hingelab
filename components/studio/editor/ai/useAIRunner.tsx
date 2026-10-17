"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addNode, locate, selectionBox } from "@/lib/studio/scene";
import { machineById, materialById } from "@/lib/studio/library";
import { getLocalAsset } from "@/lib/studio/localStore";
import { newId } from "@/lib/studio/doc";
import type { Document, ImageNode, TextNode, Vec } from "@/lib/studio/types";
import type { AdjustOptions } from "@/lib/imaging/adjust";
import { CUTOUT_DEFAULTS } from "@/lib/imaging/cutout";
import { engraveMaterial, type DitherAlgo, type EngraveMaterialId } from "@/lib/imaging/dither";
import { cropTo, nearestAspect, padTo, type FrameRect } from "@/lib/imaging/frame";
import { LINE_ART_DEFAULTS, PORTRAIT_DEFAULTS, CARTOON_DEFAULTS } from "@/lib/imaging/lineart";
import { depthImage, LAYER_DEFAULTS } from "@/lib/imaging/relief";
import type { ImagingRequest } from "@/lib/imaging/ops";
import type { Img } from "@/lib/imaging/image";
import { COSTS, HIGH_QUALITY_EXTRA, type CloudOp } from "@/lib/ai/studio/credits";
import { isRtl, kitById, kitFont, kitPrompt, type DesignKit } from "@/lib/ai/studio/kits";
import { MAX_VARIATIONS } from "@/lib/ai/studio/request";
import { styleById } from "@/lib/ai/studio/styles";
import { useEditor, useEditorApi } from "../store";
import { addImage, dataUrlToBlob, decodeImage, encodeImage, fillLayer, imageLayer, readNodeImage, uploadUrl, type Placement } from "./assets";
import { cloudImage, studioStatus, type ImageAsk, type StudioStatus } from "./cloud";
import { imaging } from "./imagingClient";
import { enqueue, loadCredits, loadHistory, spent, type JobContext, type JobInput, type JobOutput } from "./jobs";
import { openInGenerator, placeRelief } from "./targets";
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

/** A set of pictures from one prompt: what the workspace and the compact panel ask for. */
export interface PictureSet {
  prompt: string;
  style?: string;
  count?: number;
  aspect?: "square" | "wide" | "tall";
  widthMm?: number;
  quality?: "medium" | "high";
  transparent?: boolean;
  /** Reference pictures as data URLs. */
  refs?: string[];
  label?: string;
  /** What happens once a picture is ready (a recipe's next step). */
  then?: DesignKit["then"];
  target?: DesignKit["target"];
  /** Words set as real text under each picture, and their font. */
  text?: string;
  font?: string;
}

export const imageWidth = (n: ImageNode) => n.w * (Math.hypot(n.transform[0], n.transform[1]) || 1);
export const LIBRARY_TO_ENGRAVE: Record<string, EngraveMaterialId> = { birch3: "wood", birch18: "wood", poplar3: "wood", mdf3: "wood", card2: "wood", acr3: "acrylic", leather2: "leather", "anod-al": "anodized" };
const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const CLOUD_TOOLS = ["generate", "restyle", "redraw", "expand", "aiCutout"];

/** Real text under a picture: centred, sized to the picture, on the engrave layer. */
function addCaption(d: Document, imageId: string, text: string, font: string): string | null {
  const b = selectionBox(d, [imageId]);
  if (!Number.isFinite(b.minX)) return null;
  const w = b.maxX - b.minX;
  const size = Math.max(5, Math.min(40, w * 0.11));
  const node: TextNode = {
    id: newId(), type: "text", transform: [1, 0, 0, 1, (b.minX + b.maxX) / 2, b.maxY + size * 1.25], layer: fillLayer(d, 0),
    text, font, size, tracking: 0, lineHeight: 1.2, align: "center", direction: isRtl(text) ? "rtl" : "ltr", outline: [],
  };
  addNode(d, node);
  return node.id;
}

/**
 * Everything AI Studio runs: local image tools, cloud pictures, recipes and the dialogs they open.
 * Jobs live in a shared store, so the compact panel and the full workspace see the same queue.
 */
export function useAIRunner(props: AIStudioProps) {
  const { toast, notify, viewCenter, beforeLeave, preflight } = props;
  const api = useEditorApi();
  const docId = useEditor((s) => s.doc.id);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [vectorize, setVectorize] = useState<VectorizeStart | null>(null);
  const [edit, setEdit] = useState<"redraw" | "expand" | null>(null);

  useEffect(() => { loadHistory(docId); loadCredits(); void studioStatus().then(setStatus); }, [docId]);

  const cloudBlock = !status ? "Checking the cloud tools…" : !status.cloud ? "The cloud tools are not set up on this server. The free tools on this computer still work."
    : !status.signedIn ? "Sign in to use the cloud tools." : null;
  const costOf = useCallback((op: CloudOp) => status?.costs?.[op] ?? COSTS[op], [status]);
  const highQuality = !!status?.highQuality;
  const highExtra = status?.highExtra ?? HIGH_QUALITY_EXTRA;

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

  // `run` and `followUp` call each other (a recipe's picture is then engraved), so followUp reads run late.
  const runRef = useRef<(input: JobInput) => string | null>(() => null);

  /** What a recipe or style does after its picture is made. */
  const followUp = useCallback((id: string, o: Record<string, unknown>) => {
    if (typeof o.text === "string" && o.text.trim()) {
      const text = o.text.trim(), font = typeof o.font === "string" ? o.font : kitFont(undefined, text);
      api.getState().edit("AI: Text", (d) => { addCaption(d, id, text, font); });
    }
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
      runRef.current({ ...base, tool: "engrave", label: "Photo engraving", options: { material: LIBRARY_TO_ENGRAVE[api.getState().doc.sheets[0]?.materialId ?? ""] ?? "wood", widthMm: Number(o.widthMm) || 90 } });
    } else if (then === "layers") {
      runRef.current({ ...base, tool: "relief", label: "Stacked relief", options: { levels: 5, widthMm: Number(o.widthMm) || 200 } });
    } else {
      notify("Picture ready.", { label: "Vectorize", run: () => { api.getState().select([id]); setVectorize({ target: target === "relief" ? "canvas" : target, widthMm: Number(o.widthMm) || undefined }); } });
    }
  }, [api, beforeLeave, docId, notify]);

  const run = useCallback((input: JobInput): string | null => {
    const o = (input.options ?? {}) as Record<string, unknown>;
    const cloud = CLOUD_TOOLS.includes(input.tool);
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
        const refs = Array.isArray(o.refs) ? (o.refs as string[]).filter((r) => typeof r === "string").slice(0, 3) : undefined;
        const r = await cloudImage({
          op: "generate", prompt: input.prompt ?? "", style: input.style, aspect,
          ...(o.quality === "high" ? { quality: "high" as const } : {}), ...(o.transparent ? { transparent: true } : {}),
          ...(typeof o.variation === "number" ? { variation: o.variation } : {}), ...(refs?.length ? { refs } : {}),
        }, ctx.signal);
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
        const out = await cloudPicture(ctx, (url) => ({ op: "restyle", prompt: input.prompt ?? "", style: input.style, image: url, sketch: !!o.sketch, ...(o.quality === "high" ? { quality: "high" as const } : {}) }), img);
        const ids = await putImage(out, input, { kind: "beside", source: src });
        if (ids[0] && (o.then || o.text)) followUp(ids[0], o);
        return { ids, credits: COSTS.restyle };
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
  }, [api, cloudBlock, cloudPicture, docId, followUp, localTool, preflight, putImage, sourceOf, toast, viewCenter]);
  runRef.current = run;

  /** One prompt, several variations: each is its own job, asked for a different take. */
  const makeSet = useCallback((s: PictureSet): boolean => {
    const count = Math.max(1, Math.min(MAX_VARIATIONS, s.count ?? 1));
    let ok = false;
    for (let i = 0; i < count; i++) {
      const label = s.label ?? "Text to image";
      ok = !!run({
        tool: "generate", label: count > 1 ? `${label} ${i + 1}/${count}` : label, prompt: s.prompt, style: s.style,
        options: {
          aspect: s.aspect ?? "square", widthMm: s.widthMm ?? 100, index: i, variation: i, style: s.style,
          ...(s.quality === "high" ? { quality: "high" } : {}), ...(s.transparent ? { transparent: true } : {}), ...(s.refs?.length ? { refs: s.refs } : {}),
          ...(s.then ? { then: s.then } : {}), ...(s.target ? { target: s.target } : {}), ...(s.text ? { text: s.text, font: s.font } : {}),
        },
      }) || ok;
    }
    return ok;
  }, [run]);

  /** A recipe: its prompt with the user's words, its style and count, and its words set as real text. */
  const runRecipe = useCallback((id: string, words: string, fields?: Record<string, string>, extra?: Partial<PictureSet>): boolean => {
    const k = kitById(id);
    if (!k) return false;
    const text = (k.fields ?? []).map((f) => fields?.[f.key]?.trim()).filter(Boolean).join("  ·  ");
    return makeSet({
      prompt: kitPrompt(k, words), style: k.style, count: k.count, widthMm: k.widthMm, label: k.name, then: k.then, target: k.target,
      ...(text ? { text, font: kitFont(k, text) } : {}), ...extra,
    });
  }, [makeSet]);

  const onEdit = (a: EditAsk, sourceId: string) => {
    run({ tool: a.op, label: a.op === "redraw" ? "Image Redraw" : "Creative Expand", prompt: a.prompt, sourceId, options: a as unknown as Record<string, unknown> });
  };

  const toParametric = async (image: ImageNode) => {
    const img = await readNodeImage(docId, image, 1024);
    const { PARAMETRIC_PRESETS } = await import("@/lib/parametric/presets");
    const base = PARAMETRIC_PRESETS.find((p) => p.id === "head-stack");
    await beforeLeave();
    openInGenerator("parametric", image.name?.replace(/\.[a-z]+$/i, "") || "AI relief", (base?.params ?? { method: "stacked" }) as Record<string, unknown>, { photo: await uploadUrl(img, 1024), ...(base?.finish ? { finish: base.finish } : {}) });
  };

  const dialogs = (image: ImageNode | null, afterEdit?: () => void) => (
    <>
      {vectorize && <VectorizeDialog open start={vectorize} onClose={() => setVectorize(null)} beforeLeave={beforeLeave} toast={toast}
        onDone={(id, label, cut) => { toast(`Added: ${label}`, true); if (cut) preflight([id], label, true); }} />}
      {edit && image && <EditDialog open mode={edit} cost={costOf(edit)} onClose={() => setEdit(null)} onSubmit={(a) => { onEdit(a, image.id); afterEdit?.(); }} />}
    </>
  );

  return { status, cloudBlock, costOf, highQuality, highExtra, run, makeSet, runRecipe, followUp, toParametric, setVectorize, setEdit, dialogs, docId };
}
