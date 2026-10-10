/**
 * Copy and paste. Inside HingeLab the clipboard carries the scene nodes (with their world transform
 * baked in) so they paste between projects; other apps receive the same objects as SVG in mm.
 */
import { nodePaths, pathD, transformSubpaths } from "./geom";
import { locate, topLevel } from "./scene";
import type { Document, SceneNode } from "./types";

export interface ClipData { format: "hingelab-clip"; version: 1; nodes: SceneNode[] }

const KEY = "hingelab-clipboard";

export function copyNodes(doc: Document, ids: string[]): ClipData {
  const nodes = topLevel(doc.root, ids).map((id) => locate(doc.root, id)).filter((l) => !!l)
    .map((l) => ({ ...(JSON.parse(JSON.stringify(l!.node)) as SceneNode), transform: l!.world }));
  return { format: "hingelab-clip", version: 1, nodes };
}

export function parseClip(text: string | null): ClipData | null {
  if (!text) return null;
  try {
    const r = JSON.parse(text) as ClipData;
    return r && r.format === "hingelab-clip" && Array.isArray(r.nodes) ? r : null;
  } catch { return null; }
}

/** The clip as an SVG document in millimetres (cut-layer colours as strokes). */
export function clipToSvg(doc: Document, clip: ClipData): string {
  const paths: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of clip.nodes) {
    const subs = transformSubpaths(nodePaths(n), n.transform);
    for (const s of subs) for (const a of s.nodes) { minX = Math.min(minX, a.x); minY = Math.min(minY, a.y); maxX = Math.max(maxX, a.x); maxY = Math.max(maxY, a.y); }
    const color = doc.cutLayers[n.layer]?.color ?? "#000000";
    if (subs.length) paths.push(`<path d="${pathD(subs)}" fill="none" stroke="${color}" stroke-width="0.1"/>`);
  }
  if (!paths.length) { minX = minY = 0; maxX = maxY = 1; }
  const w = Math.max(maxX - minX, 0.001), h = Math.max(maxY - minY, 0.001);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r(w)}mm" height="${r(h)}mm" viewBox="${r(minX)} ${r(minY)} ${r(w)} ${r(h)}">${paths.join("")}</svg>`;
}

export function storeClip(clip: ClipData): void {
  try { localStorage.setItem(KEY, JSON.stringify(clip)); } catch { /* quota or private mode */ }
}

export function loadClip(): ClipData | null {
  try { return parseClip(localStorage.getItem(KEY)); } catch { return null; }
}
