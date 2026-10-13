/**
 * AI Studio's local image tools behind one message format, so the same code runs in the imaging
 * worker and (where workers are missing) on the page. Results carry only plain data.
 */
import { autoFixAll, type Issue } from "@/lib/issues";
import type { DepthMap } from "@/lib/parametric/source/relief";
import type { Subpath } from "@/lib/studio/types";
import { adjust, autoAdjust, enhance, upscale, type AdjustOptions } from "./adjust";
import { cutout, whiteToAlpha, type CutoutOptions } from "./cutout";
import { engrave, type EngraveOptions } from "./dither";
import { imgFromBits, type Img } from "./image";
import { cartoon, lineArt, type CartoonOptions, type LineArtOptions } from "./lineart";
import { depthLayers, type LayerOptions } from "./relief";
import { cutLength, cutSafety, type SafetyContext } from "./safety";
import { cleanVectorize, inkBitmap, vectorizeBitmap, type VectorizeOptions } from "./vectorize";

export type ImagingRequest =
  | { op: "adjust"; img: Img; options: Partial<AdjustOptions> }
  | { op: "auto"; img: Img }
  | { op: "enhance"; img: Img }
  | { op: "upscale"; img: Img; factor: 2 | 4 }
  | { op: "cutout"; img: Img; options: Partial<CutoutOptions> }
  | { op: "whiteToAlpha"; img: Img; tolerance: number }
  | { op: "lineart"; img: Img; options: Partial<LineArtOptions> }
  | { op: "cartoon"; img: Img; options: Partial<CartoonOptions> }
  | { op: "engrave"; img: Img; options: EngraveOptions }
  | { op: "vectorize"; img: Img; options: Partial<VectorizeOptions>; ctx: SafetyContext; fixAll?: boolean }
  | { op: "layers"; depth: DepthMap; options: Partial<LayerOptions>; vector: Partial<VectorizeOptions> };

/** A cut-safety issue with each fix's resulting settings (functions can't cross to the page). */
export interface PlainIssue {
  code: string;
  level: Issue<unknown>["level"];
  message: string;
  fixes: { id: string; label: string; safe: boolean; settings: VectorizeOptions }[];
}

export interface VectorResult {
  subpaths: Subpath[];
  widthMm: number;
  heightMm: number;
  lines: boolean;
  bridges: number;
  nodes: number;
  lengthMm: number;
  /** The settings used (after Fix all, if asked). */
  settings: VectorizeOptions;
  issues: PlainIssue[];
  /** Fixes "Fix all" applied. */
  applied: string[];
}

export type ImagingResult =
  | { kind: "image"; img: Img }
  | { kind: "adjust"; options: AdjustOptions }
  | { kind: "engrave"; img: Img; dpi: number }
  | { kind: "vector"; vector: VectorResult }
  | { kind: "layers"; sheets: Subpath[][]; widthMm: number; heightMm: number };

export const plainIssues = (issues: Issue<VectorizeOptions>[], p: VectorizeOptions): PlainIssue[] =>
  issues.map((i) => ({ code: i.code, level: i.level, message: i.message, fixes: i.fixes.map((f) => ({ id: f.id, label: f.label, safe: f.safe, settings: f.apply(p) })) }));

export function runImaging(req: ImagingRequest): ImagingResult {
  switch (req.op) {
    case "adjust": return { kind: "image", img: adjust(req.img, req.options) };
    case "auto": return { kind: "adjust", options: autoAdjust(req.img) };
    case "enhance": return { kind: "image", img: enhance(req.img) };
    case "upscale": return { kind: "image", img: upscale(req.img, req.factor) };
    case "cutout": return { kind: "image", img: cutout(req.img, req.options) };
    case "whiteToAlpha": return { kind: "image", img: whiteToAlpha(req.img, req.tolerance) };
    case "lineart": return { kind: "image", img: imgFromBits(lineArt(req.img, req.options)) };
    case "cartoon": return { kind: "image", img: cartoon(req.img, req.options) };
    case "engrave": {
      const r = engrave(req.img, req.options);
      return { kind: "engrave", img: imgFromBits(r.bitmap), dpi: r.dpi };
    }
    case "vectorize": {
      let p = cleanVectorize(req.options);
      const ink = inkBitmap(req.img, p);
      const check = (q: VectorizeOptions) => cutSafety(vectorizeBitmap(ink, q), q, req.ctx);
      let applied: string[] = [];
      if (req.fixAll) {
        const r = autoFixAll(p, check);
        p = cleanVectorize(r.params);
        applied = r.applied;
      }
      const v = vectorizeBitmap(ink, p);
      return {
        kind: "vector",
        vector: {
          subpaths: v.subpaths, widthMm: v.widthMm, heightMm: v.heightMm, lines: v.lines, bridges: v.bridges,
          nodes: v.subpaths.reduce((a, s) => a + s.nodes.length, 0), lengthMm: cutLength(v),
          settings: p, issues: plainIssues(cutSafety(v, p, req.ctx), p), applied,
        },
      };
    }
    case "layers": {
      const sheets = depthLayers(req.depth, req.options).map((b) => vectorizeBitmap(b, req.vector));
      return { kind: "layers", sheets: sheets.map((v) => v.subpaths), widthMm: sheets[0]?.widthMm ?? 0, heightMm: sheets[0]?.heightMm ?? 0 };
    }
  }
}
