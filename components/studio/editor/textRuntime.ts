"use client";

import { ensurePreviewFace, getLoadedFont, loadHarfBuzz, previewFamily } from "@/components/letters/runtime";
import type { HarfBuzz, LoadedFont } from "@/lib/letters/fonts";
import { layoutText, type TextLayout, type TextSettings } from "@/lib/studio/text";
import type { Subpath } from "@/lib/studio/types";

let hbNow: HarfBuzz | null = null;
const fontsNow = new Map<string, LoadedFont>();

/** Full layout for a text object (loads HarfBuzz and the font on first use). */
export async function textLayout(font: string, s: TextSettings): Promise<TextLayout> {
  const hb = (hbNow = await loadHarfBuzz());
  const f = await getLoadedFont(hb, font);
  fontsNow.set(font, f);
  return layoutText(hb, f, s);
}

/** Outlines for a text object (loads HarfBuzz and the font on first use). */
export async function textOutline(font: string, s: TextSettings): Promise<{ outline: Subpath[]; missing: string[] }> {
  const r = await textLayout(font, s);
  return { outline: r.outline, missing: r.missing };
}

/** The layout right away when HarfBuzz and the font are already loaded (for live edits), else null. */
export function textLayoutNow(font: string, s: TextSettings): TextLayout | null {
  const f = fontsNow.get(font);
  return hbNow && f ? layoutText(hbNow, f, s) : null;
}

/** CSS family for the on-canvas text editor, loaded on demand. */
export function editorFontFamily(font: string): string {
  void ensurePreviewFace(font).catch(() => {});
  return `${previewFamily(font)}, system-ui, sans-serif`;
}
