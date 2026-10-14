/**
 * A HingeLab layered SVG taken apart for the export dialog: its top-level Inkscape layers, and in
 * each layer its elements, kept as written (so an SVG can be put back together without changing a
 * path) and also as geometry in the document's millimetres (y down, transforms applied) for the
 * other formats and for telling which sheet an element is on.
 */
import { ap, attrsOf, decode, ellipse, flattenPath, ID, mul, parseTransform, type M, type P } from "./dxf";

export interface Poly { pts: P[]; closed: boolean }
export interface SceneText { str: string; x: number; y: number; size: number; rot: number; anchor: "start" | "middle" | "end"; middle: boolean }
export interface SceneImage { href: string; m: M; x: number; y: number; w: number; h: number; clip: Poly[] | null }
export interface SceneItem {
  /** The element as written in the SVG. */
  raw: string;
  polys: Poly[];
  texts: SceneText[];
  images: SceneImage[];
  /** Bounds in document mm, or null when the element draws nothing. */
  box: [number, number, number, number] | null;
}
export interface SceneLayer {
  /** The layer's opening tag as written. */
  open: string;
  label: string;
  color: string;
  /** Filled (engraved areas) rather than stroked. */
  fill: boolean;
  items: SceneItem[];
}
export interface Scene {
  W: number;
  H: number;
  /** Everything before the first layer that is not the <svg> tag: the XML declaration is dropped. */
  comment: string;
  defs: string;
  layers: SceneLayer[];
  /** Attributes of the <svg> tag. */
  root: Record<string, string>;
}

