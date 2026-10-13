"use client";

import type { StoreApi } from "zustand";
import { AI_START_KEY } from "@/lib/ai/types";
import { pathD } from "@/lib/studio/geom";
import type { ImageNode, Subpath, Vec } from "@/lib/studio/types";
import { largestPiece, lampLayout, reliefLayout, signLayout, silhouette, topperLayout, type SignOptions, type TopperOptions } from "@/lib/ai/studio/layouts";
import type { PerforationOptions } from "@/lib/imaging/relief";
import type { EditorState } from "../store";
import { addVectors, fillLayer, layerWithMode } from "./assets";

type Api = StoreApi<EditorState>;

export type TargetId = "canvas" | "topper" | "sign" | "lamp" | "trophy" | "clock" | "puzzle" | "relief";

export const TARGETS: { id: TargetId; name: string; note: string; where: "studio" | "editor" }[] = [
  { id: "canvas", name: "This canvas", note: "The outlines as they are, on the current layer.", where: "studio" },
  { id: "topper", name: "Cake topper", note: "The art joined into one piece with a pointed stake.", where: "studio" },
  { id: "sign", name: "Sign", note: "A board around the art, engraved, with two hanging holes.", where: "studio" },
  { id: "lamp", name: "Lamp panel", note: "A panel perforated with the art's outline on a grid; light shines through.", where: "studio" },
  { id: "trophy", name: "Trophy emblem", note: "Opens the Trophy generator with the art's outline as the emblem.", where: "editor" },
  { id: "clock", name: "Clock face", note: "Opens the Clock generator with the art's outline as the face.", where: "editor" },
  { id: "puzzle", name: "Picture puzzle", note: "Opens the Puzzle generator with this picture engraved over the pieces.", where: "editor" },
];

/** Opens a product editor with these settings (the same handoff the AI designer uses). */
export function openInGenerator(product: string, name: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  sessionStorage.setItem(AI_START_KEY, JSON.stringify({ product, preset: { id: `ai-studio-${Date.now()}`, name, note: "Made in AI Studio", params: { ...params, name }, ...extra } }));
  window.location.href = `/app/editor/local?p=${product}&ai=1`;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Generator settings for an outline target, or null when it opens in Studio. */
export function generatorParams(target: TargetId, art: Subpath[], w: number, h: number, picture?: string): { product: string; params: Record<string, unknown> } | null {
  const outline = () => pathD(largestPiece(silhouette(art)));
  switch (target) {
    case "trophy": {
      const k = Math.min(110 / w, 140 / h);
      return { product: "trophy", params: { emblem: { kind: "custom", path: outline(), width: r1(w * k), height: r1(h * k) } } };
    }
    case "clock": return { product: "clock", params: { face: { shape: "custom", path: outline(), size: 300 } } };
    case "puzzle": {
      if (!picture) return null;
      const aspect = w / h, width = aspect >= 1 ? 300 : Math.round(300 * aspect), height = aspect >= 1 ? Math.round(300 / aspect) : 300;
      return { product: "puzzle", params: { shape: { kind: "rect", width, height }, engrave: { kind: "image", image: picture, aspect: r1(aspect), zoom: 100 } } };
    }
    default: return null;
  }
}

/** Builds a Studio target from vector art (mm, top-left origin of a w × h box). Returns the new object's id. */
export function placeTarget(api: Api, target: Exclude<TargetId, "trophy" | "clock" | "puzzle" | "relief">, art: Subpath[], w: number, h: number, at: { source?: ImageNode; center?: Vec }, o: {
  topper?: Partial<TopperOptions>; sign?: Partial<SignOptions>; lamp?: Partial<PerforationOptions>; lines?: boolean; engrave?: boolean;
} = {}): string | null {
  const d = api.getState().doc, current = api.getState().currentLayer;
  const cut = layerWithMode(d, "cut", 2), inner = d.cutLayers[3]?.mode === "cut" ? 3 : cut, fill = fillLayer(d, current);
  switch (target) {
    case "canvas": {
      const layer = o.lines ? layerWithMode(d, "score", current) : o.engrave ? fill : current;
      return addVectors(api, "AI: Vectorize", o.lines ? "AI centre-lines" : "AI vector", [{ name: "Vector", layer, subpaths: art }], { w, h }, at);
    }
    case "topper": {
      const subs = topperLayout(art, o.topper);
      return addVectors(api, "AI: Cake topper", "AI cake topper", [{ name: "Topper", layer: cut, subpaths: subs }], { w, h: h + (o.topper?.stakeLength ?? 90) }, at);
    }
    case "sign": {
      const s = signLayout(art, o.sign);
      return addVectors(api, "AI: Sign", "AI sign", [
        { name: "Art (engrave)", layer: fill, subpaths: s.art },
        { name: "Hanging holes", layer: inner, subpaths: s.holes },
        { name: "Board", layer: cut, subpaths: s.board },
      ], { w: s.width, h: s.height }, at);
    }
    case "lamp": {
      const p = lampLayout(art, o.lamp);
      const pw = o.lamp?.width ?? 300, ph = o.lamp?.height ?? 200;
      return addVectors(api, "AI: Lamp panel", `AI lamp panel (${p.count} holes)`, [
        { name: "Perforation", layer: inner, subpaths: p.holes },
        { name: "Panel", layer: cut, subpaths: [p.panel] },
      ], { w: pw, h: ph }, at);
    }
  }
}

/** Stacked relief sheets from depth levels (outlines inside a w × h frame). */
export function placeRelief(api: Api, sheets: Subpath[][], w: number, h: number, center: Vec): string | null {
  const d = api.getState().doc;
  const cut = layerWithMode(d, "cut", 2), score = layerWithMode(d, "score", 1);
  const parts = reliefLayout(sheets, w, h);
  const all = parts.flatMap((p) => [{ name: `${p.name}`, layer: cut, subpaths: p.cut }, ...(p.score.length ? [{ name: `${p.name} glue guide`, layer: score, subpaths: p.score }] : [])]);
  let maxX = 0, maxY = 0;
  for (const p of parts) for (const s of p.cut) for (const n of s.nodes) { maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); }
  return addVectors(api, "AI: Stacked relief", `AI stacked relief (${parts.length} sheets)`, all, { w: maxX, h: maxY }, { center });
}
