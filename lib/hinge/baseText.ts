/**
 * Text engraved under the box (a company name and phone number, a message): shaped with a Letters
 * font, so Persian joins up and every laser program reads it as plain filled vectors. It sits in
 * the middle of the base, shrunk when it would reach the walls.
 */
import type { BuildContext, Contour } from "@/lib/generators/types";
import { textBlock } from "@/lib/generators/weld";
import { BUNDLED_FONTS } from "@/lib/letters/fonts";
import { coreDistance } from "./lidSlot";
import type { Edge, Params } from "./types";

/** Vazirmatn covers Persian and Latin, so mixed text needs no font change. */
export const BASE_TEXT_FONT = "vazirmatn-bold";
export const MAX_BASE_TEXT = 300;
export const MAX_BASE_LINES = 8;
export const BASE_TEXT_SIZE = 5;

export const hasBaseText = (p: Params) => typeof p.baseText === "string" && p.baseText.trim().length > 0;
export const baseTextFont = (p: Params) => (p.baseTextFont && BUNDLED_FONTS.some((f) => f.id === p.baseTextFont) ? p.baseTextFont : BASE_TEXT_FONT);

export interface BaseTextShape {
  /** Filled glyph outlines, centred on the base's centre. */
  contours: Contour[];
  width: number;
  height: number;
  /** Below 1 when the text was shrunk to fit inside the walls. */
  scale: number;
  missing: string[];
  loading: boolean;
}

/** The engraving for the base: `inner` is the clear radius inside the wall (around the core). */
export function baseTextShape(p: Params, edges: Edge[], inner: number, ctx: BuildContext | undefined): BaseTextShape | null {
  if (!hasBaseText(p)) return null;
  const missing: string[] = [];
  const block = textBlock(ctx ?? {}, p.baseText!.slice(0, MAX_BASE_TEXT), baseTextFont(p), p.baseTextSize ?? BASE_TEXT_SIZE, { align: "center", lead: 1.45, missing });
  if (block.loading || !block.contours.length) return { contours: [], width: 0, height: 0, scale: 1, missing, loading: block.loading };
  const clear = inner - 3;
  const fits = (s: number) => {
    const hw = (block.width * s) / 2, hh = (block.height * s) / 2;
    return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as [number, number][]).every((q) => coreDistance(edges, q) <= clear);
  };
  let s = 1;
  while (!fits(s) && s > 0.05) s *= 0.96;
  const contours = s === 1 ? block.contours : block.contours.map((c) => c.map(([x, y]) => [x * s, y * s] as [number, number]));
  return { contours, width: block.width * s, height: block.height * s, scale: s, missing, loading: false };
}

/** One even-odd path of the outlines, moved to (ox, oy). */
export function contoursD(contours: Contour[], ox: number, oy: number): string {
  const f = (v: number) => (Math.round(v * 1000) / 1000).toString();
  return contours.filter((c) => c.length > 2).map((c) => `M${c.map(([x, y]) => `${f(x + ox)},${f(y + oy)}`).join("L")}Z`).join("");
}
