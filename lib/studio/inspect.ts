/**
 * Structure Inspector data: a read-only, JSON-safe summary of objects for the dock panel and "Copy as
 * JSON". Geometry is summarised (counts), not dumped, so large paths and caches stay readable.
 */
import { decompose } from "./geom";
import type { Document, Mat, SceneNode, Subpath } from "./types";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const round = (v: number) => Math.round(v * 10000) / 10000 || 0;

const plain = (v: unknown): Json => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? round(v) : String(v);
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, plain(x)]));
  return String(v);
};

/** Counts for a list of subpaths: how many, how many anchors, how many closed. */
export function geometrySize(subs: Subpath[] | undefined): { subpaths: number; nodes: number; closed: number } {
  const s = subs ?? [];
  return { subpaths: s.length, nodes: s.reduce((a, x) => a + x.nodes.length, 0), closed: s.filter((x) => x.closed).length };
}

export function transformInfo(m: Mat): Json {
  const t = decompose(m);
  return { x: round(t.x), y: round(t.y), scaleX: round(t.sx), scaleY: round(t.sy), rotation: round(t.rotation), skew: round(t.skew), matrix: m.map(round) };
}

const SUBPATH_KEYS = new Set(["subpaths", "outline", "cache", "linkCache"]);

/** Effect parameters with any cached geometry replaced by its size. */
const params = (p: unknown): Json => {
  if (!p || typeof p !== "object") return plain(p);
  return Object.fromEntries(Object.entries(p as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) =>
    [k, SUBPATH_KEYS.has(k) && Array.isArray(x) ? geometrySize(x as Subpath[]) : plain(x)]));
};

export function inspectNode(d: Document, n: SceneNode): Json {
  const layer = d.cutLayers[n.layer];
  const out: Record<string, Json> = {
    type: n.type,
    id: n.id,
    ...(n.name ? { name: n.name } : {}),
    layer: layer ? `C${String(n.layer).padStart(2, "0")} ${layer.name}` : n.layer,
    ...(n.hidden ? { hidden: true } : {}),
    ...(n.locked ? { locked: true } : {}),
    transform: transformInfo(n.transform),
  };
  for (const [k, v] of Object.entries(n)) {
    if (v === undefined || k in out || k === "name" || k === "hidden" || k === "locked") continue;
    if (k === "children" && n.type === "group") out.children = n.children.map((c) => inspectNode(d, c));
    else if (k === "effects" && Array.isArray(v)) out.effects = (v as { kind: string; enabled: boolean; id: string; params: unknown }[]).map((e) => ({ kind: e.kind, id: e.id, enabled: e.enabled, params: params(e.params) }));
    else if (SUBPATH_KEYS.has(k) && Array.isArray(v)) out[k] = geometrySize(v as Subpath[]);
    else out[k] = plain(v);
  }
  return out;
}

/** What the inspector shows with nothing selected: the document's make-up. */
export function inspectDocument(d: Document): Json {
  let objects = 0;
  const count = (ns: SceneNode[]) => ns.forEach((n) => { objects++; if (n.type === "group") count(n.children); });
  count(d.root.children);
  return plain({
    type: "document", id: d.id, name: d.name, schemaVersion: d.schemaVersion, units: d.units,
    sheets: d.sheets.map((s) => ({ name: s.name, w: s.w, h: s.h, x: s.x, y: s.y })),
    objects, topLevel: d.root.children.length,
    cutLayersInUse: [...new Set(collectLayers(d.root.children))].sort((a, b) => a - b).map((k) => `C${String(k).padStart(2, "0")} ${d.cutLayers[k]?.name ?? ""}`.trim()),
    assets: d.assets.map((a) => ({ id: a.id, kind: a.kind, name: a.name, bytes: a.bytes })),
    guides: d.guides.length, grid: d.grid, snapping: d.snapping,
  });
}

function collectLayers(ns: SceneNode[], out: number[] = []): number[] {
  for (const n of ns) { if (n.type === "group") collectLayers(n.children, out); else out.push(n.layer); }
  return out;
}