const TAG = /<(\/?)([\w:-]+)([^>]*?)(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|([^<]+)/g;

/** Clip paths in <defs> by id, as polygons in their own coordinates. */
function clipPaths(defs: string): Map<string, Poly[]> {
  const out = new Map<string, Poly[]>();
  for (const [, id, body] of defs.matchAll(/<clipPath\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/clipPath>/g)) {
    const polys: Poly[] = [];
    for (const [, rest] of body.matchAll(/<path\b([^>]*)\/?>/g)) {
      const a = attrsOf(rest);
      const m = parseTransform(a.transform);
      if (a.d) for (const sp of flattenPath(a.d)) polys.push({ pts: sp.pts.map((p) => ap(m, p)), closed: true });
    }
    out.set(id, polys);
  }
  return out;
}

function grow(box: SceneItem["box"], x: number, y: number): SceneItem["box"] {
  if (!box) return [x, y, x, y];
  return [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
}

/** Geometry of one element (and its children) under a transform. */
function geometry(raw: string, base: M, clips: Map<string, Poly[]>): Omit<SceneItem, "raw"> {
  const item: Omit<SceneItem, "raw"> = { polys: [], texts: [], images: [], box: null };
  const stack: { m: M; clip: { id: string; m: M } | null }[] = [];
  let text: { a: Record<string, string>; m: M; s: string } | null = null;
  const addPoly = (pts: P[], closed: boolean, m: M) => {
    const q = pts.map((p) => ap(m, p));
    if (q.length < 2) return;
    item.polys.push({ pts: q, closed });
    for (const [x, y] of q) item.box = grow(item.box, x, y);
  };
  for (const mt of raw.matchAll(TAG)) {
    const [, close, tag, rest, self, node] = mt;
    if (node !== undefined) { if (text) text.s += node; continue; }
    if (!tag) continue;
    if (close) {
      if (tag === "text" && text) {
        const { a, m } = text;
        const str = decode(text.s).trim();
        if (str) {
          const [x, y] = ap(m, [parseFloat(a.x ?? "0"), parseFloat(a.y ?? "0")]);
          const size = parseFloat(a["font-size"] ?? "4") * Math.hypot(m[0], m[1]);
          const anchor = a["text-anchor"] === "middle" ? "middle" : a["text-anchor"] === "end" ? "end" : "start";
          item.texts.push({ str, x, y, size, rot: (Math.atan2(m[1], m[0]) * 180) / Math.PI, anchor, middle: a["dominant-baseline"] === "middle" || a["dominant-baseline"] === "central" });
          const half = (str.length * size * 0.3);
          item.box = grow(grow(item.box, x - half, y - size / 2), x + half, y + size / 2);
        }
        text = null;
      }
      stack.pop();
      continue;
    }
    const a = attrsOf(rest);
    const parent = stack[stack.length - 1];
    const m = mul(parent?.m ?? base, parseTransform(a.transform));
    // A clip is drawn in the coordinates of the element that uses it, its own transform included.
    const own = /url\(#([^)]+)\)/.exec(a["clip-path"] ?? "")?.[1];
    const clip = own ? { id: own, m } : (parent?.clip ?? null);
    if (!self) stack.push({ m, clip });
    if (tag === "path" && a.d) for (const sp of flattenPath(a.d)) addPoly(sp.pts, sp.closed, m);
    else if (tag === "polygon" || tag === "polyline") {
      const n = (a.points ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      const pts: P[] = [];
      for (let k = 0; k + 1 < n.length; k += 2) pts.push([n[k], n[k + 1]]);
      addPoly(pts, tag === "polygon", m);
    } else if (tag === "line") addPoly([[+(a.x1 ?? 0), +(a.y1 ?? 0)], [+(a.x2 ?? 0), +(a.y2 ?? 0)]], false, m);
    else if (tag === "rect") {
      const x = +(a.x ?? 0), y = +(a.y ?? 0), w = +(a.width ?? 0), h = +(a.height ?? 0);
      if (w > 0 && h > 0) addPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, m);
    } else if (tag === "circle" || tag === "ellipse") {
      const rx = +(a.r ?? a.rx ?? 0), ry = +(a.r ?? a.ry ?? 0);
      if (rx > 0 && ry > 0) addPoly(ellipse(+(a.cx ?? 0), +(a.cy ?? 0), rx, ry), true, m);
    } else if (tag === "text") text = { a, m, s: "" };
    else if (tag === "image") {
      const x = +(a.x ?? 0), y = +(a.y ?? 0), w = +(a.width ?? 0), h = +(a.height ?? 0);
      const href = a.href ?? a["xlink:href"] ?? "";
      if (w > 0 && h > 0 && href) {
        const polys = clip ? (clips.get(clip.id) ?? null) : null;
        item.images.push({ href: decode(href), m, x, y, w, h, clip: polys && polys.map((pl) => ({ pts: pl.pts.map((p) => ap(clip!.m, p)), closed: true })) });
        for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as P[]) {
          const [qx, qy] = ap(m, [px, py]);
          item.box = grow(item.box, qx, qy);
        }
      }
    }
  }
  return item;
}

/** Splits a layered SVG into its layers and their elements. */
export function readScene(svg: string): Scene {
  const head = /<svg\b([^>]*)>/.exec(svg);
  const root = attrsOf(head?.[1] ?? "");
  const vb = (root.viewBox ?? "").split(/[\s,]+/).map(Number);
  const W = vb.length === 4 && Number.isFinite(vb[2]) ? vb[2] : parseFloat(root.width ?? "0");
  const H = vb.length === 4 && Number.isFinite(vb[3]) ? vb[3] : parseFloat(root.height ?? "0");
  const base: M = vb.length === 4 && (vb[0] || vb[1]) ? [1, 0, 0, 1, -vb[0], -vb[1]] : ID;
  const body = head ? svg.slice(head.index + head[0].length) : svg;

  const scene: Scene = { W, H, comment: "", defs: "", layers: [], root };
  // Top-level children of <svg>: comments, defs, layers (anything else goes in a layer of its own).
  let depth = 0, start = -1;
  let layer: SceneLayer | null = null;
  let itemStart = -1;
  const pending: { raw: string; m: M }[] = [];
  const layers: { layer: SceneLayer; m: M; items: string[] }[] = [];
  for (const mt of body.matchAll(TAG)) {
    const [whole, close, tag, rest, self] = mt;
    const at = mt.index ?? 0;
    if (!tag) {
      if (depth === 0 && whole.startsWith("<!--")) scene.comment += whole + "\n";
      continue;
    }
    if (close) {
      depth--;
      if (depth === 1 && layer && itemStart >= 0) { layers[layers.length - 1].items.push(body.slice(itemStart, at + whole.length)); itemStart = -1; }
      if (depth === 0) {
        if (tag === "defs") scene.defs += body.slice(start, at + whole.length) + "\n";
        else if (layer) layer = null;
        else if (tag !== "svg") pending.push({ raw: body.slice(start, at + whole.length), m: base });
      }
      if (depth < 0) break;
      continue;
    }
    if (depth === 0) {
      start = at;
      const a = attrsOf(rest);
      if (tag === "g" && a["inkscape:groupmode"] === "layer" && !self) {
        const fill = !!a.fill && a.fill !== "none" && (!a.stroke || a.stroke === "none");
        layer = { open: whole, label: a["inkscape:label"] ?? a.id ?? "", color: (fill ? a.fill : a.stroke) ?? "#000000", fill, items: [] };
        layers.push({ layer, m: mul(base, parseTransform(a.transform)), items: [] });
      } else if (self) {
        if (tag === "defs") scene.defs += whole + "\n";
        else pending.push({ raw: whole, m: base });
        continue;
      }
    } else if (depth === 1 && layer) {
      if (self) { layers[layers.length - 1].items.push(whole); continue; }
      itemStart = at;
    }
    if (!self) depth++;
  }
  const clips = clipPaths(scene.defs);
  for (const { layer: l, m, items } of layers) {
    l.items = items.map((raw) => ({ raw, ...geometry(raw, m, clips) }));
    scene.layers.push(l);
  }
  if (pending.length) {
    scene.layers.push({ open: `<g inkscape:groupmode="layer" inkscape:label="Other">`, label: "Other", color: "#000000", fill: false, items: pending.map(({ raw, m }) => ({ raw, ...geometry(raw, m, clips) })) });
  }
  return scene;
}
