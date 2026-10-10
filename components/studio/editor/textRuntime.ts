"use client";

import { ensurePreviewFace, getLoadedFont, loadHarfBuzz, previewFamily } from "@/components/letters/runtime";
import { layoutText, type TextSettings } from "@/lib/studio/text";
import type { Subpath } from "@/lib/studio/types";

/** Outlines for a text object (loads HarfBuzz and the font on first use). */
export async function textOutline(font: string, s: TextSettings): Promise<{ outline: Subpath[]; missing: string[] }> {
  const hb = await loadHarfBuzz();
  const f = await getLoadedFont(hb, font);
  const r = layoutText(hb, f, s);
  return { outline: r.outline, missing: r.missing };
}

/** CSS family for the on-canvas text editor, loaded on demand. */
export function editorFontFamily(font: string): string {
  void ensurePreviewFace(font).catch(() => {});
  return `${previewFamily(font)}, system-ui, sans-serif`;
}
